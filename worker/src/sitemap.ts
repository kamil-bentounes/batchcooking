/**
 * Trouver les pages de recettes d'un site.
 *
 * Partagé par la sonde et l'ingestion, parce que le piège est le même pour les
 * deux et qu'il a déjà coûté une conclusion fausse : **un site déclare dix
 * sitemaps** — news, images, vidéos, tags, articles — et prendre les premiers
 * revient à sonder les vidéos puis à décréter que Marmiton n'a pas de recettes.
 *
 * On lit robots.txt, on vise les sitemaps qui DISENT recette, et on s'en tient
 * à ce que le site autorise.
 */

export const AGENT =
  'batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)'

/** Notre jeton de produit, celui qu'un robots.txt peut nommer (RFC 9309 § 2.2.1). */
export const JETON = 'batchcooking-perso'

/** Une règle `Allow` ou `Disallow` : son motif, tel qu'écrit, et ce qu'elle dit. */
export type Regle = { permis: boolean; motif: string }

export type Robots = {
  present: boolean
  /** Les motifs `Disallow` du groupe qui nous vise (pour l'affichage). */
  interdits: string[]
  /** Toutes les règles du groupe qui nous vise : `autorise` tranche dessus. */
  regles: Regle[]
  sitemaps: string[]
  /** `Crawl-delay` déclaré, en secondes. On le respecte s'il dépasse le nôtre. */
  delai: number | null
}

export async function texteDe(url: string, timeoutMs = 25000): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': AGENT, 'Accept-Language': 'fr-FR,fr;q=0.9' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    return r.ok ? await r.text() : null
  } catch {
    return null
  }
}

/** Le jeton d'un `User-agent` : « BatchCooking-Perso/1.0 » → « batchcooking-perso ». */
const jetonDe = (v: string) => v.trim().split('/')[0].trim().toLowerCase()

/**
 * Lecture de robots.txt selon la RFC 9309.
 *
 * Les lignes `User-agent` d'affilée ouvrent UN groupe, que les règles suivantes
 * remplissent. Si un groupe porte notre jeton (`batchcooking-perso`), on ne lit
 * que celui-là (les groupes à notre nom se cumulent) ; sinon, ceux de `*`. Les
 * `Sitemap` valent pour tout le fichier.
 */
export function lireRobots(txt: string | null): Robots {
  if (!txt) return { present: false, interdits: [], regles: [], sitemaps: [], delai: null }

  type Groupe = { agents: string[]; regles: Regle[]; delai: number | null }
  const sitemaps: string[] = []
  const groupes: Groupe[] = []
  let courant: Groupe | null = null
  // Vrai tant que les lignes lues sont des `User-agent` : la première ligne d'un
  // autre genre ferme l'en-tête, et le `User-agent` suivant ouvre un nouveau groupe.
  let enTete = false

  for (const brute of txt.split(/\r?\n/)) {
    const l = brute.replace(/#.*$/, '').trim()
    const m = l.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
    if (!m) continue
    const cle = m[1].toLowerCase()
    const valeur = m[2].trim()

    if (cle === 'sitemap') { if (valeur) sitemaps.push(valeur); continue }
    if (cle === 'user-agent') {
      if (!enTete || !courant) {
        courant = { agents: [], regles: [], delai: null }
        groupes.push(courant)
      }
      courant.agents.push(jetonDe(valeur))
      enTete = true
      continue
    }
    enTete = false
    if (!courant) continue
    if (cle === 'disallow' || cle === 'allow') {
      // Un motif vide n'interdit rien, et un `Allow` vide n'autorise rien de plus.
      if (valeur) courant.regles.push({ permis: cle === 'allow', motif: valeur })
    } else if (cle === 'crawl-delay') {
      const d = valeur.match(/^(\d+(?:\.\d+)?)/)
      if (d) courant.delai = Number(d[1])
    }
  }

  const aNous = groupes.filter(g => g.agents.includes(JETON))
  const retenus = aNous.length > 0 ? aNous : groupes.filter(g => g.agents.includes('*'))
  const regles = retenus.flatMap(g => g.regles)
  let delai: number | null = null
  for (const g of retenus) if (g.delai !== null) delai = g.delai
  return {
    present: true,
    interdits: regles.filter(r => !r.permis).map(r => r.motif),
    regles,
    sitemaps,
    delai,
  }
}

const SANS_RESERVE = /[A-Za-z0-9\-._~]/
const octetHex = (o: number) => `%${o.toString(16).toUpperCase().padStart(2, '0')}`
const encodeur = new TextEncoder()

/**
 * La forme que l'on compare (RFC 9309 § 2.2.2), pour un motif comme pour un chemin :
 * un octet échappé que l'URI laisse nu (lettre, chiffre, `-._~`) est décodé ; tout
 * autre octet échappé garde son échappement, en hexadécimal majuscule — `%2F` n'est
 * pas `/`, `%2A` n'est pas un joker ; un caractère non ASCII est encodé en UTF-8 ;
 * un `%` qui n'ouvre pas un échappement est lui-même, donc `%25`.
 */
export function normalise(s: string): string {
  let r = ''
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '%') {
      const hex = s.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        const o = parseInt(hex, 16)
        r += SANS_RESERVE.test(String.fromCharCode(o)) ? String.fromCharCode(o) : octetHex(o)
        i += 2
      } else r += '%25'
    } else if (c.charCodeAt(0) < 128) {
      r += c
    } else {
      const cp = String.fromCodePoint(s.codePointAt(i)!)
      for (const o of encodeur.encode(cp)) r += octetHex(o)
      i += cp.length - 1
    }
  }
  return r
}

