/**
 * Le hub : « ma journée ».
 *
 * Popote ne sert plus seulement à cuisiner : elle tient aussi ce que le foyer dépense. Le premier écran répond donc
 * aux questions du jour, sans qu'on ait à choisir un univers pour les poser :
 *
 *  · quoi manger : la carte sombre est le repas d'aujourd'hui (« Je l'ai mangé », « Changer », « Je les sors »), ou,
 *    quand il n'y en a pas, le geste du cycle (choisir, courses, cuisine…), comme l'accueil de la cuisine ;
 *  · quoi sortir : « Ce qui vient » dit les trois prochains repas, et « à sortir mercredi » ce qui dort au
 *    congélateur ; le frigo se compte en deux chiffres ;
 *  · où en est le budget : le reste du mois, ou ce qui l'attend avant l'arrivée.
 *
 * Le parti pris : le grand écran se remplit de choses utiles (deux colonnes dès 900 px, tout d'un regard), et le
 * téléphone tient l'essentiel sur le premier écran (la carte du jour, puis le frigo et le budget côte à côte). On entre
 * dans la cuisine et dans le budget en un geste : le bouton « Cuisine » de la carte sombre, la tuile du budget.
 *
 * ⚠️ L'honnêteté au chargement. Rien ne dit « Rien de prévu », « aucune barquette » ou « Rien de posé » avant que les
 * lectures soient revenues, et une panne s'affiche comme une panne : c'est le premier écran de l'app, il ne peut pas
 * commencer par un mensonge. Chaque `⚠️` plus bas raconte un défaut réel.
 */
import { useMemo } from 'react'
import { Erreur, Marque, dateLongue } from '../ui/coque.tsx'
import { GESTE, useChangeEtat, useCycle, useCycleInterrompu, useOuvreCycle } from '../lib/donnees/cycle.ts'
import type { Etat } from '../lib/donnees/cycle.ts'
import { bilanDuJour, jour, useAnnuleMange, useBarquettes, useMange, useSemaine } from '../lib/donnees/barquettes.ts'
import { usePrevus, useRecettesDesPlats, useSortDuCongelo } from '../lib/donnees/frigo.ts'
import { aDesObjectifs, bandeauDuProfil, objectifDe, useFoyer, initialeDe, prenomDe } from '../lib/donnees/foyer.ts'
import { useClotures, useMois, useRevenus, useSaisies, moisDe, eurosRonds } from '../lib/donnees/budget.ts'
import {
  aDire, estADire, estLaCeMois, ligneDuHub, moisVoisin, montant, nomDuMois, resteDuMois, revenuDuMois,
  sousLEuro,
} from '../lib/budget/mois.ts'
import { etatDeLEcran, messageDeLecture } from '../lib/budget/ecran.ts'
import { groupeLesParts, magnet, ordreDuRepas, pourQui } from '../lib/frigo.ts'
import {
  barreDuBudget, ceQuiVient, joursAvantLArrivee, noteDuPlat, pastilleDeSuite, pastilleDuCompteARebours,
  phraseDeLaSemaine, quandAujourdhui,
} from '../lib/hub.ts'
import { enFrancais } from '../lib/reseau.ts'
import { jourDeParis, maintenant } from '../lib/horloge.ts'
import { BoutonAide } from '../ui/Aide.tsx'
import { useMoisType } from '../ui/budget/MoisType.tsx'
import { CeSoir } from '../ui/frigo/CeSoir.tsx'
import { mesRepasManges, rendLeFocusALaCarteDuJour, useNoteRecente } from '../lib/annuler-mange.ts'
import { MangeAujourdhui } from '../ui/semaine/MangeAujourdhui.tsx'
import { CarteGeste } from '../ui/hub/CarteGeste.tsx'
import { CeQuiVient } from '../ui/hub/CeQuiVient.tsx'
import { PorteCuisine } from '../ui/hub/PorteCuisine.tsx'
import { Raccourcis } from '../ui/hub/Raccourcis.tsx'
import { TuileBudget, type VueBudget } from '../ui/hub/TuileBudget.tsx'
import { TuileFrigo } from '../ui/hub/TuileFrigo.tsx'
import { TuileJournee } from '../ui/hub/TuileJournee.tsx'

