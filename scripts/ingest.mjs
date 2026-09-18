#!/usr/bin/env node
/**
 * Ingestion de recettes (lot 0b, moitié déterministe).
 *
 * Lit les pages, en extrait le bloc `schema.org/Recipe`, résout les ingrédients
 * contre CIQUAL et analyse les étapes contre `default_duration`. Aucun modèle :
 * ce qui n'est pas trouvé reste `null`, et la recette est marquée non
 * planifiable plutôt que complétée au jugé.
 *
 *   node scripts/ingest.mjs <url> [<url>…]
 *   node scripts/ingest.mjs --fichier urls.txt
 *   node scripts/ingest.mjs --sitemap https://site.fr/sitemap.xml --limite 50
 *   node scripts/ingest.mjs --prod --fichier urls.txt
 *
 * Idempotent : une URL déjà ingérée est mise à jour, jamais dupliquée.
 *
 * ⚠️ On lit des pages publiques à un rythme humain (une par seconde, en série).
 *    Ce n'est pas du scraping de masse : c'est une bibliothèque personnelle.
 *    Ne pas augmenter la cadence.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { extraire } from '../worker/src/jsonld.ts'
import { preparer } from '../worker/src/ingere.ts'
import { pliure } from '../worker/src/etape.ts'
import { indexer } from '../worker/src/aliment.ts'

const args = process.argv.slice(2)
const prod = args.includes('--prod')
config({ path: prod ? '.env.production' : '.env' })

const API = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!API || !KEY) {
  console.error('Il manque VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(API, KEY, { auth: { persistSession: false } })

/** Une seconde entre deux pages. C'est le respect minimal d'un site tiers. */
const PAUSE_MS = 1000
const UA = 'batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)'

const option = (nom) => {
  const i = args.indexOf(nom)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

async function urls() {
  const fichier = option('--fichier')
  if (fichier) {
    return readFileSync(fichier, 'utf8').split(/\r?\n/)
      .map(l => l.trim()).filter(l => l.startsWith('http'))
  }
  const sitemap = option('--sitemap')
  if (sitemap) {
    const limite = Number(option('--limite') ?? 25)
    const lire = async (u) => {
      const xml = await (await fetch(u, { headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(30000) })).text()
      return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1])
    }
    const premier = await lire(sitemap)
    // Un sitemap d'index ne contient que d'autres sitemaps : c'est la forme
    // normale sur les gros sites. On descend d'UN niveau, jamais plus.
    const pages = premier.filter(u => !/\.xml(\.gz)?$/i.test(u))
    if (pages.length > 0) return pages.slice(0, limite)

    const sorties = []
    for (const sous of premier) {
      if (sorties.length >= limite) break
      await new Promise(r => setTimeout(r, PAUSE_MS))
      sorties.push(...(await lire(sous)).filter(u => !/\.xml(\.gz)?$/i.test(u)))
    }
    return sorties.slice(0, limite)
  }
  return args.filter(a => a.startsWith('http'))
}

/** Le référentiel, chargé une fois : il ne change pas d'une page à l'autre. */
async function contexte() {
  const [durees, alias, nonActions, conversions, aliments, densites, temperatures] =
    await Promise.all([
      db.from('default_duration').select('*'),
      Promise.resolve({ data: lireSeed().verbe_alias.alias }),
      db.from('non_action_pattern').select('pattern'),
      db.from('unit_conversion').select('*'),
      tousLesAliments(),
      db.from('density').select('food_id, grams_per_ml'),
      db.from('default_temperature').select('*'),
    ])

  for (const r of [durees, nonActions, conversions, aliments, densites, temperatures]) {
    if (r.error) throw new Error(r.error.message)
  }

  return {
    referentiel: {
      durees: durees.data,
      alias: alias.data,
      nonActions: nonActions.data.map(p => new RegExp(pliure(p.pattern), 'i')),
      temperatures: temperatures.data.map(t => ({
        preparation: t.preparation, celsius: t.temperature_c,
      })),
    },
    aliments: indexer(aliments.data.map(a => ({ id: a.id, name: a.name, state: a.state }))),
    conversions: conversions.data,
    sousGroupes: new Map(aliments.data.map(a => [a.id, a.ciqual_subgroup])),
    densites: new Map(densites.data.map(d => [d.food_id, Number(d.grams_per_ml)])),
  }
}

/**
 * CIQUAL en entier, par pages de mille.
 *
 * PostgREST plafonne une réponse à `db.max-rows` (1000 par défaut) SANS le
 * dire : un `.limit(5000)` rend 1000 lignes et aucune erreur. On l'a payé —
 * l'ingestion ne rattachait qu'un ingrédient sur deux parce qu'elle ne voyait
 * qu'un tiers du référentiel.
 */
