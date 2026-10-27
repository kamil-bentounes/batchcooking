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
import { Erreur } from '../ui/coque.tsx'
import { Ampoule } from '../ui/charges/icones.tsx'
import { FILET } from '../ui/charges/Choix.tsx'
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
      <button type="button" onClick={relire} disabled={encours}
              className="w-full min-h-[54px] rounded-[18px] bg-surface shadow-[inset_0_0_0_1.5px_var(--color-herbe)]
                         text-herbe text-[17px] font-semibold inline-flex items-center justify-center gap-2
                         disabled:text-doux disabled:shadow-[inset_0_0_0_1.5px_var(--color-brume)]">
        <Ampoule />{encours ? 'Je relis…' : 'Vérifier mes charges'}
      </button>
      <Erreur de={err} />

      {revue && (
        <section aria-label="Ce que la relecture a trouvé" className="rounded-[24px] bg-surface p-4 shadow-carte">
          <h2 className="titre text-[20px] font-semibold">Vérifier mes charges</h2>
          <p className="mt-2.5 text-[15px] leading-[22px]">{revue.verdict}</p>

          {revue.doublons.length > 0 && (
            <div>
              <p className="mt-3.5 text-[14px] font-semibold text-doux">Deux fois la même chose</p>
              {revue.doublons.map((d, i) => (
                <div key={i} className="mt-1">
                  <p className="text-[15px] font-semibold">{d.libelles.join(' · ')}</p>
                  <p className="mt-1 text-[15px] leading-[22px] text-doux">{d.pourquoi}</p>
                </div>
              ))}
            </div>
          )}

          {revue.incoherences.length > 0 && (
            <div>
              <p className="mt-3.5 text-[14px] font-semibold text-doux">À vérifier</p>
              {revue.incoherences.map((x, i) => (
                <div key={i} className="mt-1">
                  <p className="text-[15px] font-semibold">{x.libelle}</p>
                  <p className="mt-1 text-[15px] leading-[22px] text-doux">{x.quoi}</p>
                  {/* La question en ocre : c'est elle qu'on doit trancher, pas le constat qui la précède. */}
                  <p className="mt-1 text-[15px] leading-[22px] text-ocre">{x.question}</p>
                </div>
              ))}
            </div>
          )}

          {revue.oublis.length > 0 && (
            <div>
              <p className="mt-3.5 text-[14px] font-semibold text-doux">Tu n’en as pas parlé</p>
              {/* Des BOUTONS, pas une liste : le libellé vient du catalogue, il ouvre donc le formulaire d'ajout
                  pré-rempli. Une liste de noms laisserait tout le travail à faire. */}
              {/* ⚠️ NOMMÉ. Ces pastilles portent les mêmes libellés que le catalogue en bas de l'écran —
                  « Forfait mobile » y existe deux fois. Sans ce groupe nommé, ni une synthèse vocale ni un banc
                  ne peuvent dire de laquelle on parle. */}
              <div role="group" aria-label="Postes dont tu n’as pas parlé" className="mt-2 flex gap-2 flex-wrap">
                {revue.oublis.map(o => (
                  <button key={o} type="button" onClick={() => surOubli(o)}
                          className={`min-h-11 px-4 rounded-full text-[14.5px] font-medium inline-flex items-center ${FILET}`}>
                    {o}
                  </button>
                ))}
              </div>
            </div>
          )}

          {rienTrouve && (
            <p className="mt-3 text-[15px] leading-[22px] text-doux">
              Ni doublon, ni montant qui détonne, ni poste courant qui manque.
            </p>
          )}

          {typeof revue.restantes === 'number' && (
            <p className="mt-3.5 text-[13.5px] text-doux">
              {revue.restantes} relecture{revue.restantes > 1 ? 's' : ''} ce mois-ci.
            </p>
          )}
        </section>
      )}
    </>
  )
}
