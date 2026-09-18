#!/usr/bin/env node
/**
 * Banc d'essai de la GÉNÉRATION de recette.
 *
 * Deux questions, une seule façon honnête d'y répondre : mesurer.
 *
 *  · quel modèle tient le mieux nos contraintes ?
 *  · le prompt revu selon les guides de référence fait-il mieux que l'ancien ?
 *
 * Dix critères, tous vérifiables sans jugement de goût. La QUALITÉ est notée
 * sur les appels qui ont RÉPONDU ; la DISPONIBILITÉ est comptée à part — sans
 * cela, un 429 provoqué par le banc lui-même se lit comme une faute du modèle
 * et la note ne mesure plus rien. (C'est arrivé : gpt-oss est tombé de 93 % à
 * 75 % sur un quota, pas sur une erreur.)
 *
 *   npm run banc
 *   npm run banc -- --essais 5
 *   npm run banc -- --variante B
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const ESSAIS = Number(opt('--essais') ?? 3)
const SEULE = opt('--variante')
const SEUL_MODELE = opt('--modele')
const PAUSE = Number(opt('--pause') ?? 2500)

const cle = nom => {
  try { return readFileSync(join(homedir(), 'PERSO', `${nom}_token.txt`), 'utf8').trim() }
  catch { return null }
}
const GROQ = cle('groq')
const GEMINI = cle('gemini')

const MODELES = [
  GROQ && { nom: 'groq · gpt-oss-120b', base: 'https://api.groq.com/openai/v1', modele: 'openai/gpt-oss-120b', cle: GROQ },
  GROQ && { nom: 'groq · qwen3.8-27b', base: 'https://api.groq.com/openai/v1', modele: 'qwen/qwen3.8-27b', cle: GROQ },
  // Gemini : 20 requêtes par JOUR et par modèle. On prend le lite, le plus
  // rapide et le plus disponible des modèles essayés.
  GEMINI && { nom: 'gemini · 3.5-flash-lite', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-3.5-flash-lite', cle: GEMINI },
].filter(Boolean).filter(m => !SEUL_MODELE || m.nom.includes(SEUL_MODELE))

// ── Le cas d'essai ──────────────────────────────────────────────────────────
const PLACARDS = ['skyr (400 g)', 'blanc de poulet (300 g)', 'patate douce (2)',
  'oignon (1)', 'curry en poudre', 'ail', 'citron', "huile d'olive", 'riz basmati (500 g)']
const CONTRAINTES = { proteinesMin: 30, kcalMax: 620, minutesMax: 25 }
const APPAREILS_AUTORISES = ['plaque', 'air_fryer']

/** Le schéma strict : conforme là où `json_object` sortait du cadre. */
const SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string' },
    parts: { type: 'integer', minimum: 1, maximum: 12 },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nom: { type: 'string' },
          quantite: { type: ['number', 'null'] },
          unite: { type: ['string', 'null'], enum: ['g', 'ml', 'u', null] },
        },
        required: ['nom', 'quantite', 'unite'],
        additionalProperties: false,
      },
    },
    etapes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          texte: { type: 'string' },
          minutes: { type: 'number', minimum: 1 },
          appareil: {
            type: ['string', 'null'],
            enum: ['four', 'plaque', 'plaques', 'air_fryer', 'micro_ondes', null],
          },
          charge: { type: 'string', enum: ['actif', 'passif', 'bloquant'] },
        },
        required: ['texte', 'minutes', 'appareil', 'charge'],
        additionalProperties: false,
      },
    },
    kcalParPart: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
    proteinesParPart: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
    minutesActives: { type: 'number' },
    manquants: { type: 'array', items: { type: 'string' } },
    note: { type: ['string', 'null'] },
  },
  required: ['titre', 'parts', 'ingredients', 'etapes', 'kcalParPart',
    'proteinesParPart', 'minutesActives', 'manquants', 'note'],
  additionalProperties: false,
}

// ── Variante A : le prompt d'avant la revue ─────────────────────────────────
const A_SYSTEME = 'Tu réponds toujours par un unique objet JSON valide.'
const A_USER = [
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
].join('\n')

