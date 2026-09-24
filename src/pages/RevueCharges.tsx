/**
 * « Vérifie mes charges ».
 *
 * La dictée remplit, la revue RELIT. Ce sont deux moments : on dicte une fois,
 * on se relit chaque fois qu'on a touché quelque chose — un montant corrigé,
 * une charge ajoutée à la main, une ligne reprise de l'autre.
 *
 * Elle ne corrige RIEN. Elle dit ce qui cloche et pose la question ; les gestes
 * de correction sont ceux qui existaient déjà, sur la ligne concernée. Un écran
 * qui corrigerait tout seul serait un écran qu'on n'ose plus lancer.
 *
 * ⚠️ Le type est recopié de `supabase/functions/revue-charges/prompt.ts`, comme
 *    `Dictee` recopie `Proposee` : le navigateur ne peut pas importer du Deno.
 *    Ce qui ne se recopie PAS, c'est le prompt et le schéma — eux vivent d'un
 *    seul côté, et le banc d'essai les importe de là.
 */
import { useState } from 'react'
import { Surface, Erreur } from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'

type Revue = {
  doublons: { libelles: string[]; pourquoi: string }[]
  incoherences: { libelle: string; quoi: string; question: string }[]
  oublis: string[]
  verdict: string
  restantes?: number
}

export function RevueCharges({ surOubli }: { surOubli: (libelle: string) => void }) {
  const [encours, setEncours] = useState(false)
  const [revue, setRevue] = useState<Revue | null>(null)
  const [err, setErr] = useState<Error | null>(null)

  async function relire() {
    setEncours(true); setErr(null); setRevue(null)
    try {
      setRevue(await callFunction<Revue>('revue-charges', {}))
    } catch (e) {
      setErr(e as Error)
    } finally {
      setEncours(false)
    }
  }

  /* Rien trouvé n'est pas rien à dire : sans cette ligne, l'écran répond à un
     clic par le silence, et on reclique. */
  const rienTrouve = revue
    && revue.doublons.length === 0
    && revue.incoherences.length === 0
    && revue.oublis.length === 0

  return (
    <>
      <button onClick={relire} disabled={encours}
              className="mt-4 w-full min-h-11 rounded-[14px] border border-brume
                         text-[15px] disabled:text-doux">
        {encours ? 'Je relis…' : 'Vérifier mes charges'}
      </button>
      <Erreur de={err} />

      {revue && (
        <Surface className="mt-4">
          <p className="text-[15px] leading-[23px]">{revue.verdict}</p>

          {revue.doublons.length > 0 && (
            <div className="mt-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
                Deux fois la même chose
              </p>
              {revue.doublons.map((d, i) => (
                <div key={i} className="mt-3">
                  <p className="text-[16px]">{d.libelles.join(' · ')}</p>
                  <p className="mt-1 text-[15px] leading-[23px] text-doux">{d.pourquoi}</p>
                </div>
              ))}
            </div>
          )}

          {revue.incoherences.length > 0 && (
            <div className="mt-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
                À vérifier
              </p>
              {revue.incoherences.map((x, i) => (
                <div key={i} className="mt-3">
                  <p className="text-[16px]">{x.libelle}</p>
                  <p className="mt-1 text-[15px] leading-[23px] text-doux">{x.quoi}</p>
                  {/* La question en ocre : c'est elle qu'on doit trancher, pas
                      le constat qui la précède. */}
                  <p className="mt-1 text-[15px] leading-[23px]"
                     style={{ color: 'var(--color-ocre)' }}>{x.question}</p>
                </div>
              ))}
            </div>
          )}

          {revue.oublis.length > 0 && (
            <div className="mt-5">
              <p className="text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
                Tu n’en as pas parlé
              </p>
              {/* Des BOUTONS, pas une liste : le libellé vient du catalogue, il
                  ouvre donc le formulaire d'ajout pré-rempli. Une liste de noms
                  laisserait tout le travail à faire. */}
              {/* ⚠️ NOMMÉ. Ces pastilles portent les mêmes libellés que le
                  catalogue en bas de l'écran — « Forfait mobile » y existe
                  deux fois. Sans ce groupe nommé, ni une synthèse vocale ni un
                  banc ne peuvent dire de laquelle on parle. */}
              <div role="group" aria-label="Postes dont tu n’as pas parlé"
                   className="mt-3 flex gap-2 flex-wrap">
                {revue.oublis.map(o => (
                  <button key={o} onClick={() => surOubli(o)}
                          className="px-3.5 min-h-11 inline-flex items-center rounded-full
                                     border border-brume text-[14px]">
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rienTrouve && (
            <p className="mt-3 text-[15px] leading-[23px] text-doux">
              Ni doublon, ni montant qui détonne, ni poste courant qui manque.
            </p>
          )}

          {typeof revue.restantes === 'number' && (
            <p className="mt-5 text-[14px] text-doux">
              {revue.restantes} relecture{revue.restantes > 1 ? 's' : ''} ce mois-ci.
            </p>
          )}
        </Surface>
      )}
    </>
  )
}
