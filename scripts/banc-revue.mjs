#!/usr/bin/env node
/**
 * Banc d'essai de la REVUE DES CHARGES.
 *
 * Une revue se trompe de deux façons opposées, et l'une est bien plus grave :
 *
 *   · le SILENCE. Elle passe à côté d'une erreur d'unité — une taxe foncière
 *     saisie par mois au lieu de par an — et le budget ment de 16 000 € par an
 *     sans que rien ne le dise. C'est le cas qu'on mesure en premier.
 *   · le BRUIT. Elle signale une mensualité de prêt à 580 € comme « anormale »,
 *     ou invente une charge pour avoir quelque chose à dire. Une revue qui
 *     trouve toujours trois choses n'est plus lue, donc elle ne protège plus
 *     de rien : le bruit finit par produire le silence.
 *
 * On lui donne donc des foyers PROPRES autant que des foyers fautifs, et un
 * faux positif compte autant qu'un manqué.
 *
 * Le prompt et le schéma sont IMPORTÉS de la fonction : recopiés, ils
 * divergeraient, et le banc mesurerait autre chose que ce qui part en prod.
 *
 *   npm run banc-revue
 *   npm run banc-revue -- --cas 2
 */
import { readFileSync } from 'node:fs'
import { SCHEMA, SYSTEME, filtre, sansObjet }
  from '../supabase/functions/revue-charges/prompt.ts'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const UN_CAS = opt('--cas') !== null ? Number(opt('--cas')) : null

const env = Object.fromEntries(
  readFileSync('supabase/functions/.env', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))
const BASE = env.LLM_BASE_URL, CLE = env.LLM_API_KEY, MODELE = env.LLM_MODEL
if (!BASE || !CLE) { console.error('Pas de clé LLM dans supabase/functions/.env'); process.exit(1) }

const CATALOGUE = readFileSync('scripts/catalogue-charges.txt', 'utf8').trim()

/* Ce que 0087 marque en base, recopié ici : le banc tourne sans base. Il n'y a
   que cinq lignes, et elles ne bougent pas — mais si elles bougeaient, le test
   unitaire de `sansObjet`, lui, lit la vraie colonne. */
const EXCLUSIONS = [
  { libelle: 'Loyer', exclu_par: ['Mensualité de prêt', 'Crédit immobilier — résidence'] },
  { libelle: 'Mensualité de prêt', exclu_par: ['Loyer'] },
  { libelle: 'Crédit immobilier — résidence', exclu_par: ['Loyer'] },
  { libelle: 'Eau', exclu_par: ['Charges de copropriété'] },
  { libelle: 'Assurance emprunteur', exclu_par: ['Mensualité de prêt', 'Crédit immobilier — résidence'] },
]

/** Le foyer de Kamil, tel qu'il le décrit — et qui est CORRECT. */
const SAIN = [
  'Mensualité de prêt | 580,00 € mensuel | perso | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Taxe foncière | 1450,00 € annuel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Charges de copropriété | 300,00 € trimestriel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Assurance habitation | 10,70 € mensuel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Électricité | 50,00 € mensuel | commun | montant variable | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Internet | 37,00 € mensuel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01',
  'Courses | 800,00 € mensuel | commun | montant variable | compte Compte joint (commun) | enveloppe Courses | depuis 2026-01-01',
  'Restaurants | 400,00 € mensuel | commun | montant variable | compte Compte joint (commun) | enveloppe Restaurants | depuis 2026-01-01',
  'Sorties et culture | 100,00 € mensuel | commun | montant variable | compte Compte joint (commun) | enveloppe Sorties et culture | depuis 2026-01-01',
]

const CAS = [
  {
    nom: 'le foyer propre — on attend le SILENCE',
    charges: SAIN,
    /* Aucune de ces lignes ne doit être signalée. L'électricité sans enveloppe
       est le seul constat tolérable : elle varie et rien ne la plafonne. */
    zeroDoublon: true,
    interdits: ['Mensualité de prêt', 'Taxe foncière', 'Charges de copropriété',
                'Assurance habitation', 'Courses', 'Restaurants'],
  },
  {
    nom: 'l’erreur d’unité — 1450 € de taxe foncière PAR MOIS',
    charges: SAIN.map(l => l.startsWith('Taxe foncière')
      ? 'Taxe foncière | 1450,00 € mensuel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01'
      : l),
    attenduIncoherence: ['Taxe foncière'],
  },
  {
    nom: 'le doublon sous deux noms — Internet et Box',
    charges: [...SAIN,
      'Box | 37,00 € mensuel | commun | montant fixe | compte Compte joint (commun) | aucune enveloppe | depuis 2026-01-01'],
    attenduDoublon: ['Internet', 'Box'],
  },
  {
    nom: 'le poste manquant — pas de forfait mobile ni de mutuelle',
    charges: SAIN,
    attenduOublis: ['Forfait mobile', 'Mutuelle'],
  },
]

async function demande(cas) {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE,
      messages: [
        { role: 'system', content: SYSTEME },
        { role: 'user', content:
            `<catalogue>\n${CATALOGUE}\n</catalogue>\n\n`
            + `<charges>\n${cas.charges.join('\n')}\n</charges>\n\n`
            + 'Relis ces charges.' },
      ],
      response_format: { type: 'json_schema',
        json_schema: { name: 'revue', strict: true, schema: SCHEMA } },
      temperature: 0,
    }),
  })
  if (r.status === 429) {
    const secondes = Number(r.headers.get('retry-after')) || 30
    process.stdout.write(`   (quota atteint, on attend ${secondes}s)\n`)
    await new Promise(t => setTimeout(t, (secondes + 2) * 1000))
    return demande(cas)
  }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  return JSON.parse((await r.json()).choices[0].message.content)
}

