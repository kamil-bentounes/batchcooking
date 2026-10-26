/**
 * Une ligne de date de la fiche : son nom, sa valeur dite en mots, et « Modifier », qui la remplace par un
 * champ (`datetime-local` ou `date`) avec « Enregistrer » et « Annuler ».
 */
import { useId, useState } from 'react'

export function LigneDate({ nom, valeur, type, initiale, max, surEnregistre, enCours }: {
  nom: string
  /** Ce qu'on lit : « dim. 25 oct. à 21 h 26 », « jeu. 29 oct., encore 3 jours ». */
  valeur: string
  type: 'datetime-local' | 'date'
  /** La valeur de départ du champ, dans la forme de `type`. */
  initiale: string
  /** La borne haute du champ, dans la forme de `type` : on ne range pas dans le futur. */
  max?: string
  /** Rend un refus à dire (« date illisible »), ou `null` : c'est pris. */
  surEnregistre: (saisie: string) => string | null
  enCours?: boolean
}) {
  const [edite, setEdite] = useState(false)
  const [refus, setRefus] = useState<string | null>(null)
  const [saisie, setSaisie] = useState(initiale)
  const id = useId()
  return (
    <div className="border-b border-piste py-2">
      <div className="flex min-h-11 items-center gap-3">
        <div className="flex-1">
          <label htmlFor={edite ? id : undefined} className="block text-[12px] text-doux">{nom}</label>
          {!edite && <div className="mt-0.5 text-[15px]">{valeur}</div>}
        </div>
        {!edite && (
          <button type="button" onClick={() => { setSaisie(initiale); setRefus(null); setEdite(true) }}
                  aria-label={`Modifier : ${nom}`}
                  className="min-h-11 px-1 text-[14px] font-semibold text-herbe underline underline-offset-[3px]">
            Modifier
          </button>
        )}
      </div>
      {edite && (
        <div className="pb-1.5">
          <input id={id} type={type} value={saisie} max={max} onChange={e => setSaisie(e.target.value)}
                 className="min-h-11 w-full rounded-xl bg-surface px-3 text-[16px] shadow-[inset_0_0_0_1px_var(--color-brume)]" />
          {refus && <p role="alert" className="mt-1.5 text-[13px] text-groseille">{refus}</p>}
          <div className="mt-2 flex gap-2.5">
            <button type="button" disabled={enCours || saisie === ''}
                    onClick={() => {
                      const r = surEnregistre(saisie)
                      if (r) setRefus(r)
                      else setEdite(false)
                    }}
                    className="min-h-11 grow rounded-[14px] bg-herbe text-[15px] font-medium text-fond disabled:opacity-60">
              Enregistrer
            </button>
            <button type="button" onClick={() => setEdite(false)}
                    className="min-h-11 grow rounded-[14px] border border-herbe text-[15px] text-herbe">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
