/**
 * Passe l'analyseur sur le VRAI corpus et compare à la mesure Python de référence.
 * Si les proportions divergent, c'est l'analyseur qui a tort, pas le corpus.
 */
import { readFileSync } from 'node:fs'
import { analyser } from '../src/ingredient.ts'

const UA = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36',
             'Accept-Language': 'fr-FR,fr;q=0.9' }

function* walk(o) {
  if (Array.isArray(o)) { for (const v of o) yield* walk(v); return }
  if (o && typeof o === 'object') {
    const t = o['@type']
    if (t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'))) yield o
    for (const v of Object.values(o)) yield* walk(v)
  }
}

async function recette(url) {
  let html
  try { html = await (await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })).text() }
  catch { return null }
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let d
    try { d = JSON.parse(m[1].trim().replace(/&quot;/g, '"').replace(/&amp;/g, '&')) } catch { continue }
    for (const r of walk(d)) return r
  }
  return null
}

const urls = readFileSync(
  '/tmp/claude-1000/-home-kamil-PERSO-smart-receipe-scheduler/fd0290f1-2535-4343-888a-b55a0915f60d/scratchpad/sm.out',
  'utf8').split('\n').filter(l => l.startsWith('URL|')).map(l => l.split('|')[2])

const lots = []
for (let i = 0; i < urls.length; i += 12) lots.push(urls.slice(i, i + 12))
const recettes = []
for (const lot of lots) recettes.push(...(await Promise.all(lot.map(recette))).filter(Boolean))

const compte = { masse: 0, volume: 0, cuillere: 0, compte: 0, aucune: 0, section: 0 }
const exemples = { aucune: [], compte: [], cuillere: [] }
let n = 0, avecAliment = 0
for (const r of recettes) {
  for (const ligne of (r.recipeIngredient ?? [])) {
    if (typeof ligne !== 'string') continue
    const a = analyser(ligne)
    compte[a.forme]++; n++
    if (a.aliment && a.aliment !== ligne) avecAliment++
    if (exemples[a.forme]?.length < 4) exemples[a.forme]?.push(`${ligne}  →  ${a.qte ?? '—'} ${a.unite ?? ''} · « ${a.aliment} »`)
  }
}

const REF = { masse: 24, volume: 9, cuillere: 23, compte: 27, aucune: 16 }
console.log(`\n### ANALYSEUR SUR LE CORPUS RÉEL — ${recettes.length} recettes, ${n} lignes\n`)
console.log('  forme       mesuré   référence Python   écart')
for (const [k, ref] of Object.entries(REF)) {
  const pct = Math.round(100 * compte[k] / n)
  const d = pct - ref
  console.log(`  ${k.padEnd(11)} ${String(pct).padStart(4)} %   ${String(ref).padStart(9)} %   ${d >= 0 ? '+' : ''}${d}`)
}
console.log(`  section     ${String(Math.round(100 * compte.section / n)).padStart(4)} %   (les intertitres, non comptés dans la référence)`)
console.log(`\n  nom d'aliment extrait sur ${Math.round(100 * avecAliment / n)} % des lignes\n`)
for (const [k, ex] of Object.entries(exemples)) {
  console.log(`  ${k} :`)
  for (const e of ex) console.log(`    ${e}`)
}
