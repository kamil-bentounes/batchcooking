#!/usr/bin/env node
/**
 * Recalculer ce qui manque sur les recettes DÉJÀ ingérées.
 *
 * Il existe une raison précise à ce script : les colonnes et les triggers du
 * lot 4 ont été posés APRÈS une grande ingestion. Un trigger ne rattrape pas le
 * passé — les 1 400 recettes déjà en base ont donc `active_time_min` vide,
 * `appliances` vide, et pas une ligne de macros. Les filtres du catalogue ne
 * rendaient rien.
 *
 * Trois passes, dans cet ordre, parce qu'elles dépendent l'une de l'autre :
 *
 *   0. le RATTACHEMENT à CIQUAL, quand la règle de score a changé — c'est la
 *      passe qui répare le plus, parce qu'un aliment faux fausse tout ce qui
 *      suit ;
 *   1. les GRAMMES des lignes au compte (« 2 oignons »), maintenant que les
 *      poids unitaires de référence sont chargés (lot 0c) ;
 *   2. les MACROS par part, qui se calculent sur ces grammes ;
 *   3. les AGRÉGATS d'étapes — temps actif, appareils, nombre d'étapes — qu'on
 *      obtient en refaisant jouer le trigger.
 *
 * Aucune page n'est retéléchargée : tout est déjà en base. C'est ce qui rend
 * l'opération possible en quelques minutes plutôt qu'en une nuit.
 *
 *   npm run recalcule -- --prod
 *   npm run recalcule -- --prod --limite 20      (pour regarder avant)
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { agrege, parPart, pour100De } from '../src/lib/nutrition/macros.ts'
import { indexer, rattacher } from '../worker/src/aliment.ts'
import { analyser } from '../worker/src/ingredient.ts'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const PROD = args.includes('--prod')
const LIMITE = opt('--limite') ? Number(opt('--limite')) : null
const SEC = args.includes('--sec')

// ⚠️ `override` : sans lui, `.env` gagne et on écrirait en LOCAL avec la clé de
//    PROD — une heure perdue à comprendre pourquoi rien ne changeait.
config({ path: PROD ? '.env.production' : '.env', override: true })
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('URL ou clé de service manquante.'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

console.log(`Cible : ${URL}${SEC ? '  (à sec, rien ne sera écrit)' : ''}\n`)

/** PostgREST plafonne à 1 000 lignes en silence. On pagine, toujours. */
async function tout(table, select, filtre = q => q, cle = 'id') {
  const pages = []
  for (let de = 0; ; de += 1000) {
    // ⚠️ `order('id')` n'est pas décoratif : sans ordre TOTAL, deux pages
    //    successives peuvent sauter des lignes ou en rendre deux fois. Sur
    //    17 000 ingrédients, la couverture se calculait alors sur une liste
    //    tronquée et sortait à 1.0 sur un quart de plat.
    const { data, error } = await filtre(db.from(table).select(select))
      .order(cle).range(de, de + 999)
    if (error) throw new Error(`${table} : ${error.message}`)
    pages.push(...data)
    if (data.length < 1000) break
  }
  return pages
}

// ── Le référentiel ─────────────────────────────────────────────────────────
console.log('Chargement du référentiel…')
const aliments = await tout('food', 'id, name, state, nutrients, ciqual_subgroup')
const nutriments = new Map(aliments.map(a => [a.id, a.nutrients]))
const sousGroupes = new Map(aliments.map(a => [a.id, a.ciqual_subgroup]))

const typiquesL = await tout('typical_quantity', 'ciqual_subgroup, grams',
  q => q, 'ciqual_subgroup')
const typiques = new Map(typiquesL.map(t => [t.ciqual_subgroup, Number(t.grams)]))

const poidsL = await tout('unit_weight', 'food_id, grams, confidence')
const poidsUnitaires = new Map([...poidsL]
  .sort((a, b) => Number(a.confidence) - Number(b.confidence))
  .filter(w => w.food_id)
  .map(w => [w.food_id, Number(w.grams)]))
console.log(`  ${aliments.length} aliments · ${poidsUnitaires.size} poids unitaires\n`)

// ── Les recettes ───────────────────────────────────────────────────────────
let recettes = await tout('recipe', 'id, title, yield_servings')
if (LIMITE) recettes = recettes.slice(0, LIMITE)
const ids = new Set(recettes.map(r => r.id))
console.log(`${recettes.length} recettes à reprendre.\n`)