/**
 * Variante B : les bonnes pratiques des sources primaires.
 *
 * · rôle et tâche d'abord — l'attention penche vers les premiers jetons
 * · le POURQUOI de chaque règle — Anthropic, « add context to improve performance »
 * · dire quoi FAIRE plutôt que quoi ne pas faire — OpenAI et Anthropic
 * · données séparées des instructions par des balises
 * · un exemple ET un contre-exemple — Google, « always include few-shot examples »
 * · étapes numérotées quand l'ordre compte
 */
const B_SYSTEME = [
  '<role>',
  'Tu composes des plats de batch cooking : gourmands, réalistes, faisables un',
  'dimanche après-midi et bons réchauffés trois jours plus tard.',
  '</role>',
  '',
  '<pourquoi>',
  'Ta recette sera découpée en actions et ordonnancée par un planificateur qui',
  'calcule qui fait quoi et quand. Une étape qui contient deux gestes fausse le',
  "plan ; une durée absente le rend impossible. C'est pour cela que chaque étape",
  'doit tenir en un seul geste et porter sa durée.',
  '</pourquoi>',
  '',
  '<regles>',
  "1. Une étape = UN geste, à l'impératif, avec sa durée en minutes.",
  '2. Écris en français.',
  "3. Donne les quantités en grammes dès que c'est possible : elles servent à",
  "   calculer des apports et à mettre la recette à l'échelle.",
  '4. Les valeurs nutritionnelles sont des fourchettes estimées — tu ne mesures',
  "   rien, et une fourchette honnête vaut mieux qu'un chiffre inventé.",
  "5. Respecte les contraintes chiffrées. Si l'une est intenable, approche-t'en",
  '   au plus près et dis-le dans « note ».',
  '</regles>',
  '',
  '<exemple>',
  'Une étape bien formée, et une mal formée :',
  'BIEN : {"texte":"Émince les oignons","minutes":6,"appareil":null,"charge":"actif"}',
  'MAL  : {"texte":"Émince les oignons puis fais-les revenir","minutes":12,…}',
  '       deux gestes dans une étape : le planificateur ne peut pas les séparer.',
  '</exemple>',
].join('\n')

const B_USER = [
  'Compose une recette.',
  '',
  '<envie>',
  'quelque chose de crémeux et épicé',
  '</envie>',
  '',
  '<placards>',
  PLACARDS.join('\n'),
  '</placards>',
  '',
  '<contraintes>',
  `- au moins ${CONTRAINTES.proteinesMin} g de protéines par part`,
  `- au plus ${CONTRAINTES.kcalMax} kcal par part`,
  `- au plus ${CONTRAINTES.minutesMax} minutes actives au total`,
  `- n'utilise que ces appareils : ${APPAREILS_AUTORISES.join(', ')} (ou aucun)`,
  '- 2 parts',
  '</contraintes>',
  '',
  "N'utilise QUE les ingrédients de <placards>. Si la recette en exige un autre,",
  "nomme-le dans « manquants » — ne l'ajoute pas en silence.",
].join('\n')

const VARIANTES = [
  { nom: 'A — avant', systeme: A_SYSTEME, user: A_USER },
  { nom: 'B — revu', systeme: B_SYSTEME, user: B_USER },
].filter(v => !SEULE || v.nom.startsWith(SEULE))

