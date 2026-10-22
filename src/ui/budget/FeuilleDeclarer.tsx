/**
 * La feuille « Déclarer » (§ 3.2) : chaque dépense s'ajoute, la jauge avance
 * vers le prévu.
 *
 * Un envoi garde son identifiant pour ses renvois (coupure, double toucher), en
 * prend un neuf dès qu'il porte autre chose (autre montant, autre jour), et
 * l'oublie après un succès. Créé à l'ouverture de la feuille, l'identifiant
 * faisait d'un second montant (50 €, puis 30 €) un renvoi du premier : la base
 * répondait 23505, et 30 € étaient perdus.
 *
 * Sur un mois clôturé, la feuille est en lecture seule (lot 3).
 *
 * `VueDeclarer` est le dessin, sans état ni réseau : c'est elle que le banc rend
 * en chaîne pour lire ce que l'écran dit dans chaque état.
 */
import { useRef, useState, type ReactNode } from 'react'
import { useAjouteSaisie, useRetireSaisie, type Depense, type Saisie } from '../../lib/donnees/budget.ts'
import { prenomDe } from '../../lib/donnees/foyer.ts'
import { jourDeParis } from '../../lib/horloge.ts'
import { capitale, dateCourte, declare, joursProposes, montant, nomDuMois, prevu }
  from '../../lib/budget/mois.ts'
import { envoiPermis, envoiPour, jourAccepte, lisLeMontant, type Envoi, type MontantTape }
  from '../../lib/budget/feuilles.ts'
import { Erreur } from '../coque.tsx'
import { Feuille } from './Feuille.tsx'
import { Corbeille, Croix } from './icones.tsx'
import { Jauge } from './Jauge.tsx'
import { Photo } from './Photo.tsx'

type Membre = { id: string; display_name: string | null }
type Jours = ReturnType<typeof joursProposes>

