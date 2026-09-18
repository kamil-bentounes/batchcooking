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

export type Robots = {
  present: boolean
  interdits: string[]
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

/**
 * Lecture de robots.txt. Pas un parseur exhaustif — on cherche à savoir si le
 * site nous dit non, et à s'y tenir.
 */
export function lireRobots(txt: string | null): Robots {
  if (!txt) return { present: false, interdits: [], sitemaps: [], delai: null }

  const sitemaps = [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map(m => m[1])
  const interdits: string[] = []
  let delai: number | null = null
  let concerne = false

  for (const l of txt.split(/\r?\n/)) {
    const ua = l.match(/^\s*user-agent:\s*(.+)$/i)
    if (ua) { concerne = ua[1].trim() === '*'; continue }
    if (!concerne) continue
    const d = l.match(/^\s*disallow:\s*(\S*)/i)
    if (d && d[1]) interdits.push(d[1])
    const c = l.match(/^\s*crawl-delay:\s*(\d+)/i)
    if (c) delai = Number(c[1])
  }
  return { present: true, interdits, sitemaps, delai }
}

export function autorise(chemin: string, r: Robots): boolean {
  return !r.interdits.some(i => chemin.startsWith(i))
}

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
        if (!autorise(new URL(u).pathname, r)) continue
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
          if (!autorise(new URL(u).pathname, r)) continue
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
