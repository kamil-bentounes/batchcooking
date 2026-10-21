/**
 * Une ligne du mois (§ 3.1, le tableau des façons). Elle se règle d'un geste,
 * selon sa façon — celle de la LIGNE, figée à sa naissance, jamais celle de la
 * charge. Une fixe ne fait rien : on la corrige dans « Mes charges ».
 */
import type { Charge, Depense, Saisie } from '../../lib/donnees/budget.ts'
import { declare, facon, montant, prevu } from '../../lib/budget/mois.ts'
import { Jauge } from './Jauge.tsx'

export type Geste = 'declarer' | 'facture' | 'mise'

const PAR = { mensuel: 'par mois', trimestriel: 'par trimestre', annuel: 'par an' } as const

export function LigneDuMois({ ligne, charge, saisies, clos, ouvrir }: {
  ligne: Depense; charge?: Charge; saisies: Saisie[]; clos: boolean
  ouvrir: (geste: Geste, ligne: Depense) => void
}) {
  const f = facon(ligne)

  if (f === 'au_fil') {
    const dit = declare(ligne, saisies)
    const p = prevu(ligne)
    const texte = `${montant(dit)} sur ${montant(p)}`
    return (
      <li className="py-3 flex items-center gap-3">
        {/* `min-h-11` : le libellé et la jauge font 38 px, et l'audit des cibles
            tactiles (`parcours.spec.ts`) mesure la boîte du bouton, pas la ligne. */}
        <button onClick={() => ouvrir('declarer', ligne)} aria-label={`${ligne.libelle} : ${texte}`}
                className="grow min-w-0 min-h-11 text-left">
          <span className="flex items-baseline justify-between gap-2">
            <span className="text-[16px] font-medium truncate">{ligne.libelle}</span>
            <span className="text-[14px] text-doux tabular-nums whitespace-nowrap">{texte}</span>
          </span>
          <span className="mt-2 block"><Jauge valeur={dit} plafond={p} nom={texte} /></span>
        </button>
        {!clos && (
          <button onClick={() => ouvrir('declarer', ligne)} aria-label={`Déclarer pour ${ligne.libelle}`}
                  className="shrink-0 min-h-11 px-4 rounded-full bg-safran text-encre text-[15px] font-semibold">
            Déclarer
          </button>
        )}
      </li>
    )
  }

  if (f === 'facture') {
    return (
      <li>
        <button onClick={() => ouvrir('facture', ligne)}
                className="w-full min-h-11 py-3 flex items-baseline justify-between gap-3 text-left">
          <span className="text-[16px] font-medium">{ligne.libelle}</span>
          <span className="text-[16px] tabular-nums whitespace-nowrap shrink-0">{montant(ligne.montant_cents)}</span>
        </button>
      </li>
    )
  }

  if (f === 'mis_de_cote') {
    const rythme = charge && charge.periodicite !== 'mensuel'
      ? `${montant(charge.montant_cents)} ${PAR[charge.periodicite]}, mis de côté chaque mois`
      : 'mis de côté chaque mois'
    return (
      <li>
        <button onClick={() => ouvrir('mise', ligne)}
                className="w-full min-h-11 py-3 flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block text-[16px] font-medium">{ligne.libelle}</span>
            <span className="block text-[13px] text-doux">{rythme}</span>
          </span>
          <span className="text-[16px] tabular-nums whitespace-nowrap shrink-0">{montant(ligne.montant_cents)}</span>
        </button>
      </li>
    )
  }

  // Fixe, ou ajustement (montant signé, libellé tel qu'en base) : rien à faire ici.
  // Le montant ne se coupe ni ne rétrécit (`whitespace-nowrap shrink-0`, ici et dans les
  // lignes voisines) : sans cela, un libellé long le renvoyait à la ligne (« 100 / € »).
  return (
    <li className="min-h-11 py-3 flex items-baseline justify-between gap-3">
      <span className="text-[16px] font-medium">{ligne.libelle}</span>
      <span className="text-[16px] tabular-nums whitespace-nowrap shrink-0">{montant(ligne.montant_cents)}</span>
    </li>
  )
}
