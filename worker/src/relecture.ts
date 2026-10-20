/**
 * Ce qu'une page relue nous dit, et quand laisser un site tranquille (R3).
 *
 * La relecture des pages déjà ingérées ne cherche qu'une chose : la photo. Elle
 * ne force rien. Un site qui refuse — par un statut, ou par une page de défi
 * sans recette, qui répond souvent 200 — est laissé après trois refus DE SUITE.
 * Un site en panne (5xx autres que 503, réseau, délai dépassé) l'est après cinq
 * erreurs de suite : on ne le martèle pas. Une page disparue n'est pas un refus :
 * le site répond, la recette n'y est plus.
 */
export type Issue = 'photo' | 'sans-photo' | 'sans-recette' | 'disparue' | 'refusee' | 'erreur'

export const REFUS_AVANT_ABANDON = 3
export const ERREURS_AVANT_ABANDON = 5

export function issueDe(statut: number, aUneRecette: boolean, photo: string | null): Issue {
  if (statut === 404 || statut === 410) return 'disparue'
  if (statut === 401 || statut === 403 || statut === 429 || statut === 503) return 'refusee'
  // 0 : le réseau, ou le délai de 30 s.
  if (statut < 200 || statut >= 300) return 'erreur'
  if (!aUneRecette) return 'sans-recette'
  return photo ? 'photo' : 'sans-photo'
}

const estUnRefus = (i: Issue) => i === 'refusee' || i === 'sans-recette'
const estUneErreur = (i: Issue) => i === 'erreur'

/** Les `n` dernières issues sont-elles toutes du même genre ? */
const finDe = (dernieres: Issue[], n: number, genre: (i: Issue) => boolean) => {
  const fin = dernieres.slice(-n)
  return fin.length === n && fin.every(genre)
}

/**
 * Trois refus de suite, ou cinq erreurs de suite, et on laisse le site pour cette
 * fois. Les deux séries ne se mélangent pas.
 */
export function abandonne(dernieres: Issue[]): boolean {
  return (
    finDe(dernieres, REFUS_AVANT_ABANDON, estUnRefus) ||
    finDe(dernieres, ERREURS_AVANT_ABANDON, estUneErreur)
  )
}

export type VoieRobots = 'lire' | 'tout-permis' | 'laisser'

/**
 * Que dire d'un domaine d'après la réponse de son `robots.txt` (RFC 9309) :
 * 2xx, on le lit ; 404 et les autres 4xx, rien n'est interdit ; 5xx ou
 * injoignable (0), le domaine est laissé pour ce passage.
 *
 * ⚠️ 401, 403 et 429 ne sont pas un « pas de robots.txt » : c'est un refus, ou
 *    un défi anti-robot. Tout permettre, ce serait passer outre — le domaine est
 *    laissé comme pour une 5xx.
 */
export function robotsDe(statut: number): VoieRobots {
  if (statut >= 200 && statut < 300) return 'lire'
  if (statut === 401 || statut === 403 || statut === 429) return 'laisser'
  if (statut >= 400 && statut < 500) return 'tout-permis'
  return 'laisser'
}

/** 1 100 ms entre deux requêtes au même hôte, `robots.txt` compris. */
export const PAUSE_MS = 1100

/** Au-delà de 30 s de `Crawl-delay`, le site n'a pas voulu qu'on le relise : on le laisse. */
export const DELAI_MAX_S = 30

/**
 * La pause à tenir entre deux requêtes à un hôte, d'après son `Crawl-delay` :
 * la nôtre si elle est plus longue, la sienne sinon. `null` quand il dépasse le
 * plafond : le domaine est laissé pour ce passage, on ne reste pas des heures
 * sur un seul site.
 */
export function pauseDe(delaiSecondes: number | null): number | null {
  if (delaiSecondes !== null && delaiSecondes > DELAI_MAX_S) return null
  return Math.max(PAUSE_MS, (delaiSecondes ?? 0) * 1000)
}

/** Une page de recette tient en quelques centaines de ko : 2 Mo suffisent à tout le JSON-LD. */
export const MAX_OCTETS = 2 * 1024 * 1024

/**
 * Lit un corps de réponse, mais pas au-delà de `max` octets : le flux est alors
 * annulé. Une page coupée qui n'a pas son JSON-LD sera simplement `sans-recette`.
 */
export async function lireBorne(res: Response, max = MAX_OCTETS): Promise<string> {
  if (!res.body) return ''
  const lecteur = res.body.getReader()
  const morceaux: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await lecteur.read()
      if (done) break
      const reste = max - total
      if (value.length >= reste) {
        morceaux.push(value.subarray(0, reste))
        total = max
        break
      }
      morceaux.push(value)
      total += value.length
    }
  } finally {
    // Sans effet quand le flux est fini ; sinon, on coupe la connexion.
    await lecteur.cancel().catch(() => {})
  }
  const tout = new Uint8Array(total)
  let a = 0
  for (const m of morceaux) { tout.set(m, a); a += m.length }
  return new TextDecoder().decode(tout)
}

/** Au plus trois redirections suivies pour une page. */
export const MAX_REDIRECTIONS = 3

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/

function ipv4Privee(h: string): boolean {
  const m = h.match(IPV4)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}

