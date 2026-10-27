/**
 * Annuler « Je l'ai mangé » (maquette `annuler-mange.html`, migration 0129) : trois pièces d'une même carte.
 *
 *  1. `BandeauNote` : « Noté : mangé. » + « Annuler », 6 secondes, juste après le geste. UN toucher suffit, sans question.
 *     Annoncé poliment ; le délai s'arrête tant que le focus ou le pointeur est dessus.
 *  2. `PuceMange` : « Mangé à 12 h 40 », sous le nom du repas.
 *  3. `LienAnnuler` : « Pas mangé ? Annuler », discret, tant que MA case est « mangé » ; il demande de confirmer DANS la
 *     carte (le geste touche au frigo), pas dans une fenêtre par-dessus.
 *
 * La case qu'on vient de cocher, l'heure dite et le délai : `lib/annuler-mange.ts`.
 */
import { useEffect, useId, useRef, useState } from 'react'
import { DELAI_DU_BANDEAU } from '../../lib/annuler-mange.ts'

function Retour() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7 4.5 11.5 9 16" /><path d="M5 11.5h9.5a5 5 0 0 1 0 10H11" />
    </svg>
  )
}

/* Le trait qui se vide en 6 secondes. Sans mouvement, il n'a plus de sens : il disparaît (`prefers-reduced-motion`). */
const STYLE_DU_TRAIT = `
@keyframes annule-compte { from { transform: scaleX(1); } to { transform: scaleX(0); } }
.annule-trait { transform-origin: left; animation: annule-compte ${DELAI_DU_BANDEAU}ms linear forwards; }
@media (prefers-reduced-motion: reduce) { .annule-trait { display: none; } }
`

export function BandeauNote({ surAnnule, surFerme, enCours }: {
  surAnnule: () => void
  surFerme: () => void
  enCours: boolean
}) {
  const [survol, setSurvol] = useState(false)
  const [focus, setFocus] = useState(false)
  /* La région annoncée existe vide d'abord, puis reçoit son texte : un texte déjà là à l'insertion n'est pas
     toujours annoncé. */
  const annonce = useRef<HTMLSpanElement>(null)
  useEffect(() => { if (annonce.current) annonce.current.textContent = 'Noté : mangé.' }, [])

  /* Le délai, en pause tant que le pointeur ou le focus est dessus, ou que l'annulation est en vol. */
  const enPause = survol || focus || enCours
  const reste = useRef(DELAI_DU_BANDEAU)
  const ferme = useRef(surFerme)
  useEffect(() => { ferme.current = surFerme }, [surFerme])
  useEffect(() => {
    if (enPause) return
    const depuis = Date.now()
    const t = setTimeout(() => ferme.current(), reste.current)
    return () => { clearTimeout(t); reste.current = Math.max(0, reste.current - (Date.now() - depuis)) }
  }, [enPause])

  return (
    <div data-bandeau-annule="" className="sur-encre relative flex min-h-14 items-center justify-between gap-2.5 overflow-hidden rounded-[18px] bg-encre pl-4 pr-1.5 text-surface"
         onPointerEnter={() => setSurvol(true)} onPointerLeave={() => setSurvol(false)}
         onFocus={() => setFocus(true)}
         onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocus(false) }}>
      <style>{STYLE_DU_TRAIT}</style>
      <span ref={annonce} role="status" aria-live="polite" className="whitespace-nowrap text-[15px] font-medium" />
      <button type="button" onClick={surAnnule} disabled={enCours}
              className="inline-flex min-h-12 items-center gap-2 rounded-[14px] px-3 text-[16px] font-bold text-safran disabled:opacity-60">
        <Retour />Annuler
      </button>
      <i aria-hidden="true" className="annule-trait absolute inset-x-0 bottom-0 h-1 bg-safran"
         style={{ animationPlayState: enPause ? 'paused' : 'running' }} />
    </div>
  )
}

/** « ✓ Mangé » (le temps du bandeau), puis « ✓ Mangé à 12 h 40 ». */
export function PuceMange({ heure }: { heure: string | null }) {
  return (
    <span data-mange-puce="" className="inline-flex items-center gap-1.5 rounded-full bg-frais-fond px-[11px] py-[5px] text-[13px] font-bold text-frais-encre">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
      {heure ? `Mangé à ${heure}` : 'Mangé'}
    </span>
  )
}

/**
 * « Pas mangé ? Annuler », puis la confirmation dans la carte : « Remettre ce repas à « prévu » ? ». `avecBarquette` :
 * sans barquette (« autre chose »), la phrase ne parle ni de frigo ni de congélateur.
 */
export function LienAnnuler({ avecBarquette, surConfirme, enCours, nom }: {
  avecBarquette: boolean
  surConfirme: () => void
  enCours: boolean
  /** « Midi : Lasagnes » : le nom accessible du lien, quand plusieurs repas portent le même mot. */
  nom: string
}) {
  const [ouvert, setOuvert] = useState(false)
  const titre = useId()
  const boite = useRef<HTMLDivElement>(null)
  const lien = useRef<HTMLButtonElement>(null)
  const revenir = useRef(false)

  /* La question reçoit le focus à son ouverture ; « Non, garder » le rend au lien. */
  useEffect(() => { if (ouvert) boite.current?.focus() }, [ouvert])
  useEffect(() => {
    if (!ouvert && revenir.current) { revenir.current = false; lien.current?.focus() }
  }, [ouvert])

  if (!ouvert) {
    return (
      <div className="flex items-center">
        <button type="button" ref={lien} onClick={() => setOuvert(true)} data-annule="lien"
                aria-label={`Pas mangé ? Annuler : ${nom}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-[14.5px] font-medium text-doux underline underline-offset-[3px]">
          <Retour />Pas mangé ? Annuler
        </button>
      </div>
    )
  }
  return (
    <div ref={boite} tabIndex={-1} role="group" aria-labelledby={titre} data-annule="confirme"
         className="grid gap-3 rounded-[18px] bg-sable p-3.5 outline-none">
      <b id={titre} className="titre text-[18px] font-semibold leading-[1.25]">Remettre ce repas à « prévu » ?</b>
      <p className="text-[14.5px] leading-[1.4]">
        {avecBarquette
          ? 'Ta part redevient prévue et la barquette revient au frigo. Si elle venait du congélateur, elle y retourne.'
          : 'Ta part redevient prévue.'}
      </p>
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={surConfirme} disabled={enCours} data-annule="oui"
                className="min-h-12 rounded-2xl bg-herbe px-[18px] text-[16px] font-semibold text-fond disabled:opacity-60">
          Oui, remettre
        </button>
        <button type="button" onClick={() => { revenir.current = true; setOuvert(false) }} disabled={enCours}
                className="inline-flex min-h-11 items-center px-1 text-[15px] font-semibold text-herbe underline underline-offset-[3px] disabled:opacity-60">
          Non, garder
        </button>
      </div>
    </div>
  )
}
