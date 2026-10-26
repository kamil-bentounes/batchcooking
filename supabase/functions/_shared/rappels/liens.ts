/**
 * Les liens d'un mail : toujours sous `APP_BASE_URL`, jamais ailleurs. Le texte d'un mail vient de la base et de
 * gens ; un lien, lui, n'est jamais composé avec autre chose qu'un chemin de l'appli et des identifiants encodés.
 */

/** La base, sans barre finale ni requête. Elle doit être une adresse web, sinon on s'arrête : un mail sans lien juste ne part pas. */
export function baseSure(base: string | undefined | null): string {
  const b = (base ?? '').trim()
  let u: URL
  try { u = new URL(b) } catch { throw new Error('APP_BASE_URL n’est pas une adresse.') }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('APP_BASE_URL doit être une adresse web.')
  if (u.search || u.hash || u.username || u.password) throw new Error('APP_BASE_URL ne porte ni requête, ni identifiants.')
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}`
}

/** Un chemin de l'appli (`/frigo`) avec ses paramètres. Une liste d'identifiants s'écrit `a,b,c`. */
export function lien(base: string, chemin: string, params: Record<string, string | string[] | undefined> = {}): string {
  if (!chemin.startsWith('/')) throw new Error(`Un chemin d’appli commence par « / » : ${chemin}`)
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && (Array.isArray(v) ? v.length > 0 : v !== ''))
    .map(([k, v]) => `${encodeURIComponent(k)}=${(Array.isArray(v) ? v : [v as string]).map(encodeURIComponent).join(',')}`)
  return `${baseSure(base)}${chemin}${q.length ? `?${q.join('&')}` : ''}`
}

/** Une illustration servie par le site (`public/mail/<nom>.png`), jamais jointe au mail. */
export const illustration = (base: string, nom: string) => `${baseSure(base)}/mail/${encodeURIComponent(nom)}.png`

/** Une photo de plat : celle de la recette, en https seulement (une adresse locale ou une autre forme n'arrive pas dans un mail). */
export function photoSure(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && url.length <= 2048 ? u.href : null
  } catch { return null }
}
