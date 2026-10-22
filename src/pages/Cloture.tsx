/**
 * La clôture d'un mois — `/cloture/AAAA-MM` (§ 3.5, D78).
 *
 * Trois étapes, et le mois est fait : les factures du mois, les dépenses au fil
 * du mois, ce qui reste. Elle ne bloque jamais : une facture sans réponse est
 * confirmée à son montant, une ligne sans réponse garde son prévu.
 *
 * On ne clôture jamais le mois en cours : ses derniers jours ont encore des
 * dépenses. Clôturer le 27 fermait octobre quatre jours trop tôt, et les
 * courses du 30 étaient refusées. La base le refuse ; la page le dit avant.
 *
 * ⚠️ Rien n'est dit ni envoyé avant d'avoir tout lu (`porteDeLaCloture`). Les clôtures
 *    d'abord : sans elles on ne sait pas si le mois est déjà clos. Puis les lignes, les
 *    saisies et les revenus : sans les saisies, chaque ligne dirait « Rien de déclaré »
 *    et l'écart « ce qui était prévu » ; sans les poches, « Clôturer » enverrait 0 € à
 *    qui voulait tout mettre de côté. Une lecture en panne se dit, avec de quoi réessayer.
 *
 * Toute la décision (la porte, l'appel, le double clic) vit dans `lib/budget/cloture.ts`,
 * où le test la fige ; la page ne fait que lire et dessiner.
 */
import { useRef, useState, type ReactNode } from 'react'
import { Attente, Erreur, dateLongue } from '../ui/coque.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  moisDe, useApercuDesSoldes, useCharges, useClotureLeMois, useClotures, useMois, usePoches,
  useRevenus, useSaisies,
} from '../lib/donnees/budget.ts'
import {
  capitale, moisVoisin, nomDuMoisDate, partDesSoldes, montant, recapCloture, revenuDuMois,
} from '../lib/budget/mois.ts'
import {
  cloreUneFois, deMois, envoiDeLaCloture, misDeCoteDuFoyer, porteDeLaCloture, rienEffectif,
  unSeulEnvoi,
} from '../lib/budget/cloture.ts'
import { messageDeLecture } from '../lib/budget/ecran.ts'
import { pocheParDefaut } from '../lib/budget/etapes.ts'
import { maintenant } from '../lib/horloge.ts'
import { EtapeDepenses } from '../ui/budget/EtapeDepenses.tsx'
import { EtapeFactures } from '../ui/budget/EtapeFactures.tsx'
import { EtapeReste, type ChoixDuReste } from '../ui/budget/EtapeReste.tsx'
import { FeuilleDeclarer } from '../ui/budget/FeuilleDeclarer.tsx'
import { RevenirDessus } from '../ui/budget/RevenirDessus.tsx'

function Etape({ n, titre, children }: { n: number; titre: string; children: ReactNode }) {
  return (
    <section aria-label={titre} className="mt-8">
      <h2 className="flex items-center gap-3">
        <span aria-hidden="true"
              className="w-[34px] h-[34px] shrink-0 rounded-full bg-encre text-safran grid place-items-center
                         titre text-[18px]">
          {n}
        </span>
        <span className="titre text-[24px]">{titre}</span>
      </h2>
      {children}
    </section>
  )
}

