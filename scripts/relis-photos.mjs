#!/usr/bin/env node
/**
 * Relire UNE fois les pages déjà ingérées, pour y prendre la photo (R3).
 *
 * Les 1 426 recettes du catalogue ont été ingérées avant que `jsonld.ts` lise le
 * champ `image`. Leur page n'a pas bougé : on la relit, on prend l'adresse de la
 * photo, on l'écrit dans `recipe.image_url`. Rien d'autre — ni le titre, ni les
 * étapes, ni l'image elle-même : la photo reste chez le site.
 *
 * ⚠️ La même politesse que l'ingestion, et un peu plus : notre agent, `robots.txt`
 *    lu et suivi (RFC 9309), UNE requête par seconde et par hôte — `robots.txt` et
 *    chaque redirection comprises. On ne contourne rien :
 *      - trois refus de suite (statut de refus, ou page de défi sans recette) :
 *        le site est laissé pour ce passage ;
 *      - cinq erreurs de suite (5xx, réseau, délai) : idem, un site en panne
 *        n'est pas martelé ;
 *      - `robots.txt` en 401, 403, 429 (un refus, peut-être un défi), en 5xx ou
 *        injoignable : le domaine est laissé ; en 404 et autres 4xx, rien n'est
 *        interdit ;
 *      - `Crawl-delay` au-delà de 30 s : le domaine est laissé ;
 *      - une page est lue jusqu'à 2 Mo, pas plus ;
 *      - une redirection n'est suivie que dans le MÊME site (même hôte, ou le même
 *        au `www.` près), trois fois au plus, après la pause de SON hôte et
 *        après le `robots.txt` de cet hôte. Vers un autre site, une adresse
 *        privée ou un autre schéma : la page compte pour une erreur.
 *    Kamil a accordé cette relecture pour la prod le 19/10/2026.
 *
 *   npm run relis-photos -- --domaine 127.0.0.1:8787             (local)
 *   npm run relis-photos -- --prod --sec --limite 20             (regarder avant)
 *   npm run relis-photos -- --prod                               (35 à 50 min)
 *
 * Options : `--prod`, `--sec` (rien n'est écrit), `--tout` (relire aussi ce que
 * l'état dit réglé), `--limite N`, `--domaine HÔTE` (répétable). Les deux formes
 * `--limite 20` et `--limite=20` marchent ; une valeur illisible ou une option
 * inconnue arrête tout — jamais « sans limite » par mégarde.
 *
 * Durée : 1 426 pages à 1,1 s font 26 min d'attente pure ; avec la latence de
 * chaque site (0,3 à 1,5 s par page), compter 35 à 50 minutes.
 *
 * Reprise : `.relis-photos.etat.json` (à la racine, hors git) note les recettes
 * réglées — photo posée, sans photo, disparue, interdite par robots.txt — avec
 * leur issue, par base cible. Relancer les saute ; une page en refus ou en erreur
 * n'y est pas, elle sera relue. Pour tout relire : `--tout`, ou supprimer le
 * fichier (`rm .relis-photos.etat.json`). `--sec` lit l'état et ne l'écrit jamais.
 */
import { readFileSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { extraire } from '../worker/src/jsonld.ts'
import { AGENT, autorise, cheminDe, lireRobots } from '../worker/src/sitemap.ts'
import {
  abandonne, cleSite, hopSuivi, issueDe, lireArguments, lireBorne, MAX_REDIRECTIONS,
  PAUSE_MS, pauseDe, robotsDe,
} from '../worker/src/relecture.ts'

const lus = lireArguments(process.argv.slice(2))
if ('erreur' in lus) {
  console.error(`${lus.erreur}\nUsage : relis-photos [--prod] [--sec] [--tout] [--limite N] [--domaine HÔTE]...`)
  process.exit(1)
}
const { prod: PROD, sec: SEC, tout: TOUT, limite: LIMITE, domaines: DOMAINES } = lus

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

const dors = ms => new Promise(r => setTimeout(r, ms))
const hote = u => { try { return new URL(u).host } catch { return null } }
const duree = ms => `${Math.floor(ms / 60000)} min ${String(Math.round(ms / 1000) % 60).padStart(2, '0')} s`

/*
 * L'état de la reprise : { "<base cible>": { "<id>": { issue, le } } }. Rangé par
 * base, parce que les identifiants du local ne sont pas ceux de la prod. Illisible,
 * on s'arrête : le jeter en silence, ce serait tout relire chez des tiers.
 */
const FICHIER_ETAT = fileURLToPath(new URL('../.relis-photos.etat.json', import.meta.url))
const REGLEES = new Set(['photo', 'sans-photo', 'disparue', 'interdite'])

function lisEtat() {
  try {
    return JSON.parse(readFileSync(FICHIER_ETAT, 'utf8'))
  } catch (e) {
    if (e.code === 'ENOENT') return {}
    console.error(`.relis-photos.etat.json illisible (${e.message}) : corrige-le, ou supprime-le pour tout relire.`)
    process.exit(1)
  }
}
const etat = lisEtat()
etat[URL_BASE] ??= {}
const regle = etat[URL_BASE]

function noteRegle(id, issue) {
  if (SEC || !REGLEES.has(issue)) return
  regle[id] = { issue, le: new Date().toISOString() }
  writeFileSync(`${FICHIER_ETAT}.tmp`, JSON.stringify(etat, null, 1))
  renameSync(`${FICHIER_ETAT}.tmp`, FICHIER_ETAT)
}

/*
 * Le rythme. `dernier` : la fin de la dernière requête à chaque SITE (`a.fr` et
 * `www.a.fr` n'en font qu'un) ; la suivante attend sa pause (1 100 ms, ou son
 * `Crawl-delay`). Toutes les requêtes — robots.txt, pages, étapes d'une
 * redirection — passent par là.
 */
const dernier = new Map()
const pauses = new Map()
const attends = h => {
  const s = cleSite(h)
  return dors(Math.max(0, (dernier.get(s) ?? 0) + (pauses.get(s) ?? PAUSE_MS) - Date.now()))
}

const REDIRECTIONS = new Set([301, 302, 303, 307, 308])

/**
 * UNE requête, avec NOTRE agent, sans suivre de redirection. Rend le statut (0 :
 * réseau ou délai dépassé), l'adresse de renvoi, et le corps (borné) d'un succès.
 * `texteDe` ne convient pas ici : il rend `null` pour un 404 comme pour un 503, et
 * le robots.txt doit les distinguer.
 */
async function unGet(url, timeoutMs) {
  const h = new URL(url).host
  await attends(h)
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',
    })
    const ok = res.status >= 200 && res.status < 300
    const corps = ok ? await lireBorne(res) : null
    if (!ok) await res.body?.cancel().catch(() => {})
    return { statut: res.status, location: res.headers.get('location'), corps }
  } catch {
    return { statut: 0, location: null, corps: null }
  } finally {
    dernier.set(cleSite(h), Date.now())
  }
}

const reglesDeHote = new Map()

/**
 * Le robots.txt de l'hôte de `url`, lu UNE fois : sa voie, ses règles, et la pause
 * qu'il nous impose. Rien n'est demandé deux fois, et un hôte atteint par
 * redirection a le sien, avec sa pause.
 */
async function reglesDe(url) {
  const h = new URL(url).host
  if (reglesDeHote.has(h)) return reglesDeHote.get(h)
  const rob = await suis(`${new URL(url).origin}/robots.txt`, { controle: false, timeoutMs: 15000 })
  let voie = robotsDe(rob.statut)
  let raison = voie === 'laisser' ? `robots.txt en ${rob.statut || (rob.raison ?? 'erreur réseau')}` : ''
  const robots = lireRobots(voie === 'lire' ? rob.corps : null)
  if (voie !== 'laisser') {
    const pause = pauseDe(robots.delai)
    if (pause === null) { voie = 'laisser'; raison = `Crawl-delay de ${robots.delai} s, au-delà du plafond de 30 s` }
    // Le rythme se compte par SITE : `a.fr` et `www.a.fr` partagent la plus longue.
    else pauses.set(cleSite(h), Math.max(pause, pauses.get(cleSite(h)) ?? 0))
  }
  const e = { voie, robots, statut: rob.statut, raison }
  reglesDeHote.set(h, e)
  return e
}

/**
 * Une page, redirections comprises : trois au plus, chacune dans le même site, et
 * chacune après la pause de son hôte. Avec `controle`, le chemin de chaque étape
 * est confronté au robots.txt de son hôte AVANT de le demander.
 *
 * Rend `{ statut, corps, finale }` ; `interdite` quand robots.txt ferme le chemin ;
 * `raison` quand une redirection n'est pas suivie (statut 0 : une erreur).
 */
