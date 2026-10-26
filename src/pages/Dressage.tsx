/**
 * Le dressage (D24, D25, D40, D53).
 *
 * L'étape que l'app n'avait pas, et sans laquelle tout le reste tombe : la
 * session ne produit pas des recettes, elle produit des BARQUETTES. Nommées,
 * pesées, datées, chacune avec ses macros et son coût.
 *
 * Deux objectifs, un seul plat : ce qui diffère, c'est la portion. Et si le plat
 * n'est pas assez protéiné pour l'un des deux, on ne grossit pas sa part — on
 * ajoute du skyr, parce qu'une part plus grosse donne plus de TOUT. Qui n'a pas
 * encore fixé d'objectifs reçoit quand même ses parts, au poids moyen des autres.
 *
 * Deux étapes sur le même écran : on dresse (ici), puis « On range » (`Ranger`) —
 * où l'hôte choisit ce qui reste au frigo et ce qui part au congélateur.
 */
import { useMemo, useState } from 'react'
import { Attente, Chiffre, Passage, Vide } from '../ui/coque.tsx'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useFoyer, aDesObjectifs, objectifDe, phraseSansObjectifs, prenomDe } from '../lib/donnees/foyer.ts'
import { useRecettesMesurees } from '../lib/donnees/recettes.ts'
import type { RecetteMesuree } from '../lib/donnees/recettes.ts'
import { PART_DU_JOUR, repartit } from '../lib/nutrition/portions.ts'
import type { Repartition } from '../lib/nutrition/portions.ts'
import { Ranger } from './Ranger.tsx'

export function Dressage({ va, retour, userId }: { va: (v: string) => void; retour: () => void; userId?: string }) {
  const { data: cycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: recettes = [], isPending } = useRecettesMesurees(cycle?.id)
  const [etape, setEtape] = useState<'dresser' | 'ranger'>('dresser')

  // `foyer?.membres` garde son identité entre deux rendus tant que la requête
  // ne change pas ; un `?? []` en créerait un nouveau à chaque fois et le memo
  // ne servirait à rien.
  const membres = foyer?.membres

  /**
   * La découpe, recette par recette. Les parts d'une personne se répartissent au
   * prorata de ses objectifs ; le nombre de parts vient du choix du mercredi.
   * Sans objectifs (0 kcal), `repartit` lui donne la part moyenne des autres.
   */
  const decoupes = useMemo(() => recettes.map(r => {
    const gens = membres ?? []
    const parPersonne = repartitionParPersonne(r.parts, gens.length)
    const demandes = gens.map((m, i) => {
      const o = objectifDe(m)
      const f = PART_DU_JOUR.diner
      return {
        cible: { userId: m.id, kcal: o.kcal * f, proteinG: o.proteinG * f },
        nombre: parPersonne[i] ?? 0,
      }
    })
    return { recette: r, repartition: repartit(r.plat, demandes) }
  }), [recettes, membres])

  if (!cycle) return <Sombre><Vide titre="Aucune session" /></Sombre>
  if (isPending) return <Sombre><Attente /></Sombre>
  if (recettes.length === 0) {
    return (
      <Passage retour={retour}>
        <Vide titre="Rien à dresser" texte="Aucune recette n’a été cuisinée dans ce cycle." />
      </Passage>
    )
  }

  if (etape === 'ranger' && foyer) {
    return <Ranger cycle={cycle} decoupes={decoupes} membres={foyer.membres}
                   retour={() => setEtape('dresser')} va={va} />
  }

  const total = decoupes.reduce(
    (s, d) => s + d.repartition.parts.reduce((n, p) => n + p.nombre, 0), 0)
  /* Quelqu'un sans objectifs a ses parts, au poids moyen des autres : on le dit, on ne le tait pas. */
  const sansObjectifs = (membres ?? []).filter(m => !aDesObjectifs(m))
  const phraseSans = phraseSansObjectifs(sansObjectifs.map(m => prenomDe(m.display_name)))

  return (
    <Sombre>
      <p className="text-[14px] text-safran">Dernière étape</p>
      <h1 className="titre text-[42px] mt-2.5">
        Dresse<br />{total} barquette{total > 1 ? 's' : ''}
      </h1>
      <p className="mt-3.5 text-[15px] opacity-65">
        Remplis chacune au poids indiqué : c’est ce qui rend les parts justes.
      </p>

      {phraseSans && (
        <div className="mt-5 rounded-[14px] border border-fond/25 p-4">
          <p className="text-[15px] leading-snug">{phraseSans}</p>
          {sansObjectifs.some(m => m.id === userId) && (
            <button onClick={() => va('/objectifs')}
                    className="mt-3 min-h-11 px-5 rounded-full bg-safran text-encre text-[15px] font-semibold">
              Fixe tes objectifs
            </button>
          )}
        </div>
      )}

      <div className="mt-9 space-y-8">
        {decoupes.map(({ recette, repartition }) => (
          <Lot key={recette.recipeId} recette={recette} repartition={repartition}
               nomDe={id => {
                 const m = foyer?.membres.find(x => x.id === id)
                 return m ? prenomDe(m.display_name) : 'indifférent'
               }} />
        ))}
      </div>

      <div className="mt-11">
        <button onClick={() => setEtape('ranger')} disabled={total === 0}
                className="w-full h-[58px] rounded-[18px] bg-safran text-encre
                           text-[17px] font-semibold disabled:opacity-60">
          C’est dressé
        </button>
        <p className="mt-3.5 text-[13px] opacity-55 text-center leading-relaxed">
          Ensuite, tu choisis ce qui reste au frigo et ce qui part au congélateur.
        </p>
      </div>
    </Sombre>
  )
}

function Lot({ recette, repartition, nomDe }: {
  recette: RecetteMesuree
  repartition: Repartition
  nomDe: (id: string) => string
}) {
  return (
    <section aria-label={recette.titre}>
      <h2 className="titre text-[24px]">{recette.titre}</h2>

      {!recette.fiable && (
        <p className="mt-2 text-[13px] text-safran">
          Recette mal quantifiée : les parts sont égales, faute de mieux.
        </p>
      )}

      <div className="mt-3.5 space-y-2.5">
        {repartition.parts.map(p => (
          <div key={p.userId} className="flex items-baseline gap-3">
            <Chiffre valeur={`${p.nombre} × ${p.grammes} g`} taille={22} />
            <span className="text-[14px] opacity-65 grow">
              pour {nomDe(p.userId)}{p.sansObjectifs ? ' · parts égales' : ''}
            </span>
            <span className="text-[14px] opacity-80 tabular-nums">
              {p.kcal} kcal · {p.proteinG} g
            </span>
          </div>
        ))}
      </div>

      {repartition.complements.map(c => (
        <p key={c.userId} className="mt-3 text-[14px] text-safran">
          + {c.grammes} g de {c.source} pour {nomDe(c.userId)}
        </p>
      ))}

      <p className="mt-3 text-[13px] opacity-55 leading-relaxed">
        {repartition.explication}
      </p>
    </section>
  )
}

/** Répartit N parts entre P personnes sans en perdre une en route. */
function repartitionParPersonne(parts: number, personnes: number): number[] {
  if (personnes <= 0) return []
  const base = Math.floor(parts / personnes)
  const reste = parts % personnes
  return Array.from({ length: personnes }, (_, i) => base + (i < reste ? 1 : 0))
}

function Sombre({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-encre text-fond px-6 pt-16 pb-14">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  )
}
