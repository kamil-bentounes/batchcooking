/**
 * Les barquettes de la période : mangées, au frais, et — seulement s'il y en a — jetées.
 *
 * Trois chiffres posés sur leur fond, comme le frigo : le vert pour ce qui est mangé, le bleu pour ce qui attend,
 * le sable et l'ocre pour ce qui s'est perdu. Le mot dit la même chose que la couleur.
 */
import type { ReactNode } from 'react'

function Tuile({ fond, encre, picto, valeur, mot }: {
  fond: string; encre: string; picto: ReactNode; valeur: number; mot: string
}) {
  return (
    <div className={`rounded-[26px] p-4 ${fond} ${encre}`}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{picto}</svg>
      <p className="chiffre mt-2.5 text-[48px] font-semibold leading-[0.95]">{valeur}</p>
      <p className="mt-1 text-[14px] font-semibold">{mot}</p>
    </div>
  )
}

export function Barquettes({ mangees, restantes, jetees }: { mangees: number; restantes: number; jetees: number }) {
  return (
    <section className="grid grid-cols-2 gap-3" aria-label="Barquettes">
      <Tuile fond="bg-frais-fond" encre="text-frais-encre" valeur={mangees} mot={`mangée${mangees > 1 ? 's' : ''}`}
             picto={<path d="M5 12.5l4.5 4.5L19 7.5" />} />
      <Tuile fond="bg-congel-fond" encre="text-congel-encre" valeur={restantes} mot="au frais"
             picto={<><rect x="4" y="2.5" width="16" height="19" rx="2.5" /><path d="M12 2.5v19M10 8v4M14 8v4" /></>} />
      {jetees > 0 && (
        <div className="col-span-2 flex items-center gap-3.5 rounded-[26px] bg-sable px-4 py-3 text-ocre">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
          </svg>
          <p className="chiffre text-[34px] font-semibold leading-none">{jetees}</p>
          <p className="text-[14px] font-semibold">{jetees > 1 ? 'jetées' : 'jetée'}</p>
        </div>
      )}
    </section>
  )
}
