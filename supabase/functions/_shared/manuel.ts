/**
 * Le manuel de l'aide intégrée : lire une page, chercher dedans, dire si elle a vieilli.
 *
 * PUR : ni disque, ni réseau, ni API de Deno. Le même fichier sert la fonction (Deno), le script qui génère le
 * paquet (Node, `--experimental-strip-types`) et les tests (Vitest) — d'où l'absence d'énumération ou de syntaxe
 * propre à TypeScript, et les extensions `.ts` dans les imports.
 *
 * Pourquoi chercher au lieu de tout envoyer : un manuel de vingt-cinq pages pèse vingt mille jetons, et le
 * fournisseur gratuit plafonne la requête autour de huit mille. On envoie les quatre pages les plus proches de la
 * question — plus celle des limites — et le modèle ne répond que d'après elles.
 */

export type Page = {
  id: string
  titre: string
  ecrans: string[]
  questions: string[]
  sources: string[]
  verifie_sur: string
  corps: string
}

/** Une page telle que la fonction la porte : datée du commit contre lequel elle a été vérifiée. */
export type PageDatee = Page & { verifie_le: string }

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const SHA = /^[0-9a-f]{7,40}$/

function sansCommentaire(v: string): string {
  const i = v.search(/\s#/)
  return (i === -1 ? v : v.slice(0, i)).trim()
}

function sansGuillemets(v: string): string {
  const m = v.match(/^(['"])(.*)\1$/)
  return m ? m[2] : v
}

/**
 * Lit une page : un en-tête entre deux lignes `---`, puis le corps.
 *
 * L'en-tête est un sous-ensemble minuscule de YAML — des scalaires, des listes `[a, b]` et des listes à tirets —
 * parce qu'une dépendance de plus dans une fonction Deno n'a pas sa place pour six clés. Toute irrégularité lève
 * une erreur qui nomme la page : une page malformée ne doit jamais partir en silence.
 */
export function lisPage(texte: string, nom = 'page'): Page {
  const t = texte.replace(/\r\n/g, '\n')
  if (!t.startsWith('---\n')) throw new Error(`${nom} : pas d'en-tête (--- en première ligne)`)
  const fin = t.indexOf('\n---\n', 4)
  if (fin === -1) throw new Error(`${nom} : l'en-tête n'est pas refermé par ---`)
  const entete = t.slice(4, fin).split('\n')
  const corps = t.slice(fin + 5).trim()

  const cles: Record<string, string | string[]> = {}
  let liste: string | null = null
  for (const brute of entete) {
    if (brute.trim() === '' || brute.trim().startsWith('#')) continue
    const item = brute.match(/^\s+-\s+(.*)$/)
    if (item && liste) {
      ;(cles[liste] as string[]).push(sansGuillemets(sansCommentaire(item[1])))
      continue
    }
    const kv = brute.match(/^([a-z_]+):\s*(.*)$/)
    if (!kv) throw new Error(`${nom} : ligne d'en-tête illisible « ${brute} »`)
    const [, cle, brut] = kv
    const v = sansCommentaire(brut)
    if (v === '') { cles[cle] = []; liste = cle; continue }
    liste = null
    if (v.startsWith('[')) {
      if (!v.endsWith(']')) throw new Error(`${nom} : liste non refermée « ${brute} »`)
      const dedans = v.slice(1, -1).trim()
      cles[cle] = dedans === '' ? [] : dedans.split(',').map(x => sansGuillemets(x.trim()))
    } else {
      cles[cle] = sansGuillemets(v)
    }
  }

  const texteDe = (k: string): string => {
    const v = cles[k]
    if (typeof v !== 'string' || v === '') throw new Error(`${nom} : « ${k} » manque`)
    return v
  }
  const listeDe = (k: string, min: number): string[] => {
    const v = cles[k] ?? []
    if (!Array.isArray(v)) throw new Error(`${nom} : « ${k} » doit être une liste`)
    if (v.length < min) throw new Error(`${nom} : « ${k} » veut au moins ${min} élément(s)`)
    if (v.some(x => x === '')) throw new Error(`${nom} : « ${k} » contient un élément vide`)
    return v
  }

  const id = texteDe('id')
  if (!ID.test(id)) throw new Error(`${nom} : id « ${id} » invalide (minuscules, chiffres, tirets)`)
  const verifie_sur = texteDe('verifie_sur')
  if (!SHA.test(verifie_sur)) throw new Error(`${nom} : verifie_sur « ${verifie_sur} » n'est pas un commit`)
  const ecrans = listeDe('ecrans', 0)
  for (const e of ecrans) {
    if (!e.startsWith('/')) throw new Error(`${nom} : l'écran « ${e} » doit être une route (/…)`)
  }
  if (corps === '') throw new Error(`${nom} : corps vide`)

  return {
    id, titre: texteDe('titre'), ecrans,
    questions: listeDe('questions', 2),
    sources: listeDe('sources', 1),
    verifie_sur, corps,
  }
}

// ── Chercher ─────────────────────────────────────────────────────────────

const MOTS_VIDES = new Set((
  'le la les un une des du de dans sur sous avec sans pour par que qui quoi dont est sont etre ete etait '
  + 'ont avoir aux au ces cet cette ses son sa mon ma mes ton ta tes nos vos leur leurs nous vous ils elle elles '
  + 'moi toi lui meme tout tous toute toutes pas plus ainsi alors donc mais car comme quand quel quelle quels '
  + 'quelles comment pourquoi faut faire fait peut peux veux dois puis aussi tres bien deja encore fois chaque '
  + 'quelque quelques autre autres entre vers chez depuis pendant avant apres'
).split(' '))

/** Les racines : cinq lettres, sans accent. « invitation », « inviter » et « invite » tombent sur « invit ». */
const RACINE = 5

export function jetons(texte: string): string[] {
  return texte
    .toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[œ]/g, 'oe')
    .split(/[^a-z0-9]+/)
    .filter(m => m.length >= 3 && !MOTS_VIDES.has(m))
    .map(m => m.slice(0, RACINE))
}

function compte(mots: string[], poids: number, dans: Map<string, number>) {
  for (const m of mots) dans.set(m, (dans.get(m) ?? 0) + poids)
}

/** Les pages qu'on joint toujours : « ce que l'appli ne fait pas » sert à presque toute question de faisabilité. */
export const TOUJOURS = ['limites']

/**
 * Les pages les plus proches d'une question : BM25, avec le titre et les questions-types plus lourds que le corps,
 * un petit poids pour la question PRÉCÉDENTE (« et si elle arrive en décembre ? » ne dit rien seule), et un coup de
 * pouce aux pages de l'écran où l'on se trouve. Rien de plus malin : c'est déterministe, et un test le vérifie.
 */
export function choisis<P extends Page>(
  pages: P[],
  o: { question: string; precedente?: string; ecran?: string; max?: number },
): P[] {
  const max = o.max ?? 4
  const docs = pages.map(p => {
    const tf = new Map<string, number>()
    compte(jetons(p.titre), 5, tf)
    compte(jetons(p.questions.join(' ')), 3, tf)
    compte(jetons(p.corps), 1, tf)
    let longueur = 0
    for (const v of tf.values()) longueur += v
    return { p, tf, longueur }
  })
  const moyenne = docs.reduce((s, d) => s + d.longueur, 0) / Math.max(1, docs.length)

  const requete = new Map<string, number>()
  compte(jetons(o.question), 1, requete)
  if (o.precedente) compte(jetons(o.precedente), 0.4, requete)

  const N = docs.length
  const K1 = 1.2
  const B = 0.5
  const notes = docs.map(d => {
    let note = 0
    for (const [mot, poids] of requete) {
      const f = d.tf.get(mot)
      if (!f) continue
      let df = 0
      for (const x of docs) if (x.tf.has(mot)) df++
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))
      note += poids * idf * (f * (K1 + 1)) / (f + K1 * (1 - B + B * d.longueur / Math.max(1, moyenne)))
    }
    return { d, note }
  })

  /* Les libellés cités « entre guillemets » : on demande volontiers « à quoi sert « Ce que j'ai » ? », dont les mots
     sont tous des mots vides pour la recherche. Une page qui contient le libellé tel quel est LA page. */
  const cites = [...o.question.matchAll(/«\s*([^»]{4,80}?)\s*»/g)].map(m => sansAccent(m[1]).trim())
    .filter(c => /[a-z0-9]/.test(c))
  if (cites.length > 0) {
    for (const n of notes) {
      const texte = sansAccent(`${n.d.p.titre}\n${n.d.p.corps}`)
      n.note += 4 * Math.min(2, cites.filter(c => texte.includes(c)).length)
    }
  }

  const meilleure = Math.max(0, ...notes.map(n => n.note))
  if (o.ecran) {
    for (const n of notes) {
      if (n.d.p.ecrans.includes(o.ecran)) n.note += 0.3 * (meilleure || 1)
    }
  }

  const choisies = notes
    .filter(n => n.note > 0)
    .sort((a, b) => b.note - a.note || a.d.p.id.localeCompare(b.d.p.id))
    .map(n => n.d.p)
    .filter(p => !TOUJOURS.includes(p.id))
    .slice(0, max)

  /* Rien ne ressemble à la question : les pages de l'écran, puis les vues d'ensemble. Le modèle dira « ce n'est
     pas dans mon manuel » si elles n'y répondent pas — mieux qu'une page au hasard sans contexte. */
  if (choisies.length === 0) {
    const ici = pages.filter(p => o.ecran && p.ecrans.includes(o.ecran) && !TOUJOURS.includes(p.id))
    const vues = pages.filter(p => p.id.endsWith('-vue-ensemble'))
    for (const p of [...ici, ...vues]) {
      if (choisies.length < Math.min(2, max) && !choisies.includes(p)) choisies.push(p)
    }
  }

  for (const id of TOUJOURS) {
    const p = pages.find(x => x.id === id)
    if (p && !choisies.includes(p)) choisies.push(p)
  }
  return choisies
}

// ── Vieillir ─────────────────────────────────────────────────────────────

/**
 * Les pages dont une source a changé depuis le commit contre lequel elles ont été vérifiées.
 *
 * `fichiersChanges(sha, sources)` rend ceux des `sources` qui diffèrent entre `sha` et l'arbre de travail — le script
 * le branche sur git ; les tests, sur une fonction à eux. Une page périmée n'est pas fausse, elle est NON VÉRIFIÉE :
 * le déploiement s'arrête jusqu'à ce qu'on l'ait relue contre le code et re-datée.
 */
export function perimees(
  pages: Page[],
  fichiersChanges: (sha: string, sources: string[]) => string[],
): { id: string; fichiers: string[] }[] {
  const dehors: { id: string; fichiers: string[] }[] = []
  for (const p of pages) {
    const fichiers = fichiersChanges(p.verifie_sur, p.sources)
    if (fichiers.length > 0) dehors.push({ id: p.id, fichiers })
  }
  return dehors
}

// ── Contrôler une réponse ────────────────────────────────────────────────

const NOMBRE = /\d+(?:[.,]\d+)?/g

/**
 * Les nombres écrits en lettres que le manuel donnerait en chiffres : « trente jours » est « 30 », pas une absence de
 * chiffre. De dix à mille, toujours ; de deux à neuf seulement devant une unité, parce que « à deux » ou « les deux »
 * n'annoncent aucune valeur.
 */
const EN_LETTRES: Record<string, number> = {
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30,
  quarante: 40, cinquante: 50, soixante: 60, cent: 100, mille: 1000,
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
}
const UNITES = '(?:jours?|mois|semaines?|ans?|annees?|heures?|minutes?|euros?|fois|pour cent)'
const MOT_NOMBRE = new RegExp(
  `\\b(dix|onze|douze|treize|quatorze|quinze|seize|vingt|trente|quarante|cinquante|soixante|(?<!pour )cent|mille)\\b`
  + `|\\b(deux|trois|quatre|cinq|six|sept|huit|neuf)(?= ${UNITES}\\b)`, 'g')

/** Les nombres d'un texte, comparables : « 12,5 » = « 12,50 », « 1 500 » = « 1500 », « trente » = « 30 ». */
function nombresDe(texte: string, aussiSepares = false): Set<string> {
  const vu = sansAccent(texte)
  const fusionne = vu.replace(/(\d) (?=\d{3}\b)/g, '$1')
  const lot = new Set<string>()
  const ajoute = (t: string) => {
    for (const n of t.match(NOMBRE) ?? []) lot.add(String(Number(n.replace(',', '.'))))
  }
  ajoute(fusionne)
  if (aussiSepares) ajoute(vu)
  for (const m of vu.matchAll(MOT_NOMBRE)) lot.add(String(EN_LETTRES[m[1] ?? m[2]]))
  return lot
}

/**
 * La forme sur laquelle on compare : sans accent, en minuscules, avec UN tiret, UNE apostrophe, UNE espace. Un modèle
 * écrit volontiers « e‑mail » avec le tiret insécable (U+2011) ou une espace fine avant « : » ; ce n'est pas une
 * invention, et le contrôle ne doit pas la prendre pour une.
 */
function sansAccent(s: string): string {
  return s
    .normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[\u2010-\u2015\u2212\u00ad]/g, '-')
    .replace(/[’‘ʼ`]/g, "'")
    .replace(/[\u00a0\u202f\u2009]/g, ' ')
    .replace(/\s+/g, ' ')
}

/**
 * Ce qu'une réponse affirme sans que les pages le disent : les chiffres et les libellés « entre guillemets » qui
 * ne figurent ni dans les pages jointes ni dans la question. Le modèle peut tourner une phrase à sa façon ; il ne
 * peut pas inventer « 30 jours » ni un bouton « Valider ». Un manque ne rend pas la réponse fausse — il la rend
 * NON CONFIRMÉE, et l'écran le dit.
 */
export function nonConfirme(reponse: string, textes: string[], question: string): string[] {
  const source = textes.join('\n') + '\n' + question
  const manque: string[] = []

  /* Les numéros d'étape (« 1. », « 2. ») ouvrent une ligne : ce ne sont pas des chiffres du manuel. */
  const sansEtapes = reponse.replace(/^\s*\d+[.)]\s+/gm, '')
  /* Le manuel qui écrit « 1 500 » donne aussi 1 et 500 : on accepte les deux lectures de SA page, pas de la réponse. */
  const connus = nombresDe(source, true)
  for (const n of nombresDe(sansEtapes)) if (!connus.has(n)) manque.push(n)

  const lu = sansAccent(source)
  /* Un libellé se lit à frontières de mot : « Ajout » n'est pas confirmé par « Ajouter ». */
  const seLit = (morceau: string) => {
    for (let i = lu.indexOf(morceau); i !== -1; i = lu.indexOf(morceau, i + 1)) {
      const avant = lu[i - 1], apres = lu[i + morceau.length]
      if (!(avant && /[a-z0-9]/.test(avant)) && !(apres && /[a-z0-9]/.test(apres))) return true
    }
    return false
  }
  for (const m of reponse.matchAll(/«\s*([^»]{2,120}?)\s*»/g)) {
    /* Un libellé à trous (« Invitation créée pour … Envoie-lui ce lien. ») : chaque morceau doit se lire dans les pages. */
    const morceaux = m[1].split(/…|\.{3}/).map(x => sansAccent(x).trim()).filter(x => x.length >= 3)
    if (morceaux.some(x => !seLit(x))) manque.push(`« ${m[1]} »`)
  }
  return manque
}
