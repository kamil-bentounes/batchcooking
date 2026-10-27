/**
 * « Ta journée » : où j'en suis aujourd'hui, en calories et en protéines, contre mes objectifs du jour.
 *
 * Le même calcul que l'accueil de la cuisine et le bilan (`bilanDuJour`) : les barquettes mangées, ce qui est noté
 * « en plus », et un « autre chose » une fois mangé. Un repas pas encore noté n'est pas un repas à zéro : la tuile
 * le dit (D33). Sans objectifs, les chiffres restent, et la tuile mène à « Objectifs ».
 *
 * La tuile entière se touche et ouvre le bilan : un seul bouton, étendu sur elle, comme la tuile du frigo.
 */
const nombre = (n: number) => n.toLocaleString('fr-FR')

/** `n` vaut `null` tant que la semaine n'est pas lue : « … », et pas de barre. */
function Ligne({ n, unite, cible, barre }: { n: number | null; unite: string; cible: number | null; barre: string }) {
  const part = n !== null && cible ? Math.min(100, (n / cible) * 100) : 0
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-1.5">
        <b className="chiffre text-[26px] font-semibold leading-none min-[900px]:text-[30px]">{n === null ? '…' : nombre(n)}</b>
        <span className="text-[14px] text-doux">
          {unite}{cible ? `, sur ${nombre(cible)}` : ''}
        </span>
      </p>
      {n !== null && cible ? (
        <div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-brume">
          <div className={`h-1.5 rounded-full ${barre} transition-[width] duration-500 motion-reduce:transition-none`}
               style={{ width: `${part}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export function TuileJournee({ kcal, proteinG, objectif, manquent, chargement, va }: {
  kcal: number; proteinG: number
  /** Mes objectifs du jour ; `null` s'ils ne sont pas fixés. */
  objectif: { kcal: number; proteinG: number } | null
  /** Repas d'aujourd'hui pas encore notés. */
  manquent: number
  chargement: boolean
  va: (v: string) => void
}) {
  return (
    <section aria-labelledby="t-journee" data-tuile="journee"
             className="relative mt-2.5 rounded-[22px] bg-surface p-3.5 shadow-carte min-[900px]:mt-5 min-[900px]:rounded-[26px] min-[900px]:p-[18px]">
      <div className="mb-2 flex items-center justify-between min-[900px]:mb-3">
        <h2 id="t-journee" className="titre text-[18px] font-semibold min-[900px]:text-[21px]">Ta journée</h2>
        <button type="button" aria-label="Ouvrir le bilan" onClick={() => va('/bilan')}
                className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[14px] px-2 text-herbe
                           after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">
          <span aria-hidden="true" className="text-[22px] leading-none text-doux min-[900px]:hidden">›</span>
          <span aria-hidden="true" className="hidden text-[15px] font-semibold min-[900px]:inline">Le bilan</span>
        </button>
      </div>
      <div className="grid gap-3 min-[600px]:grid-cols-2 min-[600px]:gap-5">
        <Ligne n={chargement ? null : kcal} unite="kcal" cible={objectif?.kcal ?? null} barre="bg-herbe" />
        <Ligne n={chargement ? null : proteinG} unite="g de protéines" cible={objectif?.proteinG ?? null}
               barre="bg-safran" />
      </div>
      {!chargement && manquent > 0 && (
        <p className="mt-2.5 text-[14px] text-doux">
          {manquent} repas pas encore noté{manquent > 1 ? 's' : ''} aujourd’hui.
        </p>
      )}
      {!chargement && !objectif && (
        /* Au-dessus du bouton étendu : ce lien-là mène ailleurs. */
        <button type="button" onClick={() => va('/objectifs')}
                className="relative z-10 mt-2 min-h-11 text-[14px] font-semibold text-herbe underline underline-offset-2">
          Fixe tes objectifs pour voir où tu en es
        </button>
      )}
    </section>
  )
}
