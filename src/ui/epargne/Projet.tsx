/**
 * Les postes d'un projet, et son échéance.
 *
 * Ce qui fait qu'un projet est un projet et non une tirelire : une date, et le détail de ce qu'on va payer.
 * L'étalement, lui, n'est pas une mécanique de plus — c'est l'engendrement mensuel de D61 avec une fin.
 */
import { useState } from 'react'
import { Erreur } from '../coque.tsx'
import { montant } from '../../lib/budget/mois.ts'
import {
  usePostes, usePosePoste, useRetirePoste, useMajPoche, effortMensuel, enCentimes, type Poche,
} from '../../lib/donnees/budget.ts'
import { ChampMontant, ChampTexte } from './Champ.tsx'
import { Cible, Plus } from './pictos.tsx'

export function Projet({ poche, foyerId, deja }: {
  /** `null` : le solde n'est pas lu — on ne dit rien de chiffré sur ce qu'il y a dessus. */
  poche: Poche; foyerId: string; deja: number | null
}) {
  const postes = usePostes(poche.id)
  const pose = usePosePoste()
  const retire = useRetirePoste()
  const maj = useMajPoche()
  const [libelle, setLibelle] = useState('')
  const [saisi, setSaisi] = useState('')
  const [echeance, setEcheance] = useState(poche.echeance ?? '')

  const cents = enCentimes(saisi)
  const liste = postes.data ?? []
  const somme = liste.reduce((s, p) => s + p.montant_cents, 0)
  const effort = effortMensuel(poche.objectif_cents, poche.echeance, deja ?? 0)

  /* Une poche vide le dit déjà plus haut, dans sa carte (« Rien n'y est encore versé ») : on ne le répète pas ici.
     ⚠️ Une CONDITION déguisée en constat : « Vous êtes à l'heure tant que vous versez ça » s'affichait sur une
     poche où rien n'avait encore été versé, et c'est la seule chose que l'œil retient. On dit où on en est. */
  const atteint = deja !== null && deja >= (poche.objectif_cents ?? 0)
  const ouEnEst = deja === null || atteint ? ''
    : deja === 0 ? ''
    : `Il y a ${montant(deja)} dessus pour l’instant.`

  return (
    <div className="grid gap-3 pt-3.5 border-t border-brume">
      <span className="flex items-center gap-2 text-[14px] font-semibold text-doux">
        <Cible />
        Le projet
      </span>

      <ChampTexte label="Pour quand" type="date" value={echeance}
                  onChange={e => {
                    setEcheance(e.target.value)
                    maj.mutate({ id: poche.id, echeance: e.target.value || null })
                  }} />

      {/* Déjà atteint : plus rien à étaler, on ne montre pas « 0 € par mois pendant N mois ». */}
      {effort && atteint && (
        <p className="rounded-[18px] bg-sable px-3.5 py-3 text-[14.5px] leading-[1.35]">C’est déjà atteint.</p>
      )}
      {effort && !atteint && (
        effort.mois === 0
          ? <p className="rounded-[18px] bg-sable px-3.5 py-3 text-[14.5px] leading-[1.35]">
              C’est pour ce mois-ci.
            </p>
          : <p className="flex items-center gap-3 rounded-[18px] bg-sable px-3.5 py-3 text-[14.5px] leading-[1.35]">
              <b className="titre text-[30px] font-semibold text-ocre whitespace-nowrap">
                {montant(effort.parMois)}
              </b>
              <span>
                par mois pendant {effort.mois} mois pour tenir la date. {ouEnEst}
              </span>
            </p>
      )}

      {liste.length > 0 && (
        <ul className="grid" aria-label="Les postes du projet">
          {liste.map(p => (
            <li key={p.id} className="flex items-center gap-3 min-h-[52px] border-t border-brume first:border-0">
              <span className="grow min-w-0 break-words text-[15.5px]">{p.libelle}</span>
              <span className="titre text-[18px] font-semibold whitespace-nowrap">{montant(p.montant_cents)}</span>
              <button type="button" onClick={() => retire.mutate({ id: p.id, pocheId: poche.id })}
                      aria-label={`Retirer ${p.libelle}`}
                      className="min-h-11 min-w-11 px-1.5 text-[15px] font-semibold text-doux">
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Les postes chiffrent le projet ; l'objectif reste ce qu'on a décidé de mettre de côté. Les deux
          peuvent diverger, et le dire vaut mieux que de corriger l'un des deux en silence. */}
      {liste.length > 0 && poche.objectif_cents !== null && somme !== poche.objectif_cents && (
        <p className="text-[14px] text-ocre">
          Les postes font {montant(somme)}, l’objectif {montant(poche.objectif_cents)}.
          <button type="button" onClick={() => maj.mutate({ id: poche.id, objectifCents: somme })}
                  className="ml-2 min-h-11 underline underline-offset-2 font-semibold">
            Aligner l’objectif
          </button>
        </p>
      )}

      <div className="grid grid-cols-[1fr_132px_48px] max-[360px]:grid-cols-[1fr_48px] gap-2 items-end">
        <div className="max-[360px]:col-span-2 min-w-0">
          <ChampTexte label="Un poste" value={libelle} onChange={e => setLibelle(e.target.value)} />
        </div>
        <ChampMontant label="€" etiquette="Montant du poste (€)" unite={false}
                      value={saisi} onChange={e => setSaisi(e.target.value)} />
        <button type="button" disabled={libelle.trim() === '' || !cents || pose.isPending}
                aria-label="Ajouter ce poste"
                onClick={() => pose.mutate({
                  foyerId, pocheId: poche.id, libelle: libelle.trim(), cents: cents!,
                  ordre: liste.length,
                }, { onSuccess: () => { setLibelle(''); setSaisi('') } })}
                className="min-h-12 rounded-[14px] bg-piste grid place-items-center text-encre
                           disabled:text-doux">
          <Plus />
        </button>
      </div>
      <Erreur de={postes.error ?? pose.error ?? maj.error ?? retire.error} />
    </div>
  )
}