const ingredients = await tout('recipe_ingredient',
  'id, recipe_id, food_id, qty, unit, grams_reference, raw_text, resolution_source, confidence')
const parRecette = new Map()
for (const i of ingredients) {
  if (!ids.has(i.recipe_id)) continue
  if (!parRecette.has(i.recipe_id)) parRecette.set(i.recipe_id, [])
  parRecette.get(i.recipe_id).push(i)
}

// ── Passe 0 : le rattachement à CIQUAL ─────────────────────────────────────
// Mesuré le 18/09/2026 : dix-sept des trente ingrédients les plus courants
// tombaient à côté — « beurre » rendait « Haricot beurre », « tomate » rendait
// « Tomate, séchée ». Chaque erreur fausse les macros de toutes les recettes
// qui citent l'ingrédient, et le score, écrit dans `confidence`, verrouillait
// même la ligne contre toute correction au-delà de 0,8.
//
// On ne retouche QUE ce que l'ingestion avait rattaché ou laissé de côté : une
// ligne corrigée à la main par un foyer porte `resolution_source` différent.
const index = indexer(aliments.map(a => ({ id: a.id, name: a.name, state: a.state ?? 'cru' })))
const rattachements = []
if (!args.includes('--sans-rattachement')) {
  for (const i of ingredients) {
    if (!ids.has(i.recipe_id)) continue
    if (i.resolution_source !== 'reference' && i.resolution_source !== 'aucune') continue
    const ligne = analyser(i.raw_text)
    if (ligne.forme === 'section') continue
    const corr = rattacher(ligne.aliment, index)
    const nouveau = corr?.foodId ?? null
    if (nouveau === i.food_id) continue
    rattachements.push({
      id: i.id, food_id: nouveau,
      resolution_source: corr ? 'reference' : 'aucune',
      confidence: Math.min(1, Math.max(0, corr?.score ?? 0)),
    })
    // La suite des passes lit la version corrigée.
    i.food_id = nouveau
    // Un aliment qui change invalide les grammes déduits d'un poids unitaire.
    if (i.unit === null && i.qty !== null) i.grams_reference = null
  }
}
console.log(`0. Rattachement : ${rattachements.length} lignes changent d'aliment.`)
if (!SEC) {
  for (let d = 0; d < rattachements.length; d += 200) {
    await Promise.all(rattachements.slice(d, d + 200).map(async c => {
      const { error } = await db.from('recipe_ingredient').update({
        food_id: c.food_id, resolution_source: c.resolution_source, confidence: c.confidence,
      }).eq('id', c.id)
      if (error) throw new Error(`rattachement ${c.id} : ${error.message}`)
    }))
    process.stdout.write(`   ${Math.min(d + 200, rattachements.length)}/${rattachements.length}\r`)
  }
  console.log(`   ${rattachements.length}/${rattachements.length} écrites.      `)
}

// ── Passe 1 : les grammes des lignes au compte ─────────────────────────────
// « 2 oignons » : `qty` posée, `unit` vide. C'est exactement ce que l'ingestion
// ne savait pas convertir avant que les poids unitaires existent.
const corrections = []
for (const i of ingredients) {
  if (!ids.has(i.recipe_id)) continue
  if (i.grams_reference !== null || i.qty === null || i.unit !== null || !i.food_id) continue
  const unitaire = poidsUnitaires.get(i.food_id)
  if (unitaire === undefined) continue
  corrections.push({ id: i.id, grams: Math.round(Number(i.qty) * unitaire * 10) / 10 })
  i.grams_reference = Math.round(Number(i.qty) * unitaire * 10) / 10
}
console.log(`1. Grammes : ${corrections.length} lignes au compte deviennent pesables.`)
if (!SEC) {
  for (let d = 0; d < corrections.length; d += 200) {
    await Promise.all(corrections.slice(d, d + 200).map(async c => {
      const { error } = await db.from('recipe_ingredient')
        .update({ grams_reference: c.grams }).eq('id', c.id)
      if (error) throw new Error(`grammes ${c.id} : ${error.message}`)
    }))
    process.stdout.write(`   ${Math.min(d + 200, corrections.length)}/${corrections.length}\r`)
  }
  console.log(`   ${corrections.length}/${corrections.length} écrites.      `)
}

