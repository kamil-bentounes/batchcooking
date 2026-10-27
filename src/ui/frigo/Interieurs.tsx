/**
 * Ce qu'on voit quand une porte est ouverte : l'intérieur du frigo (clair, des tablettes de verre, des plats
 * dans leur bac, les ingrédients rangés par étagère, le bac à légumes) ou celui du congélateur (givré, des
 * paniers de fil, les plats congelés, le tiroir du bas).
 *
 * Il s'ouvre en plein écran, en fondu, quand la porte a fini de pivoter ; « Fermer la porte » fait le chemin
 * inverse. Fermé, il est `inert` et masqué : ni le clavier ni un lecteur d'écran n'y entrent. Ouvert, c'est lui
 * qui est modal : la page derrière (le frigo fermé, la barre du bas) est rendue inerte par `Frigo`, et Échap
 * le ferme de n'importe où (aussi par `Frigo` : il écoute la fenêtre, pas seulement ce qui est dedans).
 */
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Erreur } from '../coque.tsx'
import { CarteCongelee, CartePlat, TuileIngredient } from './Cartes.tsx'
import { VERRE } from './inox.ts'
import {
  ORDRE_DES_ETAGERES, etagereDe, fondDuPlat, soustitreDuCongelo, soustitreDuFrigo,
} from '../../lib/frigo.ts'
import type { Etagere, Groupe, Quand } from '../../lib/frigo.ts'
import type { IngredientRange } from '../../lib/donnees/frigo.ts'