export function Hub({ userId, va }: { userId: string; va: (v: string) => void }) {
  const aujourdhui = useMemo(() => maintenant(), [])
  const jourDit = jour(aujourdhui)
  const mois = moisDe()
  const { data: cycle, isPending: chargeCycle } = useCycle()
  /* Une session interrompue n'est plus « le cycle courant » : sans cette lecture, la carte disait « Rien de
     prévu » au-dessus de 30 parts qui attendaient le dressage (25/10). */
  const { data: interrompu, isLoading: chargeInterrompu } = useCycleInterrompu(!chargeCycle && !cycle)
  const lesBarquettes = useBarquettes()
  const lecteurFoyer = useFoyer()
  const foyer = lecteurFoyer.data
  const semaine = useSemaine(aujourdhui, 7)
  const lesPrevus = usePrevus()
  const mange = useMange()
  /* Annuler « Je l'ai mangé » (0129) : le bandeau de 6 secondes, puis le lien, sous la carte sombre. */
  const annule = useAnnuleMange()
  const { notee, note: noteLeMange, clos } = useNoteRecente()
  const sortDuCongelo = useSortDuCongelo()
  const ouvre = useOuvreCycle()
  const reprend = useChangeEtat()

  /* ⚠️ `isPending`, pas seulement `data`. Avec `= []` en défaut, le hub annonçait « Rien de posé » et « Aucune
     barquette au frais » à CHAQUE ouverture à froid — le cas le plus fréquent — avant de tout corriger une seconde
     plus tard. Les barquettes et la semaine restent donc `undefined` tant qu'elles ne sont pas lues. */
  const barquettes = lesBarquettes.data
  const cases = semaine.data
  const prevus = lesPrevus.data ?? null
  const budget = useMois(mois)
  const depenses = budget.data ?? []
  const saisies = useSaisies(mois)
  const lecteurRevenus = useRevenus()
  const revenus = lecteurRevenus.data ?? []
  const revenuPose = revenus.some(r => r.user_profile_id === userId)
  const moi = foyer?.membres.find(m => m.id === userId)
  /* Elle (ou il) n'entre dans le foyer qu'après ce mois : le budget n'est pas encore le sien. Sans ce
     garde, le hub lui lisait « Il te reste 2 400 € en octobre » sur le revenu d'un autre mois, ou
     « Ajoute ton revenu » à qui l'avait posé — pour novembre. */
  const pasEncoreLa = moi !== undefined && !estLaCeMois(moi, mois)
  /* Ce qui l'attend à son arrivée, déjà posé : « rien n'est à poser avant » ne disait pas que tout l'était. */
  const typeDeLArrivee = useMoisType(moi?.entre_le ? `${moi.entre_le.slice(0, 7)}-01` : mois, pasEncoreLa)
  const monMoisType = pasEncoreLa && typeDeLArrivee.donnees
    ? typeDeLArrivee.donnees.personnes.find(p => p.id === userId) : undefined
  /* ⚠️ Les lectures du chiffre, comme l'écran du mois (`etatDeLEcran`). `= []` sans `isPending` disait
     « Ajoute ton revenu » à qui l'avait posé ; une panne du mois se lisait « Rien de posé » ; une panne des
     saisies comptait le PRÉVU pour du déclaré, sans un mot. Le foyer en fait partie : sans lui, on ne sait pas si
     le mois est déjà le sien. Un faux chiffre est pire qu'un « … ». */
  const lectures = [budget, saisies, lecteurRevenus, lecteurFoyer]
  const etat = etatDeLEcran(lectures)
  const enPanne = lectures.find(q => q.data === undefined && q.error)
  /* Le bandeau ne dit « complète ton profil » que sur ce qu'on a LU : un revenu ou un
     foyer pas encore revenus ne sont pas des revenus ou un profil absents. */
  const profilLu = foyer !== undefined && lecteurRevenus.data !== undefined

  /* Le chiffre de l'écran du mois, au même calcul (§ 3.1.1). Le mois courant
     n'est jamais clôturé (D78) : `clos` vaut faux. */
  const reste = resteDuMois({ lignes: depenses, saisies: saisies.data ?? [], moi: userId,
                             revenus, mois, clos: false })
  const clotures = useClotures()
  const precedent = moisVoisin(mois, -1)
  /* Le mois précédent attend sa clôture si j'y avais un revenu (§ 3.6) : de
     janvier à août 2026, sans revenu, rien ne se clôture et rien ne le propose.
     Rien tant que les clôtures ne sont pas LUES (`data`, pas `isPending` : une
     lecture en échec n'a pas de données non plus, et `?? []` la lirait « rien de
     clôturé », donc « à clôturer »). */
  const aCloturer = clotures.data !== undefined
    && !clotures.data.some(k => k.mois === precedent)
    && revenuDuMois(revenus, userId, precedent) !== null
    && (moi === undefined || estLaCeMois(moi, precedent)) ? precedent : null
  const nAdire = aDire(depenses, saisies.data ?? [], false)
  /* Pas de ligne du tout tant qu'on ne sait pas : « Tout est à jour » dit avant d'avoir
     lu les clôtures aurait menti à qui a un mois à clôturer. */
  const suite = clotures.data === undefined ? null
    : ligneDuHub({ aCloturer, aDire: nAdire,
                   noms: depenses.filter(l => estADire(l, saisies.data ?? [], false)).map(l => l.libelle) })
  const pastilleDeLaSuite = clotures.data === undefined ? null
    : pastilleDeSuite({ aCloturer, aDire: nAdire, nomDuMois })

  /* ── Le cycle, et la carte sombre ───────────────────────────────────────── */
  const etatDuCycle: Etat = cycle?.state ?? (interrompu ? 'interrompue' : 'vide')
  const geste = GESTE[etatDuCycle]
  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, prenom: prenomDe(m.display_name) }))
  /* Mes repas d'aujourd'hui, dans l'ordre de la journée (la base ordonne les repas comme elle l'entend). */
  const duJour = (cases ?? [])
    .filter(c => c.user_profile_id === userId && c.day === jourDit && c.state === 'prevu' && c.portion)
    .sort((a, b) => ordreDuRepas(a.meal) - ordreDuRepas(b.meal) || a.id.localeCompare(b.id))
  const prochain = duJour[0]
  const memePlat = (a: typeof prochain, b: typeof prochain) =>
    a?.portion?.label === b?.portion?.label && a?.portion?.recipe_id === b?.portion?.recipe_id
  const convivesDe = (repas: string) => [...new Set((cases ?? [])
    .filter(c => c.day === jourDit && c.meal === repas && c.state === 'prevu' && memePlat(c, prochain))
    .map(c => c.user_profile_id))].sort().join()
  /* « Ce midi et ce soir » quand le même plat tient les deux repas, pour les mêmes personnes ; sinon le premier. */
  const repasDeLaCarte = prochain
    ? duJour.filter(c => memePlat(c, prochain) && convivesDe(c.meal) === convivesDe(prochain.meal)).map(c => c.meal)
    : []
  const casesDeLaCarte = new Set(duJour.filter(c => repasDeLaCarte.includes(c.meal) && memePlat(c, prochain))
    .map(c => c.id))
  /* Les parts que « Je les sors » sort : celles du même plat posées sur ce repas, et au congélateur. */
  const aSortir = prochain
    ? (cases ?? []).flatMap(c => c.day === jourDit && c.meal === prochain.meal && c.state === 'prevu'
      && memePlat(c, prochain) && c.portion?.location === 'congelateur' ? [c.portion.id] : [])
    : []

  /* La semaine ET le foyer, ou une panne qui se dit : « pour vous deux » sans le foyer lu serait faux. */
  const panneDeLaSemaine = [semaine, lecteurFoyer].find(q => q.data === undefined && q.error)?.error
  const semaineLue = cases !== undefined && foyer !== undefined
  const enSemaine = etatDuCycle === 'semaine' && !!prochain && semaineLue
  const carteEnAttente = chargeCycle || chargeInterrompu
    || (etatDuCycle === 'semaine' && !semaineLue && !panneDeLaSemaine)

  const aVenir = ceQuiVient(cases ?? [], userId, aujourdhui,
    { exclus: enSemaine ? casesDeLaCarte : undefined, max: 3 })
  const dejaMange = mesRepasManges(cases ?? [], userId, jourDit)
  /* « Ta journée » : le calcul de l'accueil de la cuisine et du bilan, sur mes cases d'aujourd'hui. */
  const maJournee = bilanDuJour(cases ?? [], userId, jourDit)
  const idsRecettes = [...new Set([...(enSemaine ? [prochain?.portion?.recipe_id] : []),
    ...aVenir.map(l => l.recipeId), ...dejaMange.map(c => c.portion?.recipe_id)].filter((x): x is string => !!x))]
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (id: string | null | undefined) => (id ? recettes?.get(id)?.image_url ?? null : null)

  /* La note de la carte : seulement ce que les données disent (parts au frigo, péremption), et seulement une fois les
     barquettes et les repas posés lus — le « finit le plat » se calcule sur les deux. */
  const groupe = prochain?.portion && barquettes
    ? groupeLesParts(barquettes).find(g => g.parts.some(p => p.id === prochain.portion!.id)) : undefined
  const note = enSemaine && groupe && groupe.location === 'frigo' && prevus
    ? noteDuPlat(groupe.parts, prevus, aujourdhui) : null

  const auFrais = (barquettes ?? []).filter(b => b.location === 'frigo').length
  const auFroid = (barquettes ?? []).filter(b => b.location === 'congelateur').length
  const panneDesBarquettes = barquettes === undefined ? lesBarquettes.error : null
  const aimant = barquettes !== undefined && magnet(barquettes, prevus, aujourdhui) !== null
  const phrase = !chargeCycle && !chargeInterrompu && barquettes !== undefined
    ? phraseDeLaSemaine(geste.titre, barquettes.map(b => b.location)) : null

  const agit = () => {
    if (!cycle && interrompu) {
      reprend.mutate({ id: interrompu.id, vers: 'en_cuisine' }, { onSuccess: () => va('/cuisine') })
    } else if (!cycle) ouvre.mutate({}, { onSuccess: () => va('/choisir') })
    else va(geste.vers)
  }
  /* Le refus de la base (« la semaine … a déjà son cycle ») se lisait nulle part : le bouton semblait mort. */
  const erreurDuGeste = ouvre.error
    ? (/a une session interrompue/.test(ouvre.error.message)
      ? 'Cette semaine a une session interrompue : reprends-la.'
      : /a déjà son cycle/.test(ouvre.error.message)
        ? 'Cette semaine a déjà eu sa session : reprends-la, ou attends la semaine suivante.'
        : enFrancais(ouvre.error.message))
    : reprend.error
  const texteDuGeste = etatDuCycle === 'vide'
    ? 'On choisit les recettes maintenant, on cuisine dimanche, on mange la semaine d’après.'
    : etatDuCycle === 'semaine' && semaineLue ? 'Rien n’est posé pour aujourd’hui.'
    : etatDuCycle === 'interrompue' ? 'Reprends-la depuis la cuisine.' : null

  /* ── Le budget ───────────────────────────────────────────────────────────── */
  const vueBudget = ((): VueBudget => {
    if (etat === 'chargement') return { etat: 'chargement' }
    if (etat === 'erreur') return { etat: 'erreur', message: messageDeLecture(enPanne?.error) }
    if (pasEncoreLa) {
      const arrivee = nomDuMois(`${moi!.entre_le!.slice(0, 7)}-01`)
      const jours = joursAvantLArrivee(moi!.entre_le!, jourDeParis(aujourdhui))
      const decompte = {
        jours,
        texte: <>{jours > 1 ? 'jours' : 'jour'} avant ton premier mois, le 1<sup>er</sup> {arrivee}.</>,
      }
      /* Le mois type n'est pas lu : ni « rien n'est à poser » ni chiffre, le temps de le savoir. */
      if (typeDeLArrivee.etat === 'chargement') return { etat: 'chargement' }
      if (typeDeLArrivee.etat === 'erreur') {
        return { etat: 'erreur', message: messageDeLecture(typeDeLArrivee.erreur) }
      }
      const type = monMoisType
      if (!type || type.total <= 0) {
        return {
          etat: 'pret', figure: { titre: true, grand: `Commence en ${arrivee}` },
          texte: 'Tu entres dans le foyer à cette date : rien n’est à poser avant.',
          decompte, pastille: pastilleDuCompteARebours(jours),
        }
      }
      const manque = type.reste !== null && type.reste < 0
      return {
        etat: 'pret', surtitre: 'Ton mois type, chaque mois',
        figure: type.reste === null
          ? { grand: eurosRonds(type.total), apres: 'de charges', apresTel: 'de charges, chaque mois' }
          : manque
            ? { avant: 'Il te manque', grand: eurosRonds(-type.reste), ton: 'ocre', apres: 'chaque mois',
                apresTel: 'il te manque, chaque mois' }
            : { grand: eurosRonds(type.reste), apres: 'pour toi', apresTel: 'pour toi, chaque mois' },
        barre: barreDuBudget(type.total, type.reste),
        legende: type.reste === null ? null
          : { charges: eurosRonds(type.total),
              reste: { libelle: manque ? 'Il te manque' : 'Il te reste',
                       montant: eurosRonds(Math.abs(type.reste)), manque } },
        decompte, pastille: pastilleDuCompteARebours(jours),
      }
    }
    if (depenses.length === 0) {
      return {
        etat: 'pret', figure: { titre: true, grand: 'Rien de posé' },
        texte: 'Les charges du foyer, et ce que chacun verse.',
      }
    }
    /* Ce qui reste, en euros ronds (§ 3.6). « 0 € à verser » et « Courses : dépassé de 500 € » disaient l'état
       d'une enveloppe ; ceci dit ce qu'on peut encore dépenser. */
    if (reste.reste === null) {
      return {
        etat: 'pret', figure: { titre: true, grand: 'Ajoute ton revenu' }, suite, pastille: pastilleDeLaSuite,
      }
    }
    const manque = reste.reste < 0
    const verbe = manque ? 'Il te manque' : 'Il te reste'
    /* Sous l'euro, l'arrondi dirait « 0 € » d'un manque de 0,30 € : le chiffre et la légende le disent au centime. */
    const dit = (cents: number) => (sousLEuro(cents) ? montant(cents) : eurosRonds(cents))
    const barre = barreDuBudget(reste.charges, reste.reste)
    return {
      etat: 'pret',
      figure: {
        avant: verbe,
        grand: dit(Math.abs(reste.reste)),
        apres: `en ${nomDuMois(mois)}`, apresTel: `${verbe.toLowerCase()} en ${nomDuMois(mois)}`,
        ton: manque ? 'ocre' : 'herbe',
      },
      barre,
      legende: barre ? { charges: eurosRonds(reste.charges),
        reste: { libelle: verbe, montant: dit(Math.abs(reste.reste)), manque } } : null,
      suite, pastille: pastilleDeLaSuite,
    }
  })()

  /* Seul dans le foyer : la porte de l'invitation est ICI. Elle vivait dans les réglages de la
     cuisine, que le hub ne montre nulle part — Kamil cherchait « Réglages » sur le premier écran,
     et l'avatar mène au profil. Elle disparaît dès qu'on est deux. */
  const seul = !!foyer && foyer.membres.length < 2
  const leBandeauDuProfil = !profilLu ? null
    : bandeauDuProfil({ prenom: !!moi?.display_name, revenu: revenuPose,
                        objectifs: moi !== undefined && aDesObjectifs(moi) })

  const dateDuJour = dateLongue(aujourdhui)
  const entete = <PorteCuisine va={va} />

  return (
    <main className="min-h-dvh px-4 pt-2 pb-8 min-[900px]:px-8 min-[900px]:pt-[18px] min-[900px]:pb-14">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="flex h-[50px] items-center justify-between min-[900px]:h-14">
          <span className="flex items-center gap-2.5 text-herbe">
            <Marque taille={26} />
            {/* Le nom, écrit une fois. L'app ne l'affichait nulle part, alors
                qu'il est ce qu'elle a de meilleur. WONK à 1 ici et NULLE PART
                ailleurs : c'est le seul endroit où la bizarrerie de la fonte
                sert à quelque chose. */}
            <h1 className="titre text-[26px] text-herbe"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 40, "WONK" 1',
                         letterSpacing: '-0.02em' }}>
              Popote
            </h1>
          </span>
          {/* Vers SON profil, pas vers les réglages de la cuisine : l'avatar
              porte son initiale, un tap dessus doit mener à soi. C'était aussi
              le seul chemin manquant — une fois le profil rempli, le bandeau
              disparaissait et la date d'arrivée devenait incorrigeable. */}
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

        <div className="mb-3.5 mt-1.5 min-[900px]:mb-[18px] min-[900px]:mt-[18px]">
          <h2 data-jour="date"
              className="titre text-[32px] font-semibold leading-[1.05] max-[360px]:text-[29px] min-[900px]:text-[46px]"
              style={{ fontVariationSettings: '"opsz" 120, "SOFT" 50, "WONK" 0' }}>
            {dateDuJour.charAt(0).toUpperCase() + dateDuJour.slice(1)}
          </h2>
          {phrase && (
            <p data-jour="phrase"
               className="mt-1 text-[15px] text-doux max-[360px]:text-[14px] min-[900px]:mt-1.5 min-[900px]:text-base">
              {phrase}
            </p>
          )}
        </div>

        {/* Téléphone : deux colonnes (la carte du jour, puis le frigo et le budget côte à côte, ce qui vient, les
            raccourcis) ; `contents` fond les deux colonnes du bureau dans cette grille. Bureau : 7fr / 5fr. */}
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2.5 min-[900px]:grid-cols-[7fr_5fr] min-[900px]:items-start min-[900px]:gap-5">
          <div className="contents min-[900px]:grid min-[900px]:content-start min-[900px]:gap-5">
            <div className="max-[899px]:order-1 max-[899px]:col-span-2">
              {enSemaine && prochain ? (
                <CeSoir grand cas={prochain} titreDePage={false} entete={entete}
                        photo={photoDe(prochain.portion?.recipe_id)} nom={prochain.portion!.label}
                        quand={quandAujourdhui(repasDeLaCarte)}
                        enCours={mange.isPending || sortDuCongelo.isPending}
                        pour={pourQui(
                          (cases ?? []).filter(c => c.day === jourDit && c.meal === prochain.meal
                            && c.state === 'prevu' && memePlat(c, prochain)).map(c => c.user_profile_id),
                          membres, userId)}
                        surMange={() => { annule.reset(); mange.mutate(prochain, { onSuccess: () => noteLeMange(prochain.id) }) }}
                        nbASortir={aSortir.length}
                        surSort={() => sortDuCongelo.mutate(aSortir)}
                        surChange={() => va(`/semaine?jour=${jourDit}&repas=${prochain.meal}`)}
                        note={note}
                        erreur={<Erreur de={mange.error ?? sortDuCongelo.error} />} />
              ) : (
                <CarteGeste entete={entete} attente={carteEnAttente} titre={geste.titre} texte={texteDuGeste}
                            action={geste.action} surAction={agit} enCours={ouvre.isPending || reprend.isPending}
                            secondaire={!cycle && interrompu ? 'Choisir de nouvelles recettes' : null}
                            surSecondaire={() => ouvre.mutate({}, { onSuccess: () => va('/choisir') })}
                            erreur={<>
                              <Erreur de={erreurDuGeste} />
                              <Erreur de={panneDeLaSemaine} />
                            </>} />
              )}
              <MangeAujourdhui cases={dejaMange} photoDe={c => photoDe(c.portion?.recipe_id)} notee={notee}
                               surFerme={clos} enCours={annule.isPending}
                               surAnnule={id => annule.mutate(id, { onSuccess: () => { clos(); setTimeout(rendLeFocusALaCarteDuJour, 0) } })} />
              {/* L'erreur se dit tant que la ligne est là ; elle s'efface au geste suivant. */}
              <Erreur de={dejaMange.length > 0 ? annule.error : null} />
              {!panneDeLaSemaine && (
                <TuileJournee kcal={maJournee.kcal} proteinG={maJournee.proteinG}
                              objectif={moi && aDesObjectifs(moi) ? objectifDe(moi) : null}
                              manquent={maJournee.prevus - maJournee.renseignes}
                              chargement={cases === undefined || foyer === undefined} va={va} />
              )}
            </div>
            <CeQuiVient lignes={aVenir} photoDe={photoDe} va={va}
                        chargement={cases === undefined && !panneDeLaSemaine}
                        erreur={cases === undefined ? semaine.error : null} />
          </div>

          <div className="contents min-[900px]:grid min-[900px]:content-start min-[900px]:gap-5">
            <TuileFrigo auFrais={auFrais} auFroid={auFroid}
                        chargement={barquettes === undefined && !panneDesBarquettes}
                        erreur={panneDesBarquettes} magnet={aimant} va={va} />
            <TuileBudget vue={vueBudget} va={va} />
            <Raccourcis va={va} />
          </div>
        </div>

        {seul && (
          <button onClick={() => va('/reglages#inviter')}
                  className="mt-4 w-full text-left bg-surface border border-dashed
                             border-brume rounded-[18px] p-4 transition-colors
                             hover:bg-brume/20 hover:border-doux/40">
            <p className="text-[15px] leading-[23px] text-doux">
              <strong className="text-encre font-semibold">Inviter quelqu’un.</strong>{' '}
              Tu obtiens un lien à lui envoyer.
            </p>
          </button>
        )}

        {/* Le bandeau n'est pas un reproche : il MÈNE quelque part. Tant que le
            revenu manque, `parts_du_foyer` partage à parts égales — autant le
            dire, et offrir le chemin dans la même phrase. */}
        {leBandeauDuProfil && (
          <button onClick={() => va(leBandeauDuProfil.vers)}
                  className="mt-4 w-full text-left bg-surface border border-dashed
                             border-brume rounded-[18px] p-4 transition-colors
                             hover:bg-brume/20 hover:border-doux/40">
            <p className="text-[15px] leading-[23px] text-doux">
              <strong className="text-encre font-semibold">{leBandeauDuProfil.titre}</strong>{' '}
              {leBandeauDuProfil.texte}
            </p>
          </button>
        )}
      </div>
    </main>
  )
}
