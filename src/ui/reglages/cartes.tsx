/**
 * Les cartes de « Réglages » et de « Mes objectifs » (refonte du 26/10/2026, d'après la maquette validée).
 *
 * Une carte par sujet : un picto dans une pastille teintée, un titre en Fraunces, une phrase d'explication en texte
 * doux, puis le geste. Rien n'est inventé ici : ce sont les mêmes jetons et les mêmes surfaces que le bilan et la
 * liste de courses (`rounded-[26px] bg-surface shadow-carte`).
 */
import { useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'

/* Les teintes sont des chaînes LITTÉRALES : Tailwind ne lit pas les noms de classe qu'on assemble. */
const TEINTES = {
  piste: 'bg-piste text-encre',
  frais: 'bg-frais-fond text-frais-encre',
  sable: 'bg-sable text-ocre',
  congel: 'bg-congel-fond text-congel-encre',
} as const
export type Teinte = keyof typeof TEINTES

export function Picto({ teinte = 'piste', children }: { teinte?: Teinte; children: ReactNode }) {
  return (
    <span aria-hidden="true"
          className={`w-10 h-10 shrink-0 rounded-[14px] grid place-items-center ${TEINTES[teinte]}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
           strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </span>
  )
}

/** Une carte : une ou plusieurs rubriques, séparées par un filet. */
export function Carte({ id, children, label }: { id?: string; children: ReactNode; label?: string }) {
  return (
    <section id={id} aria-label={label}
             className="mb-4 rounded-[26px] bg-surface shadow-carte overflow-hidden divide-y divide-brume">
      {children}
    </section>
  )
}

/** Un sujet : son picto, son titre (`h2`), sa phrase, puis ce qu'on y fait. */
export function Rubrique({ titre, picto, texte, children }:
  { titre: string; picto: ReactNode; texte?: ReactNode; children?: ReactNode }) {
  return (
    <div className="px-[18px] pt-[18px] pb-[18px]">
      <div className="flex items-center gap-3">
        {picto}
        <h2 className="titre text-[21px] font-semibold">{titre}</h2>
      </div>
      {texte && (
        /* Sous le titre quand l'écran est large ; sous la pastille à 320 px, où 70 px de retrait ne laisseraient
           que 190 px au texte. */
        <p className="mt-2 text-[14px] leading-[1.4] text-doux min-[360px]:pl-[52px]">{texte}</p>
      )}
      {children && <div className="mt-3.5">{children}</div>}
    </div>
  )
}

type BoutonCarteProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onDrag' | 'onDragStart' | 'onDragEnd'> & {
  variante?: 'plein' | 'calme' | 'contour' | 'danger'
  /** `true` : le bouton ne prend que sa largeur (il partage une rangée avec un champ). */
  court?: boolean
}

/** Les boutons de la maquette : 48 px, `plein` herbe, `calme` piste, `contour` filet brume. */
export function BoutonCarte({ variante = 'calme', court, className = '', ...rest }: BoutonCarteProps) {
  const style = {
    plein: 'bg-herbe text-white hover:bg-encre',
    calme: 'bg-piste text-encre hover:bg-brume',
    contour: 'bg-surface text-encre ring-[1.5px] ring-inset ring-brume hover:bg-brume/40',
    danger: 'text-groseille hover:bg-groseille/10',
  }[variante]
  return (
    <button type="button" {...rest}
            className={`min-h-12 rounded-2xl px-3.5 min-[360px]:px-5 text-[15.5px] font-semibold transition-colors
                        disabled:cursor-not-allowed disabled:bg-piste disabled:text-doux
                        ${court ? 'shrink-0' : 'w-full'} ${style} ${className}`} />
  )
}

type SaisieProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
  /** Le libellé visible, au-dessus du champ. Sans lui, `aria-label` est obligatoire. */
  label?: string
  picto?: ReactNode
  /** « € » : l'unité se lit à droite, et le nombre est en Fraunces comme les autres chiffres de l'app. */
  unite?: string
}

/** Le champ de la maquette : 56 px, fond `fond`, filet brume ; l'anneau de focus est celui du cadre. */
export function Saisie({ label, picto, unite, id, ...rest }: SaisieProps) {
  const auto = useId()
  const ident = id ?? auto
  const nombre = unite !== undefined
  return (
    <div className="min-w-0 flex-1">
      {label && <label htmlFor={ident} className="mb-1.5 block text-[13.5px] text-doux">{label}</label>}
      <div className="flex h-14 items-center gap-2.5 rounded-[18px] bg-fond px-4
                      ring-[1.5px] ring-inset ring-brume focus-within:ring-2 focus-within:ring-herbe">
        {picto && <span aria-hidden="true" className="shrink-0 text-doux">{picto}</span>}
        <input id={ident} {...rest}
               className={`champ-montant min-w-0 flex-1 bg-transparent outline-none placeholder:text-doux
                           ${nombre ? 'chiffre text-[26px] font-semibold' : 'text-[16px]'}`} />
        {unite && <span aria-hidden="true" className="text-[16px] text-doux">{unite}</span>}
      </div>
    </div>
  )
}

/** Une ligne à chevron, pour les gestes rares : on l'effleure, elle agit ou ouvre un écran. */
export function Ligne({ picto, texte, chevron = true, ...rest }:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { picto: ReactNode; texte: string; chevron?: boolean }) {
  return (
    <button type="button" {...rest}
            className="flex min-h-[60px] w-full items-center gap-3.5 px-[18px] py-2 text-left text-[16px] font-semibold
                       transition-colors hover:bg-brume/40 disabled:cursor-not-allowed disabled:text-doux">
      {picto}
      <span className="grow">{texte}</span>
      {chevron && (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-doux">
          <path d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  )
}
