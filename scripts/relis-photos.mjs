#!/usr/bin/env node
/**
 * Relire UNE fois les pages déjà ingérées, pour y prendre la photo (R3).
 *
 * Les 1 426 recettes du catalogue ont été ingérées avant que `jsonld.ts` lise le
 * champ `image`. Leur page n'a pas bougé : on la relit, on prend l'adresse de la
 * photo, on l'écrit dans `recipe.image_url`. Rien d'autre — ni le titre, ni les
 * étapes, ni l'image elle-même : la photo reste chez le site.
 *
 * ⚠️ La même politesse que l'ingestion : une page par seconde et par domaine, en
 *    série, notre agent, `robots.txt` lu et suivi. On ne contourne rien :
 *      - trois refus de suite (statut de refus, ou page de défi sans recette) :
 *        le site est laissé pour ce passage ;
 *      - cinq erreurs de suite (5xx, réseau, délai) : idem, un site en panne
 *        n'est pas martelé ;
 *      - `robots.txt` en 5xx ou injoignable : le domaine est laissé (RFC 9309) ;
 *        en 4xx, rien n'est interdit.
 *    Kamil a accordé cette relecture pour la prod le 19/10/2026.
 *
 *   npm run relis-photos -- --domaine 127.0.0.1:8787             (local)
 *   npm run relis-photos -- --prod --sec --limite 20             (regarder avant)
 *   npm run relis-photos -- --prod                               (35 à 50 min)
 *
 * Durée : 1 426 pages à 1,1 s font 26 min d'attente pure ; avec la latence de
 * chaque site (0,3 à 1,5 s par page), compter 35 à 50 minutes.
 *
 * Relancer reprend où l'on s'est arrêté : seules les recettes encore sans photo
 * sont relues.
 */
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { extraire } from '../worker/src/jsonld.ts'
import { AGENT, autorise, lireRobots } from '../worker/src/sitemap.ts'
import { abandonne, issueDe, robotsDe } from '../worker/src/relecture.ts'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const PROD = args.includes('--prod')
const SEC = args.includes('--sec')
const LIMITE = opt('--limite') ? Number(opt('--limite')) : null
const DOMAINES = args.filter((_, i) => args[i - 1] === '--domaine')

// ⚠️ `override` : sans lui, `.env` gagnerait, et l'on écrirait en local avec la
//    clé de prod (voir recalcule.mjs).
config({ path: PROD ? '.env.production' : '.env', override: true })
const URL_BASE = process.env.VITE_SUPABASE_URL
const CLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_BASE || !CLE) { console.error('URL ou clé de service manquante.'); process.exit(1) }

/*
 * En local, le catalogue est fait d'adresses de TEST — `https://exemple.fr/…`,
 * `https://x/…`. Les relire, ce serait frapper chez des inconnus : on n'y relit
 * que le domaine qu'on désigne.
 */
if (!PROD && DOMAINES.length === 0) {
  console.error('En local, dis quel domaine relire : --domaine <hôte>.')
  process.exit(1)
}

const db = createClient(URL_BASE, CLE, { auth: { persistSession: false } })

/** 1 100 ms entre deux requêtes au même domaine, `robots.txt` compris. */
const PAUSE_MS = 1100
const dors = ms => new Promise(r => setTimeout(r, ms))
const hote = u => { try { return new URL(u).host } catch { return null } }
const duree = ms => `${Math.floor(ms / 60000)} min ${String(Math.round(ms / 1000) % 60).padStart(2, '0')} s`

/**
 * Une requête, avec NOTRE agent. Rend le statut (0 : réseau ou délai dépassé) et
 * le corps quand la réponse est un succès. `texteDe` ne convient pas ici : il
 * rend `null` pour un 404 comme pour un 503, et le robots.txt doit les distinguer.
 */
async function demande(url, timeoutMs) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    return { statut: res.status, corps: res.ok ? await res.text() : null }
  } catch {
    return { statut: 0, corps: null }
  }
}

