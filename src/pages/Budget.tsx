/**
 * Le budget : le mois (§ 3.1 ; direction A, « Potager »).
 *
 * L'écran ouvre sur ce qui reste, puis les charges par catégorie (D74). Chaque
 * ligne se règle d'un geste, selon sa façon — celle de la LIGNE, figée à sa
 * naissance (§ 4.1), jamais celle de la charge.
 *
 * La base porte l'argent, `mois.ts` le lit et le montre. Le seul chiffre que
 * l'écran recompte avant elle est le montant d'une ligne au fil du mois tant
 * que le mois est ouvert : le plus grand du prévu et du déclaré (§ 3.1.1).
 *
 * L'ouverture du mois est paresseuse — il n'y a pas de tâche planifiée — et
 * c'est `useMois` qui la déclenche : on n'y ouvre jamais un mois futur, et on y
 * rattrape tous les mois manquants (voir ses commentaires).
 *
 * ⚠️ AUCUN chiffre avant d'avoir TOUT lu (`etatDeLEcran`). Le mois tient en six
 *    lectures ; l'écran n'en attendait que deux (lignes, charges). Les revenus
 *    pas encore revenus faisaient dire « Ajoute ton revenu » à qui l'avait posé,
 *    les saisies manquantes comptaient le prévu, les clôtures manquantes
 *    recomptaient un mois clos comme un mois ouvert. Et une lecture en ÉCHEC,
 *    `isPending` faux et données vides, se lisait « Rien de posé ».
 */
import { useEffect, useState } from 'react'
import { Attente, Erreur, Marque, Vide } from '../ui/coque.tsx'
import { etatDeLEcran, messageDeLecture, videDuMois } from '../lib/budget/ecran.ts'
import { initialeDe, prenomDe, useFoyer } from '../lib/donnees/foyer.ts'
import {
  moisDe, useCharges, useClotures, useComptes, useMois, useNonSoldees, useRevenus, useSaisies,
} from '../lib/donnees/budget.ts'
import {
  bandeau, barre, capitale, clotureSansMoi, estLaCeMois, joursRestants, membresSansRevenu, moisDemande, moisVoisin,
  nomDuMois, parCategorie, resteDuMois, revenuDuMois, totauxDuFiltre, type Filtre,
} from '../lib/budget/mois.ts'
import { choixAFermer, clotureParLesAutres, misDeCoteDuFoyer } from '../lib/budget/cloture.ts'
import { jourDeParis } from '../lib/horloge.ts'
import { Bandeau } from '../ui/budget/Bandeau.tsx'
import { CarteEpargne } from '../ui/budget/CarteEpargne.tsx'
import { Categorie } from '../ui/budget/Categorie.tsx'
import { FeuillesDuMois, type Ouverte } from '../ui/budget/FeuillesDuMois.tsx'
import { FiltreDuMois } from '../ui/budget/Filtre.tsx'
import { Gestes } from '../ui/budget/Gestes.tsx'
import { Recap } from '../ui/budget/Recap.tsx'
import { TableauDeBord } from '../ui/budget/MoisType.tsx'
import { BoutonAide } from '../ui/Aide.tsx'

