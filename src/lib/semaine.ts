/**
 * La distribution des barquettes sur la semaine, et ce qu'on en a consommé.
 *
 * Pur : aucune requête. C'est ce qui suit immédiatement le dressage (D39) —
 * sans cette étape, personne ne sait ce qu'on mange ce soir.
 */

export const REPAS = ['petit_dejeuner', 'dejeuner', 'diner', 'collation'] as const
export type Repas = (typeof REPAS)[number]

export const NOM_REPAS: Record<Repas, string> = {
  petit_dejeuner: 'Petit déjeuner',
  dejeuner: 'Déjeuner',
  diner: 'Dîner',
  collation: 'Collation',
}

/**
 * Une date locale au format que Postgres attend.
 *
 * JAMAIS `toISOString().slice(0,10)` : à 23 h en France, cela rend la veille.
 * C'est exactement le genre d'erreur qui fait manquer un repas dans l'app.
 */
export function jour(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export type BarquetteRangeable = {
  id: string
  expires_at: string
  for_user_id: string | null
}

export type CaseProposee = {
  userId: string
  jour: string
  repas: Repas
  portionId: string
}

/**
 * Une proposition de répartition : chacun ses barquettes, un repas par jour,
 * les plus pressées d'abord. L'écran Semaine la laisse déplacer — c'est une
 * proposition, jamais une décision.
 */
export function repartitionAuto(
  barquettes: BarquetteRangeable[],
  membres: { id: string }[],
  depuis: Date,
  repas: Repas = 'diner',
): CaseProposee[] {
  if (membres.length === 0) return []

  const parPersonne = new Map<string, BarquetteRangeable[]>(membres.map(m => [m.id, []]))
  const libres: BarquetteRangeable[] = []

  // Les plus pressées d'abord : une barquette qui périme jeudi ne se mange pas
  // dimanche, quelle que soit la personne à qui elle revient.
  for (const b of [...barquettes].sort((x, y) => x.expires_at.localeCompare(y.expires_at))) {
    const sienne = b.for_user_id && parPersonne.has(b.for_user_id)
    if (sienne) parPersonne.get(b.for_user_id!)!.push(b)
    else libres.push(b)
  }

  // Les parts sans destinataire vont au moins servi : on ne fait pas manger
  // trois fois le même à l'un pendant que l'autre n'a rien.
  for (const b of libres) {
    const [moins] = [...parPersonne.entries()].sort((x, y) => x[1].length - y[1].length)
    moins[1].push(b)
  }

  const cases: CaseProposee[] = []
  for (const [userId, liste] of parPersonne) {
    liste.forEach((b, i) => {
      const d = new Date(depuis)
      d.setDate(d.getDate() + i)
      cases.push({ userId, jour: jour(d), repas, portionId: b.id })
    })
  }
  return cases
}

export type CaseConsommee = {
  day: string
  user_profile_id: string
  state: string
  portion: { kcal: number | string; protein_g: number | string } | null
  extras: { kcal: number | string; protein_g: number | string }[]
}

/**
 * Ce qu'une personne a consommé un jour donné, barquettes et extras confondus.
 *
 * D33 : `renseignes` et `prevus` ne sont pas décoratifs. Un repas non renseigné
 * n'est PAS un repas à zéro, et l'écran doit pouvoir faire la différence plutôt
 * que d'afficher « 900 kcal aujourd'hui » à quelqu'un qui n'a rien coché.
 */
export function bilanDuJour(cases: CaseConsommee[], userId: string, j: string) {
  const duJour = cases.filter(c => c.day === j && c.user_profile_id === userId)
  const mangees = duJour.filter(c => c.state === 'mange')
  const somme = (prendre: (c: CaseConsommee) => number) =>
    mangees.reduce((s, c) => s + prendre(c), 0)

  return {
    kcal: Math.round(somme(c =>
      Number(c.portion?.kcal ?? 0) + c.extras.reduce((s, e) => s + Number(e.kcal), 0))),
    proteinG: Math.round(somme(c =>
      Number(c.portion?.protein_g ?? 0) + c.extras.reduce((s, e) => s + Number(e.protein_g), 0))),
    renseignes: duJour.filter(c => c.state !== 'prevu').length,
    prevus: duJour.length,
  }
}
