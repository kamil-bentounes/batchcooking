#!/usr/bin/env node
/**
 * Banc d'essai de la LECTURE DE PHOTO.
 *
 * On compare des PROMPTS, pas seulement des modèles : la littérature dit qu'un
 * modèle de vision compte mal si on lui demande juste de compter, et bien si on
 * lui fait d'abord situer et nommer chaque objet (« point, label, count »).
 * C'est vérifiable — donc on le vérifie.
 *
 *   node scripts/banc-vision.mjs /chemin/photo.jpg
 *   node scripts/banc-vision.mjs photo.jpg --essais 3
 *
 * Aucune écriture en base, aucun appel à l'Edge Function : on parle
 * directement aux fournisseurs pour pouvoir changer le prompt sans redéployer.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const ESSAIS = Number(opt('--essais') ?? 2)
const PHOTO = args.find(a => /\.(jpe?g|png|webp)$/i.test(a))
if (!PHOTO) {
  console.error('Donne une photo : node scripts/banc-vision.mjs frigo.jpg')
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

// ── Le schéma, commun aux deux variantes sauf le champ de repérage ──────────
function schema({ avecRepere }) {
  const article = {
    type: 'object',
    properties: {
      ...(avecRepere
        ? {
            ou: {
              type: 'string',
              description: 'Où se trouve cet article dans l’image, en quelques mots : '
                + '« étagère du haut, à gauche », « dans la porte, en bas ». '
                + 'Décris-le AVANT de compter.',
            },
          }
        : {}),
      nom: { type: 'string', description: 'Nom générique, au singulier, sans marque.' },
      variete: { type: ['string', 'null'], description: 'Ce qui change les valeurs nutritionnelles.' },
      quantite: { type: ['number', 'null'], description: 'Nombre d’unités visibles.' },
      unite: {
        type: ['string', 'null'],
        enum: ['u', 'g', 'ml', 'pot', 'paquet', 'bouteille', 'barquette', 'botte', null],
      },
      lieu: { type: 'string', enum: ['frigo', 'congelateur', 'placard'] },
      confiance: { type: 'number', minimum: 0, maximum: 1 },
      remarque: { type: ['string', 'null'] },
    },
    required: [...(avecRepere ? ['ou'] : []),
      'nom', 'variete', 'quantite', 'unite', 'lieu', 'confiance', 'remarque'],
    additionalProperties: false,
  }
  return {
    type: 'object',
    properties: {
      articles: { type: 'array', items: article },
      lisible: { type: 'boolean' },
      commentaire: { type: ['string', 'null'] },
    },
    required: ['articles', 'lisible', 'commentaire'],
    additionalProperties: false,
  }
}

// ── Variante A : ce qui est en production aujourd'hui ───────────────────────
const A_SYSTEME = [
  'Tu inventories le contenu d’un réfrigérateur, d’un congélateur ou d’un placard',
  'à partir d’une photo. Tu décris ce que tu VOIS, tu ne devines pas ce qu’il',
  'devrait y avoir.',
  '',
  'Règles absolues :',
  '· COMPTE les unités visibles. « 4 pots de yaourt », jamais « des yaourts ».',
  '· Distingue les variétés : un yaourt aux fruits n’a pas les mêmes valeurs',
  '  nutritionnelles qu’un nature. C’est la variété qui compte, pas la marque.',
  '· Un article par LIGNE de produit, pas un par exemplaire : quatre pots',
  '  identiques font UN article de quantité 4.',
  '· Si tu hésites entre deux aliments, choisis le plus probable et baisse la',
  '  confiance. Si tu ne vois vraiment pas, ne le liste pas.',
  '· Tu écris en français, au singulier, sans marque commerciale.',
].join('\n')
const A_USER = 'Inventorie ce que tu vois. Cette photo a été prise dans : frigo.'

// ── Variante B : les bonnes pratiques des sources primaires ─────────────────
// · le POURQUOI de chaque règle (Anthropic : « add context to improve performance »)
// · « point, label, count » : situer et nommer AVANT de compter (littérature vision)
// · dire quoi faire, pas quoi ne pas faire (OpenAI et Anthropic)
// · un exemple structuré, en balises (Google : « always include few-shot examples »)
// · étapes numérotées quand l'ordre compte (Anthropic)
const B_SYSTEME = [
  '<role>',
  'Tu dresses l’inventaire d’un réfrigérateur à partir d’une photo, pour une',
  'application de cuisine qui s’en sert pour faire les courses et calculer des',
  'apports nutritionnels.',
  '</role>',
  '',
  '<pourquoi>',
  'Ce que tu rends sera affiché à quelqu’un qui validera chaque ligne. Un article',
  'oublié se rattrape d’un geste ; un article inventé fait acheter en double et',
  'fausse des calculs. Dans le doute, baisse la confiance plutôt que d’omettre,',
  'et n’invente jamais ce que tu ne vois pas.',
  '</pourquoi>',
  '',
  '<methode>',
  'Procède dans cet ordre, sans sauter d’étape :',
  '1. Parcours l’image zone par zone : chaque étagère, chaque bac, chaque',
  '   rangement de porte.',
  '2. Pour chaque produit trouvé, écris D’ABORD où il se trouve dans le champ',
  '   « ou ». Situer avant de compter réduit fortement les erreurs de comptage.',
  '3. Compte alors les exemplaires de CE produit, un par un.',
  '4. Lis l’étiquette si elle est lisible : elle donne la variété et le poids.',
  '</methode>',
  '',
  '<regles>',
  '· Regroupe par LIGNE de produit : quatre pots identiques font un article de',
  '  quantité 4, parce que la liste de courses parle de produits, pas d’unités.',
  '· Donne la variété (« aux fruits », « demi-écrémé », « 0 % ») : elle change',
  '  les valeurs nutritionnelles, et c’est elle qui permet de rattacher',
  '  l’aliment à une table de composition.',
  '· Écris en français, au singulier, avec le nom générique de l’aliment.',
  '· Mets dans « remarque » ce qu’une étiquette indique et que les autres champs',
  '  ne portent pas : poids, date, « emballage ouvert », « à moitié caché ».',
  '· Liste les boissons et les plats préparés comme les autres aliments.',
  '· Ignore ce qui ne se mange pas : bacs, clayettes, tasses, ustensiles.',
  '</regles>',
  '',
  '<exemple>',
  'Pour une étagère portant quatre pots de yaourt à la fraise et une brique de lait :',
  '[',
  '  {"ou":"étagère du milieu, à gauche","nom":"yaourt","variete":"à la fraise",',
  '   "quantite":4,"unite":"pot","lieu":"frigo","confiance":0.95,"remarque":"pack de 4"},',
  '  {"ou":"étagère du milieu, à droite","nom":"lait","variete":"demi-écrémé",',
  '   "quantite":1,"unite":"bouteille","lieu":"frigo","confiance":1,"remarque":"brique de 1 L"}',
  ']',
  '</exemple>',
].join('\n')
const B_USER = [
  'Inventorie cette photo.',
  '',
  '<contexte>',
  'Photo prise dans : frigo.',
  '</contexte>',
].join('\n')

const VARIANTES = [
  { nom: 'A — en production', systeme: A_SYSTEME, user: A_USER, avecRepere: false, temperature: 0.7 },
  { nom: 'B — bonnes pratiques', systeme: B_SYSTEME, user: B_USER, avecRepere: true, temperature: null },
]

// Chaque modèle a SON quota de 20 requêtes par jour (métrique mesurée :
// GenerateRequestsPerDayPerProjectPerModel-FreeTier). Les enchaîner multiplie
// donc le budget — et c'est aussi ce qui rend un repli utile.
const MODELES = [
  { nom: 'gemini-3.6-flash', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-3.6-flash' },
  { nom: 'gemini-3.5-flash-lite', base: 'https://generativelanguage.googleapis.com/v1beta/openai', modele: 'gemini-3.5-flash-lite' },
]

async function lis(m, v) {
  const t0 = Date.now()
  const corps = {
    model: m.modele,
    // Google « recommande fortement » de laisser les paramètres par défaut sur
    // Gemini 3.x : on ne pose la température que dans la variante qui l'avait.
    ...(v.temperature === null ? {} : { temperature: v.temperature }),
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'inventaire', strict: true, schema: schema({ avecRepere: v.avecRepere }) },
    },
    messages: [
      { role: 'system', content: v.systeme },
      { role: 'user', content: [
        { type: 'text', text: v.user },
        { type: 'image_url', image_url: { url: dataUrl } },
      ] },
    ],
  }
  try {
    const res = await fetch(`${m.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GEMINI}` },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(120000),
    })
    const ms = Date.now() - t0
    if (!res.ok) return { ms, erreur: `HTTP ${res.status} ${(await res.text()).slice(0, 100)}` }
    const j = await res.json()
    const c = j.choices?.[0]?.message?.content ?? ''
    return { ms, valeur: JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)) }
  } catch (e) {
    return { ms: Date.now() - t0, erreur: String(e.message ?? e).slice(0, 100) }
  }
}

console.log(`\nPhoto : ${PHOTO}`)
console.log(`${VARIANTES.length} variantes × ${MODELES.length} modèle(s) × ${ESSAIS} essais\n`)

for (const m of MODELES) {
  for (const v of VARIANTES) {
    console.log(`\n══════ ${m.nom} · ${v.nom} ══════`)
    for (let i = 0; i < ESSAIS; i++) {
      const r = await lis(m, v)
      if (r.erreur) { console.log(`  essai ${i + 1} : ${r.erreur}`); continue }
      const a = r.valeur.articles ?? []
      console.log(`  essai ${i + 1} — ${(r.ms / 1000).toFixed(1)} s · ${a.length} articles`
        + (r.valeur.lisible ? '' : ' · ILLISIBLE'))
      for (const x of a) {
        console.log(`     ${String(x.quantite ?? '?').padStart(3)} ${String(x.unite ?? '').padEnd(10)}`
          + `${x.nom.padEnd(22)}${(x.variete ?? '—').padEnd(24)}`
          + `c=${x.confiance}`
          + (x.ou ? `  [${x.ou}]` : '')
          + (x.remarque ? `  « ${x.remarque} »` : ''))
      }
      if (r.valeur.commentaire) console.log(`     → ${r.valeur.commentaire}`)
      await new Promise(r2 => setTimeout(r2, 3000))
    }
  }
}
console.log()