async function suis(url, { controle, timeoutMs }) {
  let courante = url
  for (let etape = 0; ; etape++) {
    if (controle) {
      const e = await reglesDe(courante)
      if (e.voie === 'laisser') return { statut: 0, finale: courante, raison: `${hote(courante)} : ${e.raison}` }
      if (!autorise(cheminDe(courante), e.robots)) return { interdite: true, statut: 0, finale: courante }
    }
    const r = await unGet(courante, timeoutMs)
    if (!REDIRECTIONS.has(r.statut)) return { statut: r.statut, corps: r.corps, finale: courante }
    if (!r.location) return { statut: r.statut, finale: courante, raison: 'redirection sans adresse' }
    if (etape >= MAX_REDIRECTIONS) return { statut: 0, finale: courante, raison: `plus de ${MAX_REDIRECTIONS} redirections` }
    const h = hopSuivi(courante, r.location)
    if (!h.ok) return { statut: 0, finale: courante, raison: h.raison }
    courante = h.url
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
const avantEtat = recettes.length
if (!TOUT) recettes = recettes.filter(r => !regle[r.id])
const sautees = avantEtat - recettes.length
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
if (sautees > 0) console.log(`${sautees} recette(s) déjà réglée(s) d'après ${FICHIER_ETAT.split('/').at(-1)}, sautée(s) (--tout pour les relire).`)
console.log(`${recettes.length} pages à relire sur ${parDomaine.size} domaine(s), une par seconde et par hôte.\n`)

const debut = Date.now()
const bilan = []
for (const [domaine, liste] of parDomaine) {
  const debutDomaine = Date.now()
  const b = { domaine, robots: '-', lues: 0, photo: 0, 'sans-photo': 0, 'sans-recette': 0,
    disparue: 0, refusee: 0, erreur: 0, interdites: 0, abandonnees: 0, durée: '' }
  const issues = []

  // robots.txt à l'origine de la page elle-même : son protocole, son port. Sa
  // réponse dit comment le traiter : 2xx on le suit, 4xx (sauf 401, 403, 429) tout
  // est permis, le reste on laisse le domaine pour ce passage.
  const e = await reglesDe(liste[0].source_url)
  b.robots = e.statut
  if (e.voie === 'laisser') {
    b.abandonnees = liste.length
    b.durée = duree(Date.now() - debutDomaine)
    console.log(`[${domaine}] ${e.raison} : domaine laissé pour ce passage.`)
    bilan.push(b)
    continue
  }

  for (const [i, r] of liste.entries()) {
    if (abandonne(issues)) {
      b.abandonnees = liste.length - i
      console.log(`[${domaine}] abandon après ${issues.at(-1)} de suite : ${b.abandonnees} pages laissées.`)
      break
    }
    const rang = `[${domaine}] ${String(i + 1).padStart(4)}/${liste.length}`

    const res = await suis(r.source_url, { controle: true, timeoutMs: 30000 })
    if (res.interdite) {
      b.interdites++
      noteRegle(r.id, 'interdite')
      console.log(`${rang} interdite    ${res.finale}`)
      continue
    }
    // L'adresse de la photo se résout contre la page où l'on est ARRIVÉ.
    const brute = res.corps ? extraire(res.corps, res.finale) : null
    const issue = issueDe(res.statut, brute !== null, brute?.image ?? null)
    issues.push(issue)
    b.lues++
    b[issue]++

    if (issue === 'photo' && !SEC) {
      // `is('image_url', null)` : on ne remplace jamais une photo déjà posée.
      const { error } = await db.from('recipe').update({ image_url: brute.image })
        .eq('id', r.id).is('image_url', null)
      if (error) throw new Error(`${r.id} : ${error.message}`)
    }
    noteRegle(r.id, issue)
    console.log(`${rang} ${issue.padEnd(12)} `
      + `${issue === 'photo' ? brute.image : r.source_url}${res.raison ? `  (${res.raison})` : ''}`)
  }
  b.durée = duree(Date.now() - debutDomaine)
  bilan.push(b)
}

console.log(`\nTerminé en ${duree(Date.now() - debut)}.\n`)
console.table(bilan)
