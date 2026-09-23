#!/usr/bin/env node
/**
 * Banc d'essai de la DICTÉE DES CHARGES.
 *
 * On ne mesure pas « est-ce que ça marche » mais les quatre façons de se
 * tromper sur une charge dictée — et elles ne coûtent pas la même chose :
 *
 *   · la PÉRIODICITÉ. « 300 au trimestre » compris comme mensuel fait ×3 sur
 *     le budget. C'est l'erreur la plus chère, et la plus facile à faire quand
 *     quelqu'un parle vite.
 *   · le MONTANT. Un chiffre inventé est pire qu'un champ vide : on le corrige
 *     si on le voit, et on ne le voit pas toujours.
 *   · la PORTÉE. Une charge perso marquée commune fait payer l'autre.
 *   · les OUBLIS. C'est le principal apport du modèle — il a les 52 lignes
 *     sous les yeux, la personne non — et rien ne le mesure ailleurs.
 *
 * Les dictées sont écrites comme on PARLE : pas de ponctuation utile, des
 * hésitations, des « genre », des montants dits à l'oral (« mille quatre cent
 * cinquante »), l'ordre des idées qui change en cours de phrase. Un prompt qui
 * ne tient que sur du texte propre ne tient pas.
 *
 * Le prompt et le schéma sont IMPORTÉS de la fonction : recopiés, ils
 * divergeraient, et le banc mesurerait autre chose que ce qui part en prod.
 *
 *   npm run banc-charges
 *   npm run banc-charges -- --essais 3      # trois passes, pour voir la variance
 *   npm run banc-charges -- --cas 4         # un seul cas, en détail
 */
import { readFileSync } from 'node:fs'
import { SCHEMA, SYSTEME } from '../supabase/functions/charges/prompt.ts'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const ESSAIS = Number(opt('--essais') ?? 1)
const UN_CAS = opt('--cas') !== null ? Number(opt('--cas')) : null

/* Les clés vivent dans le .env des fonctions, comme en production. */
const env = Object.fromEntries(
  readFileSync('supabase/functions/.env', 'utf8')
    .split('\n').filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(),
               l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]))

const BASE = env.LLM_BASE_URL
const CLE = env.LLM_API_KEY
const MODELE = env.LLM_MODEL
if (!BASE || !CLE) { console.error('Pas de clé LLM dans supabase/functions/.env'); process.exit(1) }

/* Le catalogue, tel que la fonction le donne au modèle. */
const CATALOGUE = readFileSync('scripts/catalogue-charges.txt', 'utf8').trim()

/**
 * Dix dictées, et ce qu'on attend de chacune.
 *
 * `attendu` ne liste que ce qui DOIT être trouvé — libellé approché, montant en
 * centimes, périodicité, portée. On ne juge pas la formulation du libellé : un
 * modèle qui rend « Copropriété » là où on dit « copro » a raison.
 */
