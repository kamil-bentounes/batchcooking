#!/usr/bin/env node
/**
 * Banc d'essai des modèles pour « Envie spéciale ».
 *
 * « Lequel est le meilleur ? » ne se répond pas en lisant des classements
 * généralistes : ce qu'on demande ici est étroit et vérifiable — du JSON valide,
 * des contraintes tenues, des appareils qui existent dans NOTRE catalogue, et
 * du français mangeable.
 *
 * Tout est noté automatiquement. Aucun jugement de goût : ce qui est mesurable
 * est mesuré, le reste est affiché pour être lu.
 *
 *   node scripts/banc.mjs                 # tous les modèles configurés
 *   node scripts/banc.mjs --essais 5      # plus de tirages par modèle
 *
 * Les clés se lisent dans ~/PERSO/<fournisseur>_token.txt, jamais en argument.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const ESSAIS = Number(opt('--essais') ?? 3)

const cle = nom => {
  try { return readFileSync(join(homedir(), 'PERSO', `${nom}_token.txt`), 'utf8').trim() }
  catch { return null }
}

const GROQ = cle('groq')
const GEMINI = cle('gemini')

const MODELES = [
  GROQ && { nom: 'groq · gpt-oss-120b', base: 'https://api.groq.com/openai/v1', modele: 'openai/gpt-oss-120b', cle: GROQ },
  GROQ && { nom: 'groq · gpt-oss-20b', base: 'https://api.groq.com/openai/v1', modele: 'openai/gpt-oss-20b', cle: GROQ },
  GROQ && { nom: 'groq · qwen3.8-27b', base: 'https://api.groq.com/openai/v1', modele: 'qwen/qwen3.8-27b', cle: GROQ },
  GEMINI && { nom: 'gemini · 3.8-flash', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-3.8-flash', cle: GEMINI },
  GEMINI && { nom: 'gemini · flash-latest', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-flash-latest', cle: GEMINI },
  GEMINI && { nom: 'gemini · 2.5-flash-lite', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-2.5-flash-lite', cle: GEMINI },
].filter(Boolean)

// ── Le cas d'essai : exactement ce que la fonction envoie ───────────────────
const PLACARDS = ['skyr (400 g)', 'blanc de poulet (300 g)', 'patate douce (2)',
  'oignon (1)', 'curry en poudre', 'ail', 'citron', 'huile d\'olive', 'riz basmati (500 g)']
const CONTRAINTES = { proteinesMin: 30, kcalMax: 620, minutesMax: 25 }
const APPAREILS_AUTORISES = ['plaque', 'air_fryer']

const SCHEMA = `{
  "titre": "string",
  "parts": number,
  "ingredients": [{ "nom": "string", "quantite": number|null, "unite": "g"|"ml"|"u"|null }],
  "etapes": [{ "texte": "string", "minutes": number|null,
               "appareil": "four"|"plaque"|"air_fryer"|"micro_ondes"|"fait_tout"|null,
               "charge": "actif"|"passif"|"bloquant" }],
  "kcalParPart": [bas, haut],
  "proteinesParPart": [bas, haut],
  "minutesActives": number,
  "manquants": ["ingrédient absent des placards"],
  "note": "string, facultative"
}`

const PROMPT = [
  'Tu inventes une recette de batch cooking, gourmande et réaliste.',
  'Envie exprimée : « quelque chose de crémeux et épicé ».',
  `N'utilise QUE ces ingrédients : ${PLACARDS.join(', ')}. Si c'est impossible, dis-le dans "manquants".`,
  `Contraintes : au moins ${CONTRAINTES.proteinesMin} g de protéines par part ; `
    + `au plus ${CONTRAINTES.kcalMax} kcal par part ; `
    + `au plus ${CONTRAINTES.minutesMax} minutes de travail actif ; `
    + `uniquement avec : ${APPAREILS_AUTORISES.join(', ')}.`,
  'Prévois 2 parts.',
  "Donne des quantités en grammes chaque fois que c'est possible.",
  'Les valeurs nutritionnelles sont des FOURCHETTES : tu estimes, tu ne mesures pas.',
  'Réponds UNIQUEMENT par un objet JSON de cette forme, sans texte autour :',
  SCHEMA,
].join('\n')

async function appelle(m) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${m.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m.cle}` },
      body: JSON.stringify({
        model: m.modele,
        temperature: 0.8,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Tu réponds toujours par un unique objet JSON valide.' },
          { role: 'user', content: PROMPT },
        ],
      }),
      signal: AbortSignal.timeout(90000),
    })
    const ms = Date.now() - t0
    if (!res.ok) return { ms, erreur: `HTTP ${res.status} ${(await res.text()).slice(0, 90)}` }
    const j = await res.json()
    return { ms, brut: j.choices?.[0]?.message?.content ?? '', jetons: j.usage?.total_tokens ?? null }
  } catch (e) {
    return { ms: Date.now() - t0, erreur: String(e.message ?? e).slice(0, 90) }
  }
}

/** Les critères. Chacun vaut un point, chacun est vérifiable sans goût. */
const CRITERES = [
  ['json', r => !!r],
  ['champs', r => r && typeof r.titre === 'string' && Array.isArray(r.ingredients)
    && Array.isArray(r.etapes) && Array.isArray(r.kcalParPart) && Array.isArray(r.proteinesParPart)],
  ['protéines', r => Number(r?.proteinesParPart?.[0]) >= CONTRAINTES.proteinesMin],
  ['kcal', r => Number(r?.kcalParPart?.[1]) <= CONTRAINTES.kcalMax],
  ['minutes', r => Number(r?.minutesActives) <= CONTRAINTES.minutesMax],
  ['appareils', r => (r?.etapes ?? []).every(e =>
    e.appareil === null || e.appareil === undefined || APPAREILS_AUTORISES.includes(e.appareil))],
  ['charges', r => (r?.etapes ?? []).every(e =>
    ['actif', 'passif', 'bloquant'].includes(e.charge))],
  ['étapes datées', r => (r?.etapes ?? []).length > 0
    && (r?.etapes ?? []).every(e => typeof e.minutes === 'number' && e.minutes > 0)],
  ['placards', r => {
    // `perimetre: frigo` interdit d'inventer un ingrédient sans le déclarer.
    const dispo = PLACARDS.map(p => p.split(' (')[0].toLowerCase())
    const inventes = (r?.ingredients ?? []).filter(i =>
      !dispo.some(d => i.nom?.toLowerCase().includes(d) || d.includes(i.nom?.toLowerCase() ?? '@')))
    return inventes.length === 0 || (r?.manquants ?? []).length >= inventes.length
  }],
  ['français', r => {
    // Un titre sans mot anglais courant et sans caractère non latin.
    const t = (r?.titre ?? '') + ' ' + (r?.etapes ?? []).map(e => e.texte).join(' ')
    return t.length > 40 && !/[一-鿿Ѐ-ӿ]/.test(t)
      && !/\b(the|with|and|chicken|sweet potato)\b/i.test(t)
  }],
]

