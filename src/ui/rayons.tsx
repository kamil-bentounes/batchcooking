/**
 * Un picto par rayon de magasin (maquette `magasin.html`, 26/10/2026).
 *
 * Les rayons de la base s'écrivent de plusieurs façons (« Boucherie » ou « Boucherie, poissonnerie »,
 * « Épicerie » ou « Épicerie salée ») : on les reconnaît à leur début, et tout ce qui est inconnu
 * prend le sac de « Autre ». Le dessin ne porte jamais seul l'information, le nom du rayon est écrit
 * à côté.
 */
import type { ReactNode } from 'react'

type Dessin = { tuile: string; dessin: ReactNode }

const FEUILLE = <><path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14" /><path d="M5 19c3-4 6-6 9-8" /></>
const VIANDE = <><path d="M6 14c0-4 3-8 8-8 3 0 5 2 5 4.5 0 4-3.5 7.5-8 7.5-3 0-5-1.5-5-4z" /><circle cx="14" cy="10.5" r="1.8" /></>
const BOUTEILLE = <><path d="M10 3h4v3l1.5 2.5V20a1 1 0 0 1-1 1h-5a1 1 0 0 1-1-1V8.5L10 6z" /><path d="M8.5 13h7" /></>
const FLOCON = <><path d="M12 3v18" /><path d="M4.2 7.5l15.6 9" /><path d="M19.8 7.5l-15.6 9" /><path d="M9.5 4.8 12 7l2.5-2.2" /><path d="M9.5 19.2 12 17l2.5 2.2" /></>
const BOCAL = <><path d="M7 8h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" /><path d="M6 8V5.5h12V8" /></>
const GATEAU = <><path d="M5 12h14v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" /><path d="M5 12c0-2 1.5-3 3.5-3h7c2 0 3.5 1 3.5 3" /><path d="M12 9V5.5" /></>
const VERRE = <><path d="M7 4h10l-1.2 15a1.5 1.5 0 0 1-1.5 1.4H9.7a1.5 1.5 0 0 1-1.5-1.4z" /><path d="M7.6 10h8.8" /></>
const SPRAY = <><path d="M9 11h6v9a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z" /><path d="M10 11V8h4v3" /><path d="M14 6h3M14 4h3" /></>
const GOUTTE = <path d="M12 3.5c3 4 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9 7.5 12 3.5z" />
const SAC = <><path d="M5.5 8h13l-1 12h-11z" /><path d="M9 8V6.5a3 3 0 0 1 6 0V8" /></>

const RAYONS: [RegExp, Dessin][] = [
  [/^fruits/i, { tuile: 'bg-frais-fond text-frais-encre', dessin: FEUILLE }],
  [/^boucherie|^poisson/i, { tuile: 'bg-sable text-ocre', dessin: VIANDE }],
  [/^frais/i, { tuile: 'bg-congel-fond text-congel-encre', dessin: BOUTEILLE }],
  [/^surgel/i, { tuile: 'bg-congel-fond text-congel-encre', dessin: FLOCON }],
  [/^épicerie sucrée/i, { tuile: 'bg-sable text-ocre', dessin: GATEAU }],
  [/^épicerie/i, { tuile: 'bg-piste text-doux', dessin: BOCAL }],
  [/^boisson/i, { tuile: 'bg-congel-fond text-congel-encre', dessin: VERRE }],
  [/^entretien/i, { tuile: 'bg-piste text-doux', dessin: SPRAY }],
  [/^hygi/i, { tuile: 'bg-piste text-doux', dessin: GOUTTE }],
]
const AUTRE: Dessin = { tuile: 'bg-piste text-doux', dessin: SAC }

export function PictoRayon({ rayon, taille = 22, className = 'size-10 rounded-[14px]' }:
  { rayon: string; taille?: number; className?: string }) {
  const { tuile, dessin } = RAYONS.find(([re]) => re.test(rayon))?.[1] ?? AUTRE
  return (
    <span aria-hidden="true" className={`grid place-items-center shrink-0 ${tuile} ${className}`}>
      <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="block">
        {dessin}
      </svg>
    </span>
  )
}

/** Une icône de trait quelconque dans une tuile : magasin, actions de la liste. */
export function TuileIcone({ children, taille = 20, className = 'size-9 rounded-xl bg-piste text-encre' }:
  { children: ReactNode; taille?: number; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid place-items-center shrink-0 ${className}`}>
      <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="block">
        {children}
      </svg>
    </span>
  )
}

export const DESSINS = {
  magasin: <><path d="M4 9l1.5-4.5h13L20 9M4 9v10.5h16V9M4 9c0 1.7 1.3 2.5 2.7 2.5S9.4 10.7 9.4 9c0 1.7 1.3 2.5 2.6 2.5S14.6 10.7 14.6 9c0 1.7 1.3 2.5 2.7 2.5S20 10.7 20 9" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  liste: <><path d="M9 7h11M9 12h11M9 17h11" /><circle cx="4.7" cy="7" r="1" /><circle cx="4.7" cy="12" r="1" /><circle cx="4.7" cy="17" r="1" /></>,
  etiquette: <><path d="M4 4h8l8 8-8 8-8-8z" /><circle cx="8.5" cy="8.5" r="1.2" /></>,
  appareil: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  coche: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  crayon: <path d="M5 19l1-4L16.5 4.5l3 3L9 18z" />,
  marmite: <><path d="M5 10h14l-1.2 7.5A2.5 2.5 0 0 1 15.3 20H8.7a2.5 2.5 0 0 1-2.5-2.5z" /><path d="M3 11.5h2M19 11.5h2M9 7c0-1 1-1.5 1-2.5M14 7c0-1 1-1.5 1-2.5" /></>,
}
