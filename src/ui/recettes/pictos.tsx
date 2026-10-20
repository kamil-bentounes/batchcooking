/**
 * Les pictos de l'écran des recettes (R4).
 *
 * « four · plaques » se lisait en toutes lettres sous chaque recette ; Kamil veut
 * des images à la place des mots. Le mot ne disparaît pas : il devient
 * l'étiquette du dessin, pour les lecteurs d'écran et au survol.
 *
 * Les tracés sont ceux de la maquette (`docs/superpowers/maquettes/recettes/
 * build.py`, `APP` et `IC`), au trait, en `currentColor` : ils prennent la
 * couleur de leur pastille.
 */
import type { ReactNode } from 'react'

const APPAREILS: Record<string, { label: string; dessin: ReactNode }> = {
  four: { label: 'Four', dessin: <>
    <rect x="3" y="3.5" width="18" height="17" rx="3" /><path d="M3 8.5h18" />
    <rect x="6.5" y="11.5" width="11" height="6" rx="1.5" /><path d="M7 6h.01" /><path d="M10 6h.01" />
  </> },
  plaques: { label: 'Plaques', dessin: <>
    <rect x="2.5" y="4" width="19" height="16" rx="3" /><circle cx="8" cy="12" r="3" />
    <circle cx="16.5" cy="9" r="2" /><circle cx="16.5" cy="15.5" r="2" />
  </> },
  micro_ondes: { label: 'Micro-ondes', dessin: <>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" /><rect x="5.5" y="8" width="9.5" height="8" rx="1.2" />
    <path d="M18.5 9h.01" /><path d="M18.5 12.5v2.5" />
  </> },
  autocuiseur: { label: 'Autocuiseur', dessin: <>
    <path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z" /><path d="M3.5 11h17" />
    <path d="M6.5 11a5.5 4 0 0 1 11 0" /><path d="M12 4.5V7" /><path d="M2.5 14H5" /><path d="M19 14h2.5" />
  </> },
  blender: { label: 'Blender', dessin: <>
    <path d="M7 3h10l-1.6 10H8.6Z" /><rect x="7" y="13" width="10" height="8" rx="2" />
    <circle cx="12" cy="17" r="1.2" /><path d="M9.5 6.5h3" />
  </> },
  batteur: { label: 'Batteur', dessin: <>
    <path d="M12 13v8" /><path d="M12 13C7.5 13 6.5 3 12 3s4.5 10 0 10Z" />
    <path d="M12 13c-1.8 0-2.2-10 0-10s1.8 10 0 10Z" />
  </> },
  robot_cuiseur: { label: 'Robot cuiseur', dessin: <>
    <path d="M6 9.5h12l-1.2 5.5H7.2Z" /><path d="M8.5 9.5V6.5h7v3" />
    <rect x="4" y="15" width="16" height="6" rx="2" /><circle cx="12" cy="18" r="1.2" />
  </> },
  air_fryer: { label: 'Air fryer', dessin: <>
    <rect x="5" y="3" width="14" height="18" rx="4" /><path d="M9 7h6" /><path d="M5 13h14" /><path d="M10 17h4" />
  </> },
}

const ICONES = {
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></>,
  fermer: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  coche: <path d="M20 6 9 17l-5-5" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  loupe: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  reglages: <><path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" />
    <path d="M4 17h4" /><path d="M12 17h8" /><circle cx="10" cy="17" r="2" /></>,
  droite: <path d="M9 18l6-6-6-6" />,
  sortie: <><path d="M14 4h6v6" /><path d="M20 4 11 13" />
    <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
}

function Trait({ taille, epaisseur, children }:
  { taille: number; epaisseur: number; children: ReactNode }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth={epaisseur} strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" className="block shrink-0">
      {children}
    </svg>
  )
}

export function Icone({ nom, taille = 22, epaisseur = 2 }:
  { nom: keyof typeof ICONES; taille?: number; epaisseur?: number }) {
  return <Trait taille={taille} epaisseur={epaisseur}>{ICONES[nom]}</Trait>
}

/** Un appareil : le dessin, et son nom pour qui ne le voit pas. Code inconnu : rien. */
export function Picto({ code, taille = 18, className = '' }:
  { code: string; taille?: number; className?: string }) {
  const a = APPAREILS[code]
  if (!a) return null
  return (
    <span role="img" aria-label={a.label} title={a.label}
          className={`inline-grid place-items-center shrink-0 rounded-full ${className}`}>
      <Trait taille={taille} epaisseur={1.7}>{a.dessin}</Trait>
    </span>
  )
}

/**
 * Un appareil avec son nom, en pastille : la fiche (lecture seule) et le panneau
 * des filtres (un bouton qu'on coche).
 */
export function PictoEtNom({ code, actif = false, surClic }:
  { code: string; actif?: boolean; surClic?: () => void }) {
  const a = APPAREILS[code]
  if (!a) return null
  const contenu = (
    <>
      <span className={`size-[34px] grid place-items-center rounded-full
        ${actif ? 'bg-fond/15 text-fond' : 'bg-piste text-herbe'}`}>
        <Trait taille={18} epaisseur={1.7}>{a.dessin}</Trait>
      </span>
      {a.label}
    </>
  )
  const forme = 'inline-flex items-center gap-2 min-h-11 pl-1.5 pr-3.5 rounded-full text-[14px] font-medium'
  if (!surClic) return <span className={`${forme} bg-surface shadow-carte`}>{contenu}</span>
  return (
    <button type="button" onClick={surClic} aria-pressed={actif}
            className={`${forme} ${actif ? 'bg-encre text-fond' : 'bg-surface shadow-carte'}`}>
      {contenu}
    </button>
  )
}
