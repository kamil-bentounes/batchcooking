/**
 * Une jauge : herbe jusqu'au prévu, ocre au-delà. Jamais rouge — une dépense
 * n'est pas une erreur (règle de l'écran d'avant, gardée).
 */
export function Jauge({ valeur, plafond, nom, epaisse = false }: {
  valeur: number; plafond: number; nom: string; epaisse?: boolean
}) {
  const part = plafond <= 0 ? (valeur > 0 ? 1 : 0) : Math.min(1, Math.max(0, valeur / plafond))
  return (
    <div role="meter" aria-label={nom} aria-valuemin={0} aria-valuemax={plafond}
         aria-valuenow={valeur}
         className={`${epaisse ? 'h-2.5' : 'h-1.5'} rounded-full bg-piste overflow-hidden`}>
      <div className="h-full rounded-full transition-[width]"
           style={{ width: `${part * 100}%`,
                    background: valeur > plafond ? 'var(--color-ocre)' : 'var(--color-herbe)' }} />
    </div>
  )
}
