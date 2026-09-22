/**
 * L'épargne, et les projets.
 *
 * Une chose à ne jamais perdre de vue : une épargne PERSISTE, donc elle
 * appartient à quelqu'un. Le solde affiché n'est jamais « 4 000 € » tout court
 * mais « 4 000 €, dont 2 480 toi et 1 520 elle » — un livret joint est présumé
 * moitié-moitié alors que les versements, eux, ne l'étaient pas (D64).
 *
 * Et deux poches, pas une : l'urgence et les voyages dans le même pot, ce sont
 * les voyages qui gagnent, toujours.
 */
import { useState } from 'react'
import { Surface, Vide, Attente, Erreur } from '../ui/coque.tsx'
import { Champ } from '../ui/kit.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  usePoches, useSolde, usePosePoche, useVerse, usePostes, usePosePoste,
  useRetirePoste, useMajPoche, effortMensuel, euros, enCentimes, type Poche,
} from '../lib/donnees/budget.ts'

/**
 * Les postes d'un projet, et son échéance.
 *
 * Ce qui fait qu'un projet est un projet et non une tirelire : une date, et le
 * détail de ce qu'on va payer. L'étalement, lui, n'est pas une mécanique de
 * plus — c'est l'engendrement mensuel de D61 avec une fin.
 */