const CAS = [
  {
    nom: 'le logement, dit d’une traite',
    section: 'Logement',
    dictee: `alors la copro c’est trois cents euros par trimestre euh la taxe foncière `
      + `mille quatre cent cinquante à l’année l’assurance habitation dix euros soixante-dix `
      + `par mois l’électricité on est à la conso donc genre cinquante et internet trente-sept`,
    attendu: [
      { mot: /copro/i, cents: 30_000, periode: 'trimestriel' },
      { mot: /fonci/i, cents: 145_000, periode: 'annuel' },
      { mot: /assurance/i, cents: 1_070, periode: 'mensuel' },
      { mot: /lectric/i, cents: 5_000, periode: 'mensuel', variable: true },
      { mot: /internet/i, cents: 3_700, periode: 'mensuel' },
    ],
  },
  {
    nom: 'la voiture, avec une hésitation et une correction',
    section: 'Auto',
    dictee: `mon assurance auto c’est quarante-huit euh non quarante-huit cinquante par mois `
      + `je mets à peu près cent vingt d’essence et le contrôle technique quatre-vingt-dix `
      + `mais c’est tous les deux ans`,
    attendu: [
      { mot: /assurance/i, cents: 4_850, periode: 'mensuel' },
      { mot: /essence|carburant|recharge/i, cents: 12_000, periode: 'mensuel' },
      /* « quatre-vingt-dix tous les deux ans » : le rythme n'existe pas dans
         l'application. Rendu tel quel en annuel, il fait payer 90 par an au
         lieu de 45 — le double, tous les ans, sans que rien ne le signale. */
      { mot: /contr[ôo]le technique/i, cents: 4_500, periode: 'annuel' },
    ],
    veutQuestion: true,
  },
  {
    nom: 'du commun et du perso mélangés',
    section: null,
    dictee: `bon on met huit cents euros de courses par mois quatre cents de restaurant `
      + `et cent de sorties moi ma mutuelle c’est quarante-deux et j’ai mon crédit `
      + `immobilier cinq cent quatre-vingts par mois mais ça c’est pour moi tout seul`,
    attendu: [
      { mot: /course/i, cents: 80_000, periode: 'mensuel', portee: 'commun' },
      { mot: /restaurant/i, cents: 40_000, periode: 'mensuel', portee: 'commun' },
      { mot: /sortie|culture/i, cents: 10_000, periode: 'mensuel', portee: 'commun' },
      { mot: /mutuelle/i, cents: 4_200, periode: 'mensuel', portee: 'perso' },
      { mot: /cr[ée]dit|immobilier|pr[êe]t/i, cents: 58_000, periode: 'mensuel', portee: 'perso' },
    ],
  },
  {
    nom: 'un montant sans unité de temps',
    section: 'Abonnements',
    dictee: `netflix quatorze quatre-vingt-dix-neuf spotify duo quinze euros `
      + `et mon forfait c’est quinze aussi`,
    attendu: [
      { mot: /netflix|streaming|vid[ée]o/i, cents: 1_499, periode: 'mensuel' },
      { mot: /spotify|musique/i, cents: 1_500, periode: 'mensuel' },
      { mot: /forfait|mobile/i, cents: 1_500, periode: 'mensuel', portee: 'perso' },
    ],
    veutQuestion: true,
  },
  {
    nom: 'une ambiguïté qui mérite une question',
    section: null,
    dictee: `j’ai l’assurance à soixante euros par mois et puis l’autre assurance `
      + `à quinze euros`,
    attendu: [],
    veutQuestion: true,
  },
  {
    nom: 'des montants dits en lettres',
    section: 'Logement',
    dictee: `le loyer c’est mille deux cent cinquante euros par mois et les charges `
      + `quatre-vingt-cinq euros`,
    attendu: [
      { mot: /loyer/i, cents: 125_000, periode: 'mensuel' },
      { mot: /charge|copro/i, cents: 8_500, periode: 'mensuel' },
    ],
  },
  {
    nom: 'un montant annuel pour une chose qu’on croit mensuelle',
    section: null,
    dictee: `l’assurance habitation c’est cent vingt-huit euros mais à l’année hein `
      + `pas par mois`,
    attendu: [
      { mot: /assurance/i, cents: 12_800, periode: 'annuel' },
    ],
    veutQuestion: true,
  },
  {
    nom: 'une charge sans montant',
    section: null,
    dictee: `il y a aussi la taxe d’ordures ménagères mais je ne sais plus combien `
      + `et les frais bancaires`,
    attendu: [],
    veutSansMontant: true,
  },
  {
    nom: 'du vocabulaire familier',
    section: 'Vie courante',
    dictee: `on claque genre cinquante balles de droguerie par mois et les clopes `
      + `non ça compte pas et puis soixante par mois de cadeaux en gros sur l’année`,
    attendu: [
      { mot: /droguerie|hygi/i, cents: 5_000, periode: 'mensuel' },
      { mot: /cadeau/i, cents: 6_000, periode: 'mensuel' },
    ],
  },
  {
    nom: 'presque rien à en tirer',
    section: null,
    dictee: `euh bah je sais pas trop en fait on paie des trucs quoi`,
    attendu: [],
    veutPeu: true,
  },
]

const SECTIONS = ['Logement', 'Auto', 'Abonnements', 'Santé', 'Crédits', 'Impôts', 'Vie courante']

async function demande(cas) {
  const liste = CATALOGUE.split('\n')
    .filter(l => !cas.section || l.startsWith(cas.section + ' '))
    .join('\n')
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE,
      messages: [
        { role: 'system', content: SYSTEME },
        { role: 'user', content:
            `<catalogue>\n${liste}\n</catalogue>\n\n<dictee>\n${cas.dictee}\n</dictee>\n\n`
            + (cas.section ? `La personne parle de la section « ${cas.section} ».\n` : '')
            + 'Range cette dictée.' },
      ],
      response_format: { type: 'json_schema',
        json_schema: { name: 'charges', strict: true, schema: SCHEMA } },
      temperature: 0,
    }),
  })
  /* Le quota de Groq se compte en jetons par MINUTE, et une seule dictée en
     consomme presque la totalité : le catalogue pèse plus que la parole. Sans
     cette attente, le banc ne mesurait que ses propres 429. */
  if (r.status === 429) {
    const secondes = Number(r.headers.get('retry-after')) || 30
    process.stdout.write(`   (quota atteint, on attend ${secondes}s)\n`)
    await new Promise(t => setTimeout(t, (secondes + 2) * 1000))
    return demande(cas)
  }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
  const j = await r.json()
  return JSON.parse(j.choices[0].message.content)
}

