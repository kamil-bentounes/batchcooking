/**
 * La photo d'une recette : un LIEN vers celle du site, jamais une copie (R3).
 *
 *  · `referrerPolicy="no-referrer"` — le site n'a pas à savoir qui regarde sa
 *    photo, et c'est aussi ce qui passe la plupart des refus de « hotlink » ;
 *  · `loading="lazy"` — seules les recettes affichées se téléchargent ;
 *  · une IMAGE NEUTRE quand il n'y a pas de photo ou qu'elle ne charge plus : le
 *    fond piste et la marmite de Popote. Une adresse en échec est retenue jusqu'au
 *    rechargement de la page : on ne la redemande pas à chaque page de la liste.
 */
import { useState } from 'react'
import { Marque } from '../coque.tsx'

const enEchec = new Set<string>()

export function Photo({ url, className = '', glyphe = 34 }:
  { url: string | null; className?: string; glyphe?: number }) {
  const [, redessine] = useState(0)
  if (!url || enEchec.has(url)) {
    return (
      <span data-photo="neutre" aria-hidden="true"
            className={`grid place-items-center shrink-0 bg-piste text-doux/50 ${className}`}>
        <Marque taille={glyphe} />
      </span>
    )
  }
  return (
    <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
         onError={() => { enEchec.add(url); redessine(n => n + 1) }}
         className={`object-cover shrink-0 bg-piste ${className}`} />
  )
}