function analyse(brut) {
  if (!brut) return null
  try {
    const d = brut.indexOf('{')
    const f = brut.lastIndexOf('}')
    return JSON.parse(brut.slice(d, f + 1))
  } catch { return null }
}

console.log(`\nBanc d'essai — ${MODELES.length} modèles, ${ESSAIS} tirages chacun.`)
console.log(`Critères : ${CRITERES.map(c => c[0]).join(' · ')}\n`)

const resultats = []
for (const m of MODELES) {
  const latences = []
  const jetons = []
  const echecs = []
  const titres = []
  // Un compteur PAR critère : la note globale dit qui gagne, le détail dit
  // pourquoi l'autre perd — et c'est le détail qui sert à choisir.
  const reussites = CRITERES.map(() => 0)

  for (let i = 0; i < ESSAIS; i++) {
    const r = await appelle(m)
    latences.push(r.ms)
    if (r.jetons) jetons.push(r.jetons)
    if (r.erreur) { echecs.push(r.erreur); continue }
    const objet = analyse(r.brut)
    if (objet?.titre) titres.push(objet.titre)
    CRITERES.forEach(([, test], k) => {
      try { if (test(objet)) reussites[k]++ } catch { /* un critère qui lève est un échec */ }
    })
  }

  const total = reussites.reduce((a, b) => a + b, 0)
  resultats.push({
    modele: m,
    note: total / (ESSAIS * CRITERES.length),
    latence: latences.reduce((a, b) => a + b, 0) / latences.length,
    jetons: jetons.length ? Math.round(jetons.reduce((a, b) => a + b, 0) / jetons.length) : null,
    reussites, echecs, titres,
  })

  const d = resultats.at(-1)
  const rates = CRITERES.map(([nom], k) => (reussites[k] < ESSAIS ? nom : null)).filter(Boolean)
  console.log(`  ${m.nom.padEnd(26)} ${(d.note * 100).toFixed(0).padStart(3)} %`
    + `  ${(d.latence / 1000).toFixed(1).padStart(5)} s`
    + `  ${String(d.jetons ?? '—').padStart(6)} jetons`
    + (echecs.length ? `  ⚠️ ${echecs.length} échec(s) : ${echecs[0]}` : '')
    + (rates.length ? `  rate : ${rates.join(', ')}` : ''))
}

console.log(`\n${'modèle'.padEnd(26)} ${'note'.padStart(6)} ${'latence'.padStart(9)} ${'jetons'.padStart(8)}`)
console.log('-'.repeat(54))
for (const r of [...resultats].sort((a, b) => b.note - a.note || a.latence - b.latence)) {
  console.log(r.modele.nom.padEnd(26)
    + `${(r.note * 100).toFixed(0)} %`.padStart(7)
    + `${(r.latence / 1000).toFixed(1)} s`.padStart(10)
    + String(r.jetons ?? '—').padStart(9))
}
console.log()
console.log(`${'critère'.padEnd(16)}${resultats.map(r => r.modele.nom.split(' · ')[1].slice(0, 9).padStart(11)).join('')}`)
console.log('-'.repeat(16 + resultats.length * 11))
CRITERES.forEach(([nom], k) => {
  console.log(nom.padEnd(16)
    + resultats.map(r => `${r.reussites[k]}/${ESSAIS}`.padStart(11)).join(''))
})

console.log()
for (const r of resultats) {
  if (r.titres.length) console.log(`  ${r.modele.nom} — ${r.titres.slice(0, 2).join(' · ')}`)
}
console.log()
