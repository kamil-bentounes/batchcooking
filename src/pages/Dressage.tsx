/**
 * Le dressage (D24, D25, D40, D53).
 *
 * L'étape que l'app n'avait pas, et sans laquelle tout le reste tombe : la
 * session ne produit pas des recettes, elle produit des BARQUETTES. Nommées,
 * pesées, datées, chacune avec ses macros et son coût.
 *
 * Deux objectifs, un seul plat : ce qui diffère, c'est la portion. Et si le plat
 * n'est pas assez protéiné pour l'un des deux, on ne grossit pas sa part — on
 * ajoute du skyr, parce qu'une part plus grosse donne plus de TOUT.
 */
import { useMemo, useState } from 'react'
import { Attente, Chiffre, Erreur, Passage, Vide } from '../ui/coque.tsx'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'
import { useFoyer, objectifDe } from '../lib/donnees/foyer.ts'
import { useRecettesMesurees } from '../lib/donnees/recettes.ts'
import type { RecetteMesuree } from '../lib/donnees/recettes.ts'
import { useDresse, useDistribue, repartitionAuto, jour } from '../lib/donnees/barquettes.ts'
import type { ADresser } from '../lib/donnees/barquettes.ts'
import { PART_DU_JOUR, repartit } from '../lib/nutrition/portions.ts'
import type { Repartition } from '../lib/nutrition/portions.ts'
import { supabase, ou } from '../lib/supabase.ts'

/** Au-delà de quatre jours, une barquette ne tient pas au frigo (D40). */
const JOURS_AU_FRAIS = 4

