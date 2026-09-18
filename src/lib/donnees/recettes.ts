/**
 * Les macros des recettes choisies, avec leur incertitude (D18).
 *
 * C'est ce qui permet au dressage de dire « 340 g pour toi, 290 g pour elle »
 * plutôt que de couper en parts égales et d'espérer.
 */
import { useQuery } from '@tanstack/react-query'
import { ou, supabase } from '../supabase.ts'
import { agrege, pour100De } from '../nutrition/macros.ts'
import type { Agregat } from '../nutrition/macros.ts'
import type { Plat } from '../nutrition/portions.ts'

export type RecetteMesuree = {
  recipeId: string
  titre: string
  parts: number
  /** Masse totale du plat, somme des ingrédients pesés. */
  plat: Plat
  agregat: Agregat
  /** Vrai quand assez de lignes sont résolues pour montrer un chiffre. */
  fiable: boolean
}

type LigneBrute = {
  recipe_id: string
  grams_reference: number | null
  qty: number | null
  food: { nutrients: unknown; ciqual_subgroup: string | null } | null
}

export function useRecettesMesurees(cycleId: string | undefined) {
  return useQuery({
    queryKey: ['recettes-mesurees', cycleId],
    enabled: !!cycleId,
    queryFn: async (): Promise<RecetteMesuree[]> => {
      const choisies = ou(await supabase.from('cycle_recipe')
        .select('recipe_id, servings, recipe:recipe_id(title)')
        .eq('cycle_id', cycleId!).order('position')) as unknown as {
          recipe_id: string; servings: number; recipe: { title: string | null } | null
        }[]
      if (choisies.length === 0) return []

      const ids = choisies.map(c => c.recipe_id)
      const [lignes, typiques] = await Promise.all([
        supabase.from('recipe_ingredient')
          .select('recipe_id, grams_reference, qty, food:food_id(nutrients, ciqual_subgroup)')
          .in('recipe_id', ids),
        supabase.from('typical_quantity').select('ciqual_subgroup, grams'),
      ])

      const repli = new Map(ou(typiques).map(t => [t.ciqual_subgroup, Number(t.grams)]))

      return choisies.map(c => {
        const siennes = (ou(lignes) as unknown as LigneBrute[])
          .filter(l => l.recipe_id === c.recipe_id)

        const pretes = siennes.map(l => ({
          grammes: l.grams_reference === null ? null : Number(l.grams_reference),
          grammesTypiques: l.food?.ciqual_subgroup
            ? repli.get(l.food.ciqual_subgroup) ?? null
            : null,
          pour100: pour100De(l.food?.nutrients),
        }))

        const a = agrege(pretes)
        const grammes = pretes.reduce(
          (s, l) => s + (l.pour100 ? (l.grammes ?? l.grammesTypiques ?? 0) : 0), 0)

        return {
          recipeId: c.recipe_id,
          titre: c.recipe?.title ?? 'Recette',
          parts: c.servings,
          plat: { grammes, ...a.valeur },
          agregat: a,
          // On ne dresse pas des barquettes dont on ne sait rien : sous le seuil,
          // l'écran propose des parts égales et le dit franchement.
          fiable: a.couverture >= 0.75 && grammes > 0,
        }
      })
    },
  })
}
