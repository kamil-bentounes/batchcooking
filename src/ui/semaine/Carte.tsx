/**
 * Un repas du jour choisi : la carte (maquette `Semaine.dc.html`).
 *
 * La photo du plat, ou une pastille ; son nom ; pour qui, et d'où il vient ; « Changer » ; aujourd'hui,
 * « Je l'ai mangé » ; et, pour un plat congelé, le bandeau bleu qui dit quand le sortir. Un repas encore à choisir
 * est une carte vide : « + Choisir le midi ».
 */
import type { ReactNode } from 'react'
import { PlatImage } from '../frigo/PlatImage.tsx'
import { fondDuPlat } from '../../lib/frigo.ts'
import { ligneDeLaCarte, nomDeLaCarte, phraseDuBandeau } from '../../lib/choix.ts'
import type { Carte, Membre, RepasChoisi } from '../../lib/choix.ts'
import { MOT_DU_REPAS } from '../../lib/choix.ts'

/** Le fond d'une pastille sans photo : le plat a sa teinte, le congelé son givre, « autre chose » le sable. */
function fondDeLaPastille(carte: Carte): string {
  const c = carte.contenu
  if (c.genre === 'plat') return c.lieu === 'congelateur' ? 'var(--color-congel-fond)' : fondDuPlat(c.label)
  return c.genre === 'autre' ? 'var(--color-sable)' : 'var(--color-piste)'
}

export function Pastille({ carte, photo }: { carte: Carte; photo: string | null }) {
  const c = carte.contenu
  return (
    <span aria-hidden="true" data-pastille={c.genre}
          className="relative block h-11 w-[52px] shrink-0 overflow-hidden rounded-[10px]"
          style={{ background: fondDeLaPastille(carte), boxShadow: 'inset 0 0 0 1.5px rgba(28, 43, 35, 0.12)' }}>
      {c.genre === 'plat' && <PlatImage url={photo} texte={false} glyphe={18} />}
    </span>
  )
}

export function CarteDuRepas({
  carte, membres, photo, jour, repas, maintenant, rappelActif, surChange, surMange, enCours, enPlus,
}: {
  carte: Carte
  membres: Membre[]
  photo: string | null
  jour: string
  repas: RepasChoisi
  maintenant: Date
  rappelActif: boolean
  surChange: () => void
  /** « Je l'ai mangé » : `undefined` quand il n'y a rien à cocher (pas ma carte, déjà mangé, jour à venir, pas un plat). */
  surMange: (() => void) | undefined
  enCours: boolean
  /** Ce que j'ai mangé en plus de ce plat. */
  enPlus: ReactNode
}) {
  const c = carte.contenu
  const tousMange = carte.mangePar.length === carte.cases.length
  const bandeau = c.genre === 'plat' && c.lieu === 'congelateur' && !tousMange
    ? phraseDuBandeau({
      jour, repas, label: c.label, n: carte.cases.filter(x => x.state !== 'mange').length, rappelActif, maintenant,
    })
    : ''
  return (
    <div data-carte={carte.cle} aria-label={`${MOT_DU_REPAS[repas].titre} : ${nomDeLaCarte(carte)}`} role="group"
         className="flex flex-col gap-2.5 rounded-[20px] bg-surface p-3.5"
         style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
      <div className="flex items-center gap-3">
        <Pastille carte={carte} photo={photo} />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-[1.25] [overflow-wrap:anywhere]">{nomDeLaCarte(carte)}</div>
          <div className="mt-[3px] text-[13px] text-doux">{ligneDeLaCarte(carte, membres)}</div>
        </div>
        {!tousMange && (
          <button type="button" onClick={surChange} data-ouvre=""
                  aria-label={`Changer le ${MOT_DU_REPAS[repas].minuscule}`}
                  className="min-h-11 shrink-0 rounded-xl bg-piste px-3.5 text-[14px] font-semibold">
            Changer
          </button>
        )}
      </div>
      {bandeau && (
        <div data-bandeau="congele" className="flex items-start gap-2.5 rounded-[14px] bg-congel-fond px-3 py-2.5 text-congel-encre">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" className="mt-px shrink-0" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" />
          </svg>
          <span className="text-[13px] leading-[1.4]">{bandeau}</span>
        </div>
      )}
      {surMange && (
        <button type="button" onClick={surMange} disabled={enCours}
                className="min-h-11 rounded-xl bg-herbe px-4 text-[15px] font-semibold text-fond disabled:opacity-60">
          Je l’ai mangé
        </button>
      )}
      {enPlus}
    </div>
  )
}

/** « + Choisir le midi » : la carte vide, en pointillés. `pour` : les prénoms quand une autre carte existe déjà. */
export function CarteVide({ repas, pour, surOuvre }: { repas: RepasChoisi; pour?: string; surOuvre: () => void }) {
  const mot = MOT_DU_REPAS[repas].minuscule
  return (
    <button type="button" onClick={surOuvre} data-ouvre=""
            className="flex min-h-[72px] w-full items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed
                       border-[#9FB0A4] bg-transparent px-3 text-center text-[15px] font-semibold text-herbe">
      + Choisir le {mot}{pour ? ` pour ${pour}` : ''}
    </button>
  )
}
