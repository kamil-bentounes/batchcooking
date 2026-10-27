/**
 * Le repas du jour, en carte sombre : le plat, pour qui, et — s'il dort au congélateur — ce qu'il faut faire.
 *
 * Deux maisons : l'accueil de la cuisine (la carte compacte) et le hub (`grand`, la maquette « ma journée » : une
 * photo plus large, le nom plus gros, et une note sur les parts et leur péremption quand les données la permettent).
 */
import type { ReactNode } from 'react'
import { NOM_REPAS } from '../../lib/donnees/barquettes.ts'
import type { Case } from '../../lib/donnees/barquettes.ts'
import { nomCourt } from '../../lib/frigo.ts'
import type { Note } from '../../lib/hub.ts'
import { Appareil, PlatImage } from './PlatImage.tsx'

/** Les mesures de la carte : celles de l'accueil de la cuisine, ou celles du hub (téléphone, puis bureau dès 900 px). */
const MESURES = {
  compacte: {
    carte: 'rounded-3xl p-4',
    photo: 'size-[72px] rounded-2xl',
    rangee: 'gap-3.5',
    quand: 'text-[13px]',
    nom: 'mt-[3px] text-[22px] leading-[1.15]',
    note: 'mt-3.5 rounded-[14px] px-3 py-2.5 text-[14px] leading-[1.4]',
    gestes: 'mt-3.5 gap-2.5',
    bouton: 'h-[50px] rounded-[15px] text-[15px]',
  },
  grande: {
    carte: 'grid gap-3 rounded-[24px] p-3.5 min-[900px]:gap-4 min-[900px]:rounded-[28px] min-[900px]:p-[18px]',
    photo: 'size-[84px] rounded-[18px] max-[360px]:size-[72px] min-[900px]:size-[150px] min-[900px]:rounded-[22px]',
    rangee: 'gap-3.5 min-[900px]:gap-4',
    quand: 'text-[13.5px] min-[900px]:text-[14.5px]',
    nom: 'mt-0.5 text-[21px] leading-[1.12] max-[360px]:text-[19px] min-[900px]:mt-1 min-[900px]:text-[30px]',
    note: 'rounded-[14px] px-3 py-[9px] text-[14px] leading-[1.4] min-[900px]:rounded-2xl min-[900px]:px-3.5 min-[900px]:py-3 min-[900px]:text-[15px]',
    gestes: 'gap-2.5',
    bouton: 'h-12 rounded-[14px] text-[15.5px] min-[900px]:h-[52px] min-[900px]:rounded-2xl min-[900px]:text-base',
  },
}

export function CeSoir({
  cas, photo, pour, enCours, nbASortir, surMange, surSort, surChange, titreDePage,
  grand = false, nom, quand, note, entete, erreur,
}: {
  cas: Case; photo: string | null; pour: string; enCours: boolean
  /** Vrai quand la carte est le geste de la page : son titre en est alors le `<h1>` (il n'y en a qu'un). */
  titreDePage: boolean
  /** Combien de barquettes « Je les sors » sort : le texte et le bouton s'accordent avec ce nombre. */
  nbASortir: number
  surMange: () => void; surSort: () => void; surChange: () => void
  /** La carte du hub : plus large, sans marge (la grille du hub espace ses cartes). */
  grand?: boolean
  /** Le nom du plat tel qu'on le montre ; par défaut le nom court de l'accueil. */
  nom?: string
  /** « Ce midi et ce soir » quand le plat tient plusieurs repas ; par défaut le repas de la case. */
  quand?: string
  /** Ce que le frigo sait du plat (parts, péremption) : affiché sous le nom, quand le plat n'est pas au congélateur. */
  note?: Note | null
  /** Ce qui se pose tout en haut de la carte (la porte vers la cuisine, sur le hub). */
  entete?: ReactNode
  /** Le refus d'un geste (« Je l'ai mangé » raté), dit dans la carte. */
  erreur?: ReactNode
}) {
  const m = grand ? MESURES.grande : MESURES.compacte
  const p = cas.portion!
  const auFroid = p.location === 'congelateur'
  const meal = cas.meal as keyof typeof NOM_REPAS
  const Titre = titreDePage ? 'h1' : 'h2'
  const moment = quand
    ?? (meal === 'diner' ? 'Ce soir' : meal === 'dejeuner' ? 'Ce midi' : `Ce ${NOM_REPAS[meal].toLowerCase()}`)
  return (
    <section aria-label="Le prochain repas" data-carte="repas"
             className={`sur-encre bg-encre text-fond ${m.carte} ${grand ? '' : titreDePage ? 'mt-[18px]' : 'mt-10'}`}>
      {entete}
      <div className={`flex items-center ${m.rangee}`}>
        <div className={`relative shrink-0 overflow-hidden bg-[#3A4A41] text-[#B9C7BD] ${m.photo}`}>
          {photo ? <PlatImage url={photo} texte={false} /> : <span className="absolute inset-0 grid place-items-center"><Appareil taille={26} /></span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${m.quand} text-[#B9C7BD]`}>{moment}, pour {pour}</p>
          <Titre className={`titre font-semibold [overflow-wrap:anywhere] ${m.nom}`}>{nom ?? nomCourt(p.label)}</Titre>
        </div>
      </div>
      {auFroid ? (
        <p className={`${m.note} text-[#E3EEF3]`} style={{ background: 'rgba(220, 232, 238, 0.14)' }}>
          Il est au congélateur : sors-{nbASortir > 1 ? 'les' : 'le'} maintenant, ou micro-ondes avant de manger.
        </p>
      ) : note && (
        <p data-note="plat" className={`${m.note} bg-white/[.08] text-fond/90`}>
          {note.debut}{note.fort && <b className="font-semibold text-safran">{note.fort}</b>}{note.fin}
        </p>
      )}
      <div className={`flex ${m.gestes}`}>
        {auFroid ? (
          <button type="button" onClick={surSort} disabled={enCours}
                  className={`${m.bouton} flex-1 bg-safran font-bold text-encre disabled:opacity-60`}>
            {nbASortir > 1 ? 'Je les sors' : 'Je le sors'}
          </button>
        ) : (
          <button type="button" onClick={surMange} disabled={enCours}
                  className={`${m.bouton} flex-1 bg-safran font-bold text-encre disabled:opacity-60`}>
            Je l’ai mangé
          </button>
        )}
        <button type="button" onClick={surChange}
                className={`${m.bouton} flex-1 font-semibold text-fond`}
                style={{ background: 'rgba(242, 244, 239, 0.12)' }}>
          Changer
        </button>
      </div>
      {erreur}
    </section>
  )
}
