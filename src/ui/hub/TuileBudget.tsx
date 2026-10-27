/**
 * La tuile du budget : le chiffre du mois, ou ce qui l'attend avant l'arrivée, et la porte vers `/budget`.
 *
 * Elle ne calcule rien : le hub lui passe une `VueBudget` toute faite (les mêmes calculs que l'écran du mois). Au
 * bureau, la carte complète — le chiffre en grand, la barre charges et reste, la légende, la ligne de suite ou le
 * compte à rebours. Au téléphone, la tuile : le chiffre, une courte étiquette, la barre et une pastille.
 *
 * Chaque état se dit : chargement (« … »), panne (une alerte), pas encore arrivé, rien de posé, revenu à ajouter, le
 * reste du mois. Une barre sans sens dans un état n'est pas dessinée.
 */
import type { ReactNode } from 'react'

export type VueBudget = {
  etat: 'chargement' | 'erreur' | 'pret'
  /** La panne, dite en français (`messageDeLecture`). */
  message?: string
  /** « Ton mois type, chaque mois » : au bureau seulement, au-dessus du chiffre. */
  surtitre?: string | null
  figure?: {
    /** « Il te reste » : au bureau seulement, devant le chiffre. */
    avant?: string
    grand: string
    apres?: string
    /** Ce qui suit le chiffre au téléphone (par défaut `apres`). */
    apresTel?: string
    ton?: 'herbe' | 'ocre'
    /** Une phrase courte en titre (« Rien de posé »), pas un chiffre. */
    titre?: boolean
  }
  /** Une phrase douce, sous la figure. */
  texte?: string | null
  barre?: { charges: number; reste: number } | null
  legende?: { charges: string; reste: { libelle: string; montant: string; manque?: boolean } } | null
  /** La ligne de suite (`ligneDuHub`) : au bureau. */
  suite?: string | null
  /** Le compte à rebours jusqu'au premier mois : au bureau, le bloc sable. */
  decompte?: { jours: number; texte: ReactNode } | null
  /** La pastille du téléphone. */
  pastille?: string | null
}

export function TuileBudget({ vue, va }: { vue: VueBudget; va: (v: string) => void }) {
  const f = vue.figure
  return (
    <section aria-labelledby="t-budget" data-tuile="budget"
             className="relative rounded-[22px] bg-surface p-3.5 shadow-carte max-[899px]:order-3 min-[900px]:rounded-[26px] min-[900px]:p-[18px]">
      <div className="mb-1 flex items-center justify-between min-[900px]:mb-2">
        <h2 id="t-budget" className="titre text-[18px] font-semibold min-[900px]:text-[21px]">Le budget</h2>
        <button type="button" aria-label="Budget, ouvrir" onClick={() => va('/budget')}
                className="-my-2 -mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-[14px] px-2 text-herbe
                           after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">
          <span aria-hidden="true" className="text-[22px] leading-none text-doux min-[900px]:hidden">›</span>
          <span aria-hidden="true" className="hidden text-[15px] font-semibold min-[900px]:inline">Ouvrir</span>
        </button>
      </div>

      {vue.etat === 'chargement' && <p className="titre py-2 text-[28px] font-semibold opacity-50">…</p>}
      {vue.etat === 'erreur' && (
        <p role="alert" className="text-[15px] leading-snug text-doux">{vue.message}</p>
      )}

      {vue.etat === 'pret' && (
        <>
          {vue.surtitre && <p className="m-0 text-[15px] text-doux max-[899px]:hidden">{vue.surtitre}</p>}
          {f && (f.titre ? (
            <p className="titre mt-1 text-[22px] font-semibold leading-[1.15] min-[900px]:text-[28px]">{f.grand}</p>
          ) : (
            <p className="mt-1 flex flex-col min-[900px]:flex-row min-[900px]:flex-wrap min-[900px]:items-baseline min-[900px]:gap-2.5">
              {f.avant && <span className="text-[15px] max-[899px]:hidden">{f.avant}</span>}
              <span className={`chiffre text-[34px] font-semibold leading-none max-[360px]:text-[30px] min-[900px]:text-[48px] ${
                f.ton === 'ocre' ? 'text-ocre' : 'text-herbe'}`}>{f.grand}</span>
              {f.apres && (
                <>
                  <span className="mt-0.5 text-[13px] text-doux max-[899px]:hidden min-[900px]:mt-0 min-[900px]:text-[15px]">{f.apres}</span>
                  <span className="mt-0.5 text-[13px] text-doux min-[900px]:hidden">{f.apresTel ?? f.apres}</span>
                </>
              )}
            </p>
          ))}
          {vue.texte && <p className="mt-2 text-[14px] leading-snug text-doux min-[900px]:text-[15px]">{vue.texte}</p>}

          {vue.barre && (
            <div aria-hidden="true" data-barre="budget"
                 className="my-2.5 flex h-2 gap-0.5 overflow-hidden rounded-lg min-[900px]:mb-2.5 min-[900px]:mt-4 min-[900px]:h-3.5">
              {vue.barre.charges > 0 && <i className="bg-safran" style={{ flex: vue.barre.charges }} />}
              {vue.barre.reste > 0 && <i className="bg-herbe" style={{ flex: vue.barre.reste }} />}
            </div>
          )}
          {vue.legende && (
            <p className="flex flex-wrap justify-between gap-x-3 text-[14px] text-doux max-[899px]:hidden">
              <span><i className="mr-1.5 inline-block size-2.5 rounded-[3px] bg-safran align-[-1px]" />
                Charges <b className="font-semibold text-encre">{vue.legende.charges}</b></span>
              <span><i className={`mr-1.5 inline-block size-2.5 rounded-[3px] align-[-1px] ${vue.legende.reste.manque ? 'bg-ocre' : 'bg-herbe'}`} />
                {vue.legende.reste.libelle} <b className="font-semibold text-encre">{vue.legende.reste.montant}</b></span>
            </p>
          )}
          {vue.suite && <p className="mt-3 text-[15px] text-doux max-[899px]:hidden">{vue.suite}</p>}
          {vue.decompte && (
            <div data-decompte="budget"
                 className="mt-4 flex items-center gap-3.5 rounded-[18px] bg-sable p-3.5 max-[899px]:hidden">
              <b className="titre text-[34px] font-semibold leading-none text-ocre">{vue.decompte.jours}</b>
              <p className="text-[15px] leading-[1.3]">{vue.decompte.texte}</p>
            </div>
          )}
          {vue.pastille && (
            <span data-pastille="budget"
                  className="mt-1 inline-block rounded-[16px] bg-sable px-[9px] py-1 text-[12.5px] font-semibold text-ocre min-[900px]:hidden">
              {vue.pastille}
            </span>
          )}
        </>
      )}
    </section>
  )
}
