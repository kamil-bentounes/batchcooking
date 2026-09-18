#!/usr/bin/env node
/**
 * Sonde un site de recettes AVANT de l'ingérer.
 *
 * Un site « populaire » n'est pas un site exploitable. Ce qui compte est
 * mesurable, et ne se devine pas depuis un article de blog :
 *
 *   · publie-t-il du `schema.org/Recipe` ? (sinon : rien à extraire)
 *   · ses étapes sont-elles datables par notre référentiel ?
 *   · ses ingrédients se rattachent-ils à CIQUAL ?
 *   · son robots.txt nous autorise-t-il ? (on le lit, et on s'y tient)
 *
 *   node scripts/sonde.mjs                    # la liste de candidats intégrée
 *   node scripts/sonde.mjs site1.fr site2.fr  # des domaines précis
 *   node scripts/sonde.mjs --pages 6          # plus d'échantillons par site
 *
 * Aucune écriture en base. C'est une mesure, pas une ingestion.
 */
import { readFileSync } from 'node:fs'
import { extraire } from '../worker/src/jsonld.ts'
import { preparer } from '../worker/src/ingere.ts'
import { pliure } from '../worker/src/etape.ts'
import { indexer } from '../worker/src/aliment.ts'
import { autorise, decouvrir, texteDe } from '../worker/src/sitemap.ts'

const PAUSE_MS = 1100
const dors = () => new Promise(r => setTimeout(r, PAUSE_MS))

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const PAGES = Number(opt('--pages') ?? 4)

/** Les candidats, du plus gros au plus spécialisé. */
const CANDIDATS = [
  'marmiton.org', 'cuisineaz.com', '750g.com', 'cuisineactuelle.fr',
  'ptitchef.com', 'chefsimon.com', 'papillesetpupilles.fr', 'odelices.com',
  'cuisine.journaldesfemmes.fr', 'atelierdeschefs.fr', 'recettes.de',
  'quitoque.fr', 'jow.fr', 'croquonslavie.fr', 'fitnessmith.fr',
  'natura-force.com', 'recetteproteine.fr', 'mangerbouger.fr',
]

const texte = texteDe

// ── Le contexte de résolution, depuis les fichiers de graine ────────────────
const lire = f => JSON.parse(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'))
const seed = lire('seed/conversions.json')
const ciqual = lire('seed/ciqual.json')
const CTX = {
  referentiel: {
    durees: seed.default_duration,
    alias: seed.verbe_alias.alias,
    nonActions: seed.non_action.motifs.map(m => new RegExp(pliure(m), 'i')),
    temperatures: seed.default_temperature.map(t => ({
      preparation: t.preparation, celsius: t.temperature_c ?? t.celsius,
    })),
  },
  aliments: indexer(ciqual.map(a => ({ id: a.code, name: a.nom, state: a.etat }))),
  conversions: seed.unit_conversion,
  sousGroupes: new Map(ciqual.map(a => [a.code, a.sous_groupe])),
  densites: new Map(),
}

const pct = (a, b) => (b === 0 ? '—' : `${Math.round((a / b) * 100)} %`)

async function sonder(domaine) {
  // La sonde répond « ce site publie-t-il ? » : le repli par l'accueil lui va.
  const { robots: r, urls } = await decouvrir(
    domaine, { max: PAGES, pause: dors, repliAccueil: true })
  const bilan = {
    domaine, robots: r, urls: urls.length,
    pages: 0, avecRecette: 0, planifiables: 0,
    etapes: 0, datees: 0, avecVerbe: 0,
    ingredients: 0, rattaches: 0, grammes: 0,
    exemples: [],
  }

  for (const u of urls) {
    const chemin = new URL(u).pathname
    if (!autorise(chemin, r)) continue
    const html = await texte(u)
    await dors()
    bilan.pages++
    if (!html) continue

    const brute = extraire(html, u)
    if (!brute) continue
    bilan.avecRecette++

    const p = preparer(brute, CTX)
    if (p.recipe.plannable) bilan.planifiables++
    bilan.etapes += p.etapes.length
    bilan.datees += p.etapes.filter(e => e.duration_min !== null).length
    bilan.avecVerbe += p.etapes.filter(e => e.verb !== null).length
    bilan.ingredients += p.ingredients.length
    bilan.rattaches += p.ingredients.filter(g => g.food_id !== null).length
    bilan.grammes += p.ingredients.filter(g => g.grams_reference !== null).length
    if (bilan.exemples.length < 2) bilan.exemples.push(brute.titre ?? u)
  }
  return bilan
}

const liste = args.filter(a => a.includes('.')) .length > 0
  ? args.filter(a => a.includes('.'))
  : CANDIDATS

console.log(`\nSonde de ${liste.length} site(s), ${PAGES} pages chacun, une requête par seconde.\n`)

const resultats = []
for (const d of liste) {
  process.stdout.write(`  ${d.padEnd(30)}`)
  const b = await sonder(d)
  resultats.push(b)
  const verdict = b.avecRecette === 0
    ? (b.urls === 0 ? 'aucune URL trouvée' : 'aucun schema.org/Recipe')
    : `${b.avecRecette}/${b.pages} recettes · ${b.planifiables} planifiables`
  console.log(verdict)
}

console.log(`\n${'site'.padEnd(30)} ${'JSON-LD'.padStart(8)} ${'plan.'.padStart(7)} ${'datées'.padStart(7)} ${'verbe'.padStart(7)} ${'CIQUAL'.padStart(7)} ${'robots'.padStart(12)}`)
console.log('-'.repeat(88))
for (const b of resultats.sort((x, y) => y.planifiables - x.planifiables)) {
  console.log(
    b.domaine.padEnd(30) +
    `${b.avecRecette}/${b.pages}`.padStart(8) +
    `${b.planifiables}`.padStart(7) +
    pct(b.datees, b.etapes).padStart(8) +
    pct(b.avecVerbe, b.etapes).padStart(8) +
    pct(b.rattaches, b.ingredients).padStart(8) +
    (b.robots.present
      ? `${b.robots.interdits.length} règles${b.robots.delai ? ` ${b.robots.delai}s` : ''}`
      : 'absent').padStart(13))
}
console.log()
for (const b of resultats) {
  if (b.exemples.length > 0) console.log(`  ${b.domaine} — ${b.exemples.join(' · ')}`)
}
console.log()
