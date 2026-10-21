/** La vignette d'une catégorie, ou de l'épargne : une photo de `public/budget/`. */
import { infoCategorie } from '../../lib/budget/categories.ts'

export function Photo({ categorie, epargne = false, taille = 54 }: {
  categorie?: string; epargne?: boolean; taille?: number
}) {
  const nom = epargne ? 'epargne' : infoCategorie(categorie ?? 'autre').cle
  return (
    <img src={`${import.meta.env.BASE_URL}budget/${nom}.jpg`} alt="" loading="lazy"
         width={taille} height={taille} style={{ width: taille, height: taille }}
         className="shrink-0 rounded-[16px] object-cover bg-piste" />
  )
}
