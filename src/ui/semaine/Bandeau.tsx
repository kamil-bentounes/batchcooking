/**
 * Le bandeau des jours : sept jours passés, aujourd'hui et les six suivants. Le jour, son numéro, et deux points (midi, soir).
 *
 * Vert : du frigo. Bleu : du congélateur. Safran : autre chose. Creux : rien de choisi — ou, sur un jour passé, un repas
 * pas noté. Le point se lit aussi avec des mots (le nom accessible du jour dit « midi : du frigo, soir : rien ») : la
 * couleur ne porte pas l'information seule. Un jour passé se dessine en pointillé, son numéro en texte doux, et « hier »
 * remplace l'abréviation d'hier. Le bandeau s'ouvre sur le jour choisi et défile de lui-même : quatorze boutons de 44 px
 * ne tiennent sur aucun écran.
 */
import { useEffect, useRef, useState } from 'react'
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
  const piste = useRef<HTMLDivElement>(null)
  const premier = useRef(true)
  /* « ‹ » : il y a des jours plus anciens à gauche, hors de l'écran. */
  const [aGauche, setAGauche] = useState(false)
  /* À l'ouverture, le jour choisi se pose au milieu (hier reste visible à sa gauche) ; ensuite il reste simplement
     visible quand on le choisit ou qu'un lien `?jour=` en désigne un hors de l'écran. */
  useEffect(() => {
    actif.current?.scrollIntoView?.({ inline: premier.current ? 'center' : 'nearest', block: 'nearest' })
    premier.current = false
    const p = piste.current
    if (p) setAGauche(p.scrollLeft > 8)
  }, [index])
  return (
    /* Le « ‹ » a sa propre gouttière, à gauche : il ne passe jamais sur une puce. Le bandeau défile à droite de lui, et
       sort de l'écran à droite. */
    <div className="mt-5 flex items-center">
      <span aria-hidden="true" data-plus-ancien={aGauche ? '' : undefined}
            className="w-5 shrink-0 select-none text-center text-[22px] leading-none text-doux">{aGauche ? '‹' : ''}</span>
      <div ref={piste} role="group" aria-label="Choisir le jour" data-bandeau="jours"
           onScroll={ev => setAGauche(ev.currentTarget.scrollLeft > 8)}
           className="-mr-6 min-w-0 flex-1 overflow-x-auto pb-1 pr-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex w-max min-w-full gap-1">
        {jours.map((j, i) => {
          const choisi = i === index
          const [midi, soir] = points[i]
          return (
            <button key={j.jour} ref={choisi ? actif : undefined} type="button" onClick={() => surChoix(i)}
                    aria-pressed={choisi} data-jour={j.jour} data-passe={j.passe ? '' : undefined}
                    aria-label={`${j.long}${j.hier ? ', hier' : j.passe ? ', jour passé' : ''}, midi : ${MOT_DU_POINT[midi]}, soir : ${MOT_DU_POINT[soir]}`}
                    className={`flex h-[76px] min-w-11 flex-1 flex-col items-center justify-center gap-[3px] rounded-2xl transition-colors
                                ${choisi ? 'bg-encre text-fond' : j.passe ? 'bg-transparent text-doux' : 'bg-surface text-encre'}`}
                    style={choisi ? undefined
                      : j.passe ? { border: '1.5px dashed #9FB0A4' }
                        : { boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
              <span aria-hidden="true" className={`text-[12px] ${j.passe && !choisi ? '' : 'opacity-80'}`}>{j.court}</span>
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
    </div>
  )
}
