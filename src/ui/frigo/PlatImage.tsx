/**
 * La photo d'un plat, ou « pas encore de photo » : l'appareil photo en trait, jamais une image vide.
 *
 * Un LIEN vers la photo du site (`referrerPolicy`, comme `ui/recettes/Photo`) ou vers la nôtre (le seau des
 * photos de plats). Une adresse qui ne charge pas bascule sur l'appareil photo, et on s'en souvient UN MOMENT
 * (`DELAI_ECHEC`) : on ne la redemande pas à chaque carte, mais une coupure de réseau d'une seconde ne
 * condamne pas la photo jusqu'au prochain rechargement de la page.
 */
import { useState } from 'react'
import { echecRecent, noteUnEchec } from './echec-image.ts'

export function Appareil({ taille }: { taille: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  )
}

export function PlatImage({ url, filtre, glyphe = 26, texte = true }: {
  url: string | null; filtre?: string; glyphe?: number; texte?: boolean
}) {
  const [, redessine] = useState(0)
  if (!url || echecRecent(url)) {
    return (
      <span data-photo="vide" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-doux">
        <Appareil taille={glyphe} />
        {texte && <span className="text-[12px]">pas encore de photo</span>}
      </span>
    )
  }
  return (
    <img src={url} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
         onError={() => { noteUnEchec(url); redessine(n => n + 1) }}
         className="block size-full object-cover" style={filtre ? { filter: filtre } : undefined} />
  )
}
