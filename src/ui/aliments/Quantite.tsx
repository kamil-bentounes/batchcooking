/**
 * « Yaourt nature : combien ? » — le panneau qui s'ouvre quand on appuie sur un de nos aliments.
 *
 * Un appui ajoutait UNE unité ; on mange souvent deux yaourts, ou 30 g de céréales. Le panneau demande donc la quantité,
 * en un geste :
 *  · un aliment qui a une unité (un pot) : un compteur « − 2 pots + », les grammes dessous, et « ou en grammes » ;
 *  · un aliment au gramme, ou « en grammes » : les quantités récentes de la personne pour cet aliment (« 30 g », « 60 g »),
 *    « Autre » pour taper — et, sans historique, directement le champ.
 * Il dit ce que ça pèse (« 114 kcal · 3 g de protéines ») avant d'écrire. Les valeurs écrites sont une COPIE : corriger
 * l'aliment demain ne réécrit pas le bilan d'hier.
 */
import { useRef, useState } from 'react'
import { useQuantitesRecentes } from '../../lib/donnees/barquettes.ts'
import type { Aliment } from '../../lib/donnees/aliments.ts'
import {
  UNITES_MAX, auGramme, grammesDe, lisLesGrammes, phraseDuCalcul, pluriel, quantiteParDefaut, valeursDeLaQuantite,
} from '../../lib/aliments/en-plus.ts'
import type { Quantite } from '../../lib/aliments/en-plus.ts'
import { ecrit } from '../../lib/aliments/calcul.ts'

const CADRE = { boxShadow: 'inset 0 0 0 1px var(--color-brume)' } as const
const LIEN = 'inline-flex min-h-11 items-center text-[14px] font-semibold text-herbe underline underline-offset-[3px]'
const PETIT_BOUTON = 'grid size-[52px] shrink-0 place-items-center rounded-[16px] bg-piste text-[24px] font-semibold leading-none disabled:opacity-40'

/** Le texte d'un nombre dans un champ : 12.5 → « 12,5 ». */
const texte = (n: number) => String(n).replace('.', ',')

export function QuantiteDeLAliment({ aliment, moi, bouton, enCours = false, surAjoute }: {
  aliment: Aliment
  /** Moi : ce sont MES quantités récentes. */
  moi: string
  /** « Ajouter au soir » : ce que le bouton dit. */
  bouton: string
  /** Un ajout est en cours : le bouton ne repart pas. */
  enCours?: boolean
  surAjoute: (q: Quantite) => void
}) {
  const recentes = useQuantitesRecentes(aliment.id, moi)
  return (
    <div role="group" aria-label={`${aliment.label} : combien ?`} data-quantite={aliment.id}
         className="rounded-[18px] bg-surface p-3.5" style={CADRE}>
      <h4 className="text-[16px] font-bold [overflow-wrap:anywhere]">{aliment.label} : combien ?</h4>
      {/* Les dernières quantités se lisent avant que le panneau ne propose : jamais un « 1 pot » qui change sous le doigt.
          Une lecture en panne (hors ligne) ne bloque rien : le panneau commence sans historique. */}
      {recentes.isPending
        ? <p role="status" className="mt-3 text-[13px] text-doux">Je regarde tes dernières quantités…</p>
        : <Panneau aliment={aliment} recentes={recentes.data ?? []} bouton={bouton} enCours={enCours} surAjoute={surAjoute} />}
    </div>
  )
}

