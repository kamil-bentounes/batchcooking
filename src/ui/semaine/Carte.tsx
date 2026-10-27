/**
 * Un repas du jour choisi : la carte (maquette `Semaine.dc.html`).
 *
 * La photo du plat, ou une pastille ; son nom ; pour qui, et d'où il vient ; « Changer » ; aujourd'hui,
 * « Je l'ai mangé » ; et, pour un plat congelé, le bandeau bleu qui dit quand le sortir. Un repas encore à choisir
 * est une carte vide : « + Choisir le midi ».
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { PlatImage } from '../frigo/PlatImage.tsx'
import { fondDuPlat } from '../../lib/frigo.ts'
import {
  detailDeLaPart, ligneDeLaCarte, nomDeLaCarte, peremptionDeLaCarte, phraseDuBandeau, texteDeLaCarteVide,
} from '../../lib/choix.ts'
import type { Carte, Membre, RepasChoisi } from '../../lib/choix.ts'
import { MOT_DU_REPAS } from '../../lib/choix.ts'
import { puceDuMange } from '../../lib/annuler-mange.ts'
import { BandeauNote, LienAnnuler, PuceMange } from './AnnulerLeMange.tsx'

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
  carte, membres, moi, photo, jour, repas, maintenant, rappelActif, surChange, surMange, enCours, enPlus, passe = false, mange,
}: {
  carte: Carte
  membres: Membre[]
  /** Moi : la part dont la carte dit le poids est la mienne. */
  moi: string
  photo: string | null
  jour: string
  repas: RepasChoisi
  maintenant: Date
  rappelActif: boolean
  surChange: () => void
  /** « Je l'ai mangé » : `undefined` quand il n'y a rien à cocher (pas ma carte, déjà mangé, jour à venir, « sauté »). */
  surMange: (() => void) | undefined
  enCours: boolean
  /** Ce que j'ai mangé en plus de ce plat. */
  enPlus: ReactNode
  /** Un jour passé : un repas pas marqué mangé dit « pas encore noté ». */
  passe?: boolean
  /**
   * MA case est « mangé » (annuler « Je l'ai mangé », 0129) : la puce « Mangé à 12 h 40 », puis, 6 secondes, le bandeau
   * « Noté : mangé. » (`notee`), ensuite le lien « Pas mangé ? Annuler ». `surAnnule` remet MA case à « prévu ».
   * `undefined` : pas ma case, ou pas mangée.
   */
  mange?: { eatenAt: string | null; notee: boolean; surFerme: () => void; surAnnule: () => void; enCours: boolean }
}) {
  const c = carte.contenu
  /* Une fois annulé, le bouton « Je l'ai mangé » revient : le focus y retourne (celui de « Oui, remettre » a disparu). */
  const boutonMange = useRef<HTMLButtonElement>(null)
  const etaitMange = useRef(false)
  useEffect(() => {
    if (etaitMange.current && !mange && (!document.activeElement || document.activeElement === document.body)) {
      boutonMange.current?.focus()
    }
    etaitMange.current = !!mange
  }, [mange])
  const tousMange = carte.mangePar.length === carte.cases.length
  const bandeau = c.genre === 'plat' && c.lieu === 'congelateur' && !tousMange
    ? phraseDuBandeau({
      jour, repas, label: c.label, n: carte.cases.filter(x => x.state !== 'mange').length, rappelActif, maintenant,
    })
    : ''
  const detail = detailDeLaPart(carte, membres, moi)
  const peremption = peremptionDeLaCarte(carte, jour, repas, maintenant)
  return (
    <div data-carte={carte.cle} aria-label={`${MOT_DU_REPAS[repas].titre} : ${nomDeLaCarte(carte)}`} role="group"
         className="flex flex-col gap-2.5 rounded-[20px] bg-surface p-3.5"
         style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
      {/* À 320 px, « Changer » passe sur sa propre ligne (maquette) : le nom du plat garde toute la largeur. */}
      <div className="flex items-center gap-3 max-[360px]:flex-wrap">
        <Pastille carte={carte} photo={photo} />
        <div className="min-w-0 flex-1 max-[360px]:basis-[calc(100%-68px)]">
          <div className="text-[15px] font-semibold leading-[1.25] [overflow-wrap:anywhere]">{nomDeLaCarte(carte)}</div>
          <div className="mt-[3px] text-[13px] text-doux">{ligneDeLaCarte(carte, membres, passe)}</div>
          {detail && <div data-detail="" className="mt-0.5 text-[12px] text-doux">{detail}</div>}
          {peremption && (
            <div data-peremption="" className="mt-0.5 text-[12px] font-semibold" style={{ color: peremption.encre }}>
              {peremption.texte}
            </div>
          )}
          {mange && <div className="mt-2"><PuceMange texte={mange.notee ? 'Mangé' : puceDuMange(mange.eatenAt, jour)} /></div>}
        </div>
        {!tousMange && (
          <button type="button" onClick={surChange} data-ouvre={carte.cle}
                  aria-label={`Changer le ${MOT_DU_REPAS[repas].minuscule}`}
                  className="min-h-11 shrink-0 rounded-xl bg-piste px-3.5 text-[14px] font-semibold max-[360px]:w-full">
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
      {mange && (mange.notee
        ? <BandeauNote surAnnule={mange.surAnnule} surFerme={mange.surFerme} enCours={mange.enCours} />
        : <LienAnnuler avecBarquette={c.genre === 'plat'} surConfirme={mange.surAnnule} enCours={mange.enCours}
                       nom={`${MOT_DU_REPAS[repas].titre} : ${nomDeLaCarte(carte)}`} />)}
      {surMange && (
        <button type="button" ref={boutonMange} onClick={surMange} disabled={enCours}
                className="min-h-11 rounded-xl bg-herbe px-4 text-[15px] font-semibold text-fond disabled:opacity-60">
          Je l’ai mangé
        </button>
      )}
      {enPlus}
    </div>
  )
}

/**
 * « + Choisir le midi » : la carte vide, en pointillés. Un jour passé : « + Noter ce que j'ai mangé ce midi ». `pour` : les
 * personnes sans choix quand une autre carte existe déjà.
 */
export function CarteVide({ repas, pour, passe = false, surOuvre }: {
  repas: RepasChoisi; pour?: { ids: string[]; membres: Membre[]; moi: string }; passe?: boolean; surOuvre: () => void
}) {
  return (
    <button type="button" onClick={surOuvre} data-ouvre="vide"
            className="flex min-h-[72px] w-full items-center justify-center gap-2 rounded-[20px] border-[1.5px] border-dashed
                       border-[#9FB0A4] bg-transparent px-3 text-center text-[15px] font-semibold text-herbe">
      {texteDeLaCarteVide(repas, passe, pour)}
    </button>
  )
}
