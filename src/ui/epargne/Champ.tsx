/**
 * Les champs de l'épargne, au dessin de la maquette : étiquette en gras au-dessus, cadre de 1,5 px, 48 px de haut.
 * Un champ de montant porte son « € » à côté, en Fraunces ; sa saisie est un texte à clavier décimal.
 */
import { useId, type InputHTMLAttributes, type ReactNode } from 'react'

const CADRE = `min-h-12 w-full min-w-0 rounded-[14px] border-[1.5px] border-brume bg-surface px-3.5
               text-[16px] text-encre placeholder:text-doux
               champ-montant focus:border-herbe focus:shadow-[0_0_0_1px_var(--color-herbe)]`

export function ChampTexte({ label, petit, ...p }: {
  label: string; petit?: string
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="grid gap-1.5 min-w-0">
      <label htmlFor={id} className="text-[14px] font-semibold">
        {label}{petit && <small className="ml-1 font-normal text-doux">{petit}</small>}
      </label>
      <input id={id} {...p} className={CADRE} />
    </div>
  )
}

/** Un montant : la saisie en Fraunces, et son « € ». `etiquette` remplace le nom lu quand le libellé visible est court. */
export function ChampMontant({ label, grand = false, etiquette, unite = true, ...p }: {
  label: ReactNode; grand?: boolean; etiquette?: string; unite?: boolean
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'>) {
  const id = useId()
  return (
    <div className="grid gap-1.5 min-w-0">
      <label htmlFor={id} className="text-[14px] font-semibold">{label}</label>
      <span className="flex items-center gap-2.5">
        <input id={id} type="text" inputMode="decimal" autoComplete="off" aria-label={etiquette} {...p}
               className={`${CADRE} titre max-w-[220px] font-semibold
                           ${grand ? 'min-h-14 text-[26px] px-4 rounded-[16px]' : 'text-[20px]'}`} />
        {unite && <span aria-hidden="true" className="titre text-[22px] font-semibold text-doux">€</span>}
      </span>
    </div>
  )
}
