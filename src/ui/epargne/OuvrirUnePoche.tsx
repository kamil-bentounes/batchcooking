/** « Ouvrir une poche » : un fonds d'urgence ou un projet, son nom, son objectif, et pour un projet sa date et sa clé. */
import { useState } from 'react'
import { usePosePoche, enCentimes } from '../../lib/donnees/budget.ts'
import { ChampMontant, ChampTexte } from './Champ.tsx'
import { Information, Tirelire, Valise } from './pictos.tsx'

type Genre = 'urgence' | 'projet'
type Cle = 'defaut' | 'moitie' | 'prorata'

const GENRES: readonly [Genre, string][] = [['urgence', 'Fonds d’urgence'], ['projet', 'Un projet']]
const CLES: readonly [Cle, string][] = [
  ['defaut', 'Comme le foyer'], ['prorata', 'Au prorata'], ['moitie', 'Moitié-moitié'],
]

export function OuvrirUnePoche({ foyerId, pose }: {
  foyerId: string; pose: ReturnType<typeof usePosePoche>
}) {
  const [nom, setNom] = useState('')
  const [objectif, setObjectif] = useState('')
  const [genre, setGenre] = useState<Genre>('projet')
  const [quand, setQuand] = useState('')
  const [cle, setCle] = useState<Cle>('defaut')

  return (
    <section aria-labelledby="ouvrir-une-poche"
             className="grid content-start gap-4 rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:p-[22px]">
      <h2 id="ouvrir-une-poche" className="titre text-[20px] font-semibold">Ouvrir une poche</h2>

      <div role="radiogroup" aria-label="Genre de poche"
           className="grid grid-cols-2 gap-1 rounded-2xl bg-piste p-1">
        {GENRES.map(([v, t]) => (
          <button key={v} type="button" role="radio" aria-checked={genre === v} onClick={() => setGenre(v)}
                  className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-2
                              text-[14.5px] font-semibold leading-[1.15] transition-colors
                    ${genre === v ? 'bg-surface text-encre shadow-carte' : 'text-encre'}`}>
            {v === 'urgence' ? <Tirelire taille={18} /> : <Valise taille={18} />}
            {t}
          </button>
        ))}
      </div>

      <ChampTexte label="Son nom" value={nom} onChange={e => setNom(e.target.value)} />
      <ChampMontant label="Objectif (€)" value={objectif} onChange={e => setObjectif(e.target.value)} />

      {genre === 'projet' && (
        <>
          <ChampTexte label="Pour quand" petit="(facultatif)" type="date" value={quand}
                      onChange={e => setQuand(e.target.value)} />
          <div>
            <span className="mb-2 block text-[15px] font-semibold">Comment le financer</span>
            <div role="radiogroup" aria-label="Clé du projet" className="grid grid-cols-3 gap-1.5">
              {CLES.map(([v, t]) => (
                <button key={v} type="button" role="radio" aria-checked={cle === v} onClick={() => setCle(v)}
                        className={`min-h-11 rounded-[14px] px-1 py-1.5 text-center text-[14.5px] font-medium
                                    leading-[1.2] transition-colors max-[360px]:text-[13px]
                          ${cle === v ? 'bg-encre text-surface'
                                      : 'bg-surface shadow-[inset_0_0_0_1.5px_var(--color-brume)]'}`}>
                  {t}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[14px] leading-[1.4] text-doux">
              Un voyage peut être à moitié-moitié même si tout le reste est au prorata.
            </p>
          </div>
        </>
      )}
      {genre === 'urgence' && (
        <p className="flex items-start gap-3 rounded-2xl bg-sable px-3.5 py-3 text-[14.5px] leading-[1.4]">
          <span className="mt-px text-ocre"><Information /></span>
          <span>
            La règle habituelle : quatre mois de ce qui est nécessaire, le toit et les courses, pas le
            restaurant.
          </span>
        </p>
      )}

      <button type="button" disabled={nom.trim() === '' || pose.isPending}
              onClick={() => pose.mutate({
                foyerId, libelle: nom.trim(), genre,
                objectifCents: enCentimes(objectif),
                echeance: genre === 'projet' && quand ? quand : null,
                cle: genre === 'projet' && cle !== 'defaut' ? cle : null,
              }, { onSuccess: () => { setNom(''); setObjectif(''); setQuand('') } })}
              className="min-h-[54px] w-full rounded-[18px] bg-herbe text-[17px] font-semibold text-fond
                         disabled:bg-brume disabled:text-encre">
        Ouvrir
      </button>
    </section>
  )
}