function Projet({ poche, foyerId, deja }: {
  poche: Poche; foyerId: string; deja: number
}) {
  const postes = usePostes(poche.id)
  const pose = usePosePoste()
  const retire = useRetirePoste()
  const maj = useMajPoche()
  const [libelle, setLibelle] = useState('')
  const [montant, setMontant] = useState('')
  const [echeance, setEcheance] = useState(poche.echeance ?? '')

  const cents = enCentimes(montant)
  const somme = (postes.data ?? []).reduce((s, p) => s + p.montant_cents, 0)
  const effort = effortMensuel(poche.objectif_cents, poche.echeance, deja)

  return (
    <div className="mt-4 pt-4 border-t border-brume">
      <span className="text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
        Le projet
      </span>

      <div className="mt-3">
        <Champ label="Pour quand" type="date" value={echeance}
               onChange={e => {
                 setEcheance(e.target.value)
                 maj.mutate({ id: poche.id, echeance: e.target.value || null })
               }} />
      </div>

      {effort && (
        <p className="mt-2.5 text-[15px] text-doux">
          {effort.mois === 0
            ? 'C’est pour ce mois-ci.'
            : <>
                {euros(effort.parMois)} par mois pendant {effort.mois} mois pour tenir
                la date. {deja >= (poche.objectif_cents ?? 0)
                  ? 'C’est déjà atteint.' : 'Vous êtes à l’heure tant que vous versez ça.'}
              </>}
        </p>
      )}

      {(postes.data ?? []).length > 0 && (
        <div className="mt-3">
          {(postes.data ?? []).map(p => (
            <div key={p.id} className="py-2.5 flex items-baseline gap-3 border-b border-brume last:border-0">
              <span className="grow text-[15px]">{p.libelle}</span>
              <span className="chiffre text-[16px]">{euros(p.montant_cents)}</span>
              <button onClick={() => retire.mutate({ id: p.id, pocheId: poche.id })}
                      aria-label={`Retirer ${p.libelle}`}
                      className="text-doux min-h-11 px-2 text-[14px]">Retirer</button>
            </div>
          ))}
          {/* Les postes chiffrent le projet ; l'objectif reste ce qu'on a décidé
              de mettre de côté. Les deux peuvent diverger, et le dire vaut mieux
              que de corriger l'un des deux en silence. */}
          {poche.objectif_cents !== null && somme !== poche.objectif_cents && (
            <p className="mt-2.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              Les postes font {euros(somme)}, l’objectif {euros(poche.objectif_cents)}.
              <button onClick={() => maj.mutate({ id: poche.id, objectifCents: somme })}
                      className="ml-2 underline underline-offset-2">
                Aligner l’objectif
              </button>
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex gap-2 items-end">
        <div className="grow">
          <Champ label="Un poste" value={libelle} onChange={e => setLibelle(e.target.value)} />
        </div>
        <div className="w-28">
          <Champ label="€" type="text" inputMode="decimal" value={montant}
                 onChange={e => setMontant(e.target.value)} />
        </div>
        <button disabled={libelle.trim() === '' || !cents || pose.isPending}
                onClick={() => pose.mutate({
                  foyerId, pocheId: poche.id, libelle: libelle.trim(), cents: cents!,
                  ordre: (postes.data ?? []).length,
                }, { onSuccess: () => { setLibelle(''); setMontant('') } })}
                className="min-h-11 px-4 rounded-[14px] bg-brume/60 text-[15px] shrink-0
                           disabled:opacity-60">
          +
        </button>
      </div>
      <Erreur de={postes.error ?? pose.error ?? maj.error ?? retire.error} />
    </div>
  )
}

function Poche_({ poche, userId, foyerId, prenoms }: {
  poche: Poche; userId: string; foyerId: string; prenoms: Map<string, string>
}) {
  const solde = useSolde(poche.id)
  const verse = useVerse()
  const [montant, setMontant] = useState('')

  const cumul = solde.data ?? []
  const total = cumul.reduce((s, c) => s + c.cents, 0)
  const cents = enCentimes(montant)
  const part = poche.objectif_cents ? Math.min(1, total / poche.objectif_cents) : null

  return (
    <Surface className="mt-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[16px] font-semibold">{poche.libelle}</span>
        {poche.echeance && (
          <span className="text-[14px] text-doux">
            {new Date(poche.echeance).toLocaleDateString('fr-FR',
              { month: 'long', year: 'numeric' })}
          </span>
        )}
      </div>

      <p className="mt-3 flex items-baseline gap-2.5">
        <span className="chiffre text-[32px] text-herbe">{euros(total)}</span>
        {poche.objectif_cents && (
          <span className="text-[15px] text-doux">sur {euros(poche.objectif_cents)}</span>
        )}
      </p>

      {part !== null && (
        <div className="mt-3 h-[7px] rounded-full bg-brume overflow-hidden">
          <div className="h-[7px] rounded-full bg-herbe" style={{ width: `${part * 100}%` }} />
        </div>
      )}

      {/* Le cumul par personne, toujours affiché. C'est LUI la donnée, pas le
          solde : sans lui, c'est la présomption de moitié-moitié qui gagne. */}
      {cumul.length > 0 && (
        <p className="mt-3 text-[15px] text-doux">
          dont {cumul.map(c => `${euros(c.cents)} ${prenoms.get(c.userId) ?? '?'}`).join(' · ')}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <div className="grow">
          <Champ label="Verser (€)" type="text" inputMode="decimal" value={montant}
                 onChange={e => setMontant(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <button disabled={!cents || verse.isPending}
                onClick={() => verse.mutate(
                  { foyerId, pocheId: poche.id, userId, cents: cents! },
                  { onSuccess: () => setMontant('') })}
                /* Désactivé, il gardait un fond plein qui le faisait passer pour
                   actif. La bordure et le fond effacé disent mieux « pas
                   encore » qu'un aplat plus pâle. */
                className="flex-1 min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                           font-medium disabled:bg-transparent disabled:text-doux
                           disabled:border disabled:border-brume">
          Je verse
        </button>
        <button disabled={!cents || verse.isPending}
                onClick={() => {
                  if (!confirm(`Retirer ${euros(cents!)} de « ${poche.libelle} » ?`)) return
                  verse.mutate({ foyerId, pocheId: poche.id, userId, cents: -cents!,
                                 motif: 'retrait' },
                               { onSuccess: () => setMontant('') })
                }}
                /* `opacity-60` sur du `doux` tombait à 2,42:1 : un bouton
                   désactivé doit se lire, sinon on ne sait pas ce qu'on ne peut
                   pas faire. Il reste distinct par sa couleur, pas par un voile. */
                className="min-h-11 px-4 rounded-[14px] border border-brume text-[15px]
                           text-encre disabled:text-doux">
          Je retire
        </button>
      </div>
      <Erreur de={verse.error ?? solde.error} />

      {poche.genre === 'projet' && (
        <Projet poche={poche} foyerId={foyerId} deja={total} />
      )}
    </Surface>
  )
}

export function Epargne({ userId, retour }: { userId: string; retour: () => void }) {
  const { data: foyer } = useFoyer()
  const poches = usePoches()
  const pose = usePosePoche()
  const [nom, setNom] = useState('')
  const [objectif, setObjectif] = useState('')
  const [genre, setGenre] = useState<'urgence' | 'projet'>('projet')
  const [quand, setQuand] = useState('')
  const [cle, setCle] = useState<'defaut' | 'moitie' | 'prorata'>('defaut')

  const foyerId = foyer?.id ?? ''
  const prenoms = new Map((foyer?.membres ?? []).map(m => [m.id, m.display_name]))
  const cObjectif = enCentimes(objectif)

  return (
    <main className="min-h-dvh px-6 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Le mois
        </button>
        <h1 className="titre text-[34px] mt-6">L’épargne</h1>
        <p className="mt-2 text-[15px] leading-[23px] text-doux">
          Ce qui est versé appartient à qui l’a versé. Le registre le suit, parce
          qu’un livret joint est présumé moitié-moitié — et vos versements, non.
        </p>

        <Erreur de={poches.error ?? pose.error} />
        {poches.isPending ? <Attente /> : (poches.data ?? []).length === 0 ? (
          <Vide titre="Rien encore"
                texte="Commence par un fonds d’urgence : quatre mois de ce qui est nécessaire, et intouchable pour le reste." />
        ) : (
          (poches.data ?? []).map(p => (
            <Poche_ key={p.id} poche={p} userId={userId} foyerId={foyerId} prenoms={prenoms} />
          ))
        )}

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
          Ouvrir une poche
        </h2>
        <div className="mt-3 space-y-3">
          <div role="radiogroup" aria-label="Genre de poche" className="flex gap-2">
            {([['urgence', 'Fonds d’urgence'], ['projet', 'Un projet']] as const).map(([v, t]) => (
              <button key={v} role="radio" aria-checked={genre === v} onClick={() => setGenre(v)}
                      className={`flex-1 min-h-11 rounded-[12px] text-[14px] transition-colors
                        ${genre === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                {t}
              </button>
            ))}
          </div>
          <Champ label="Son nom" value={nom} onChange={e => setNom(e.target.value)} />
          <Champ label="Objectif (€)" type="text" inputMode="decimal" value={objectif}
                 onChange={e => setObjectif(e.target.value)} />
          {genre === 'projet' && (
            <>
              <Champ label="Pour quand (facultatif)" type="date" value={quand}
                     onChange={e => setQuand(e.target.value)} />
              <div>
                <span className="block text-[15px] font-semibold">Comment le financer</span>
                <div role="radiogroup" aria-label="Clé du projet" className="mt-2 flex gap-2">
                  {([['defaut', 'Comme le foyer'], ['prorata', 'Au prorata'],
                     ['moitie', 'Moitié-moitié']] as const).map(([v, nom]) => (
                    <button key={v} role="radio" aria-checked={cle === v} onClick={() => setCle(v)}
                            className={`flex-1 min-h-11 rounded-[12px] text-[13px] transition-colors
                              ${cle === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                      {nom}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-[14px] text-doux">
                  Un voyage peut être à moitié-moitié même si tout le reste est au prorata.
                </p>
              </div>
            </>
          )}
          {genre === 'urgence' && (
            <p className="text-[14px] text-doux">
              La règle habituelle : quatre mois de ce qui est nécessaire — le toit
              et les courses, pas le restaurant.
            </p>
          )}
          <button disabled={nom.trim() === '' || pose.isPending}
                  onClick={() => pose.mutate({
                    foyerId, libelle: nom.trim(), genre,
                    objectifCents: cObjectif,
                    echeance: genre === 'projet' && quand ? quand : null,
                    cle: genre === 'projet' && cle !== 'defaut' ? cle : null,
                  }, { onSuccess: () => { setNom(''); setObjectif(''); setQuand('') } })}
                  className="w-full min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                             font-medium disabled:bg-brume disabled:text-encre">
            Ouvrir
          </button>
        </div>
      </div>
    </main>
  )
}
