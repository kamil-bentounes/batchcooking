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

/** Un motif de robots.txt (`*`, `$` final) en expression, ancrée au début du chemin. */
function motifEnExpression(motif: string): RegExp {
  const fin = motif.endsWith('$')
  const corps = (fin ? motif.slice(0, -1) : motif)
    .split('*').map(p => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${corps}${fin ? '$' : ''}`)
}

/**
 * Le chemin — avec sa chaîne de requête, `/priv?x=1` — est-il permis ? Le motif
 * le plus long gagne ; à longueur égale, `Allow` (RFC 9309 § 2.2.2).
 */
export function autorise(chemin: string, r: Robots): boolean {
  let meilleure: Regle | null = null
  for (const regle of r.regles) {
    if (!motifEnExpression(regle.motif).test(chemin)) continue
    if (
      !meilleure ||
      regle.motif.length > meilleure.motif.length ||
      (regle.motif.length === meilleure.motif.length && regle.permis)
    ) meilleure = regle
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
