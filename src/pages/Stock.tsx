/**
 * Ce que j'ai (D28, D29, D36, D37, D49, D57).
 *
 * L'inventaire du frigo, du congélateur et des placards. Deux règles :
 *
 *   · l'urgence se lit avec le MOT, pas seulement avec la couleur. Un daltonien,
 *     ou n'importe qui dans une cuisine mal éclairée, doit pouvoir la lire.
 *   · tout se supprime. Sans exception, et sans confirmation modale : une
 *     barquette mangée en douce ne doit pas rester une semaine à l'écran.
 */
import { useState } from 'react'
import { Attente, Ecran, Vide } from '../ui/coque.tsx'
import {
  useBarquettes, useDeplaceBarquette, useJette,
  useStock, useSupprimeBarquette, useSupprimeStock,
} from '../lib/donnees/barquettes.ts'
import { FormulaireAjout } from './AjoutManuel.tsx'
import type { Barquette } from '../lib/donnees/barquettes.ts'
import type { Ligne as LigneTable } from '../lib/supabase.ts'
import { parUrgence, urgence } from '../lib/peremption.ts'

type Onglet = 'frigo' | 'congelateur' | 'placard'

const NOM: Record<Onglet, string> = {
  frigo: 'Frigo', congelateur: 'Congélateur', placard: 'Placard',
}