/** Ce qui compte, et ce que ça coûte quand c'est faux. */
function juge(cas, sortie) {
  const lignes = sortie.charges ?? []
  const notes = []
  let trouve = 0, montantJuste = 0, periodeJuste = 0, porteeJuste = 0

  for (const a of cas.attendu) {
    const l = lignes.find(x => a.mot.test(x.libelle) || a.mot.test(x.catalogue_libelle ?? ''))
    if (!l) { notes.push(`✗ manque ${a.mot.source}`); continue }
    trouve++
    if (l.montant_cents === a.cents) montantJuste++
    else notes.push(`✗ montant ${a.mot.source} : ${l.montant_cents} au lieu de ${a.cents}`)
    if (l.periodicite === a.periode) periodeJuste++
    else notes.push(`✗ PÉRIODE ${a.mot.source} : ${l.periodicite} au lieu de ${a.periode}`)
    if (a.portee) {
      if (l.portee === a.portee) porteeJuste++
      else notes.push(`✗ portée ${a.mot.source} : ${l.portee} au lieu de ${a.portee}`)
    } else porteeJuste++
    if (a.variable && !l.variable) notes.push(`· ${a.mot.source} pas marquée variable`)
  }

  /* Le bruit : des lignes qu'on n'a pas dites. Un modèle qui invente coûte plus
     cher qu'un modèle qui oublie — on relit rarement ce qu'on n'a pas dicté. */
  const bruit = lignes.length - trouve
  if (bruit > 0) notes.push(`· ${bruit} ligne(s) en trop : `
    + lignes.filter(l => !cas.attendu.some(a => a.mot.test(l.libelle)))
        .map(l => `${l.libelle} ${l.montant_cents ?? '?'}`).join(', '))

  if (cas.veutQuestion && (sortie.questions ?? []).length === 0)
    notes.push('✗ aucune question alors que la dictée est ambiguë')
  if (cas.veutSansMontant && lignes.some(l => l.montant_cents !== null))
    notes.push('✗ un montant a été inventé pour une charge sans chiffre')
  if (cas.veutPeu && lignes.length > 1)
    notes.push(`✗ ${lignes.length} lignes tirées d’une dictée qui ne dit rien`)

  const confianceFolle = lignes.filter(l => l.confiance < 0 || l.confiance > 1)
  if (confianceFolle.length) notes.push(`✗ confiance hors bornes : ${confianceFolle.length}`)
  const sectionsInconnues = (sortie.oublis ?? [])
    .filter(o => !CATALOGUE.includes(o))
  if (sectionsInconnues.length) notes.push(`· oublis hors catalogue : ${sectionsInconnues.join(', ')}`)

  /* Le libellé part dans la liste des charges tel quel : « Frais bancaires ? »
     y resterait, point d'interrogation compris. Une question se pose dans
     questions, elle ne se déguise pas en nom de charge. */
  const interroge = lignes.filter(l => l.libelle.includes('?'))
  if (interroge.length) notes.push(`✗ libellé interrogatif : ${interroge.map(l => l.libelle).join(', ')}`)

  /* Ce qui manquait : les totaux ne comptaient que ce qui va bien, et les ✗
     restaient dans la marge. Un banc qui ne totalise pas ses défauts se
     félicite tout seul — celui-ci affichait 19/19 en inventant quatre lignes. */
  return { trouve, montantJuste, periodeJuste, porteeJuste,
           attendus: cas.attendu.length, oublis: (sortie.oublis ?? []).length,
           questions: (sortie.questions ?? []).length, notes,
           defauts: notes.filter(n => n.startsWith('✗')).length }
}

const cas = UN_CAS !== null ? [CAS[UN_CAS]] : CAS
const total = { trouve: 0, montant: 0, periode: 0, portee: 0, attendus: 0, defauts: 0 }

for (const [i, c] of cas.entries()) {
  for (let e = 0; e < ESSAIS; e++) {
    let s
    try { s = await demande(c) }
    catch (err) { console.log(`\n${i}. ${c.nom}\n   ⚠ ${err.message}`); continue }
    const n = juge(c, s)
    total.trouve += n.trouve; total.montant += n.montantJuste
    total.periode += n.periodeJuste; total.portee += n.porteeJuste
    total.attendus += n.attendus; total.defauts += n.defauts
    console.log(`\n${i}. ${c.nom}`)
    console.log(`   ${n.trouve}/${n.attendus} trouvées · ${n.montantJuste} montants `
      + `· ${n.periodeJuste} périodes · ${n.oublis} oublis · ${n.questions} questions`)
    for (const note of n.notes) console.log(`   ${note}`)
    if (UN_CAS !== null) console.log(JSON.stringify(s, null, 2))
  }
}

console.log(`\n── Total sur ${cas.length} dictées × ${ESSAIS} essai(s) ──`)
console.log(`Charges trouvées   ${total.trouve}/${total.attendus}`)
console.log(`Montants exacts    ${total.montant}/${total.attendus}`)
console.log(`Périodicités justes ${total.periode}/${total.attendus}   ← la plus chère`)
console.log(`Portées justes     ${total.portee}/${total.attendus}`)
console.log(`Défauts            ${total.defauts}   ← zéro, ou le reste ne veut rien dire`)
process.exitCode = total.defauts > 0 || total.trouve < total.attendus ? 1 : 0
