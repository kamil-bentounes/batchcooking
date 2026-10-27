/**
 * Les sept jours, en bandeau : le jour, son numéro, et deux points (midi, soir).
 *
 * Vert : du frigo. Bleu : du congélateur. Safran : autre chose. Creux : rien. Le point se lit aussi avec des mots
 * (le nom accessible du jour dit « midi : du frigo, soir : rien ») : la couleur ne porte pas l'information seule.
 * Le bandeau défile de lui-même quand l'écran est trop étroit pour sept boutons de 44 px.
 */
import { useEffect, useRef } from 'react'
import type { JourDuBandeau, PointDuJour } from '../../lib/choix.ts'

const MOT_DU_POINT: Record<PointDuJour, string> = {
  frigo: 'du frigo', congelateur: 'du congélateur', autre: 'autre chose', vide: 'rien de choisi',
}
const COULEUR: Record<PointDuJour, string> = {
  frigo: '#2F5D45', congelateur: '#3E6A84', autre: '#E8A33D', vide: 'transparent',
}

/* Sur le fond encre du jour choisi, le vert et le bleu du fond clair disparaissent (1,9:1 et 2,5:1) :
   on prend leurs frères clairs, qui passent 3:1 avec une grande marge (6,7:1 et 6,6:1). */
const COULEUR_SUR_ENCRE: Record<PointDuJour, string> = {
  frigo: '#6FBF94', congelateur: '#7DB4D2', autre: '#E8A33D', vide: 'transparent',
}

function Point({ genre, choisi }: { genre: PointDuJour; choisi: boolean }) {
  const creux = genre === 'vide'
  const couleur = (choisi ? COULEUR_SUR_ENCRE : COULEUR)[genre]
  return (
    <span data-point={genre} className="size-[7px] rounded-full"
          style={{ background: couleur, boxShadow: `inset 0 0 0 1.2px ${creux ? (choisi ? '#8DA095' : '#9FB0A4') : couleur}` }} />
  )
}

export function Bandeau({ jours, points, index, surChoix }: {
  jours: JourDuBandeau[]
  /** Pour chaque jour : le point de midi et celui du soir. */
  points: [PointDuJour, PointDuJour][]
  index: number
  surChoix: (i: number) => void
}) {
  const actif = useRef<HTMLButtonElement>(null)
  /* Le jour choisi reste visible quand le bandeau défile (un lien `?jour=` peut en désigner un hors de l'écran). */
  useEffect(() => { actif.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' }) }, [index])
  return (
    <div role="group" aria-label="Choisir le jour" data-bandeau="jours"
         className="-mx-6 mt-5 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max min-w-full gap-1">
        {jours.map((j, i) => {
          const choisi = i === index
          const [midi, soir] = points[i]
          return (
            <button key={j.jour} ref={choisi ? actif : undefined} type="button" onClick={() => surChoix(i)}
                    aria-pressed={choisi} data-jour={j.jour}
                    aria-label={`${j.long}, midi : ${MOT_DU_POINT[midi]}, soir : ${MOT_DU_POINT[soir]}`}
                    className={`flex h-[76px] min-w-11 flex-1 flex-col items-center justify-center gap-[3px] rounded-2xl transition-colors
                                ${choisi ? 'bg-encre text-fond' : 'bg-surface text-encre'}`}
                    style={choisi ? undefined : { boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
              <span aria-hidden="true" className="text-[12px] opacity-80">{j.court}</span>
              <span aria-hidden="true" className="chiffre text-[20px] font-semibold leading-none">{j.num}</span>
              <span aria-hidden="true" className="mt-[3px] flex gap-[3px]">
                <Point genre={midi} choisi={choisi} />
                <Point genre={soir} choisi={choisi} />
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