// ── Les critères : un point chacun, tous vérifiables ────────────────────────
const CRITERES = [
  ['protéines', r => Number(r?.proteinesParPart?.[0]) >= CONTRAINTES.proteinesMin],
  ['kcal', r => Number(r?.kcalParPart?.[1]) <= CONTRAINTES.kcalMax],
  ['minutes', r => Number(r?.minutesActives) <= CONTRAINTES.minutesMax],
  ['appareils', r => (r?.etapes ?? []).every(e =>
    e.appareil === null || e.appareil === 'plaques'
    || APPAREILS_AUTORISES.includes(e.appareil))],
  ['étapes datées', r => (r?.etapes ?? []).length > 0
    && (r?.etapes ?? []).every(e => typeof e.minutes === 'number' && e.minutes > 0)],
  // Le planificateur découpe PAR étape : deux gestes dans une phrase le faussent.
  ['un geste par étape', r => (r?.etapes ?? []).length > 0
    && (r?.etapes ?? []).every(e => !/\b(puis|ensuite|pendant ce temps)\b/i.test(e.texte))],
  ['placards', r => {
    const dispo = PLACARDS.map(p => p.split(' (')[0].toLowerCase())
    const inventes = (r?.ingredients ?? []).filter(i =>
      !dispo.some(d => i.nom?.toLowerCase().includes(d) || d.includes(i.nom?.toLowerCase() ?? '@')))
    return inventes.length === 0 || (r?.manquants ?? []).length >= inventes.length
  }],
  ['grammes', r => {
    const q = (r?.ingredients ?? []).filter(i => i.quantite !== null)
    return q.length > 0 && q.filter(i => i.unite === 'g').length / q.length >= 0.5
  }],
  ['fourchettes', r => Number(r?.kcalParPart?.[1]) > Number(r?.kcalParPart?.[0])
    && Number(r?.proteinesParPart?.[1]) >= Number(r?.proteinesParPart?.[0])],
  ['français', r => {
    const t = (r?.titre ?? '') + ' ' + (r?.etapes ?? []).map(e => e.texte).join(' ')
    return t.length > 40 && !/[一-鿿Ѐ-ӿ]/.test(t)
      && !/\b(the|with|and|chicken|sweet potato|step)\b/i.test(t)
  }],
]

const dors = ms => new Promise(r => setTimeout(r, ms))

/** Un appel, avec reprise sur les échecs qui ne disent rien du modèle. */
async function appelle(m, v, reprises = 3) {
  const t0 = Date.now()
  try {
    const res = await fetch(`${m.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${m.cle}` },
      body: JSON.stringify({
        model: m.modele,
        // ⚠️ Sans cette borne, un modèle à RAISONNEMENT épuise son budget en
        //    réfléchissant : le JSON est tronqué et le schéma strict renvoie
        //    un 400 « missing required content ». C'est ce qui faisait échouer
        //    gpt-oss-120b sur le prompt B, plus riche donc plus « réfléchi ».
        max_completion_tokens: 8000,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'recette', strict: true, schema: SCHEMA },
        },
        messages: [
          { role: 'system', content: v.systeme },
          { role: 'user', content: v.user },
        ],
      }),
      signal: AbortSignal.timeout(75000),
    })
    const ms = Date.now() - t0
    if (!res.ok) {
      const corps = (await res.text()).slice(0, 80)
      // Le 400 `json_validate_failed` de Groq est INTERMITTENT : il survient sur
      // les deux prompts, génération vide à l'appui. Le traiter comme une faute
      // du prompt serait une erreur de lecture — on réessaie, et on le compte
      // comme une indisponibilité.
      const intermittent = res.status === 429 || res.status >= 500
        || (res.status === 400 && corps.includes('json_validate_failed'))
      if (reprises > 0 && intermittent) {
        await dors(6000)
        const encore = await appelle(m, v, reprises - 1)
        return { ...encore, indisponible: (encore.indisponible ?? 0) + 1 }
      }
      return { ms, erreur: `HTTP ${res.status} ${corps}`, indisponible: 1 }
    }
    const j = await res.json()
    return { ms, brut: j.choices?.[0]?.message?.content ?? '', jetons: j.usage?.total_tokens ?? null }
  } catch (e) {
    const ms = Date.now() - t0
    if (reprises > 0) {
      await dors(4000)
      const encore = await appelle(m, v, reprises - 1)
      return { ...encore, indisponible: (encore.indisponible ?? 0) + 1 }
    }
    return { ms, erreur: String(e.message ?? e).slice(0, 80), indisponible: 1 }
  }
}

function analyse(brut) {
  if (!brut) return null
  try {
    return JSON.parse(brut.slice(brut.indexOf('{'), brut.lastIndexOf('}') + 1))
  } catch { return null }
}

console.log('\nBanc de génération — schéma strict.')
console.log(`${MODELES.length} modèles × ${VARIANTES.length} prompts × ${ESSAIS} essais`)
console.log(`Critères : ${CRITERES.map(c => c[0]).join(' · ')}\n`)

