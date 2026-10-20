/**
 * Ce qu'une page relue nous dit, et quand laisser un site tranquille (R3).
 *
 * La relecture des pages déjà ingérées ne cherche qu'une chose : la photo. Elle
 * ne force rien. Un site qui répond 429, ou par un défi anti-robot reconnu (en-tête
 * `cf-mitigated`, page « Just a moment »), est laissé dès la PREMIÈRE réponse, sans
 * un second essai. Un autre refus — un statut ordinaire, ou une page de défi sans
 * recette, qui répond souvent 200 — est laissé après trois refus DE SUITE.
 * Un site en panne (5xx autres que 503, réseau, délai dépassé) l'est après cinq
 * erreurs de suite : on ne le martèle pas. Une page disparue n'est pas un refus :
 * le site répond, la recette n'y est plus.
 */
export type Issue =
  | 'photo' | 'sans-photo' | 'sans-recette' | 'disparue' | 'refusee' | 'bloquee' | 'erreur'

export const REFUS_AVANT_ABANDON = 3
export const ERREURS_AVANT_ABANDON = 5

/** Ce que porte la page de défi d'un pare-feu anti-robot (Cloudflare et ses proches). */
const SIGNATURE_DEFI = /just a moment|attention required|cf[-_]chl/i

/**
 * La réponse est-elle un défi anti-robot ? Seul un refus (401, 403, 503) peut
 * l'être : l'en-tête `cf-mitigated` suffit ; le corps (déjà borné par l'appelant)
 * ne compte que sur un 403 ou un 503 — une recette qui parle d'« un moment »
 * n'est pas un défi.
 */
export function estUnDefi(statut: number, cfMitigated: boolean, corps: string | null): boolean {
  if (statut !== 401 && statut !== 403 && statut !== 503) return false
  if (cfMitigated) return true
  return statut !== 401 && corps !== null && SIGNATURE_DEFI.test(corps)
}

/**
 * `defi` : la réponse porte la signature d'un défi anti-robot (`estUnDefi`).
 * Un 429, ou un défi, est « bloquee » : on ne contourne rien, le domaine est laissé
 * dès la première (voir `abandonne`). Un 401, 403 ou 503 sans signature reste un
 * refus ordinaire, qui en demande trois.
 */
