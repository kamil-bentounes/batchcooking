#!/usr/bin/env node
/**
 * Banc d'essai de la LECTURE DE TICKET.
 *
 * On ne mesure pas « est-ce que ça marche » mais trois choses précises, qui
 * sont les trois façons de se tromper sur un ticket :
 *
 *   · **la couverture** — combien des articles du papier ont été lus ;
 *   · **les montants** — combien sont exacts au centime ;
 *   · **le bruit** — combien de lignes inventées, ou de sous-totaux, de points
 *     de fidélité et de rendus monnaie pris pour des achats.
 *
 * Le prompt et le schéma sont IMPORTÉS de la fonction : recopiés, ils
 * divergeraient, et le banc mesurerait autre chose que ce qui part en prod.
 *
 *   npm run banc-ticket -- ticket.jpg
 *   npm run banc-ticket -- ticket.jpg --verite verite.json --essais 2
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SCHEMA, SYSTEME } from '../supabase/functions/ticket/prompt.ts'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const ESSAIS = Number(opt('--essais') ?? 1)
const PHOTO = args.find(a => /\.(jpe?g|png|webp)$/i.test(a))
if (!PHOTO) {
  console.error('Donne une photo : npm run banc-ticket -- ticket.jpg')
  process.exit(1)
}

const cle = n => {
  try { return readFileSync(join(homedir(), 'PERSO', `${n}_token.txt`), 'utf8').trim() }
  catch { return null }
}
const GEMINI = cle('gemini')
if (!GEMINI) { console.error('Pas de clé Gemini.'); process.exit(1) }

const b64 = readFileSync(PHOTO).toString('base64')
const type = PHOTO.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
const dataUrl = `data:image/${type};base64,${b64}`

/** La vérité du papier, quand on la donne. Sinon le banc ne fait que décrire. */
const VERITE = opt('--verite')
  ? JSON.parse(readFileSync(opt('--verite'), 'utf8'))
  : null

const MODELES = (opt('--modeles')
  ?? 'gemini-3.5-flash-lite,gemini-flash-lite-latest,gemini-3.6-flash').split(',')

const BASE = 'https://generativelanguage.googleapis.com/v1beta/openai'

async function lit(modele) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI}` },
    body: JSON.stringify({
      model: modele,
      max_completion_tokens: 8000,
      response_format: { type: 'json_schema', json_schema: { name: 'ticket', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: SYSTEME },
        { role: 'user', content: [
          { type: 'text', text: 'Lis ce ticket de caisse.\n\n<contexte>\nL’enseigne est à lire en haut du ticket.\n</contexte>' },
          { type: 'image_url', image_url: { url: dataUrl } },
        ] },
      ],
    }),
    signal: AbortSignal.timeout(90_000),
  })
  const ms = Date.now() - t0
  if (!res.ok) return { erreur: `HTTP ${res.status} ${(await res.text()).slice(0, 100)}`, ms }
  const j = await res.json()
  const c = j.choices?.[0]?.message?.content
  if (!c) return { erreur: 'réponse vide', ms }
  try { return { lu: JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)), ms } }
  catch { return { erreur: 'JSON illisible', ms }  }
}

/** Compare la lecture à la vérité du papier, libellé par libellé. */
function note(lu) {
  const lignes = (lu.lignes ?? []).filter(l => Number(l.price_eur) > 0)
  const somme = Math.round(lignes.reduce((s, l) => s + Number(l.price_eur), 0) * 100) / 100
  if (!VERITE) return { lignes: lignes.length, somme, total: lu.total_eur }

  const cle = s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const restants = [...lignes]
  let trouves = 0, justes = 0
  for (const v of VERITE.lignes) {
    const i = restants.findIndex(l => cle(l.label).includes(cle(v.label).slice(0, 8)))
    if (i < 0) continue
    trouves++
    if (Math.abs(Number(restants[i].price_eur) - v.price_eur) < 0.005) justes++
    restants.splice(i, 1)
  }
  return {
    lignes: lignes.length,
    couverture: `${trouves}/${VERITE.lignes.length}`,
    montants: `${justes}/${VERITE.lignes.length}`,
    // Ce qui reste après appariement est du bruit : une ligne inventée, ou un
    // sous-total pris pour un achat.
    bruit: restants.length,
    bruitDetail: restants.map(l => l.label),
    somme,
    total: lu.total_eur,
    totalJuste: lu.total_eur !== null && Math.abs(Number(lu.total_eur) - VERITE.total) < 0.005,
  }
}

console.log(`Ticket : ${PHOTO}${VERITE ? ` · vérité : ${VERITE.lignes.length} articles, ${VERITE.total} €` : ''}\n`)
for (const m of MODELES) {
  for (let i = 0; i < ESSAIS; i++) {
    const r = await lit(m)
    if (r.erreur) { console.log(`${m.padEnd(26)} ✗ ${r.erreur}`); continue }
    const n = note(r.lu)
    console.log(`${m.padEnd(26)} ${String(r.ms / 1000).padStart(5)} s  ${JSON.stringify(n)}`)
  }
}