const resultats = []
for (const m of MODELES) {
  for (const v of VARIANTES) {
    const latences = []
    const jetons = []
    const echecs = []
    const titres = []
    const reussites = CRITERES.map(() => 0)
    let repondus = 0
    let coupures = 0

    for (let i = 0; i < ESSAIS; i++) {
      if (i > 0) await dors(PAUSE)
      const r = await appelle(m, v)
      latences.push(r.ms)
      coupures += r.indisponible ?? 0
      if (r.jetons) jetons.push(r.jetons)
      if (r.erreur) { echecs.push(r.erreur); continue }
      const o = analyse(r.brut)
      if (!o) { echecs.push('JSON illisible'); continue }
      repondus++
      if (o.titre) titres.push(o.titre)
      CRITERES.forEach(([, test], k) => {
        try { if (test(o)) reussites[k]++ } catch { /* un critère qui lève est un échec */ }
      })
    }

    const total = reussites.reduce((a, b) => a + b, 0)
    const d = {
      modele: m.nom, variante: v.nom, repondus, coupures, reussites, echecs, titres,
      note: repondus > 0 ? total / (repondus * CRITERES.length) : 0,
      latence: latences.reduce((a, b) => a + b, 0) / latences.length,
      jetons: jetons.length ? Math.round(jetons.reduce((a, b) => a + b, 0) / jetons.length) : null,
    }
    resultats.push(d)

    const rates = CRITERES.map(([n], k) => (reussites[k] < repondus ? n : null)).filter(Boolean)
    console.log(`  ${m.nom.padEnd(24)} ${v.nom.padEnd(10)} ${(d.note * 100).toFixed(0).padStart(3)} %`
      + `  ${repondus}/${ESSAIS} rép.  ${(d.latence / 1000).toFixed(1).padStart(5)} s`
      + (coupures ? `  ${coupures} reprise(s)` : '')
      + (rates.length ? `  rate : ${rates.join(', ')}` : ''))
  }
}

console.log(`\n${'modèle'.padEnd(24)} ${'prompt'.padEnd(10)} ${'qualité'.padStart(8)} ${'dispo'.padStart(7)} ${'latence'.padStart(9)} ${'jetons'.padStart(8)}`)
console.log('-'.repeat(70))
for (const r of [...resultats].sort((a, b) => b.note - a.note || a.latence - b.latence)) {
  console.log(r.modele.padEnd(24) + r.variante.padEnd(10)
    + `${(r.note * 100).toFixed(0)} %`.padStart(9)
    + `${r.repondus}/${ESSAIS}`.padStart(8)
    + `${(r.latence / 1000).toFixed(1)} s`.padStart(10)
    + String(r.jetons ?? '—').padStart(9))
}

// L'écart à MODÈLE ÉGAL : la seule comparaison qui isole l'effet du prompt.
if (VARIANTES.length === 2) {
  console.log(`\n${'modèle'.padEnd(24)} ${'A'.padStart(7)} ${'B'.padStart(8)} ${'écart'.padStart(9)}`)
  console.log('-'.repeat(50))
  for (const m of MODELES) {
    const a = resultats.find(r => r.modele === m.nom && r.variante.startsWith('A'))
    const b = resultats.find(r => r.modele === m.nom && r.variante.startsWith('B'))
    if (!a || !b) continue
    const ecart = (b.note - a.note) * 100
    console.log(m.nom.padEnd(24)
      + `${(a.note * 100).toFixed(0)} %`.padStart(7)
      + `${(b.note * 100).toFixed(0)} %`.padStart(8)
      + `${ecart >= 0 ? '+' : ''}${ecart.toFixed(0)} pts`.padStart(10))
  }
}

console.log(`\n${'critère'.padEnd(20)}${resultats.map(r => `${r.variante[0]}·${r.modele.split('· ')[1].slice(0, 7)}`.padStart(12)).join('')}`)
console.log('-'.repeat(20 + resultats.length * 12))
CRITERES.forEach(([nom], k) => {
  console.log(nom.padEnd(20)
    + resultats.map(r => `${r.reussites[k]}/${r.repondus}`.padStart(12)).join(''))
})
console.log()
