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
  usePoches, useSolde, usePosePoche, useVerse, euros, enCentimes, type Poche,
} from '../lib/donnees/budget.ts'

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
                className="flex-1 min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                           font-medium disabled:bg-brume disabled:text-encre">
          Je verse
        </button>
        <button disabled={!cents || verse.isPending}
                onClick={() => {
                  if (!confirm(`Retirer ${euros(cents!)} de « ${poche.libelle} » ?`)) return
                  verse.mutate({ foyerId, pocheId: poche.id, userId, cents: -cents!,
                                 motif: 'retrait' },
                               { onSuccess: () => setMontant('') })
                }}
                className="min-h-11 px-4 rounded-[14px] border border-brume text-[15px]
                           text-doux disabled:opacity-60">
          Je retire
        </button>
      </div>
      <Erreur de={verse.error ?? solde.error} />
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
          {genre === 'urgence' && (
            <p className="text-[14px] text-doux">
              La règle habituelle : quatre mois de ce qui est nécessaire — le toit
              et les courses, pas le restaurant.
            </p>
          )}
          <button disabled={nom.trim() === '' || pose.isPending}
                  onClick={() => pose.mutate({
                    foyerId, libelle: nom.trim(), genre,
                    objectifCents: cObjectif, echeance: null, cle: null,
                  }, { onSuccess: () => { setNom(''); setObjectif('') } })}
                  className="w-full min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                             font-medium disabled:bg-brume disabled:text-encre">
            Ouvrir
          </button>
        </div>
      </div>
    </main>
  )
}
