/**
 * La carte sombre du jour quand il n'y a pas de repas à manger : elle dit le geste du moment, comme l'accueil de
 * la cuisine (`GESTE`), avec son bouton. Aussi sa version d'attente (« … ») : le hub ne dit rien du cycle avant
 * de l'avoir lu.
 */
import type { ReactNode } from 'react'

export function CarteGeste({ entete, titre, texte, action, surAction, secondaire, surSecondaire, enCours, attente, erreur }: {
  entete: ReactNode
  titre: string
  texte?: string | null
  action: string
  surAction: () => void
  secondaire?: string | null
  surSecondaire?: () => void
  enCours?: boolean
  /** Le cycle n'est pas encore lu : « … », ni geste ni bouton. */
  attente?: boolean
  erreur?: ReactNode
}) {
  return (
    <section aria-label="Le geste du moment" data-carte="geste" aria-busy={attente || undefined}
             className="sur-encre grid gap-3 rounded-[24px] bg-encre p-3.5 text-fond min-[900px]:gap-4 min-[900px]:rounded-[28px] min-[900px]:p-[18px]">
      {entete}
      {attente ? (
        <p className="titre py-4 text-[28px] font-semibold opacity-50 min-[900px]:text-[34px]">…</p>
      ) : (
        <>
          <div>
            <h2 className="titre text-[26px] font-semibold leading-[1.1] min-[900px]:text-[34px]">{titre}</h2>
            {texte && <p className="mt-2 max-w-[36ch] text-[14.5px] text-[#B9C7BD] min-[900px]:text-[15px]">{texte}</p>}
          </div>
          <div className="grid gap-2.5">
            <button type="button" onClick={surAction} disabled={enCours}
                    className="h-12 rounded-[14px] bg-safran text-[15.5px] font-bold text-encre disabled:opacity-60 min-[900px]:h-[52px] min-[900px]:rounded-2xl min-[900px]:text-base">
              {action}
            </button>
            {secondaire && (
              <button type="button" onClick={surSecondaire} disabled={enCours}
                      className="h-12 rounded-[14px] text-[15.5px] font-semibold text-fond disabled:opacity-60 min-[900px]:h-[52px] min-[900px]:rounded-2xl min-[900px]:text-base"
                      style={{ background: 'rgba(242, 244, 239, 0.12)' }}>
                {secondaire}
              </button>
            )}
          </div>
          {erreur}
        </>
      )}
    </section>
  )
}