async function tousLesAliments() {
  const PAGE = 1000
  const tout = []
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await db.from('food')
      .select('id, name, state, ciqual_subgroup')
      .eq('source', 'ciqual').order('id').range(debut, debut + PAGE - 1)
    if (error) return { data: null, error }
    tout.push(...data)
    if (data.length < PAGE) break
  }
  return { data: tout, error: null }
}

function lireSeed() {
  return JSON.parse(
    readFileSync(new URL('../seed/conversions.json', import.meta.url), 'utf8'))
}

async function journal(url, state, erreur = null) {
  await db.from('ingestion_job').upsert({
    url, state, error: erreur, updated_at: new Date().toISOString(),
  }, { onConflict: 'url' })
}

/** Écrit une recette. Les étapes et ingrédients sont remplacés, jamais empilés. */
async function ecrire(pret) {
  const { data: recette, error } = await db.from('recipe')
    .upsert(pret.recipe, { onConflict: 'source_url' }).select().single()
  if (error) throw new Error(error.message)

  // On efface avant de réécrire : une recette réingérée ne doit pas se retrouver
  // avec les étapes des deux passages.
  await db.from('recipe_step').delete().eq('recipe_id', recette.id)
  await db.from('recipe_ingredient').delete().eq('recipe_id', recette.id)

  if (pret.ingredients.length > 0) {
    const { error: e } = await db.from('recipe_ingredient')
      .insert(pret.ingredients.map(i => ({ ...i, recipe_id: recette.id })))
    if (e) throw new Error(e.message)
  }

  if (pret.etapes.length > 0) {
    const { data: posees, error: e } = await db.from('recipe_step')
      .insert(pret.etapes.map(s => ({ ...s, recipe_id: recette.id }))).select('id, ordinal')
    if (e) throw new Error(e.message)

    const parOrdinal = new Map(posees.map(s => [s.ordinal, s.id]))
    const arcs = pret.dependances
      .map(([a, b]) => ({ before_id: parOrdinal.get(a), after_id: parOrdinal.get(b) }))
      .filter(x => x.before_id && x.after_id)
    if (arcs.length > 0) {
      const { error: e2 } = await db.from('recipe_step_dependency').insert(arcs)
      if (e2) throw new Error(e2.message)
    }
  }
  return recette
}

const liste = await urls()
if (liste.length === 0) {
  console.error('Aucune URL. Passe-les en arguments, ou --fichier, ou --sitemap.')
  process.exit(1)
}

console.log(`\nCible : ${API}`)
console.log(`${liste.length} page(s), une par seconde.\n`)

const ctx = await contexte()
const bilan = { planifiables: 0, aRevoir: 0, sansRecette: 0, erreurs: 0 }

for (const [i, url] of liste.entries()) {
  const prefixe = `[${String(i + 1).padStart(3)}/${liste.length}]`
  try {
    await journal(url, 'fetching')
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const brute = extraire(html, url)
    if (!brute) {
      bilan.sansRecette++
      await journal(url, 'failed', 'aucun bloc schema.org/Recipe exploitable')
      console.log(`${prefixe} ✗ pas de recette · ${url}`)
      continue
    }

    const pret = preparer(brute, ctx)
    await ecrire(pret)
    await journal(url, pret.recipe.plannable ? 'ready' : 'needs_review',
      pret.motifs.join(' ; ') || null)

    if (pret.recipe.plannable) bilan.planifiables++
    else bilan.aRevoir++

    const marque = pret.recipe.plannable ? '✓' : '~'
    const detail = pret.recipe.plannable ? '' : ` (${pret.motifs.join(' ; ')})`
    console.log(`${prefixe} ${marque} ${brute.titre ?? '(sans titre)'} — `
      + `${pret.etapes.length} étapes, ${pret.ingredients.length} ingrédients${detail}`)
  } catch (e) {
    bilan.erreurs++
    await journal(url, 'failed', String(e.message ?? e))
    console.log(`${prefixe} ✗ ${e.message ?? e} · ${url}`)
  }
  if (i < liste.length - 1) await new Promise(r => setTimeout(r, PAUSE_MS))
}

const total = liste.length
console.log(`
  planifiables   ${String(bilan.planifiables).padStart(4)}  (${Math.round(bilan.planifiables / total * 100)} %)
  à revoir       ${String(bilan.aRevoir).padStart(4)}
  sans recette   ${String(bilan.sansRecette).padStart(4)}
  erreurs        ${String(bilan.erreurs).padStart(4)}
`)
