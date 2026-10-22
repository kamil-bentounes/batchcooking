/**
 * La place des libellés de gestes dans la frise du plan.
 *
 * Chaque geste était posé à `début × échelle` : à deux cuisiniers, sept gestes commencent à la
 * minute 0 et d'autres suivent à quelques minutes d'écart — leurs libellés (deux lignes de
 * texte, 46 px) s'écrasaient les uns sur les autres, et le plan d'une vraie session (cinq
 * recettes) était illisible. On garde la minute quand il y a la place, et sinon on pousse
 * le libellé sous le précédent : l'ORDRE du temps est toujours juste, l'échelle l'est tant
 * que les gestes sont espacés.
 */
export function placeEtiquettes(
  taches: { id: string; debutMin: number }[], echelle: number, hauteurEtiquette: number,
): { tops: Map<string, number>; hauteur: number } {
  const tops = new Map<string, number>()
  let bas = -Infinity
  let hauteur = 0
  for (const t of [...taches].sort((a, b) => a.debutMin - b.debutMin)) {
    const top = Math.max(t.debutMin * echelle - 2, bas)
    tops.set(t.id, top)
    bas = top + hauteurEtiquette
    hauteur = bas
  }
  return { tops, hauteur }
}