// ── Passe 2 : les macros par part ──────────────────────────────────────────
// Le seuil de 75 % de couverture est celui de l'ingestion : une valeur calculée
// sur la moitié d'une recette est PIRE qu'aucune valeur, parce qu'elle sert
// ensuite à filtrer (D18).
const macros = []
let insuffisantes = 0
for (const r of recettes) {
  const lignes = (parRecette.get(r.id) ?? []).map(g => ({
    grammes: g.grams_reference === null ? null : Number(g.grams_reference),
    grammesTypiques: g.food_id ? typiques.get(sousGroupes.get(g.food_id) ?? '') ?? null : null,
    pour100: g.food_id ? pour100De(nutriments.get(g.food_id)) : null,
  }))
  if (lignes.length === 0) { insuffisantes++; continue }

  const a = agrege(lignes)
  const grammesPlat = lignes.reduce(
    (s, l) => s + (l.pour100 ? (l.grammes ?? l.grammesTypiques ?? 0) : 0), 0)
  const parts = Math.max(1, r.yield_servings ?? 1)
  if (a.couverture < 0.75 || grammesPlat <= 0) { insuffisantes++; continue }

  const p = parPart(a, grammesPlat, grammesPlat / parts)
  macros.push({
    recipe_id: r.id,
    grams: Math.round(grammesPlat / parts),
    kcal: p.valeur.kcal, protein_g: p.valeur.proteinG,
    fiber_g: p.valeur.fiberG, carb_g: p.valeur.carbG, fat_g: p.valeur.fatG,
    kcal_margin: p.marge.kcal, protein_g_margin: p.marge.proteinG,
    coverage: Math.round(a.couverture * 100) / 100,
  })
}
console.log(`2. Macros : ${macros.length} recettes calculées, ${insuffisantes} trop incomplètes.`)
if (!SEC) {
  // Une recette devenue trop incomplète ne doit pas garder ses anciennes
  // macros : elles serviraient à filtrer, et elles seraient fausses.
  const gardees = new Set(macros.map(m => m.recipe_id))
  const aEffacer = recettes.map(r => r.id).filter(id => !gardees.has(id))
  for (let d = 0; d < aEffacer.length; d += 200) {
    const { error } = await db.from('recipe_nutrition')
      .delete().in('recipe_id', aEffacer.slice(d, d + 200))
    if (error) throw new Error(error.message)
  }
  if (aEffacer.length > 0) console.log(`   ${aEffacer.length} macros périmées effacées.`)
  for (let d = 0; d < macros.length; d += 300) {
    const { error } = await db.from('recipe_nutrition')
      .upsert(macros.slice(d, d + 300), { onConflict: 'recipe_id' })
    if (error) throw new Error(error.message)
    process.stdout.write(`   ${Math.min(d + 300, macros.length)}/${macros.length}\r`)
  }
  console.log(`   ${macros.length}/${macros.length} écrites.      `)
}

// ── Passe 3 : les agrégats d'étapes ────────────────────────────────────────
// Le trigger `tg_recipe_agrege` ne rattrape pas le passé. On le refait jouer en
// réécrivant une étape par recette — la valeur ne change pas, le trigger si.
const etapes = await tout('recipe_step', 'id, recipe_id, ordinal')
const premiere = new Map()
for (const e of etapes) {
  if (!ids.has(e.recipe_id)) continue
  const d = premiere.get(e.recipe_id)
  if (!d || e.ordinal < d.ordinal) premiere.set(e.recipe_id, e)
}
console.log(`3. Agrégats : ${premiere.size} recettes à réveiller.`)
if (!SEC) {
  const liste = [...premiere.values()]
  for (let d = 0; d < liste.length; d += 200) {
    await Promise.all(liste.slice(d, d + 200).map(async e => {
      const { error } = await db.from('recipe_step')
        .update({ ordinal: e.ordinal }).eq('id', e.id)
      if (error) throw new Error(`agrégat ${e.id} : ${error.message}`)
    }))
    process.stdout.write(`   ${Math.min(d + 200, liste.length)}/${liste.length}\r`)
  }
  console.log(`   ${liste.length}/${liste.length} réveillées.      `)
}

console.log('\nTerminé.')