export function Dressage({ va, retour }: { va: (v: string) => void; retour: () => void }) {
  const { data: cycle } = useCycle()
  const { data: foyer } = useFoyer()
  const { data: recettes = [], isPending } = useRecettesMesurees(cycle?.id)
  const dresse = useDresse()
  const distribue = useDistribue()
  const change = useChangeEtat()
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<unknown>(null)

  // `foyer?.membres` garde son identité entre deux rendus tant que la requête
  // ne change pas ; un `?? []` en créerait un nouveau à chaque fois et le memo
  // ne servirait à rien.
  const membres = foyer?.membres

  /**
   * La découpe, recette par recette. Les parts d'une personne se répartissent au
   * prorata de ses objectifs ; le nombre de parts vient du choix du mercredi.
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

  async function valide() {
    if (!cycle) return
    setEnCours(true)
    setErreur(null)
    try {
      // Le lieu suit la planification (D40), et il se décide sur TOUTE la
      // session, pas recette par recette : ce que chacun mangera dans les quatre
      // jours reste au frigo, le reste part au congélateur. Compter par recette
      // mettrait tout au frais et ferait périmer la moitié des barquettes.
      const posees = new Map<string, number>()
      const lots: ADresser[] = []
      for (const { recette, repartition } of decoupes) {
        for (const p of repartition.parts) {
          for (let k = 0; k < p.nombre; k++) {
            const rang = posees.get(p.userId) ?? 0
            posees.set(p.userId, rang + 1)
            lots.push({
              recipeId: recette.recipeId,
              label: recette.titre,
              nombre: 1,
              grammes: p.grammes,
              kcal: p.kcal,
              proteinG: p.proteinG,
              fiberG: p.fiberG,
              carbG: p.carbG,
              fatG: p.fatG,
              margeKcal: partDeLaMarge(recette, p.grammes, 'kcal'),
              margeProteinG: partDeLaMarge(recette, p.grammes, 'proteinG'),
              forUserId: p.userId,
              location: rang < JOURS_AU_FRAIS ? 'frigo' : 'congelateur',
            })
          }
        }
      }
      if (lots.length === 0) throw new Error('Rien à dresser.')
      /*
       * ⚠️ REPRENABLE.
       *
       * Quatre écritures en série, sans transaction. Si la distribution échoue
       * — il suffit d'une case déjà mangée dans les jours visés — le bouton
       * reste actif, l'erreur s'affiche, et la personne réappuie. Sans ce test,
       * `dresse` réinsérait la TOTALITÉ des lots : dix barquettes en devenaient
       * vingt, et la distribution s'étalait sur le double de jours.
       *
       * Le dressage n'a lieu qu'une fois par cycle. S'il a déjà eu lieu, on
       * reprend à l'étape suivante.
       */
      const { count: deja } = await supabase.from('portion')
        .select('id', { count: 'exact', head: true }).eq('cycle_id', cycle.id)
      if (!deja) await dresse.mutateAsync({ cycleId: cycle.id, lots })

      // La distribution suit immédiatement : sans elle, personne ne sait ce
      // qu'on mange ce soir (D39). Elle reste déplaçable sur l'écran Semaine.
      const fraiches = ou(await supabase.from('portion').select('*')
        .eq('cycle_id', cycle.id).in('state', ['au_frais', 'decongelee']))
      const demain = new Date()
      demain.setDate(demain.getDate() + 1)
      await distribue.mutateAsync({
        cycleId: cycle.id,
        cases: repartitionAuto(fraiches, membres ?? [], demain),
      })

      await change.mutateAsync({ id: cycle.id, vers: 'semaine' })
      va('/semaine')
    } catch (e) {
      setErreur(e)
    } finally {
      setEnCours(false)
    }
  }

  if (!cycle) return <Sombre><Vide titre="Aucune session" /></Sombre>
  if (isPending) return <Sombre><Attente /></Sombre>
  if (recettes.length === 0) {
    return (
      <Passage retour={retour}>
        <Vide titre="Rien à dresser" texte="Aucune recette n’a été cuisinée dans ce cycle." />
      </Passage>
    )
  }

  const total = decoupes.reduce(
    (s, d) => s + d.repartition.parts.reduce((n, p) => n + p.nombre, 0), 0)
  const jourDemain = new Date()
  jourDemain.setDate(jourDemain.getDate() + 1)

  return (
    <Sombre>
      <p className="text-[14px] text-safran">Dernière étape</p>
      <h1 className="titre text-[42px] mt-2.5">
        Dresse<br />{total} barquette{total > 1 ? 's' : ''}
      </h1>
      <p className="mt-3.5 text-[15px] opacity-65">
        Pèse-les : c’est la seule pesée de la semaine, et c’est elle qui rend
        tout le reste juste.
      </p>

      <div className="mt-9 space-y-8">
        {decoupes.map(({ recette, repartition }) => (
          <Lot key={recette.recipeId} recette={recette} repartition={repartition}
               nomDe={id => foyer?.membres.find(m => m.id === id)?.display_name ?? 'indifférent'} />
        ))}
      </div>

      <div className="mt-11">
        <button onClick={valide} disabled={enCours}
                className="w-full h-[58px] rounded-[18px] bg-safran text-encre
                           text-[17px] font-semibold disabled:opacity-60">
          {enCours ? 'Je range…' : 'C’est dressé, ranger'}
        </button>
        <Erreur de={erreur} />
        <p className="mt-3.5 text-[13px] opacity-55 text-center leading-relaxed">
          Les barquettes partent au frigo puis au congélateur, et se distribuent
          sur la semaine à partir de {jour(jourDemain)}. Tout reste déplaçable.
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
              pour {nomDe(p.userId)}
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

/** La marge du plat entier ramenée à une part. Nulle quand tout était pesé. */
function partDeLaMarge(r: RecetteMesuree, grammes: number, cle: 'kcal' | 'proteinG'): number | null {
  if (r.plat.grammes <= 0) return null
  const m = r.agregat.marge[cle] * (grammes / r.plat.grammes)
  return m < 1 ? null : Math.round(m * 10) / 10
}

function Sombre({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh bg-encre text-fond px-6 pt-16 pb-14">
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  )
}