function Interieur({ visible, origine, fond, nom, titre, soustitre, couleurSoustitre, annonce, erreur, surFerme, children }: {
  visible: boolean; origine: string; fond: string; nom: string
  titre: string; soustitre: string; couleurSoustitre: string
  annonce: string | null; erreur?: unknown; surFerme: () => void; children: ReactNode
}) {
  const titreRef = useRef<HTMLHeadingElement>(null)
  /* Le focus entre dans l'intérieur quand il s'ouvre : sans cela il restait sur la porte, DERRIÈRE. */
  useEffect(() => {
    if (!visible) return
    const t = requestAnimationFrame(() => titreRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [visible])
  return (
    <div role="region" aria-label={nom} inert={!visible} data-interieur={visible ? 'ouvert' : 'ferme'}
         className="fixed inset-0 z-30 overflow-y-auto"
         style={{
           background: fond, opacity: visible ? 1 : 0, visibility: visible ? 'visible' : 'hidden',
           transform: visible ? 'scale(1)' : 'scale(0.55)', transformOrigin: origine,
           /* `visibility` bascule tout de suite à l'ouverture (sinon rien n'est focalisable pendant le fondu) et
              attend la fin du fondu pour se masquer. */
           transition: `opacity 0.35s ease, transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), visibility 0s linear ${visible ? '0s' : '0.35s'}`,
         }}>
      <div className="mx-auto w-full max-w-[460px] px-[18px] pb-[30px] pt-[54px]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 ref={titreRef} tabIndex={-1} className="titre text-[32px] font-semibold leading-none">{titre}</h2>
            <p className="mt-1.5 text-[14px]" style={{ color: couleurSoustitre }}>{soustitre}</p>
          </div>
          <button type="button" onClick={surFerme}
                  className="min-h-11 shrink-0 rounded-full bg-encre px-4 text-[14px] font-semibold text-fond">
            Fermer la porte
          </button>
        </div>
        {annonce && (
          <p role="status" className="mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{annonce}</p>
        )}
        <Erreur de={erreur} />
        {children}
      </div>
    </div>
  )
}

export type PlatAffiche = { groupe: Groupe; photo: string | null; quand: Quand }

export function InterieurFrigo({ visible, plats, ingredients, annonce, erreur, attente, surFerme, surPlat, surIngredient, surAjoute, surPhoto }: {
  visible: boolean
  plats: PlatAffiche[]
  ingredients: IngredientRange[]
  annonce: string | null
  erreur?: unknown
  attente: boolean
  surFerme: () => void
  surPlat: (cle: string) => void
  surIngredient: (id: string) => void
  surAjoute: () => void
  surPhoto: () => void
}) {
  const parts = plats.reduce((n, p) => n + p.groupe.parts.length, 0)
  const parEtagere = new Map<Etagere, IngredientRange[]>(ORDRE_DES_ETAGERES.map(e => [e, []]))
  for (const i of ingredients) parEtagere.get(etagereDe({ label: i.label, groupe: i.groupe, sousGroupe: i.sousGroupe }))!.push(i)
  const bac = parEtagere.get('Bac à légumes')!
  return (
    <Interieur visible={visible} origine="72% 45%" nom="Dans le frigo" titre="Frigo"
               soustitre={attente ? 'Un instant…' : soustitreDuFrigo(parts, ingredients.length)}
               couleurSoustitre="var(--color-doux)" annonce={annonce} erreur={erreur} surFerme={surFerme}
               fond="linear-gradient(90deg, rgba(255, 246, 222, 0.9) 0, rgba(255, 255, 255, 0) 14px, rgba(255, 255, 255, 0) calc(100% - 14px), rgba(255, 246, 222, 0.9) 100%), linear-gradient(180deg, #FFFFFF 0%, #F4F8F6 100%)">
      <div aria-hidden="true" className="absolute left-1/2 top-0 -ml-[90px] h-[5px] w-[180px] rounded-b-[5px]"
           style={{ background: '#FFF6DE', boxShadow: '0 0 24px 10px rgba(255, 236, 190, 0.8)' }} />
      {plats.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-x-3.5 gap-y-4 pb-3.5">
          {plats.map(p => (
            <CartePlat key={p.groupe.cle} groupe={p.groupe} photo={p.photo} quand={p.quand}
                       fond={fondDuPlat(p.groupe.label)} surOuvre={() => surPlat(p.groupe.cle)} />
          ))}
        </div>
      ) : (
        <p className="mt-5 pb-3.5 text-[14px] text-doux">{attente ? 'Un instant…' : 'Pas de plat au frigo.'}</p>
      )}
      <div aria-hidden="true" style={VERRE} />

      {(['Laitages et frais', 'Viandes et poissons', 'Autres'] as Etagere[]).map(e => {
        const liste = parEtagere.get(e)!
        return liste.length > 0 && (
          <section key={e} aria-label={e}>
            <h3 className="pt-3.5 text-[13px] font-semibold text-doux">{e}</h3>
            <div className="flex flex-wrap gap-2 pb-3.5 pt-2">
              {liste.map(i => <TuileIngredient key={i.id} item={i} surOuvre={() => surIngredient(i.id)} />)}
            </div>
            <div aria-hidden="true" style={VERRE} />
          </section>
        )
      })}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-4">
        <button type="button" onClick={surAjoute}
                className="min-h-11 rounded-xl border-[1.5px] border-dashed border-[#9FB0A4] px-3.5 text-[14px] font-semibold text-herbe">
          + Ajouter au frigo
        </button>
        <button type="button" onClick={surPhoto}
                className="min-h-11 px-1 text-[14px] font-semibold text-herbe underline underline-offset-[3px]">
          Photo du frigo
        </button>
      </div>

      <section aria-label="Bac à légumes"
               className="flex min-h-[92px] flex-wrap content-center items-center justify-center gap-2 rounded-[14px] p-3 text-[13px] text-doux"
               style={{
                 background: 'linear-gradient(180deg, rgba(214, 228, 221, 0.75), rgba(200, 218, 210, 0.75))',
                 boxShadow: 'inset 0 0 0 1.5px rgba(160, 184, 172, 0.6), inset 0 10px 0 rgba(255, 255, 255, 0.4)',
               }}>
        {bac.length === 0
          ? 'Bac à légumes : rien'
          : bac.map(i => <TuileIngredient key={i.id} item={i} surOuvre={() => surIngredient(i.id)} />)}
      </section>
    </Interieur>
  )
}

export function InterieurCongelo({ visible, plats, ingredients, plusTard, annonce, erreur, attente, surFerme, surPlat, surIngredient, surAjoute }: {
  visible: boolean
  plats: PlatAffiche[]
  ingredients: IngredientRange[]
  plusTard: Date | null
  annonce: string | null
  erreur?: unknown
  attente: boolean
  surFerme: () => void
  surPlat: (cle: string) => void
  surIngredient: (id: string) => void
  surAjoute: () => void
}) {
  const parts = plats.reduce((n, p) => n + p.groupe.parts.length, 0)
  return (
    <Interieur visible={visible} origine="28% 45%" nom="Dans le congélateur" titre="Congélateur"
               soustitre={attente ? 'Un instant…' : soustitreDuCongelo(parts, plusTard)}
               couleurSoustitre="var(--color-congel-encre)" annonce={annonce} erreur={erreur} surFerme={surFerme}
               fond="radial-gradient(circle at 10px 10px, rgba(255, 255, 255, 0.9) 0 1.2px, transparent 2px) 0 0 / 22px 22px, linear-gradient(180deg, #F4F9FB 0%, #DFEAEF 100%)">
      <div className="mt-5 flex flex-col gap-4">
        {plats.map(p => (
          <CarteCongelee key={p.groupe.cle} groupe={p.groupe} photo={p.photo} quand={p.quand}
                         fond={fondDuPlat(p.groupe.label)} surOuvre={() => surPlat(p.groupe.cle)} />
        ))}
        {plats.length === 0 && <p className="text-[14px] text-congel-encre">{attente ? 'Un instant…' : 'Pas de plat au congélateur.'}</p>}
        <section aria-label="Tiroir du bas"
                 className="flex min-h-20 flex-wrap items-center justify-center gap-2 rounded-2xl p-3 text-[13px] text-congel-encre"
                 style={{ boxShadow: 'inset 0 0 0 2px #C6D6DD' }}>
          {ingredients.length === 0
            ? 'Tiroir du bas : vide'
            : ingredients.map(i => <TuileIngredient key={i.id} item={i} froid surOuvre={() => surIngredient(i.id)} />)}
        </section>
        <div>
          <button type="button" onClick={surAjoute}
                  className="min-h-11 rounded-xl border-[1.5px] border-dashed border-[#8FAAB8] px-3.5 text-[14px] font-semibold text-congel-encre">
            + Ajouter au congélateur
          </button>
        </div>
      </div>
    </Interieur>
  )
}
