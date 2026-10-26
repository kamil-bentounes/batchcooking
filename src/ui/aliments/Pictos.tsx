/**
 * Les pictos de « Nos aliments » : le pot (couvercle safran, de la maquette), et d'où viennent les chiffres.
 * Des dessins inline qui prennent la couleur du texte : ils ne chargent rien et ne clignotent pas.
 */
import { MOT_DE_LA_SOURCE } from '../../lib/aliments/brouillon.ts'
import type { Source } from '../../lib/aliments/brouillon.ts'

/** Le pot : un couvercle safran sur un pot clair, comme la maquette `Aliment.dc.html`. */
export function Pot({ largeur = 30 }: { largeur?: number }) {
  const hauteur = Math.round(largeur * 34 / 30)
  return (
    <span aria-hidden="true" className="relative block shrink-0" style={{ width: largeur, height: hauteur }}>
      <span className="absolute inset-x-0 top-0 block rounded-[3px] bg-safran" style={{ height: hauteur * 7 / 34 }} />
      <span className="absolute block rounded-b-[8px] rounded-t-[2px] bg-surface"
            style={{ left: 2, right: 2, top: hauteur * 6 / 34, bottom: 0, border: '1.5px solid #B7C3BA' }} />
    </span>
  )
}

const TRAIT = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** L'appareil photo : l'étiquette. */
export function Appareil({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" {...TRAIT}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.3-2h6l1.3 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  )
}

/** Le code-barres. */
export function CodeBarres({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" {...TRAIT}>
      <path d="M4 5v14M7.5 5v14M11 5v14M14 5v14M17.5 5v14M20 5v14" />
    </svg>
  )
}

/** Le crayon : tapé à la main. */
export function Crayon({ taille = 18 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" aria-hidden="true" {...TRAIT}>
      <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 2.8 0l.2.2a2 2 0 0 1 0 2.8L8 19z" />
      <path d="M14.5 6.5l3 3" />
    </svg>
  )
}

/** D'où viennent les chiffres : le picto ET le mot (la couleur ne dit jamais seule). */
export function Provenance({ source }: { source: Source }) {
  const Icone = source === 'etiquette' ? Appareil : source === 'code_barres' ? CodeBarres : Crayon
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-doux">
      <Icone taille={14} />{MOT_DE_LA_SOURCE[source]}
    </span>
  )
}

/** Le retour : une chevron vers la gauche. */
export function Chevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8 10 12.5" /></svg>
  )
}