function Panneau({ aliment, recentes, bouton, enCours, surAjoute }: {
  aliment: Aliment; recentes: number[]; bouton: string; enCours: boolean; surAjoute: (q: Quantite) => void
}) {
  const parDefaut = quantiteParDefaut(aliment, recentes)
  const [q, setQ] = useState<Quantite>(parDefaut)
  /* « Autre » : les grammes se tapent. Sans historique, c'est le seul chemin : le champ est là d'emblée. */
  const [autre, setAutre] = useState(parDefaut.mode === 'grammes' && recentes.length === 0)
  const [saisie, setSaisie] = useState('')
  const [erreur, setErreur] = useState('')
  const champ = useRef<HTMLInputElement>(null)
  const unite = aliment.unite.trim()
  const alUnite = !auGramme(aliment)

  const grammes = q.mode === 'grammes' ? q.g : grammesDe(aliment, q)
  const valeurs = valeursDeLaQuantite(aliment, q)

  function enGrammes() {
    const g = grammesDe(aliment, q)
    setErreur('')
    if (g !== null && recentes.includes(g)) { setAutre(false); setQ({ mode: 'grammes', g }) } else {
      setAutre(true); setSaisie(g === null ? '' : texte(g)); setQ({ mode: 'grammes', g })
    }
    setTimeout(() => champ.current?.focus(), 0)
  }
  function enUnites() {
    setErreur('')
    setAutre(false)
    setQ(quantiteParDefaut(aliment, recentes))
  }
  function tape(v: string) {
    setSaisie(v)
    setErreur('')
    const l = lisLesGrammes(v)
    setQ({ mode: 'grammes', g: 'g' in l ? l.g : null })
  }
  function ajoute() {
    if (enCours) return
    if (q.mode === 'grammes') {
      /* Les grammes tapés : lus d'ici, pas de l'état — la phrase du refus dit ce qui ne va pas. */
      const l = autre ? lisLesGrammes(saisie) : q.g === null ? { erreur: 'Dis combien, en grammes.' } : { g: q.g }
      if ('erreur' in l) { setErreur(l.erreur); champ.current?.focus(); return }
      surAjoute({ mode: 'grammes', g: l.g })
      return
    }
    surAjoute(q)
  }

  return (
    <>
      {q.mode === 'unites' ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-3">
            <button type="button" aria-label={`Un ${unite} de moins`} disabled={q.n <= 1}
                    onClick={() => setQ({ mode: 'unites', n: q.n - 1 })} className={PETIT_BOUTON}>
              <span aria-hidden="true">−</span>
            </button>
            <div className="min-w-0 text-center" aria-live="polite">
              <div className="titre text-[28px] font-semibold leading-none">{q.n} {pluriel(unite, q.n)}</div>
              <div className="mt-1 text-[13px] text-doux">{ecrit(grammes ?? 0)} g</div>
            </div>
            <button type="button" aria-label={`Un ${unite} de plus`} disabled={q.n >= UNITES_MAX}
                    onClick={() => setQ({ mode: 'unites', n: q.n + 1 })} className={PETIT_BOUTON}>
              <span aria-hidden="true">+</span>
            </button>
          </div>
          <button type="button" onClick={enGrammes} className={`${LIEN} mt-1`}>ou en grammes</button>
        </>
      ) : (
        <>
          {recentes.length > 0 && (
            <div role="group" aria-label="Quantités récentes" className="mt-3 flex flex-wrap gap-2">
              {recentes.map(g => {
                const choisi = !autre && q.g === g
                return (
                  <button key={g} type="button" aria-pressed={choisi}
                          onClick={() => { setAutre(false); setErreur(''); setQ({ mode: 'grammes', g }) }}
                          className={`min-h-11 rounded-full px-4 text-[15px] font-semibold ${choisi ? 'bg-herbe text-fond' : 'bg-piste text-encre'}`}>
                    {ecrit(g)} g
                  </button>
                )
              })}
              <button type="button" aria-pressed={autre}
                      onClick={() => { setAutre(true); setSaisie(''); setQ({ mode: 'grammes', g: null }); setTimeout(() => champ.current?.focus(), 0) }}
                      className={`min-h-11 rounded-full px-4 text-[15px] font-semibold ${autre ? 'bg-herbe text-fond' : 'bg-piste text-encre'}`}>
                Autre
              </button>
            </div>
          )}
          {autre && (
            <label className="mt-3 block">
              <span className="text-[13px] font-semibold">{recentes.length > 0 ? 'Autre quantité, en grammes' : 'Combien, en grammes'}</span>
              <input ref={champ} value={saisie} onChange={e => tape(e.target.value)} inputMode="decimal" autoComplete="off"
                     onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ajoute() } }}
                     aria-invalid={erreur ? true : undefined} aria-describedby={erreur ? `quantite-erreur-${aliment.id}` : undefined}
                     className="mt-1 h-12 w-full rounded-[14px] bg-fond px-3.5 text-[17px] text-encre"
                     style={erreur ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE} />
            </label>
          )}
          {alUnite && <button type="button" onClick={enUnites} className={`${LIEN} mt-1`}>{`ou en ${pluriel(unite, 2)}`}</button>}
        </>
      )}

      {erreur && <p id={`quantite-erreur-${aliment.id}`} role="alert" className="mt-1.5 text-[13px] text-groseille">{erreur}</p>}

      {/* Ce que ça pèse, avant d'écrire. */}
      <p aria-live="polite" data-calcul="" className="titre mt-3 min-h-[28px] text-[20px] font-semibold leading-[1.2] text-herbe">
        {valeurs ? phraseDuCalcul(valeurs) : ''}
      </p>
      <button type="button" onClick={ajoute} disabled={enCours}
              className="mt-2 min-h-[52px] w-full rounded-[16px] bg-herbe px-4 text-[17px] font-semibold text-fond disabled:opacity-60">
        {bouton}
      </button>
    </>
  )
}