export function issueDe(
  statut: number,
  aUneRecette: boolean,
  photo: string | null,
  defi = false,
): Issue {
  if (statut === 404 || statut === 410) return 'disparue'
  if (statut === 429) return 'bloquee'
  if (statut === 401 || statut === 403 || statut === 503) return defi ? 'bloquee' : 'refusee'
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
 * Une page « bloquee » (429, défi anti-robot) : on laisse le site tout de suite.
 * Sinon, trois refus de suite, ou cinq erreurs de suite, et on le laisse pour cette
 * fois. Les deux séries ne se mélangent pas.
 */
export function abandonne(dernieres: Issue[]): boolean {
  return (
    dernieres.includes('bloquee') ||
    finDe(dernieres, REFUS_AVANT_ABANDON, estUnRefus) ||
    finDe(dernieres, ERREURS_AVANT_ABANDON, estUneErreur)
  )
}

/** Les issues que la reprise note et saute : la page est réglée, la relire n'apprendrait rien. */
export const ISSUES_REGLEES: ReadonlySet<string> =
  new Set(['photo', 'sans-photo', 'disparue', 'interdite'])

const estObjet = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Le fichier d'état de la reprise — `{ "<base>": { "<id>": { issue, le } } }` — a-t-il
 * la bonne forme ? `null` si oui ; sinon, ce qui cloche, pour l'écrire à l'écran.
 * Un JSON valide d'une autre forme (`null`, `"x"`, `[]`…) ne doit pas être pris pour
 * un état vide : on s'arrête avant tout appel réseau, comme pour un JSON illisible.
 */
export function etatInvalide(etat: unknown): string | null {
  if (!estObjet(etat)) return 'la racine devrait être un objet { "<base>": { "<id>": { issue, le } } }'
  for (const [base, fiches] of Object.entries(etat)) {
    if (!estObjet(fiches)) return `« ${base} » devrait être un objet { "<id>": { issue, le } }`
    for (const [id, fiche] of Object.entries(fiches)) {
      if (!estObjet(fiche)) return `« ${base} » / « ${id} » devrait être un objet { issue, le }`
      if (typeof fiche.issue !== 'string' || !ISSUES_REGLEES.has(fiche.issue)) {
        return `« ${base} » / « ${id} » : issue illisible (attendu : ${[...ISSUES_REGLEES].join(', ')})`
      }
      if (fiche.le !== undefined && typeof fiche.le !== 'string') {
        return `« ${base} » / « ${id} » : « le » devrait être une date en texte`
      }
    }
  }
  return null
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

/** Les plages IPv4 où l'on ne frappe jamais : [base, bits, nom]. */
const PLAGES_V4: ReadonlyArray<readonly [number, number, string]> = [
  [0x00000000, 8, 'réseau « ce réseau » 0.0.0.0/8'],
  [0x0a000000, 8, 'réseau privé 10.0.0.0/8'],
  [0x64400000, 10, 'CGNAT 100.64.0.0/10'],
  [0x7f000000, 8, 'bouclage 127.0.0.0/8'],
  [0xa9fe0000, 16, 'lien local et métadonnées 169.254.0.0/16'],
  [0xac100000, 12, 'réseau privé 172.16.0.0/12'],
  [0xc0000000, 24, 'réservé IETF 192.0.0.0/24'],
  [0xc0a80000, 16, 'réseau privé 192.168.0.0/16'],
  [0xc6120000, 15, 'banc d’essai 198.18.0.0/15'],
  [0xe0000000, 3, 'multicast et réservé 224.0.0.0/3'],
]

const nomPlageV4 = (n: number): string | null => {
  for (const [base, bits, nom] of PLAGES_V4) {
    const masque = (0xffffffff << (32 - bits)) >>> 0
    if (((n & masque) >>> 0) === base) return nom
  }
  return null
}

/** Un morceau d'adresse IPv4 : décimal, octal (`0177`) ou hexadécimal (`0x7f`). Les mêmes que `inet_aton`. */
const MORCEAU_NUMERIQUE = /^(0x[0-9a-f]*|\d+)$/i

function morceau(m: string): number | null {
  if (/^0x/i.test(m)) return m.length === 2 ? 0 : parseInt(m.slice(2), 16)
  if (m.length > 1 && m.startsWith('0')) return /^[0-7]+$/.test(m) ? parseInt(m, 8) : null
  return Number(m)
}

/**
 * Une adresse IPv4 écrite à la manière de `inet_aton` — `127.0.0.1`, mais aussi
 * `2130706433`, `0x7f.1`, `0177.0.0.1`, `127.1` — en entier de 32 bits. `null` si
 * elle ne se lit pas. Un navigateur ou un résolveur les acceptent toutes : le
 * filtre doit les lire pareil, sans quoi `http://2130706433/` passe pour un nom.
 */
function ipv4De(h: string): number | null {
  const morceaux = h.split('.')
  if (morceaux.length > 4 || !morceaux.every(m => MORCEAU_NUMERIQUE.test(m))) return null
  const n = morceaux.map(morceau)
  if (n.some(v => v === null || !Number.isFinite(v))) return null
  const v = n as number[]
  const dernier = v[v.length - 1]
  if (v.slice(0, -1).some(x => x > 255) || dernier >= 256 ** (5 - v.length)) return null
  return v.slice(0, -1).reduce((acc, x, i) => acc + x * 256 ** (3 - i), 0) + dernier
}

/** Une adresse IPv6 en huit groupes de 16 bits ; `null` si elle ne se lit pas. */
function ipv6De(h: string): number[] | null {
  let t = h.replace(/%.*$/, '')
  if (t.includes('.')) {
    // IPv4 inscrite en fin d'adresse : `::ffff:10.0.0.1`.
    const deux = t.lastIndexOf(':')
    const v4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(t.slice(deux + 1)) ? ipv4De(t.slice(deux + 1)) : null
    if (v4 === null) return null
    t = `${t.slice(0, deux + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`
  }
  const moities = t.split('::')
  if (moities.length > 2) return null
  const groupes = (x: string) => (x === '' ? [] : x.split(':'))
  const tete = groupes(moities[0])
  const queue = moities.length === 2 ? groupes(moities[1]) : []
  if (moities.length === 1 ? tete.length !== 8 : tete.length + queue.length > 7) return null
  const plein = [...tete, ...Array<string>(8 - tete.length - queue.length).fill('0'), ...queue]
  if (!plein.every(g => /^[0-9a-f]{1,4}$/i.test(g))) return null
  return plein.map(g => parseInt(g, 16))
}

const v4Des = (haut: number, bas: number) => ((haut << 16) | bas) >>> 0

/** Pourquoi cette adresse IPv6 est de chez nous, ou `null`. */
function nomPlageV6(g: number[]): string | null {
  const [a, b, c, d, e, f, x, y] = g
  const v4 = nomPlageV4(v4Des(x, y))
  if (g.every(v => v === 0)) return 'adresse indéfinie ::'
  if (g.slice(0, 7).every(v => v === 0) && y === 1) return 'bouclage ::1'
  if ((a & 0xfe00) === 0xfc00) return 'unique-local fc00::/7'
  if ((a & 0xffc0) === 0xfe80) return 'lien local fe80::/10'
  if ((a & 0xffc0) === 0xfec0) return 'site-local fec0::/10'
  if ((a & 0xff00) === 0xff00) return 'multicast ff00::/8'
  if (a === 0x2001 && b === 0xdb8) return 'documentation 2001:db8::/32'
  // IPv4 inscrite en IPv6 : mappée (::ffff:a.b.c.d), compatible (::a.b.c.d), NAT64, 6to4.
  if ([a, b, c, d, e].every(v => v === 0) && f === 0xffff) return v4 && `IPv4 mappée, ${v4}`
  if ([a, b, c, d, e, f].every(v => v === 0)) return v4 && `IPv4 compatible, ${v4}`
  if (a === 0x64 && b === 0xff9b && [c, d, e, f].every(v => v === 0)) return v4 && `NAT64, ${v4}`
  if (a === 0x2002) { const r = nomPlageV4(v4Des(b, c)); return r && `6to4, ${r}` }
  return null
}

/**
 * Pourquoi cet hôte est de chez nous — bouclage, réseau privé, lien local,
 * unique-local, CGNAT, métadonnées du nuage, nom qui n'existe que sur le réseau
 * local —, ou `null` s'il est public. `host` est un nom ou une adresse, sans port
 * (les crochets d'une IPv6 sont tolérés) ; `adresses` sont celles où le nom se
 * RÉSOUT (`dns.lookup`, toutes) : un nom public qui pointe vers 10.0.0.5 est refusé.
 *
 * `source_url` est réécrivable par un foyer : sans ce contrôle, la machine de
 * Kamil irait lire `http://169.254.169.254/` pour qui le demande.
 */
export function hoteInterdit(host: string, adresses: readonly string[] = []): string | null {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (h === '') return 'hôte vide'
  if (h === 'localhost' || /\.(localhost|local|internal|lan)$/.test(h)) {
    return `${host} : nom du réseau local`
  }
  if (h.includes(':')) {
    const g = ipv6De(h)
    if (g === null) return `${host} : adresse IPv6 illisible`
    const nom = nomPlageV6(g)
    return nom && `${host} : ${nom}`
  }
  // Le dernier morceau est un nombre : le nom est une adresse IPv4 (à la `inet_aton`),
  // jamais un nom de domaine — un nom ne se termine pas par un nombre.
  const dernier = h.split('.').at(-1) as string
  if (MORCEAU_NUMERIQUE.test(dernier)) {
    const n = ipv4De(h)
    if (n === null) return `${host} : adresse IPv4 illisible`
    const nom = nomPlageV4(n)
    if (nom) return `${host} : ${nom}`
  }
  for (const adresse of adresses) {
    // Une adresse résolue que l'on ne sait pas lire est refusée aussi : dans le doute, on ne frappe pas.
    const lisible = adresse.includes(':') || (/^[\d.]+$/.test(adresse) && ipv4De(adresse) !== null)
    const raison = lisible ? hoteInterdit(adresse) : `${adresse} n'est pas une adresse`
    if (raison) return `${host} se résout vers ${adresse} : ${raison}`
  }
  return null
}

/**
 * Cet hôte (sans le port) est-il une adresse de la maison ? Voir `hoteInterdit`.
 */
export const estPrive = (hostname: string): boolean => hoteInterdit(hostname) !== null

/**
 * Peut-on seulement demander cette adresse ? `null` si oui ; sinon, pourquoi non :
 * ni autre schéma que http(s), ni identité dans l'adresse, ni hôte de chez nous.
 * C'est le garde de la PREMIÈRE requête à un hôte ; la résolution DNS s'y ajoute
 * (`hoteInterdit(hôte, adresses)`).
 */
export function urlRefusee(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return 'adresse illisible'
  }
  return formeRefusee(u) ?? hoteInterdit(u.hostname)
}

/** Le schéma et l'identité d'une adresse : http(s) seulement, et rien devant l'hôte. */
export function formeRefusee(u: URL): string | null {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `schéma ${u.protocol} refusé`
  if (u.username || u.password) return 'identité dans l’adresse'
  return null
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

/**
 * Le seul cas où un hôte de chez nous est permis : un essai LOCAL (`--domaine
 * 127.0.0.1:8787`, `--domaine localhost:9101`), sur le site que l'on désigne soi-même
 * contre un serveur de test. Jamais avec `--prod` : la production ne frappe que le
 * web public, quoi que dise la ligne de commande.
 */
export function exempteLocal(prod: boolean, domaines: readonly string[], host: string): boolean {
  return !prod && domaines.some(d => cleSite(d) === cleSite(host))
}
