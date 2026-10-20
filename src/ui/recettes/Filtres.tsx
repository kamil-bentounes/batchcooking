/**
 * Chercher et filtrer (R1, § 3.3 de la spec).
 *
 * Les filtres gardent leurs règles — la borne défavorable (D18), le temps des
 * mains (D30) — et changent de forme : quatre puces sous la recherche pour ce
 * qu'on demande le plus, le reste derrière « Appareils et filtres ».
 */
import type { ReactNode } from 'react'
import { CODES_APPAREILS } from '../../lib/donnees/catalogue.ts'
import type { Filtres } from '../../lib/donnees/catalogue.ts'
import { Icone, PictoEtNom } from './pictos.tsx'

type Modifie = (p: Partial<Filtres>) => void

export function Recherche({ texte, surTexte, ouvert, basculer, actifs }: {
  texte: string
  surTexte: (t: string) => void
  ouvert: boolean
  basculer: () => void
  actifs: number
}) {
  return (
    <div className="mt-[18px] flex gap-2">
      <label className="grow min-w-0 h-[50px] rounded-[18px] bg-surface shadow-carte flex items-center
                        gap-2.5 px-3.5 text-doux focus-within:ring-2 focus-within:ring-herbe">
        <Icone nom="loupe" taille={20} />
        <input type="search" inputMode="search" enterKeyHint="search"
               value={texte} onChange={e => surTexte(e.target.value)}
               placeholder="Chercher une recette" aria-label="Chercher une recette"
               className="champ-recherche grow min-w-0 bg-transparent text-[15px] text-encre
                          placeholder:text-doux outline-none" />
      </label>
      <button type="button" onClick={basculer} aria-expanded={ouvert}
              aria-label={actifs > 0 ? `Appareils et filtres, ${actifs} posés` : 'Appareils et filtres'}
              className="relative size-[50px] shrink-0 grid place-items-center rounded-[18px]
                         bg-piste text-herbe">
        <Icone nom="reglages" taille={20} />
        {actifs > 0 && (
          <span aria-hidden="true"
                className="absolute -top-1 -right-1 min-w-5 h-5 px-1 grid place-items-center
                           rounded-full bg-safran text-encre text-[12px] font-semibold">
            {actifs}
          </span>
        )}
      </button>
    </div>
  )
}

/** Les quatre raccourcis : chacun est l'une des valeurs du panneau. */
export function Puces({ filtres: f, modifie }: { filtres: Filtres; modifie: Modifie }) {
  return (
    <div className="mt-2.5 -mx-6 px-6 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
      <Puce actif={f.tempsActifMax === 20}
            surClic={() => modifie({ tempsActifMax: f.tempsActifMax === 20 ? null : 20 })}>
        ≤ 20 min actives
      </Puce>
      <Puce actif={f.proteinesMin === 30}
            surClic={() => modifie({ proteinesMin: f.proteinesMin === 30 ? null : 30 })}>
        ≥ 30 g de protéines
      </Puce>
      <Puce actif={f.congelable === true}
            surClic={() => modifie({ congelable: f.congelable === true ? null : true })}>
        Se congèle
      </Puce>
      <Puce actif={f.avecCeQuOnA} surClic={() => modifie({ avecCeQuOnA: !f.avecCeQuOnA })}>
        Avec ce que j’ai
      </Puce>
    </div>
  )
}

export function PanneauFiltres({ filtres: f, modifie }: { filtres: Filtres; modifie: Modifie }) {
  return (
    <div className="mt-4 rounded-[22px] bg-surface shadow-carte p-[17px] space-y-5">
      {/* Le filtre le plus utile, et personne ne l'a. */}
      <div>
        <p className="text-[13px] text-doux">Temps les mains prises</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          {[10, 20, 30, 45, null].map(v => (
            <Puce key={String(v)} actif={f.tempsActifMax === v}
                  surClic={() => modifie({ tempsActifMax: v })}>
              {v === null ? 'Peu importe' : `≤ ${v} min`}
            </Puce>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-doux leading-relaxed">
          Le temps de gestes, pas le temps total : une cuisson au four n’occupe personne.
        </p>
      </div>

      <div className="flex gap-4">
        <Nombre libelle="Protéines au moins" unite="g" valeur={f.proteinesMin}
                min={0} max={90} pas={5} surValeur={v => modifie({ proteinesMin: v })} />
        <Nombre libelle="Calories au plus" unite="kcal" valeur={f.kcalMax}
                min={100} max={1500} pas={50} surValeur={v => modifie({ kcalMax: v })} />
      </div>
      <p className="text-[12px] text-doux leading-relaxed -mt-3">
        Sur la borne défavorable : « au moins 30 g » écarte une recette annoncée entre 28 et 34.
      </p>

      <div>
        <p className="text-[13px] text-doux">Avec seulement</p>
        <div className="mt-2 flex gap-2 flex-wrap">
          {CODES_APPAREILS.map(code => (
            <PictoEtNom key={code} code={code} actif={f.appareils.includes(code)}
                        surClic={() => modifie({
                          appareils: f.appareils.includes(code)
                            ? f.appareils.filter(x => x !== code)
                            : [...f.appareils, code],
                        })} />
          ))}
        </div>
        {f.appareils.length > 0 && (
          <p className="mt-2 text-[12px] text-doux">
            Écarte toute recette qui exige autre chose — utile le jour où le four est déjà pris.
          </p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Puce actif={f.jamaisFaites} surClic={() => modifie({ jamaisFaites: !f.jamaisFaites })}>
          Jamais essayée
        </Puce>
      </div>
    </div>
  )
}

function Puce({ actif, surClic, children }:
  { actif: boolean; surClic: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={surClic} aria-pressed={actif}
            className={`shrink-0 min-h-11 px-3.5 rounded-full text-[13.5px] font-medium
                        whitespace-nowrap transition-colors
                        ${actif ? 'bg-encre text-fond' : 'bg-piste text-encre'}`}>
      {children}
    </button>
  )
}

function Nombre({ libelle, unite, valeur, min, max, pas, surValeur }: {
  libelle: string; unite: string; valeur: number | null
  min: number; max: number; pas: number; surValeur: (v: number | null) => void
}) {
  return (
    <label className="flex-1">
      <span className="block text-[13px] text-doux">{libelle}</span>
      <span className="flex items-center gap-2 mt-1.5">
        <input type="number" min={min} max={max} step={pas} value={valeur ?? ''} placeholder="—"
               onChange={e => surValeur(e.target.value === '' ? null : Number(e.target.value))}
               className="w-20 h-11 rounded-[14px] border border-brume bg-fond px-2.5 text-right
                          outline-none focus:border-herbe" />
        <span className="text-[13px] text-doux">{unite}</span>
      </span>
    </label>
  )
}
