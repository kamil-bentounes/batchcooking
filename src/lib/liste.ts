/**
 * La liste de courses, mise en ordre pour le magasin (D56, D58, D59).
 *
 * Pur : aucune requête, aucun client. Ce qui compte ici, c'est l'ORDRE — une
 * sortie par enseigne, et dans chacune les rayons dans l'ordre où ce foyer les
 * traverse vraiment. C'est éprouvable sans base, donc c'est éprouvé.
 */
import { rangParDefaut } from './rayons.ts'

/** Ce dont la mise en ordre a besoin d'un article, et rien de plus. */
export type ArticleRange = {
  id: string
  label: string
  store_id: string | null
  aisle: string | null
  checked_at: string | null
}

/** Une position apprise, telle que `aisle_order` la garde. */
export type Rang = { store_id: string | null; aisle: string; position: number | string }

export type Groupe<T> = { rayon: string; articles: T[] }
export type Sortie<T> = {
  storeId: string | null
  groupes: Groupe<T>[]
  restants: number
  total: number
}

/** La clé d'un rayon dans un magasin. Le séparateur ne peut apparaître dans un uuid. */
const cle = (magasin: string | null, rayon: string) => `${magasin}|${rayon}`

export function organise<T extends ArticleRange>(
  articles: T[],
  ordres: Rang[],
  magasins: { id: string; name: string }[],
): Sortie<T>[] {
  const rang = new Map(ordres.map(o => [cle(o.store_id, o.aisle), Number(o.position)]))

  const parMagasin = new Map<string | null, T[]>()
  for (const a of articles) {
    if (!parMagasin.has(a.store_id)) parMagasin.set(a.store_id, [])
    parMagasin.get(a.store_id)!.push(a)
  }

  // L'ordre des enseignes est celui des réglages ; les articles sans magasin
  // passent en dernier, pour ne pas ouvrir la liste sur un rayon fantôme.
  const ordreMagasin = new Map(magasins.map((m, i) => [m.id, i]))
  const place = (id: string | null) => (id === null ? 99 : ordreMagasin.get(id) ?? 98)

  return [...parMagasin.entries()]
    .sort((a, b) => place(a[0]) - place(b[0]))
    .map(([storeId, liste]) => {
      const parRayon = new Map<string, T[]>()
      for (const a of liste) {
        const r = a.aisle ?? 'Autre'
        if (!parRayon.has(r)) parRayon.set(r, [])
        parRayon.get(r)!.push(a)
      }

      const groupes = [...parRayon.entries()]
        .map(([rayon, articles]) => ({
          rayon,
          // Dans un rayon, ce qui reste à prendre d'abord : on ne fait pas
          // relire vingt lignes barrées pour trouver la seule qui compte.
          articles: [...articles].sort((x, y) =>
            Number(!!x.checked_at) - Number(!!y.checked_at) ||
            x.label.localeCompare(y.label, 'fr')),
        }))
        .sort((a, b) =>
          (rang.get(cle(storeId, a.rayon)) ?? rangParDefaut(a.rayon)) -
          (rang.get(cle(storeId, b.rayon)) ?? rangParDefaut(b.rayon)))

      return {
        storeId,
        groupes,
        restants: liste.filter(a => !a.checked_at).length,
        total: liste.length,
      }
    })
}

/** Ce que la sortie coûte, estimé et réel. Le réel ne s'affiche que s'il existe. */
export function budget(
  articles: { est_price_eur: number | string | null; paid_price_eur: number | string | null }[],
): { estime: number; paye: number | null } {
  const centimes = (n: number) => Math.round(n * 100) / 100
  const estime = articles.reduce((s, a) => s + Number(a.est_price_eur ?? 0), 0)
  const payes = articles.filter(a => a.paid_price_eur !== null)
  return {
    estime: centimes(estime),
    // Additionner des prix payés partiels et les présenter comme le total
    // serait mentir : on ne rend un réel que s'il y en a un.
    paye: payes.length > 0
      ? centimes(payes.reduce((s, a) => s + Number(a.paid_price_eur), 0))
      : null,
  }
}