/**
 * Cet hôte (sans le port) est-il une adresse de la maison — bouclage, réseau
 * privé, lien local, métadonnées du nuage — ou un nom qui n'existe que chez nous ?
 */
export function estPrive(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || /\.(localhost|local|internal|lan)$/.test(h)) return true
  if (ipv4Privee(h)) return true
  if (!h.includes(':')) return false
  // IPv6 : `::`, `::1`, unique-local fc00::/7, lien local fe80::/10.
  if (h === '::' || h === '::1' || /^f[cd]/.test(h) || /^fe[89ab]/.test(h)) return true
  // IPv4 inscrite en IPv6 : `::ffff:7f00:1` (l'URL normalise `::ffff:127.0.0.1` ainsi).
  const m = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (m) {
    const [x, y] = [parseInt(m[1], 16), parseInt(m[2], 16)]
    return ipv4Privee(`${x >> 8}.${x & 255}.${y >> 8}.${y & 255}`)
  }
  return false
}

/**
 * La clé d'un site : son hôte (port compris), sans `www.`. C'est elle qui compte
 * le rythme — `a.fr` et `www.a.fr` sont presque toujours le même serveur, et lui
 * parler deux fois à 10 ms d'écart parce que le nom change serait impoli.
 */
export const cleSite = (host: string) => host.toLowerCase().replace(/^www\./, '')

/**
 * Le même site : le même hôte (port compris), ou le même au `www.` près. On s'en
 * tient là — pas de liste des suffixes publics : `img.a.fr` n'est pas `a.fr`.
 */
export const memeSite = (a: string, b: string) => cleSite(a) === cleSite(b)

/**
 * Une redirection est suivie seulement si elle reste dans le site de la page :
 * http(s), sans identité dans l'adresse, même hôte ou même hôte au `www.` près.
 * Toute autre — autre site, adresse privée, autre schéma — est refusée, et la
 * page compte pour une erreur. Un site local désigné (`--domaine 127.0.0.1:8787`)
 * peut se renvoyer à lui-même, jamais ailleurs.
 */
export function hopSuivi(
  depuis: string,
  location: string,
): { ok: true; url: string } | { ok: false; raison: string } {
  let vers: URL
  let origine: URL
  try {
    origine = new URL(depuis)
    vers = new URL(location, origine)
  } catch {
    return { ok: false, raison: 'adresse de redirection illisible' }
  }
  if (vers.protocol !== 'http:' && vers.protocol !== 'https:') {
    return { ok: false, raison: `schéma ${vers.protocol} refusé` }
  }
  if (vers.username || vers.password) return { ok: false, raison: 'identité dans l’adresse' }
  if (!memeSite(vers.host, origine.host)) {
    return {
      ok: false,
      raison: estPrive(vers.hostname) ? `adresse privée ${vers.host}` : `autre site : ${vers.host}`,
    }
  }
  vers.hash = ''
  return { ok: true, url: vers.toString() }
}

export type Arguments = {
  prod: boolean
  sec: boolean
  tout: boolean
  limite: number | null
  domaines: string[]
}

const DRAPEAUX = new Set(['--prod', '--sec', '--tout'])
const AVEC_VALEUR = new Set(['--limite', '--domaine'])
const HOTE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/

/**
 * Lit la ligne de commande — `--cle valeur` ou `--cle=valeur` —, et refuse ce
 * qu'elle ne comprend pas : une faute de frappe ne doit jamais valoir « sans
 * limite » ni « tous les domaines », surtout en `--prod`.
 */
export function lireArguments(argv: string[]): Arguments | { erreur: string } {
  const r: Arguments = { prod: false, sec: false, tout: false, limite: null, domaines: [] }
  for (let i = 0; i < argv.length; i++) {
    const brut = argv[i]
    // Le `--` que npm laisse passer : rien à lire.
    if (brut === '--') continue
    if (!brut.startsWith('--')) return { erreur: `argument inattendu : ${brut}` }
    const egal = brut.indexOf('=')
    const cle = egal >= 0 ? brut.slice(0, egal) : brut
    const inline = egal >= 0 ? brut.slice(egal + 1) : null

    if (DRAPEAUX.has(cle)) {
      if (inline !== null) return { erreur: `${cle} ne prend pas de valeur` }
      if (cle === '--prod') r.prod = true
      else if (cle === '--sec') r.sec = true
      else r.tout = true
      continue
    }
    if (!AVEC_VALEUR.has(cle)) return { erreur: `option inconnue : ${cle}` }

    let valeur = inline
    if (valeur === null) {
      valeur = argv[i + 1] ?? ''
      if (valeur.startsWith('--')) valeur = ''
      else i++
    }
    if (valeur === '') return { erreur: `${cle} demande une valeur` }
    if (cle === '--limite') {
      if (!/^[1-9]\d*$/.test(valeur)) return { erreur: `${cle} : « ${valeur} » n'est pas un entier positif` }
      r.limite = Number(valeur)
    } else {
      const h = valeur.toLowerCase()
      if (!HOTE.test(h)) return { erreur: `${cle} : « ${valeur} » n'est pas un hôte (exemple : www.a.fr ou 127.0.0.1:8787)` }
      r.domaines.push(h)
    }
  }
  return r
}
