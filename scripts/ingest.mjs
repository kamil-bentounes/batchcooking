#!/usr/bin/env node
/**
 * Ingestion de recettes (lot 0b, moitié déterministe).
 *
 * Lit les pages, en extrait le bloc `schema.org/Recipe`, résout les ingrédients
 * contre CIQUAL et analyse les étapes contre `default_duration`. Aucun modèle :
 * ce qui n'est pas trouvé reste `null`, et la recette est marquée non
 * planifiable plutôt que complétée au jugé.
 *
 *   npm run ingest -- <url> [<url>…]
 *   npm run ingest -- --site marmiton.org --site jow.fr --limite 60
 *   npm run ingest -- --fichier urls.txt
 *   npm run ingest -- --sitemap https://site.fr/sitemap.xml --limite 50
 *   npm run ingest -- --prod --site marmiton.org
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
import { AGENT, decouvrir, texteDe } from '../worker/src/sitemap.ts'

const args = process.argv.slice(2)
const prod = args.includes('--prod')
// `override: true` est indispensable : vite-node charge `.env` de lui-même
// avant que ce script démarre, et dotenv n'écrase pas ce qui existe déjà —
// `--prod` visait donc la base LOCALE avec la clé de PRODUCTION.
config({ path: prod ? '.env.production' : '.env', override: true })

const API = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!API || !KEY) {
  console.error('Il manque VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(API, KEY, { auth: { persistSession: false } })

/** Une seconde entre deux pages. C'est le respect minimal d'un site tiers. */
const PAUSE_MS = 1100
const UA = AGENT
const dors = () => new Promise(r => setTimeout(r, PAUSE_MS))

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

  const limite = Number(option('--limite') ?? 25)

  // `--site` : on découvre le sitemap nous-mêmes, en respectant robots.txt.
  // C'est la même découverte que la sonde — un seul endroit où se tromper.
  const sites = args.filter((a, i) => args[i - 1] === '--site')
  if (sites.length > 0) {
    const tout = []
    for (const d of sites) {
      const { robots, urls: u } = await decouvrir(d, { max: limite, pause: dors })
      console.log(`  ${d.padEnd(30)} ${u.length} recettes`
        + (robots.delai ? ` (crawl-delay ${robots.delai}s déclaré)` : ''))
      tout.push(...u)
    }
    return tout
  }

  const sitemap = option('--sitemap')
  if (sitemap) {
    const xml = await texteDe(sitemap)
    const liens = xml ? [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]) : []
    const pages = liens.filter(u => !/\.xml(\.gz)?$/i.test(u))
    if (pages.length > 0) return pages.slice(0, limite)

    const sorties = []
    for (const sous of liens) {
      if (sorties.length >= limite) break
      await dors()
      const x = await texteDe(sous)
      if (x) {
        sorties.push(...[...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
          .map(m => m[1]).filter(u => !/\.xml(\.gz)?$/i.test(u)))
      }
    }
    return sorties.slice(0, limite)
  }

  return args.filter(a => a.startsWith('http'))
}

/** Le référentiel, chargé une fois : il ne change pas d'une page à l'autre. */
async function contexte() {
  const [durees, alias, nonActions, conversions, aliments, densites, poids,
         temperatures, typiques] =
    await Promise.all([
      db.from('default_duration').select('*'),
      // La base, pas le fichier : c'est ce qui garantit que l'ingestion et
      // l'import d'une recette collée appliquent EXACTEMENT les mêmes alias.
      db.from('verbe_alias').select('depuis, vers'),
      db.from('non_action_pattern').select('pattern'),
      db.from('unit_conversion').select('*'),
      tousLesAliments(),
      db.from('density').select('food_id, grams_per_ml'),
      db.from('unit_weight').select('food_id, grams, confidence'),
      db.from('default_temperature').select('*'),
      db.from('typical_quantity').select('ciqual_subgroup, grams'),
    ])

  for (const r of [durees, nonActions, conversions, aliments, densites, poids,
                   temperatures, typiques]) {
    if (r.error) throw new Error(r.error.message)
  }

  return {
    referentiel: {
      durees: durees.data,
      alias: Object.fromEntries(alias.data.map(a => [a.depuis, a.vers])),
      nonActions: nonActions.data.map(p => new RegExp(pliure(p.pattern), 'i')),
      temperatures: temperatures.data.map(t => ({
        preparation: t.preparation, celsius: t.temperature_c,
      })),
    },
    aliments: indexer(aliments.data.map(a => ({ id: a.id, name: a.name, state: a.state }))),
    conversions: conversions.data,
    sousGroupes: new Map(aliments.data.map(a => [a.id, a.ciqual_subgroup])),
    densites: new Map(densites.data.map(d => [d.food_id, Number(d.grams_per_ml)])),
    // Le plus sûr l'emporte : deux libellés (« oignon », « oignon rouge ») ne
    // pèsent pas pareil, mais l'ingestion ne sait pas lequel elle tient.
    poidsUnitaires: new Map([...poids.data]
      .sort((a, b) => Number(a.confidence) - Number(b.confidence))
      .map(w => [w.food_id, Number(w.grams)])),
    nutriments: new Map(aliments.data.map(a => [a.id, a.nutrients])),
    typiques: new Map(typiques.data.map(t => [t.ciqual_subgroup, Number(t.grams)])),
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
      // `nutrients` alourdit la page, mais c'est LUI qui permet de calculer les
      // macros par part — donc les filtres du catalogue.
      .select('id, name, state, ciqual_subgroup, nutrients')
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
    if (e) {
      /*
       * ⚠️ On a DÉJÀ effacé les anciennes étapes. Laisser la recette telle
       *    quelle la rend « planifiable » avec zéro étape — et le catalogue la
       *    sert. Déclencheur mesuré : « 1 pincée de paprika » vaut 0,4 g, que
       *    `Math.round` ramène à 0, que `check (quantity_g > 0)` refuse, ce qui
       *    fait échouer TOUTES les étapes de la recette d'un coup.
       *
       *    On la sort donc du catalogue plutôt que d'y laisser une coquille.
       */
      await db.from('recipe').update({ plannable: false }).eq('id', recette.id)
      throw new Error(`étapes refusées, recette rendue non planifiable : ${e.message}`)
    }

    const parOrdinal = new Map(posees.map(s => [s.ordinal, s.id]))
    const arcs = pret.dependances
      .map(([a, b]) => ({ before_id: parOrdinal.get(a), after_id: parOrdinal.get(b) }))
      .filter(x => x.before_id && x.after_id)
    if (arcs.length > 0) {
      const { error: e2 } = await db.from('recipe_step_dependency').insert(arcs)
      if (e2) throw new Error(e2.message)
    }
  }

  // Les macros par part servent aux FILTRES : sans elles, « plus de 30 g de
  // protéines » ne peut pas s'écrire en SQL.
  if (pret.nutrition) {
    const { error: e3 } = await db.from('recipe_nutrition')
      .upsert({ recipe_id: recette.id, ...pret.nutrition }, { onConflict: 'recipe_id' })
    if (e3) throw new Error(e3.message)
  } else {
    await db.from('recipe_nutrition').delete().eq('recipe_id', recette.id)
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
  if (i < liste.length - 1) await dors()
}

const total = liste.length
console.log(`
  planifiables   ${String(bilan.planifiables).padStart(4)}  (${Math.round(bilan.planifiables / total * 100)} %)
  à revoir       ${String(bilan.aRevoir).padStart(4)}
  sans recette   ${String(bilan.sansRecette).padStart(4)}
  erreurs        ${String(bilan.erreurs).padStart(4)}
`)
