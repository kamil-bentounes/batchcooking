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

const UA = 'batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)'
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

async function texte(url, timeout = 20000) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(timeout),
      redirect: 'follow',
    })
    return r.ok ? await r.text() : null
  } catch { return null }
}

/**
 * Lecture de robots.txt. On ne cherche pas l'exhaustivité d'un parseur — on
 * cherche à savoir si le site nous dit non, et à s'y tenir.
 */
function robots(txt) {
  if (!txt) return { present: false, interdits: [], sitemaps: [], delai: null }
  const sitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1])
  const lignes = txt.split(/\r?\n/)
  const interdits = []
  let delai = null
  let concerne = false
  for (const l of lignes) {
    const ua = l.match(/^\s*user-agent:\s*(.+)$/i)
    if (ua) { concerne = ua[1].trim() === '*'; continue }
    if (!concerne) continue
    const d = l.match(/^\s*disallow:\s*(\S*)/i)
    if (d && d[1]) interdits.push(d[1])
    const c = l.match(/^\s*crawl-delay:\s*(\d+)/i)
    if (c) delai = Number(c[1])
  }
  return { present: true, interdits, sitemaps, delai }
}

const autorise = (chemin, r) =>
  !r.interdits.some(i => chemin.startsWith(i))

/** Des URL de recettes, par le sitemap quand il existe. */
async function urlsDeRecettes(domaine, r) {
  // Un site déclare souvent dix sitemaps : news, images, vidéos, tags… Prendre
  // les premiers, c'est sonder les vidéos et conclure qu'il n'y a pas de
  // recettes. On vise donc CEUX QUI LE DISENT, d'abord.
  const declares = r.sitemaps.length > 0
    ? [...r.sitemaps].sort((a, b) =>
        Number(/recip|recett/i.test(b)) - Number(/recip|recett/i.test(a)))
    : [`https://${domaine}/sitemap.xml`, `https://www.${domaine}/sitemap.xml`,
       `https://${domaine}/sitemap_index.xml`]
  const candidats = declares

  const locs = async u => {
    const xml = await texte(u, 25000)
    return xml ? [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]) : []
  }

  for (const sm of candidats.slice(0, 4)) {
    let liste = await locs(sm)
    await dors()
    // Sitemap d'index : on descend d'un niveau, en visant les recettes.
    const sous = liste.filter(u => /\.xml(\.gz)?$/i.test(u))
    if (sous.length > 0) {
      const vise = sous.filter(u => /recip|recett/i.test(u))
      for (const s of (vise.length > 0 ? vise : sous).slice(0, 2)) {
        liste = liste.concat(await locs(s))
        await dors()
      }
    }
    const pages = liste.filter(u => !/\.xml(\.gz)?$/i.test(u) && /recette|recipe/i.test(u))
    if (pages.length >= PAGES) {
      // On échantillonne au hasard plutôt que de prendre les premières : les
      // sitemaps commencent souvent par des pages de catégorie.
      const pris = []
      for (let i = 0; i < PAGES && pages.length > 0; i++) {
        pris.push(pages.splice(Math.floor(pages.length * (i + 1) / (PAGES + 1)), 1)[0])
      }
      return pris.filter(Boolean)
    }
  }
  // Aucun sitemap exploitable : on retombe sur les liens de la page d'accueil.
  // C'est moins représentatif, mais cela suffit à répondre à la seule question
  // qui compte ici — le site publie-t-il du schema.org/Recipe ?
  const accueil = await texte(`https://www.${domaine}/`) ?? await texte(`https://${domaine}/`)
  await dors()
  if (!accueil) return []
  const liens = [...accueil.matchAll(/href="((?:https?:\/\/[^"]*)?\/[^"]*recette[^"]*)"/gi)]
    .map(m => m[1])
    .map(u => (u.startsWith('http') ? u : `https://www.${domaine}${u}`))
    .filter(u => !/\/(recettes|recipes)\/?$/i.test(u))
  return [...new Set(liens)].slice(0, PAGES)
}

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
  const r = robots(await texte(`https://${domaine}/robots.txt`, 15000))
  await dors()

  const urls = await urlsDeRecettes(domaine, r)
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