/* Les libellés que le foyer contient vraiment : tout ce que le modèle cite en
   dehors est une INVENTION, et c'est le défaut qui tue la confiance. */
const libellesDe = cas => new Set(cas.charges.map(l => l.split(' | ')[0]))

function juge(cas, s) {
  const notes = []
  const vrais = libellesDe(cas)
  const cites = [
    ...(s.incoherences ?? []).map(i => i.libelle),
    ...(s.doublons ?? []).flatMap(d => d.libelles),
  ]
  for (const c of cites) {
    if (!vrais.has(c)) notes.push(`✗ cite « ${c} », qui n’existe pas dans le foyer`)
  }
  for (const o of (s.oublis ?? [])) {
    if (vrais.has(o)) notes.push(`✗ propose « ${o} » comme oubli alors qu’elle est posée`)
  }

  /* ⚠️ Les oublis CONTREDITS ou DÉJÀ COMPRIS. Le prompt les interdit ; une
     règle qu'on n'éprouve pas est une règle qui dérivera. Mesuré : au premier
     jet le modèle proposait « Loyer » à quelqu'un qui rembourse un prêt, et
     « Eau » à un foyer qui paie des charges de copropriété. */
  const EXCLUS = [
    ['Mensualité de prêt', 'Loyer', 'on ne paie pas un loyer ET un prêt'],
    ['Mensualité de prêt', 'Assurance emprunteur', 'elle est comprise dans la mensualité'],
    ['Charges de copropriété', 'Eau', 'elle est souvent comprise dans les charges'],
  ]
  for (const [present, interdit, pourquoi] of EXCLUS) {
    if (vrais.has(present) && (s.oublis ?? []).includes(interdit)) {
      notes.push(`✗ propose « ${interdit} » alors que « ${present} » est posée — ${pourquoi}`)
    }
  }

  if (cas.zeroDoublon && (s.doublons ?? []).length > 0) {
    notes.push(`✗ invente ${s.doublons.length} doublon(s) sur un foyer propre`)
  }
  for (const interdit of (cas.interdits ?? [])) {
    if ((s.incoherences ?? []).some(i => i.libelle === interdit)) {
      notes.push(`✗ signale « ${interdit} », qui est un montant ordinaire`)
    }
  }
  for (const attendu of (cas.attenduIncoherence ?? [])) {
    if (!(s.incoherences ?? []).some(i => i.libelle === attendu)) {
      notes.push(`✗ RATE l’incohérence sur « ${attendu} »`)
    }
  }
  if (cas.attenduDoublon) {
    const ok = (s.doublons ?? []).some(d =>
      cas.attenduDoublon.every(l => d.libelles.includes(l)))
    if (!ok) notes.push(`✗ RATE le doublon ${cas.attenduDoublon.join(' / ')}`)
  }
  for (const attendu of (cas.attenduOublis ?? [])) {
    if (!(s.oublis ?? []).includes(attendu)) {
      notes.push(`· n’a pas proposé « ${attendu} » (toléré, cinq places seulement)`)
    }
  }
  return notes
}

let defauts = 0
for (const [i, cas] of CAS.entries()) {
  if (UN_CAS !== null && UN_CAS !== i) continue
  process.stdout.write(`\n${i}. ${cas.nom}\n`)
  const brut = await demande(cas)
  /* ⚠️ On juge CE QUI S'AFFICHE, pas ce que le modèle a dit. Le serveur filtre
     — libellés inventés, oublis déjà posés, oublis rendus sans objet — et
     c'est cette sortie-là que la personne lit. Juger le brut ferait compter
     comme défaut ce que le produit n'a jamais montré, et manquerait l'inverse :
     un filtre qui laisse passer. */
  const postes = [...libellesDe(cas)]
  const s = filtre(brut, { postes, exclus: sansObjet(EXCLUSIONS, postes) })
  const retires = (brut.oublis ?? []).length - s.oublis.length
    + (brut.incoherences ?? []).length - s.incoherences.length
    + (brut.doublons ?? []).length - s.doublons.length
  if (retires > 0) process.stdout.write(`   (le filtre a retiré ${retires} constat(s))\n`)
  process.stdout.write(`   verdict : ${s.verdict}\n`)
  for (const d of (s.doublons ?? [])) {
    process.stdout.write(`   doublon : ${d.libelles.join(' + ')} — ${d.pourquoi}\n`)
  }
  for (const x of (s.incoherences ?? [])) {
    process.stdout.write(`   à voir  : ${x.libelle} — ${x.quoi}\n`)
  }
  if ((s.oublis ?? []).length) process.stdout.write(`   oublis  : ${s.oublis.join(', ')}\n`)
  const notes = juge(cas, s)
  for (const n of notes) process.stdout.write(`   ${n}\n`)
  /* ⚠️ On COMPTE les défauts. Un banc qui ne totalise pas les siens se félicite
     tout seul — c'est exactement ce qu'a fait `banc-charges` à son premier jet. */
  defauts += notes.filter(n => n.startsWith('✗')).length
}

process.stdout.write(`\n${defauts} défaut${defauts > 1 ? 's' : ''}.\n`)
process.exitCode = defauts > 0 ? 1 : 0