/** Une règle prête à servir : son motif normalisé, coupé aux jokers. */
type Compilee = {
  permis: boolean
  /** Longueur du motif normalisé : c'est elle qui départage deux règles. */
  longueur: number
  /** Les morceaux entre les `*` (le premier ancré au début du chemin). */
  morceaux: string[]
  /** Un `$` final : le dernier morceau doit finir le chemin. */
  fin: boolean
}

function compile(regle: Regle): Compilee {
  const motif = normalise(regle.motif)
  const fin = motif.endsWith('$')
  return {
    permis: regle.permis,
    longueur: motif.length,
    morceaux: (fin ? motif.slice(0, -1) : motif).split('*'),
    fin,
  }
}

/**
 * Le motif (`*`, `$` final) colle-t-il au début du chemin ? Sans expression
 * régulière : chaque morceau est cherché au plus tôt après le précédent, et
 * le plus tôt est toujours le bon choix (il laisse le plus de chemin au reste).
 * Un seul passage, jamais de retour en arrière — un motif hostile ne coûte
 * pas plus qu'un autre.
 */
function colle({ morceaux, fin }: Compilee, chemin: string): boolean {
  const premier = morceaux[0]
  if (morceaux.length === 1) return fin ? chemin === premier : chemin.startsWith(premier)
  if (!chemin.startsWith(premier)) return false
  let pos = premier.length
  for (let i = 1; i < morceaux.length - 1; i++) {
    const trouve = chemin.indexOf(morceaux[i], pos)
    if (trouve < 0) return false
    pos = trouve + morceaux[i].length
  }
  const dernier = morceaux[morceaux.length - 1]
  // Avec `$`, le dernier morceau finit le chemin, après tout ce qui précède ;
  // sans, il lui suffit d'apparaître.
  return fin
    ? chemin.length - dernier.length >= pos && chemin.endsWith(dernier)
    : chemin.indexOf(dernier, pos) >= 0
}

/**
 * Les règles compilées, rangées par leur premier morceau (le préfixe littéral que
 * le chemin doit porter) : pour un chemin, on ne regarde que les règles dont le
 * préfixe est un début de ce chemin, pas les dix-huit mille d'un gros fichier.
 */
type Jeu = { parPrefixe: Map<string, Compilee[]>; longueurs: number[] }

/** Une fois par robots.txt lu (clé : sa liste de règles). */
const compilees = new WeakMap<Regle[], Jeu>()

function jeuDe(regles: Regle[]): Jeu {
  let jeu = compilees.get(regles)
  if (jeu) return jeu
  const parPrefixe = new Map<string, Compilee[]>()
  for (const regle of regles.map(compile)) {
    const prefixe = regle.morceaux[0]
    const rang = parPrefixe.get(prefixe)
    if (rang) rang.push(regle)
    else parPrefixe.set(prefixe, [regle])
  }
  const longueurs = [...new Set([...parPrefixe.keys()].map(p => p.length))].sort((a, b) => a - b)
  jeu = { parPrefixe, longueurs }
  compilees.set(regles, jeu)
  return jeu
}

/**
 * Le chemin — avec sa chaîne de requête, `/priv?x=1` — est-il permis ? Le motif
 * le plus long gagne ; à longueur égale, `Allow` (RFC 9309 § 2.2.2).
 */