export function Stock({ va }: { va: (v: string) => void }) {
  const { data: barquettes = [], isPending } = useBarquettes()
  const { data: stock = [] } = useStock()
  const deplace = useDeplaceBarquette()
  const jette = useJette()
  const supprime = useSupprimeBarquette()
  const supprimeStock = useSupprimeStock()
  const [onglet, setOnglet] = useState<Onglet>('frigo')
  const [ajout, setAjout] = useState(false)
  const [ouverte, setOuverte] = useState<string | null>(null)

  const desBarquettes = parUrgence(
    barquettes.filter(b => b.location === onglet) as (Barquette & {
      expires_at: string; location: 'frigo' | 'congelateur'
    })[])
  const duStock = stock.filter(s => s.location === onglet)
  const compte = (o: Onglet) =>
    barquettes.filter(b => b.location === o).length + stock.filter(s => s.location === o).length

  if (isPending) return <Ecran actif="stock" va={va}><Attente /></Ecran>

  return (
    <Ecran actif="stock" va={va}>
      <h1 className="titre text-[38px]">Ce que j’ai</h1>

      <div className="mt-6 flex gap-2" role="tablist">
        {(['frigo', 'congelateur', 'placard'] as Onglet[]).map(o => (
          <button key={o} role="tab" aria-selected={onglet === o} onClick={() => setOnglet(o)}
                  className={`px-4 min-h-11 inline-flex items-center rounded-full text-[14px] transition-colors
                    ${onglet === o ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
            {NOM[o]} <span className="tabular-nums opacity-70">{compte(o)}</span>
          </button>
        ))}
      </div>

      {desBarquettes.length === 0 && duStock.length === 0 ? (
        <Vide titre={`${NOM[onglet]} vide`}
              texte="Les courses cochées remplissent l’inventaire toutes seules. Tu peux aussi ajouter à la main." />
      ) : (
        <>
          {desBarquettes.length > 0 && (
            <section className="mt-8" aria-label="Barquettes">
              <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">Barquettes</h2>
              <ul className="mt-3 divide-y divide-brume/70">
                {desBarquettes.map(b => (
                  <LigneBarquette key={b.id} barquette={b}
                                  ouverte={ouverte === b.id}
                                  surOuvre={() => setOuverte(ouverte === b.id ? null : b.id)}
                                  surDeplace={v => deplace.mutate({ id: b.id, vers: v })}
                                  surJette={() => jette.mutate(b.id)}
                                  surSupprime={() => supprime.mutate(b.id)} />
                ))}
              </ul>
            </section>
          )}

          {duStock.length > 0 && (
            <section className="mt-8" aria-label="Ingrédients">
              <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">Ingrédients</h2>
              <ul className="mt-3 divide-y divide-brume/70">
                {duStock.map(s => (
                  <LigneStock key={s.id} item={s} surSupprime={() => supprimeStock.mutate(s.id)} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <div className="mt-8 flex gap-3">
        <button onClick={() => setAjout(a => !a)}
                className="flex-1 h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          + À la main
        </button>
        {/* Le libellé suit l'onglet : « Photo du frigo » sur l'onglet du
            congélateur est le genre de détail qui fait douter qu'on ait été
            compris. */}
        <button onClick={() => va('/photo')}
                className="flex-1 h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                           hover:bg-brume transition-colors">
          Photo du {NOM[onglet].toLowerCase()}
        </button>
      </div>
      {ajout && <FormulaireAjout lieu={onglet} surFini={() => setAjout(false)} />}

      {/* La pesée (lot 0c) : c'est elle qui rend les macros vraies. Sa place
          est ici, à côté de la photo — le même geste d'entretien, fait une
          fois puis oublié. */}
      <button onClick={() => va('/peser')}
              className="mt-4 w-full h-[46px] rounded-[16px] bg-brume/50 text-[15px]
                         hover:bg-brume transition-colors">
        Peser ce qu’on compte à l’unité
      </button>

      <p className="mt-6 text-[13px] text-doux leading-relaxed">
        La photo accélère la saisie, elle ne la remplace pas : le modèle propose,
        tu valides ligne par ligne, et tout reste corrigeable à la main.
        « 2 oignons » ne fait des grammes qu’une fois pesé — trois fois, puis
        plus jamais.
      </p>
    </Ecran>
  )
}

function LigneBarquette({ barquette, ouverte, surOuvre, surDeplace, surJette, surSupprime }: {
  barquette: Barquette
  ouverte: boolean
  surOuvre: () => void
  surDeplace: (v: 'frigo' | 'congelateur') => void
  surJette: () => void
  surSupprime: () => void
}) {
  const u = urgence(barquette.expires_at, barquette.location as 'frigo' | 'congelateur')
  const prepare = new Date(barquette.prepared_at)

  return (
    <li className="py-1">
      <button onClick={surOuvre} className="w-full flex items-center gap-3 text-left py-2.5">
        <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: u.pastille }} />
        <span className="grow">
          <span className="block text-[15px]">{barquette.label}</span>
          <span className="block text-[13px] text-doux mt-0.5">
            {Math.round(Number(barquette.grams))} g ·{' '}
            {Math.round(Number(barquette.kcal))} kcal ·{' '}
            {Math.round(Number(barquette.protein_g))} g de protéines
          </span>
        </span>
        {/* Le mot porte l'information à lui seul ; la pastille ne fait que confirmer. */}
        <span className="text-[13px] shrink-0" style={{ color: u.encre }}>{u.mot}</span>
      </button>

      {ouverte && (
        <div className="pl-[22px] pb-3.5 space-y-3">
          <p className="text-[13px] text-doux">
            Préparée le {prepare.toLocaleDateString('fr-FR')} à{' '}
            {prepare.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
            {barquette.state === 'decongelee' && ' · décongelée'}
          </p>
          <div className="flex gap-2 flex-wrap">
            {barquette.location === 'frigo' ? (
              <button onClick={() => surDeplace('congelateur')}
                      className="px-4 py-2 rounded-full bg-brume/60 text-[14px]">
                Congeler
              </button>
            ) : (
              <button onClick={() => surDeplace('frigo')}
                      className="px-4 py-2 rounded-full bg-brume/60 text-[14px]">
                Décongeler
              </button>
            )}
            <button onClick={surJette} className="px-4 py-2 rounded-full bg-brume/60 text-[14px]">
              Jetée
            </button>
            <button onClick={surSupprime}
                    className="ml-auto text-groseille text-[14px] px-3 min-h-11">
              Supprimer
            </button>
          </div>
          {barquette.location === 'frigo' && (
            <p className="text-[13px] text-doux">
              Congeler repart de zéro : la part tiendra trois mois.
            </p>
          )}
          {barquette.location === 'congelateur' && (
            <p className="text-[13px] text-doux">
              Décongeler la rend à manger le lendemain, pas dans quatre jours.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

function LigneStock({ item, surSupprime }:
  { item: LigneTable<'stock_item'>; surSupprime: () => void }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="grow text-[15px]">{item.label}</span>
      {item.quantity !== null && (
        <span className="text-[13px] text-doux">
          {Math.round(Number(item.quantity))} {item.unit ?? ''}
        </span>
      )}
      <button onClick={surSupprime} aria-label={`Supprimer ${item.label}`}
              className="text-doux hover:text-groseille w-11 h-11 grid place-items-center">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
             strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </li>
  )
}
