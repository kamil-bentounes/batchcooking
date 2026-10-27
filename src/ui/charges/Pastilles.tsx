/** Les pastilles d'une ligne : qui participe (l'initiale, jamais la couleur seule), et « sans compte ». */
import { initialeDe } from '../../lib/donnees/foyer.ts'
import { Alerte } from './icones.tsx'

type Membre = { id: string; display_name: string }

/* Le premier membre en herbe, le deuxième en safran (l'encre dessus : 6,8:1), les suivants en brume. */
const STYLE = [
  'bg-herbe text-fond', 'bg-safran text-encre', 'bg-brume text-encre',
]

export function Avatars({ ids, membres, taille = 24 }: { ids: string[]; membres: Membre[]; taille?: number }) {
  if (ids.length === 0) return null
  return (
    /* Les noms sont écrits dans le sous-titre de la ligne : les pastilles n'ajoutent rien à une synthèse vocale. */
    <span aria-hidden="true" className="flex">
      {ids.map((id, i) => {
        const rang = Math.max(membres.findIndex(m => m.id === id), 0)
        const nom = membres.find(m => m.id === id)?.display_name
        return (
          <span key={id} style={{ width: taille, height: taille, fontSize: taille * 0.46 }}
                className={`grid place-items-center rounded-full font-bold shrink-0
                            ${STYLE[Math.min(rang, STYLE.length - 1)]}
                            ${i > 0 ? '-ml-1.5 shadow-[0_0_0_2px_var(--color-surface)]' : ''}`}>
            {initialeDe(nom)}
          </span>
        )
      })}
    </span>
  )
}

export function SansCompte() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-sable px-2.5 py-0.5 text-[12.5px]
                     font-semibold text-ocre">
      <Alerte />sans compte
    </span>
  )
}