export function autorise(chemin: string, r: Robots): boolean {
  const { parPrefixe, longueurs } = jeuDe(r.regles)
  const vu = normalise(chemin)
  let meilleure: Compilee | null = null
  for (const n of longueurs) {
    if (n > vu.length) break
    for (const regle of parPrefixe.get(vu.slice(0, n)) ?? []) {
      // Une règle qui ne battrait pas la meilleure trouvée n'a pas à être essayée.
      if (meilleure && (regle.longueur < meilleure.longueur
        || (regle.longueur === meilleure.longueur && (meilleure.permis || !regle.permis)))) continue
      if (colle(regle, vu)) meilleure = regle
    }
  }
  return meilleure ? meilleure.permis : true
}

/** Chemin et chaîne de requête : ce que robots.txt compare. */
export const cheminDe = (u: string) => { const x = new URL(u); return x.pathname + x.search }

const estXml = (u: string) => /\.xml(\.gz)?$/i.test(u)
const parleRecette = (u: string) => /recip|recett/i.test(u)

/**
 * Les URL de recettes d'un site, dans l'ordre du sitemap.
 *
 * `pause` est appelée entre deux requêtes : c'est l'appelant qui décide du
 * rythme, et il n'y a aucune raison qu'il soit différent d'un script à l'autre.
 */
export async function urlsDeRecettes(
  domaine: string,
  r: Robots,
  { max = 50, pause, repliAccueil = false }:
  { max?: number; pause: () => Promise<void>; repliAccueil?: boolean },
): Promise<string[]> {
  const depart = r.sitemaps.length > 0
    // Ceux qui disent « recette » d'abord : c'est toute la leçon.
    ? [...r.sitemaps].sort((a, b) => Number(parleRecette(b)) - Number(parleRecette(a)))
    : [
        `https://${domaine}/sitemap.xml`,
        `https://www.${domaine}/sitemap.xml`,
        `https://${domaine}/sitemap_index.xml`,
      ]

  const locs = async (u: string) => {
    const xml = await texteDe(u)
    return xml ? [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]) : []
  }

  const trouvees: string[] = []
  for (const sm of depart.slice(0, 5)) {
    let liste = await locs(sm)
    await pause()

    // Sitemap d'index : on descend d'UN niveau, en visant les recettes.
    const sous = liste.filter(estXml)
    if (sous.length > 0) {
      const vise = sous.filter(parleRecette)
      for (const s of (vise.length > 0 ? vise : sous).slice(0, 6)) {
        if (trouvees.length >= max) break
        liste = liste.concat(await locs(s))
        await pause()
      }
    }

    for (const u of liste) {
      if (estXml(u) || !parleRecette(u)) continue
      try {
        if (!autorise(cheminDe(u), r)) continue
      } catch { continue }
      trouvees.push(u)
    }
    if (trouvees.length >= max) break
  }

  // Aucun sitemap exploitable — certains gros sites n'en déclarent pas. On
  // retombe alors sur les liens de la page d'accueil.
  //
  // ⚠️ RÉSERVÉ À LA SONDE (`repliAccueil`). Ces liens ramènent des pages de
  //    CATÉGORIE (« Cuisine minceur »), dont le JSON-LD porte parfois la recette
  //    mise en avant : cela répond à « le site publie-t-il ? », mais ingérer
  //    l'une d'elles mettrait au catalogue une recette au titre de rubrique.
  if (trouvees.length === 0 && repliAccueil) {
    const accueil = await texteDe(`https://www.${domaine}/`) ?? await texteDe(`https://${domaine}/`)
    await pause()
    if (accueil) {
      for (const m of accueil.matchAll(/href="((?:https?:\/\/[^"]*)?\/[^"]*recette[^"]*)"/gi)) {
        const u = m[1].startsWith('http') ? m[1] : `https://www.${domaine}${m[1]}`
        // Les pages d'index (« /recettes ») ne portent aucune recette.
        if (/\/(recettes|recipes)\/?$/i.test(u)) continue
        try {
          if (!autorise(cheminDe(u), r)) continue
        } catch { continue }
        trouvees.push(u)
      }
    }
  }

  // Les sitemaps commencent souvent par des pages de catégorie : on échantillonne
  // en pas réguliers plutôt que de prendre le début.
  const uniques = [...new Set(trouvees)]
  if (uniques.length <= max) return uniques
  const pas = uniques.length / max
  return Array.from({ length: max }, (_, i) => uniques[Math.floor(i * pas)])
}

/** Le tout d'un coup : robots.txt puis les URL. */
export async function decouvrir(
  domaine: string,
  options: { max?: number; pause: () => Promise<void>; repliAccueil?: boolean },
): Promise<{ robots: Robots; urls: string[] }> {
  const robots = lireRobots(await texteDe(`https://${domaine}/robots.txt`, 15000))
  await options.pause()
  return { robots, urls: await urlsDeRecettes(domaine, robots, options) }
}
