/**
 * Un champ de parts (carte encre) : on y tape, on peut l'effacer, on ne le
 * « corrige » pas sous les doigts.
 *
 * Il garde un BROUILLON — ce que la personne a tapé — et ne montre la valeur de la
 * base que quand elle n'écrit pas. Un `<input type="number">` contrôlé par un
 * entier ne pouvait pas être vidé : il revenait à « 1 », et « effacer puis 12 »
 * donnait « 112 ». Ici le texte est lu tel quel (`lireSaisie`) : un entier valide
 * s'écrit tout de suite, un refus se dit (`surRefus`), et un champ vide ne fait
 * rien. À la sortie, le champ reprend la valeur de la base — celle qu'on vient
 * d'envoyer en attendant qu'elle revienne, pour ne pas clignoter sur l'ancienne.
 * Un geste raté se rejoue par une nouvelle `key` : le champ repart de la base.
 */
import { useState } from 'react'
import { lireSaisie } from '../../lib/recettes/parts.ts'

export function ChampParts({ valeur, max, surValeur, surRefus, libelle, className = '' }: {
  valeur: number
  max: number
  /** Un entier valide, différent de `valeur` : à écrire. */
  surValeur: (parts: number) => void
  /** Le motif d'un refus (`null` quand la frappe est valide ou vide). */
  surRefus: (message: string | null) => void
  libelle?: string
  className?: string
}) {
  const [brouillon, setBrouillon] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState<number | null>(null)
  const [vu, setVu] = useState(valeur)
  // La base a répondu : sauf si l'on tape encore, c'est elle qui fait foi.
  if (valeur !== vu) {
    setVu(valeur)
    if (brouillon === null) setEnvoye(null)
  }

  function lit(texte: string) {
    setBrouillon(texte)
    const { commit, refus } = lireSaisie(texte, max, valeur)
    if (refus !== null) return surRefus(refus)
    surRefus(null)
    if (commit !== null) {
      setEnvoye(commit)
      surValeur(commit)
    }
  }

  return (
    <input type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
           aria-label={libelle}
           value={brouillon ?? String(envoye ?? valeur)}
           onChange={e => lit(e.target.value)}
           onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
           onBlur={() => setBrouillon(null)}
           className={className} />
  )
}