export function Cloture({ userId, mois, va, retour }: {
  userId: string; mois: string; va: (v: string) => void; retour: () => void
}) {
  const courant = moisDe()
  const { data: foyer } = useFoyer()
  const clotures = useClotures()
  const depenses = useMois(mois)
  const saisies = useSaisies(mois)
  const charges = useCharges()
  const revenus = useRevenus()
  const poches = usePoches()
  const cloture = useClotureLeMois()
  const garde = useRef(unSeulEnvoi()).current
  const [rien, setRien] = useState<Set<string> | null>(null)
  const [choix, setChoix] = useState<ChoixDuReste | null>(null)
  const [declarer, setDeclarer] = useState<string | null>(null)

  const revenu = revenus.data ? revenuDuMois(revenus.data, userId, mois) : null
  const { porte, fermee } = porteDeLaCloture({
    mois, courant, clotures, lectures: [depenses, saisies, revenus], revenu,
  })
  /* Les soldes d'année ne se lisent que pour un mois qu'on va clôturer. */
  const apercu = useApercuDesSoldes(mois, porte === 'a-clore')

  const lignes = depenses.data
  const dites = saisies.data
  /* Ma part des soldes : sûre seul au foyer ; à deux, la base la répartit autrement que ne le ferait
     l'écran, qui n'en annonce donc aucune (`partDesSoldes`). */
  const soldes = partDesSoldes(apercu.data ?? [], foyer?.membres.length)
  const rienEff = lignes && dites ? rienEffectif(lignes, dites, rien) : new Set<string>()
  /* Le récap attend TOUT : lignes, saisies, revenu et soldes. Calculé sur un morceau, il
     ment (« 0 € » de soldes pendant leur lecture, un faux écart sans les saisies). */
  const recap = porte === 'a-clore' && lignes && dites && apercu.data && revenu !== null
    ? recapCloture({ revenu, lignes, saisies: dites, moi: userId, factures: new Map(), rien: rienEff,
                     soldes: soldes.incertain ? null : soldes.cents })
    : null
  /* Par défaut, la poche d'urgence s'il y en a une, sinon la première (§ 3.5). */
  const leChoix: ChoixDuReste = choix ?? {
    garder: false, poche: (poches.data && pocheParDefaut(poches.data)?.id) ?? null, combien: null,
  }
  const envoi = recap && poches.data
    ? envoiDeLaCloture({ mois, reste: recap.reste, poches: poches.data, choix: leChoix, rien: rienEff,
                      incertain: recap.incertain })
    : { valide: false, appel: null }
  const panneDuReste = apercu.error ?? poches.error ?? null

  const nom = nomDuMoisDate(mois, courant)
  const laLigne = lignes?.find(l => l.id === declarer)
  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name }))
  const dansLeMois = `/budget/${mois.slice(0, 7)}`

  function basculer(chargeId: string) {
    const s = new Set(rienEff)
    if (s.has(chargeId)) s.delete(chargeId)
    else s.add(chargeId)
    setRien(s)
  }

  const clore = () => cloreUneFois({
    garde, envoi, cloturer: a => cloture.mutateAsync(a), apres: () => va(dansLeMois),
  })

  let corps: ReactNode
  if (porte === 'trop-tot') {
    corps = (
      <>
        <p className="mt-4 text-[17px] leading-snug">
          On clôture {nom} une fois fini, à partir du 1er {nomDuMoisDate(moisVoisin(mois, 1), courant)}.
        </p>
        <button onClick={retour}
                className="mt-5 min-h-11 px-5 rounded-full bg-piste text-[15px] font-semibold">
          Revenir au mois
        </button>
      </>
    )
  } else if (porte === 'chargement') {
    corps = <Attente />
  } else if (porte === 'erreur') {
    /* Rien d'autre que la panne et de quoi réessayer : « Clôturer » ou « Ajoute ton revenu »
       seraient des faits que personne n'a lus. */
    const enPanne = [clotures, depenses, saisies, revenus].filter(q => q.error)
    corps = (
      <>
        <Erreur de={new Error(messageDeLecture(enPanne[0]?.error))} />
        <button onClick={() => enPanne.forEach(q => { void q.refetch() })}
                className="mt-4 min-h-11 px-5 rounded-full bg-piste text-[15px] font-semibold">
          Réessayer
        </button>
      </>
    )
  } else if (porte === 'close' && fermee) {
    const mien = fermee.choix.find(c => c.user_profile_id === userId)
    corps = (
      <>
        <p className="mt-4 text-[17px]">
          {capitale(nom)} est clôturé le{' '}
          {new Date(fermee.cloture_le).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}.
        </p>
        {mien && mien.reste_cents !== null && (
          <p className="mt-2 text-[17px]">
            {mien.reste_cents < 0 ? 'Il te manque' : 'Il t’est resté'}{' '}
            <span className="chiffre text-[28px]">{montant(Math.abs(mien.reste_cents))}</span>
            {mien.mis_de_cote_cents > 0 && `, dont ${montant(mien.mis_de_cote_cents)} mis de côté`}.
          </p>
        )}
        <RevenirDessus mois={mois}
                       misDeCote={misDeCoteDuFoyer(fermee.choix, foyer?.membres.map(m => m.id))}
                       apres={() => va(dansLeMois)} />
      </>
    )
  } else if (porte === 'sans-revenu') {
    /* Sans revenu, un mois ne se clôture pas (§ 4.5) : de janvier à août 2026,
       Popote ne suivait pas encore le budget. */
    corps = (
      <>
        <p className="mt-4 text-[17px] leading-snug">
          Ajoute ton revenu {deMois(mois, courant)} pour clôturer {nom}.
        </p>
        <button onClick={() => va('/budget-reglages')}
                className="mt-5 min-h-11 px-5 rounded-full bg-herbe text-fond text-[15px] font-semibold">
          Revenus
        </button>
      </>
    )
  } else {
    corps = (
      <>
        <p className="mt-2 text-[17px] text-doux">Trois étapes, et le mois est fait.</p>
        <Etape n={1} titre="Les factures du mois">
          <EtapeFactures lignes={lignes} panne={depenses.error} />
        </Etape>
        <Etape n={2} titre="Tes dépenses du mois">
          <EtapeDepenses lignes={lignes} saisies={dites} rien={rienEff} basculer={basculer}
                         declarer={l => setDeclarer(l.id)} ecart={recap?.ecart ?? null}
                         panne={depenses.error ?? saisies.error} />
        </Etape>
        <Etape n={3} titre="Ce qui reste">
          <EtapeReste recap={recap} soldes={apercu.data} mois={mois} poches={poches.data}
                      choix={leChoix} changer={setChoix} panne={panneDuReste} />
          {panneDuReste && (
            <button onClick={() => { void apercu.refetch(); void poches.refetch() }}
                    className="mt-3 min-h-11 px-5 rounded-full bg-piste text-[15px] font-semibold">
              Réessayer
            </button>
          )}
        </Etape>
        <button onClick={clore} disabled={cloture.isPending || !envoi.valide}
                className="mt-8 w-full h-[56px] rounded-[18px] bg-safran text-encre text-[17px]
                           font-semibold disabled:opacity-50">
          Clôturer {nom}
        </button>
        <p className="mt-2 text-center text-[14px] text-doux">Tu pourras revenir dessus depuis le mois.</p>
        <Erreur de={cloture.error} />
      </>
    )
  }

  return (
    <main className="min-h-dvh px-4 pt-4 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour} className="inline-flex items-center gap-2 min-h-11 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Budget
        </button>
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.08em] text-doux">
          {dateLongue(maintenant())}
        </p>
        <h1 className="titre text-[40px] leading-tight mt-1">
          {porte === 'close' ? capitale(nom) : `Clôturer ${nom}`}
        </h1>
        {corps}
      </div>
      {laLigne && porte === 'a-clore' && lignes && dites && (
        <FeuilleDeclarer ligne={laLigne} mois={mois} moi={userId} foyerId={foyer?.id ?? ''}
                         saisies={dites} membres={membres} fermer={() => setDeclarer(null)}
                         categorie={(laLigne.charge_id
                           && (charges.data ?? []).find(c => c.id === laLigne.charge_id)?.categorie)
                           || 'autre'} />
      )}
    </main>
  )
}
