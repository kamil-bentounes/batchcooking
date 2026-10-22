/**
 * Ce qui reste du mois (§ 3.1, point 4 ; § 3.1.1) : une carte encre, le chiffre
 * en safran, la barre de mes parts par catégorie, la légende sur deux colonnes.
 * La couleur n'est jamais seule : chaque pastille porte son nom.
 *
 * « après X € de charges prévues », c'est la somme de MES parts. Seul, c'est le
 * total du foyer ; à deux, ce ne l'est plus — voir une ligne ne veut pas dire
 * la payer (D80).
 */
import { infoCategorie } from '../../lib/budget/categories.ts'
import { capitale, montant, nomDuMois, type Reste, type Segment } from '../../lib/budget/mois.ts'
import { RevenirDessus } from './RevenirDessus.tsx'

export function Recap({ mois, reste, segments, cloture, va }: {
  mois: string; reste: Reste; segments: Segment[]
  /** Lot 3 : le mois est clôturé, et voici ce que le choix de clôture en a retenu.
      `duFoyer` : ce que « Revenir dessus » retirera de l'épargne — le total des membres,
      que `rouvre_le_mois` efface tous ; à défaut, ma part. */
  cloture?: { reste: number | null; misDeCote: number; duFoyer?: number | null } | null
  va: (v: string) => void
}) {
  const teinte = (s: Segment) =>
    s.cle === 'reste' ? 'rgb(251 252 250 / 0.22)' : infoCategorie(s.cle).sombre
  return (
    /* `sur-encre` : le bouton « Revenus » vit sur l'encre, où l'anneau de focus `herbe`
       fait 1,9:1 — il disparaîtrait au clavier (`anneau.test.ts`). */
    <section aria-label="Ce qui reste" className="sur-encre mt-7 rounded-[28px] bg-encre text-fond p-5">
      {cloture ? (
        <>
          <p className="text-[16px] opacity-80">{capitale(nomDuMois(mois))} est clôturé.</p>
          {/* Négatif : « Il te manque », comme le mois ouvert (§ Négatif) — jamais « resté −120 € ». */}
          <p className="text-[16px]">
            {cloture.reste !== null && cloture.reste < 0 ? 'Il te manque' : 'Il t’est resté'}
          </p>
          <p className="chiffre mt-1 text-[56px] leading-none text-safran">
            {cloture.reste === null ? '—' : montant(Math.abs(cloture.reste))}
          </p>
          {cloture.misDeCote > 0 && (
            <p className="mt-3 text-[15px] opacity-80">dont {montant(cloture.misDeCote)} mis de côté</p>
          )}
          <RevenirDessus mois={mois} misDeCote={cloture.duFoyer === undefined ? cloture.misDeCote : cloture.duFoyer} clair />
        </>
      ) : reste.revenu === null || reste.reste === null ? (
        <>
          <p className="text-[17px] leading-snug">Ajoute ton revenu pour voir ce qu’il te reste.</p>
          <button onClick={() => va('/budget-reglages')}
                  className="mt-4 min-h-11 px-5 rounded-full bg-safran text-encre text-[15px] font-semibold">
            Revenus
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[16px] opacity-80">{reste.reste < 0 ? 'Il te manque' : 'Il te reste'}</span>
            <span className="px-3 py-1 rounded-full bg-fond/10 text-[13px] whitespace-nowrap">
              sur {montant(reste.revenu)} de revenus
            </span>
          </div>
          {/* Négatif : le chiffre garde le safran. L'ocre de la spec ne se lit pas
              sur l'encre (≈ 2,4:1) ; c'est « Il te manque » qui dit le signe. */}
          <p className="chiffre mt-2 text-[60px] leading-none text-safran">
            {montant(Math.abs(reste.reste))}
          </p>
          <p className="mt-3 text-[15px] opacity-80">après {montant(reste.charges)} de charges prévues</p>
          <div aria-hidden="true" className="mt-5 flex h-3 gap-[3px] overflow-hidden">
            {segments.map(s => (
              <span key={s.cle} className="h-full rounded-full"
                    style={{ flexGrow: Math.max(s.pourcent, 1), background: teinte(s) }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-2 gap-x-5 max-[380px]:gap-x-3 gap-y-2">
            {segments.map(s => (
              <li key={s.cle} className="flex items-center gap-2 text-[14px] max-[380px]:text-[13px]">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: teinte(s) }} />
                {/* À 360 px, « Vie coura… » et « 17 / % » sur deux lignes : le nom passe à la ligne
                    plutôt que de se tronquer, et le pourcentage ne se coupe jamais. */}
                <span className="grow min-w-0 leading-tight">{s.nom}</span>
                <span className="tabular-nums opacity-80 whitespace-nowrap shrink-0">{s.pourcent} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