export function Budget({ userId, va, remplace, mois: depart, ouverteAuDepart = null }: {
  userId: string; va: (v: string) => void
  /** Quitte une adresse fausse (`/budget/2030-05`) sans la laisser dans l'historique. */
  remplace?: (v: string) => void
  /** `/budget/AAAA-MM` : le mois qu'on vient de clôturer, ou de rouvrir. */
  mois?: string
  /** Pour le banc : le rendu en chaîne ne touche rien, il lui faut une feuille déjà ouverte
      pour voir ce que l'écran en fait sur un mois clôturé. */
  ouverteAuDepart?: Ouverte
}) {
  const courant = moisDe()
  /* Jamais au-delà du mois courant, même par l'adresse (`moisDemande`) : l'ouvrir créerait ses
     lignes avec la clé du jour, figée. Un mois à venir quitte son adresse pour `/budget` : sans
     cela, le mois courant s'affichait sous « /budget/2030-05 ». Un mois qui n'existe pas
     (`2026-13`) retombe sur le courant, au lieu de requêter la base avec une date fausse. */
  const demande = moisDemande(depart, courant)
  const [mois, setMois] = useState(demande.mois)
  useEffect(() => { if (demande.futur) remplace?.('/budget') }, [demande.futur, remplace])
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [ouverte, setOuverte] = useState<Ouverte>(ouverteAuDepart)
  const lecteurFoyer = useFoyer()
  const foyer = lecteurFoyer.data
  const depenses = useMois(mois)
  const saisies = useSaisies(mois)
  const charges = useCharges()
  const revenus = useRevenus()
  const lecteurComptes = useComptes()
  const clotures = useClotures()

  /* Ce qu'il faut avoir lu avant de montrer un chiffre. Les comptes n'en sont pas :
     ils ne décident que de la porte d'un mois vide, et leur panne ne doit pas
     cacher le mois. */
  const requises = [lecteurFoyer, depenses, saisies, charges, revenus, clotures]
  const etat = etatDeLEcran(requises)
  const enPanne = requises.find(q => q.error)
  const nComptes = lecteurComptes.data ? lecteurComptes.data.length : null

  const lignes = depenses.data ?? []
  const dites = saisies.data ?? []
  const parCharge = new Map((charges.data ?? []).map(c => [c.id, c]))
  /* Un mois clôturé se lit tel que la clôture l'a laissé : ses montants en base,
     plus de « max(prévu, déclaré) » (§ 3.1.1). */
  const estClos = (m: string) => (clotures.data ?? []).some(k => k.mois === m)
  const clos = estClos(mois)
  /* Le chiffre d'un mois clôturé vient de la clôture : `cloture_choix.reste_cents`,
     celui du jour où on l'a fermé (§ 3.1.1). */
  const cetteCloture = (clotures.data ?? []).find(k => k.mois === mois)
  const monChoix = cetteCloture?.choix.find(c => c.user_profile_id === userId)
  const misDeCote = monChoix?.mis_de_cote_cents ?? 0
  /* Clôturé par un AUTRE : je n'ai aucun `cloture_choix`, mais les lignes d'un mois clos sont
     gelées — mon reste calculé est stable. On le montre, et on dit qui a clôturé. */
  const parQui = clos ? clotureParLesAutres(cetteCloture?.choix ?? [], userId, foyer?.membres) : null
  /* « Revenir dessus » rouvre pour tout le foyer : c'est ce total qu'il annonce. */
  const misDeCoteFoyer = misDeCoteDuFoyer(cetteCloture?.choix ?? [], foyer?.membres.map(m => m.id))
  const nonSoldees = useNonSoldees(mois)
  /* Rien tant que les clôtures ne sont pas lues : un mois clôturé s'annonçait
     « à clôturer » le temps d'un aller-retour. */
  const leBandeau = clotures.isPending ? null : bandeau({
    mois, aujourdhui: jourDeParis(), clos: estClos,
    /* Et le mois doit être le sien : un revenu daté avant l'arrivée ne fait pas d'un mois sans elle un mois à clôturer. */
    aRevenu: m => revenuDuMois(revenus.data ?? [], userId, m) !== null
      && estLaCeMois(foyer?.membres.find(x => x.id === userId) ?? {}, m),
  })
  const reste = resteDuMois({ lignes, saisies: dites, moi: userId, revenus: revenus.data ?? [],
                             mois, clos })
  const segments = reste.revenu === null ? []
    : barre({ lignes, charges: parCharge, saisies: dites, moi: userId, revenu: reste.revenu, clos })
  const totaux = totauxDuFiltre(lignes, parCharge, dites, userId, clos)
  const categories = parCategorie({ lignes, charges: parCharge, saisies: dites, filtre,
                                    moi: userId, clos })
  const nLignes = categories.reduce((t, c) => t + c.lignes.length, 0)
  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name }))
  const moi = foyer?.membres.find(m => m.id === userId)
  const jours = joursRestants(mois, jourDeParis())
  const precedent = moisVoisin(mois, -1)
  const suivant = moisVoisin(mois, 1)
  /* L'année, dès qu'elle n'est pas la nôtre : « Décembre » seul ne dit pas lequel. */
  const annee = mois.slice(0, 4) === courant.slice(0, 4) ? '' : ` ${mois.slice(0, 4)}`

  /* ⚠️ Le partage bascule en MOITIÉ-MOITIÉ dès qu'un revenu manque, et c'est ici
     qu'on lit les chiffres qui en découlent. L'avertissement vivait dans les
     réglages, là où l'on ne revient jamais : quelqu'un qui arrivait sans avoir
     posé son revenu lisait « au prorata » et payait 50/50. Seul, il n'y a rien
     à partager, et ce qui reste dit déjà « Ajoute ton revenu ». */
  const sansRevenu = membresSansRevenu(foyer?.membres ?? [], revenus.data ?? [], mois)
    .map(m => prenomDe(m.display_name))
  /* Celle qui arrive en octobre n'a ni revenu ni part en septembre : on le lui dit, au lieu de
     « Ajoute ton revenu pour voir ce qu'il te reste » sur un mois qui n'est pas le sien. */
  const pasEncoreLa = moi !== undefined && !!moi.entre_le && !estLaCeMois(moi, mois)
  /* Un mois clos SANS elle : arrivée (ou premier revenu) après la clôture. Ni reste ni choix à lui prêter. */
  const clotureSansElle = clotureSansMoi({ clos, revenu: reste.revenu, charges: reste.charges })

  const fermer = () => setOuverte(null)
  /* Le mois se clôt (relecture, autre appareil) pendant que la feuille « choix » est ouverte : elle
     disparaît, et le focus avec elle. On la ferme pour de bon — sinon elle se rouvrirait à
     « Revenir dessus » — et le focus va au geste qui reste. */
  const aFermer = choixAFermer(ouverte, clos)
  useEffect(() => {
    if (!aFermer) return
    setOuverte(null)
    document.querySelector<HTMLElement>('[data-revenir-dessus]')?.focus()
  }, [aFermer])
  const auFil = lignes.filter(l => l.facon === 'au_fil')
    .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr'))
  const vide = videDuMois({ mois, courant, nComptes })

  return (
    <main className="min-h-dvh px-4 pt-4 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <header className="h-14 flex items-center justify-between">
          <button onClick={() => va('/')} aria-label="Retour à l’accueil de Popote"
                  className="flex items-center gap-2 min-h-11 text-herbe">
            <span aria-hidden="true" className="text-[20px] text-doux">‹</span>
            <Marque taille={22} />
            <span className="titre text-[20px]">Popote</span>
          </button>
          <span className="flex items-center">
            <BoutonAide />
            <button onClick={() => va('/profil')} aria-label="Mon profil"
                    className="w-11 h-11 -mr-2 grid place-items-center">
              <span className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px]
                               grid place-items-center">
                {initialeDe(moi?.display_name)}
              </span>
            </button>
          </span>
        </header>

        {/* Les pastilles des mois sur la ligne du surtitre, pas à côté du titre :
            « Septembre » en Fraunces 46 px et deux pastilles ne tiennent pas
            ensemble dans 390 px. */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-doux">Budget</p>
          <div className="flex gap-1.5">
            <button onClick={() => setMois(precedent)}
                    aria-label={`Mois précédent : ${nomDuMois(precedent)}`}
                    className="min-h-11 px-3.5 rounded-full bg-piste text-[14px] font-medium">
              <span aria-hidden="true">‹ </span>{capitale(nomDuMois(precedent))}
            </button>
            {/* Jamais au-delà du mois courant : feuilleter vers l'avenir CRÉAIT ses
                dépenses avec la clé du jour, figée. On n'affiche pas une porte
                qui ne doit pas s'ouvrir. */}
            {mois < courant && (
              <button onClick={() => setMois(suivant)}
                      aria-label={`Mois suivant : ${nomDuMois(suivant)}`}
                      className="min-h-11 px-3.5 rounded-full bg-piste text-[14px] font-medium">
                {capitale(nomDuMois(suivant))}<span aria-hidden="true"> ›</span>
              </button>
            )}
          </div>
        </div>
        <h1 className="titre text-[46px] leading-none mt-1">{capitale(nomDuMois(mois))}{annee}</h1>
        {/* On compte des JOURS, pas des instants : le dernier jour à 14 h, il en
            reste zéro, et « Dernier jour. » s'affiche. */}
        {jours !== null && (
          <p className="mt-2 text-[15px] text-doux">
            {jours === 0 ? 'Dernier jour.' : jours === 1 ? 'Il reste un jour.' : `Il reste ${jours} jours.`}
          </p>
        )}

        {/* La porte vers les charges est le premier geste, et SANS CONDITION : elle
            a disparu une fois, conditionnée à un virement à faire, et un foyer qui
            paie tout depuis le compte joint ne pouvait plus corriger ses charges —
            `/charges` n'est dans aucune barre. */}
        <Gestes va={va} declarer={clos ? null : () => setOuverte({ geste: 'choix' })} />

        <Erreur de={enPanne ? new Error(messageDeLecture(enPanne.error)) : null} />

        {etat === 'chargement' ? <Attente /> : etat === 'erreur' ? (
          /* Rien d'autre que le message et de quoi réessayer : « Rien de posé » ou
             « Ajoute ton revenu » seraient des faits que personne n'a lus. */
          <button onClick={() => requises.forEach(q => { if (q.error) void q.refetch() })}
                  className="mt-4 min-h-11 px-5 rounded-full bg-piste text-[15px] font-medium">
            Réessayer
          </button>
        ) : lignes.length === 0 ? (
          pasEncoreLa ? (
            /* Pas de porte vers les revenus : « Commencer par les revenus » daterait octobre, un mois qui
               n'est pas le sien. Mais « Pas encore » tout seul cachait ce qui était déjà posé pour son
               arrivée : le mois type le montre, calculé pour le mois où il entre. */
            <TableauDeBord mois={`${moi!.entre_le!.slice(0, 7)}-01`} va={va} avant />
          ) : (
          <>
            <Vide titre={vide.titre} texte={vide.texte} />
            {/* UN SEUL geste, celui qui vient en premier : sans compte, une charge
                posée ne dit pas d'où elle part. Et seulement sur le mois courant
                (`videDuMois`). */}
            {vide.porte === 'revenus' && (
              <button onClick={() => va('/budget-reglages')}
                      className="w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px] font-medium">
                Commencer par les revenus et les comptes
              </button>
            )}
            {vide.porte === 'charges' && (
              <button onClick={() => va('/charges')}
                      className="w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px] font-medium">
                Poser les charges
              </button>
            )}
          </>
          )
        ) : (
          <>
            {/* ⚠️ Clos ou non : un mois clos d'avant son arrivée n'a ni reste ni choix pour elle (le
                récap lui lisait « Il t'est resté — » et « Revenir dessus » : un tiret, et le geste
                d'un mois qui n'est pas le sien). */}
            {pasEncoreLa || clotureSansElle ? (
              <section aria-label="Ce qui reste" className="mt-7 rounded-[28px] bg-encre text-fond p-5">
                <p className="text-[17px] leading-snug">
                  {pasEncoreLa
                    ? <>Tu {mois < courant ? 'n’étais' : 'n’es'} pas encore dans le foyer : tu y entres en {nomDuMois(`${moi!.entre_le!.slice(0, 7)}-01`)}.{' '}
                        Ce mois-là ne te compte aucune part.</>
                    : <>Le mois de {nomDuMois(mois)} a été clôturé avant que ton revenu soit posé.{' '}
                        Il ne te compte aucune part.</>}
                </p>
              </section>
            ) : (
              <Recap mois={mois} reste={reste} segments={segments} va={va}
                     cloture={clos ? { reste: monChoix ? monChoix.reste_cents : parQui ? reste.reste : null,
                                       misDeCote, duFoyer: misDeCoteFoyer, parQui } : null} />
            )}
            {/* Ce que la clôture n'a pas pu solder se dit sous son chiffre, jusqu'au
                rechargement (choix 20). Sur un mois clôturé seulement : rouvert, il n'a
                plus de clôture à qui l'imputer. */}
            {clos && (nonSoldees.data ?? []).map(n => (
              <p key={`${n.charge}-${n.annee}`} className="mt-3 text-[15px] leading-snug"
                 style={{ color: 'var(--color-ocre)' }}>
                {n.libelle} : {n.annee} n’a pas pu être soldée. Elle le sera à la prochaine clôture.
              </p>
            ))}
            {sansRevenu.length > 0 && !clos && (
              <p className="mt-3 text-[15px] leading-snug" style={{ color: 'var(--color-ocre)' }}>
                {sansRevenu.length === 1
                  ? `${sansRevenu[0]} n’a pas encore dit son revenu : tant qu’il manque, le partage se fait à parts égales.`
                  : 'Aucun revenu n’est posé : le partage se fait à parts égales.'}
              </p>
            )}
            <CarteEpargne va={va} />
            {/* Le mois type et le tableau de toutes les charges, une fois le mois commencé. */}
            <button onClick={() => va('/mois-type')}
                    className="mt-3.5 w-full flex items-center justify-between gap-3 rounded-[22px] bg-surface
                               shadow-carte px-4 min-h-[60px] text-left">
              <span>
                <span className="block text-[16px] font-semibold">Le mois type</span>
                <span className="block text-[13px] text-doux">Vos charges par catégorie, et ce que chacun paie</span>
              </span>
              <span aria-hidden="true" className="text-[20px] text-doux">›</span>
            </button>

            <div className="mt-8 flex items-baseline justify-between">
              <h2 className="titre text-[24px]">Par catégorie</h2>
              <span className="text-[14px] text-doux">{nLignes} ligne{nLignes > 1 ? 's' : ''}</span>
            </div>
            <FiltreDuMois filtre={filtre} totaux={totaux} choisir={setFiltre} />
            <Bandeau bandeau={leBandeau} va={va} />
            <div className="mt-4 flex flex-col gap-3">
              {categories.map(c => (
                <Categorie key={c.cle} categorie={c} saisies={dites} charges={parCharge} clos={clos}
                           ouvrir={(geste, l) => setOuverte({ geste, id: l.id })} />
              ))}
            </div>
          </>
        )}
      </div>

      <FeuillesDuMois ouverte={ouverte} clos={clos} misDeCote={misDeCoteFoyer} etat={etat}
                      lignes={lignes} auFil={auFil} saisies={dites} charges={parCharge}
                      mois={mois} moi={userId} foyerId={foyer?.id ?? ''} membres={membres}
                      fermer={fermer}
                      choisir={l => setOuverte({ geste: 'declarer', id: l.id })} />
    </main>
  )
}