/** Le catalogue ingéré qui n'a pas encore sa photo. PostgREST plafonne à mille. */
async function aRelire() {
  const tout = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await db.from('recipe')
      .select('id, source_url')
      .is('image_url', null).is('owner_household_id', null)
      .eq('origin', 'importee').not('source_url', 'is', null)
      .order('id').range(de, de + 999)
    if (error) throw new Error(error.message)
    tout.push(...data)
    if (data.length < 1000) break
  }
  return tout
}

let recettes = (await aRelire()).filter(r => hote(r.source_url))
if (DOMAINES.length > 0) recettes = recettes.filter(r => DOMAINES.includes(hote(r.source_url)))
if (LIMITE) recettes = recettes.slice(0, LIMITE)

const parDomaine = new Map()
for (const r of recettes) {
  const h = hote(r.source_url)
  if (!parDomaine.has(h)) parDomaine.set(h, [])
  parDomaine.get(h).push(r)
}

/*
 * Un ordre neuf à chaque passage. Une page en échec n'est retenue nulle part :
 * dans l'ordre des `id`, trois pages mortes en tête d'un site le feraient
 * abandonner à chaque relance, et la reprise promise ne vaudrait pas pour lui.
 */
for (const liste of parDomaine.values()) {
  for (let i = liste.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[liste[i], liste[j]] = [liste[j], liste[i]]
  }
}

console.log(`Cible : ${URL_BASE}${SEC ? '  (à sec, rien ne sera écrit)' : ''}`)
console.log(`${recettes.length} pages à relire sur ${parDomaine.size} domaine(s), une par seconde.\n`)

const debut = Date.now()
const bilan = []
for (const [domaine, liste] of parDomaine) {
  const debutDomaine = Date.now()
  const b = { domaine, robots: '-', lues: 0, photo: 0, 'sans-photo': 0, 'sans-recette': 0,
    disparue: 0, refusee: 0, erreur: 0, interdites: 0, abandonnees: 0, durée: '' }
  const issues = []

  // robots.txt à l'origine de la page elle-même : son protocole, son port. Sa
  // réponse dit comment le traiter : 2xx on le suit, 4xx tout est permis, 5xx ou
  // injoignable on laisse le domaine pour ce passage.
  const rob = await demande(`${new URL(liste[0].source_url).origin}/robots.txt`, 15000)
  const voie = robotsDe(rob.statut)
  b.robots = rob.statut
  await dors(PAUSE_MS)

  if (voie === 'laisser') {
    b.abandonnees = liste.length
    b.durée = duree(Date.now() - debutDomaine)
    console.log(`[${domaine}] robots.txt en ${rob.statut || 'erreur réseau'} : domaine laissé pour ce passage.`)
    bilan.push(b)
    continue
  }
  const robots = lireRobots(voie === 'lire' ? rob.corps : null)
  // Un `Crawl-delay` plus long que le nôtre l'emporte.
  const pause = Math.max(PAUSE_MS, (robots.delai ?? 0) * 1000)

  for (const [i, r] of liste.entries()) {
    if (abandonne(issues)) {
      b.abandonnees = liste.length - i
      console.log(`[${domaine}] abandon après ${issues.at(-1)} de suite : ${b.abandonnees} pages laissées.`)
      break
    }
    if (!autorise(new URL(r.source_url).pathname, robots)) { b.interdites++; continue }

    const { statut, corps: html } = await demande(r.source_url, 30000)
    const brute = html ? extraire(html, r.source_url) : null
    const issue = issueDe(statut, brute !== null, brute?.image ?? null)
    issues.push(issue)
    b.lues++
    b[issue]++

    if (issue === 'photo' && !SEC) {
      // `is('image_url', null)` : on ne remplace jamais une photo déjà posée.
      const { error } = await db.from('recipe').update({ image_url: brute.image })
        .eq('id', r.id).is('image_url', null)
      if (error) throw new Error(`${r.id} : ${error.message}`)
    }
    console.log(`[${domaine}] ${String(i + 1).padStart(4)}/${liste.length} `
      + `${issue.padEnd(12)} ${issue === 'photo' ? brute.image : r.source_url}`)
    await dors(pause)
  }
  b.durée = duree(Date.now() - debutDomaine)
  bilan.push(b)
}

console.log(`\nTerminé en ${duree(Date.now() - debut)}.\n`)
console.table(bilan)
