/** Les pictos de l'écran des charges, en SVG inline : ils prennent la couleur du texte, et le texte les dit toujours. */
import type { ReactNode } from 'react'

const Picto = ({ children, taille = 20, trait = 1.7 }: { children: ReactNode; taille?: number; trait?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth={trait} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
)

export const Lien = () => <Picto><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Picto>
export const Crayon = () => <Picto><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></Picto>
export const Personnes = () => <Picto><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.5 0 4.5 2 4.5 5" /></Picto>
export const Corbeille = () => <Picto><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></Picto>
export const Ampoule = () => <Picto><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></Picto>
export const Micro = ({ taille = 20 }: { taille?: number }) =>
  <Picto taille={taille}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></Picto>
export const Loupe = () => <Picto><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></Picto>
export const Plus = () => <Picto><path d="M12 5v14M5 12h14" /></Picto>
export const Coche = () => <Picto taille={18} trait={2}><path d="M5 12.5l4.5 4.5L19 7.5" /></Picto>
export const Alerte = () => <Picto taille={14}><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></Picto>
export const Document = () => <Picto><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4M9 12h6M9 16h6" /></Picto>
export const Chevron = ({ ouvert }: { ouvert: boolean }) =>
  <Picto><path d={ouvert ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} /></Picto>