export function VueDeclarer({
  ligne, categorie, mois, saisies, membres, jours, clos = null,
  saisi, montantTape, jour, autre, jourOk, enCours, erreur,
  tape, choisisJour, autreJour, ecrisLeJour, ajouter, retirer, fermer,
}: {
  ligne: Depense; categorie: string; mois: string; saisies: Saisie[]; membres: Membre[]
  jours: Jours
  /** Lot 3 : sur un mois clôturé, ce qu'on montre à la place de la saisie. */
  clos?: ReactNode
  saisi: string; montantTape: MontantTape; jour: string; autre: boolean; jourOk: boolean
  /** Un envoi est en vol : le bouton se désactive, pour qu'un second toucher n'en lance pas un autre. */
  enCours: boolean
  erreur: unknown
  tape: (v: string) => void; choisisJour: (date: string) => void; autreJour: () => void
  ecrisLeJour: (date: string) => void; ajouter: () => void; retirer: (id: string) => void
  fermer: () => void
}) {
  const dit = declare(ligne, saisies)
  const p = prevu(ligne)
  const siennes = saisies.filter(s => s.depense_id === ligne.id)
  const aDeux = membres.length > 1

  return (
    <Feuille fermer={fermer} titre={ligne.libelle}>
      <div className="flex items-center gap-3">
        <Photo categorie={categorie} taille={52} />
        <div className="grow min-w-0">
          <h2 className="titre text-[28px] leading-tight truncate">{ligne.libelle}</h2>
          <p className="text-[14px] text-doux">{capitale(nomDuMois(mois))} · {montant(p)} prévus</p>
        </div>
        <button onClick={fermer} aria-label="Fermer"
                className="w-11 h-11 shrink-0 rounded-full bg-piste grid place-items-center"><Croix /></button>
      </div>

      <div className="mt-4 rounded-[22px] bg-surface shadow-carte p-4">
        <p className="flex items-baseline gap-2">
          <span className="chiffre text-[40px]">{montant(dit)}</span>
          <span className="text-[15px] text-doux">sur {montant(p)}</span>
        </p>
        <div className="mt-3"><Jauge valeur={dit} plafond={p} epaisse nom={`${montant(dit)} sur ${montant(p)}`} /></div>
        <p className="mt-3 text-[15px]" style={{ color: dit > p ? 'var(--color-ocre)' : undefined }}>
          {dit > p ? `${montant(dit - p)} au-delà du prévu.`
                   : `Il reste ${montant(p - dit)} pour ${nomDuMois(mois)}.`}
        </p>
      </div>

      {clos ?? (
        <>
          <label className="mt-5 block">
            <span className="text-[15px] text-doux">Nouvelle dépense</span>
            <span className="mt-1.5 flex items-center rounded-[18px] border-2 border-herbe bg-surface px-4">
              <input value={saisi} onChange={e => tape(e.target.value)} inputMode="decimal"
                     aria-label="Nouvelle dépense"
                     className="champ-montant chiffre grow min-w-0 bg-transparent py-3 text-[32px] outline-none" />
              <span aria-hidden="true" className="chiffre text-[28px] text-doux">€</span>
            </span>
          </label>
          {montantTape.refus && (
            <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              {montantTape.refus}
            </p>
          )}

          <div role="radiogroup" aria-label="Le jour de la dépense" className="mt-3 flex flex-wrap gap-2">
            {jours.choix.map(c => (
              <button key={c.date} role="radio" aria-checked={!autre && jour === c.date}
                      onClick={() => choisisJour(c.date)}
                      className={`min-h-11 px-4 rounded-full text-[15px]
                                  ${!autre && jour === c.date ? 'bg-encre text-fond' : 'bg-piste'}`}>
                {c.libelle}
              </button>
            ))}
            <button role="radio" aria-checked={autre} onClick={autreJour}
                    className={`min-h-11 px-4 rounded-full text-[15px] ${autre ? 'bg-encre text-fond' : 'bg-piste'}`}>
              Autre jour
            </button>
          </div>
          {autre && (
            <input type="date" value={jour} min={jours.min} max={jours.max} aria-label="Le jour"
                   onChange={e => e.target.value && ecrisLeJour(e.target.value)}
                   className="mt-3 min-h-11 rounded-[14px] border border-brume bg-surface px-3 text-[16px]" />
          )}
          {/* `min` et `max` n'empêchent pas la frappe : on le dit, et le bouton reste éteint. */}
          {autre && !jourOk && (
            <p role="alert" className="mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
              Un jour entre le {dateCourte(jours.min)} et le {dateCourte(jours.max)}.
            </p>
          )}

          <button onClick={ajouter} disabled={!envoiPermis({ valide: montantTape.valide, enCours, jourOk })}
                  className="mt-4 w-full h-[56px] rounded-[18px] bg-safran text-encre text-[17px] font-semibold
                             disabled:opacity-50">
            {montantTape.valide ? `Ajouter ${montant(montantTape.cents)}` : 'Ajouter'}
          </button>
        </>
      )}
      <Erreur de={erreur} />

      {siennes.length > 0 && (
        <>
          <h3 className="mt-6 text-[13px] font-semibold uppercase tracking-[0.08em] text-doux">
            Déjà ce mois-ci
          </h3>
          <ul className="mt-2 rounded-[22px] bg-surface shadow-carte px-4 divide-y divide-brume">
            {siennes.map(s => (
              <li key={s.id} className="py-2 flex items-center gap-3 min-h-11">
                <span className="grow text-[15px]">
                  {dateCourte(s.fait_le)}
                  {/* À deux, on lit qui l'a saisie (D80 : le foyer voit tout). */}
                  {aDeux && s.saisi_par &&
                    ` · ${prenomDe(membres.find(m => m.id === s.saisi_par)?.display_name)}`}
                </span>
                <span className="text-[15px] font-semibold tabular-nums">{montant(s.montant_cents)}</span>
                {!clos && (
                  <button onClick={() => retirer(s.id)}
                          aria-label={`Retirer ${montant(s.montant_cents)} du ${dateCourte(s.fait_le)}`}
                          className="w-11 h-11 grid place-items-center text-doux"><Corbeille /></button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Feuille>
  )
}

export function FeuilleDeclarer({ ligne, categorie, mois, moi, foyerId, saisies, membres, fermer,
                                  clos = null }: {
  ligne: Depense; categorie: string; mois: string; moi: string; foyerId: string
  saisies: Saisie[]; membres: Membre[]; fermer: () => void
  /** Lot 3 : sur un mois clôturé, ce qu'on montre à la place de la saisie. */
  clos?: ReactNode
}) {
  const ajoute = useAjouteSaisie()
  const retire = useRetireSaisie()
  const jours = joursProposes(mois, jourDeParis())
  const [saisi, setSaisi] = useState('')
  const [jour, setJour] = useState(jours.choix[0].date)
  const [autre, setAutre] = useState(false)
  /* Une référence, pas un état : un second toucher qui arrive avant le rendu doit
     déjà retrouver l'identifiant du premier. */
  const envoi = useRef<Envoi | null>(null)
  /* Ce que `lisLeMontant` refuse : zéro, et plus de 1 000 000 € (la borne de la base). */
  const m = lisLeMontant(saisi, { zeroOk: false })
  const jourOk = jourAccepte(jour, jours.min, jours.max)

  function ajouter() {
    if (!m.valide || !envoiPermis({ valide: true, enCours: ajoute.isPending, jourOk })) return
    envoi.current = envoiPour(envoi.current, [ligne.id, m.cents, jour].join('|'),
                              () => crypto.randomUUID())
    ajoute.mutate({ id: envoi.current.id, foyerId, depenseId: ligne.id, faitLe: jour,
                    cents: m.cents, moi },
      { onSuccess: () => { setSaisi(''); envoi.current = null } })
  }

  return (
    <VueDeclarer ligne={ligne} categorie={categorie} mois={mois} saisies={saisies}
                 membres={membres} jours={jours} clos={clos}
                 saisi={saisi} montantTape={m} jour={jour} autre={autre} jourOk={jourOk}
                 enCours={ajoute.isPending} erreur={ajoute.error ?? retire.error}
                 tape={setSaisi}
                 choisisJour={date => { setAutre(false); setJour(date) }}
                 autreJour={() => setAutre(true)} ecrisLeJour={setJour}
                 ajouter={ajouter} retirer={id => retire.mutate(id)} fermer={fermer} />
  )
}
