/**
 * Un mail par type de rappel : ce que `rappels_a_envoyer` a rendu devient un `Contenu` (titre, texte, liens,
 * carte), que `gabarit.ts` habille en HTML et en texte brut.
 *
 * Les phrases s'accordent au nombre (« 1 wrap », « 4 wraps » ; « la barquette de petit salé aux lentilles »,
 * « les 3 barquettes de lasagnes »). Les liens sont ceux de l'appli, sous `APP_BASE_URL` : voir `liens.ts`.
 */
import { html, texte } from './gabarit.ts'
import type { Contenu } from './gabarit.ts'
import { illustration, lien, photoSure } from './liens.ts'
import {
  exige, estUnJour, JOURS, JOURS_COURTS, MOT_DU_REPAS, barquettes, deMois, euros, jourEnToutesLettres, laBarquetteDe,
  lisLeJour, listeDeRepas, majuscule, momentDePeremption, moisEnToutesLettres, nomCourt, partsDuPlat, pourDit, premier,
  prenomSur, quandEnvoye, MOIS,
} from './texte.ts'
import type {
  Contexte, DonneesChoisir, DonneesCloturer, DonneesConfirmer, DonneesFacture, DonneesNoter, DonneesPerime,
  DonneesSortir, Mail, PlatQuiPerime, TypeDeRappel,
} from './types.ts'
import { estUnType } from './types.ts'

/** Les noms que l'écran `/rappels` donne aux rappels : le pied du mail les reprend. */
export const NOM_DU_RAPPEL: Record<TypeDeRappel, string> = {
  sortir_du_congelateur: 'Sortir du congélateur',
  barquette_perime: 'Une barquette va périmer',
  choisir_les_repas: 'Choisir les repas',
  noter_les_depenses: 'Noter les dépenses',
  confirmer_les_charges: 'Confirmer les charges',
  cloturer_le_mois: 'Clôturer le mois',
  facture_annuelle: 'Une facture annuelle approche',
}

const s = (n: number) => (n > 1 ? 's' : '')
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])

/** Ce que tous les mails ont en commun : le coin daté, le pied, le lien vers les réglages. */
function commun(type: TypeDeRappel, ctx: Contexte) {
  return {
    quand: quandEnvoye(ctx.maintenant),
    reglages: lien(ctx.base, '/rappels'),
    raison: ctx.exemple
      ? 'Ceci est un exemple, envoyé à ta demande : rien n’est à faire.'
      : `Tu reçois ce mail parce que le rappel « ${NOM_DU_RAPPEL[type]} » est activé pour toi.`,
  }
}

// ── Sortir du congélateur (bleu) ────────────────────────────────────────────

/** Les prénoms d'une liste « pour qui » : normalisés comme la base le fait (le premier mot, un repli sûr). */
const prenoms = (pour: unknown): string[] => arr<string>(pour).map(x => prenomSur(x, 'Quelqu’un'))

function sortir(d: DonneesSortir, ctx: Contexte): Contenu {
  const plats = arr<DonneesSortir['plats'][number]>(d.plats)
  exige(estUnJour(d.jour) && plats.length > 0, 'sortir_du_congelateur')
  for (const p of plats) exige(typeof p.label === 'string' && p.label.trim() && p.n > 0, 'un plat à sortir')
  const total = plats.reduce((t, p) => t + p.n, 0)
  const ids = plats.flatMap(p => arr<string>(p.portion_ids))
  const repas = [...new Set(plats.flatMap(p => arr<{ meal: string }>(p.repas).map(r => r.meal)))]
    .sort((a, b) => Object.keys(MOT_DU_REPAS).indexOf(a) - Object.keys(MOT_DU_REPAS).indexOf(b))
  const pour = pourDit(plats.flatMap(p => arr<{ pour: string[] }>(p.repas).flatMap(r => prenoms(r.pour))), ctx.prenom)
  const titre = plats.length === 1
    ? `Ce soir, sors ${partsDuPlat(plats[0].label, plats[0].n)} du congélateur`
    : `Ce soir, sors ${barquettes(total)} du congélateur`
  const intro = `Après une nuit au frigo, tout est prêt pour demain ${listeDeRepas(repas)}${pour ? `, ${pour}` : ''}.`
  const lignes = plats.flatMap(p => arr<{ meal: string; pour: string[] }>(p.repas).map(r => ({
    point: 'bleu' as const,
    titre: MOT_DU_REPAS[r.meal]?.titre ?? r.meal,
    sous: `${nomCourt(p.label)}${arr(r.pour).length ? `, ${pourDit(prenoms(r.pour), ctx.prenom)}` : ''}`,
    droite: String(arr(r.pour).length),
  })))
  const reste = plats.length === 1
    ? (plats[0].restant > 0
      ? ` Il restera ensuite ${partsDuPlat(plats[0].label, plats[0].restant)} au congélateur.`
      : ' Il n’en restera plus au congélateur.')
    : ''
  return {
    famille: 'bleu',
    sujet: titre,
    preEntete: intro,
    ...commun('sortir_du_congelateur', ctx),
    titre,
    intro,
    bouton: { texte: 'C’est fait, c’est au frigo', url: lien(ctx.base, '/frigo', { sortir: ids }) },
    lien: { texte: 'Changer les repas de demain', url: lien(ctx.base, '/semaine', { jour: d.jour }) },
    image: {
      src: illustration(ctx.base, 'congelateur'),
      alt: 'Des barquettes givrées passent du congélateur à l’étagère du frigo pendant la nuit.',
    },
    carte: {
      titre: `Demain, ${jourEnToutesLettres(d.jour)}`,
      lignes,
      note: `Oublié ? Demain, le micro-ondes en mode décongélation fait l’affaire.${reste}`,
    },
  }
}

// ── Une barquette va périmer (encre) ────────────────────────────────────────

const JOUR_SEUL = (iso: string) => JOURS[lisLeJour(iso).semaine]

/** « samedi », « samedi et dimanche » : les jours (ISO) où des barquettes sont prévues trop tard. */
const joursDits = (jours: string[]) => {
  const noms = [...new Set(jours.map(JOUR_SEUL))]
  return noms.length <= 1 ? (noms[0] ?? '') : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`
}

/**
 * UN mail par membre et par jour : tous les plats dont des barquettes périment avant demain soir, ou ont péri il y a
 * moins de 24 h. Le héros parle du nombre total ; la vignette, du plat le plus pressé ; la carte les liste tous.
 * Une barquette déjà périmée n'est pas « à manger avant » : elle est « à jeter ».
 */
function perime(d: DonneesPerime, ctx: Contexte): Contenu {
  const plats = arr<PlatQuiPerime>(d.plats)
  exige(plats.length > 0 && plats.every(p =>
    typeof p.label === 'string' && p.label.trim() && p.n > 0 && !Number.isNaN(new Date(p.expire).getTime())), 'barquette_perime')
  const trie = [...plats].sort((a, b) => new Date(a.expire).getTime() - new Date(b.expire).getTime())
  const perimee = (p: PlatQuiPerime) => new Date(p.expire).getTime() <= ctx.maintenant.getTime()
  const vivants = trie.filter(p => !perimee(p))
  const morts = trie.filter(perimee)
  const n = trie.reduce((t, p) => t + p.n, 0)
  const nMorts = morts.reduce((t, p) => t + p.n, 0)
  const nVivants = n - nMorts
  const pressee = trie[0]
  const mots = vivants.length ? momentDePeremption(new Date(vivants[0].expire), ctx.maintenant).mots : ''

  let sujet: string
  if (trie.length === 1) {
    sujet = perimee(pressee)
      ? `${majuscule(laBarquetteDe(pressee.label, n))} ${n > 1 ? 'sont périmées' : 'est périmée'} : à jeter`
      : `${majuscule(laBarquetteDe(pressee.label, n))} ${n > 1 ? 'périment' : 'périme'} ${mots}`
  } else if (nMorts === 0) {
    sujet = `${barquettes(n)} à manger ou à congeler d’ici ${mots}`
  } else if (nVivants === 0) {
    sujet = `${barquettes(n)} ${n > 1 ? 'périmées' : 'périmée'} : à jeter`
  } else {
    sujet = `${barquettes(n)} : ${nMorts} à jeter, ${nVivants} à sauver`
  }

  const titre = nVivants === 0
    ? (n === 1 ? 'Une barquette est périmée' : `${n} barquettes sont périmées`)
    : (n === 1 ? 'Une barquette n’est prévue nulle part' : `${n} barquettes ne sont prévues nulle part`)

  const aSauver = nVivants === 1 ? 'Mange-la avant, ou congèle-la aujourd’hui : elle tiendra trois mois.'
    : 'Mange-les avant, ou congèle-les aujourd’hui : elles tiendront trois mois.'
  let intro: string
  if (nVivants === 0) intro = n === 1 ? 'Elle est périmée : à jeter.' : 'Elles sont périmées : à jeter.'
  else if (nMorts === 0) {
    const tient = vivants.length === 1 && nVivants === 1 ? `Elle tient jusqu’à ${mots}.`
      : vivants.length === 1 ? `Elles tiennent jusqu’à ${mots}.`
        : `La plus pressée tient jusqu’à ${mots}.`
    intro = `${tient} ${aSauver}`
  } else {
    const morte = nMorts === 1 ? 'Une est périmée : à jeter.' : `${nMorts} sont périmées : à jeter.`
    intro = `${morte} Pour ${nVivants === 1 ? 'l’autre' : 'les autres'}, la plus pressée tient jusqu’à ${mots}. ${aSauver}`
  }

  const lignes = trie.map(p => {
    const mort = perimee(p)
    const m = momentDePeremption(new Date(p.expire), ctx.maintenant).mots
    const tardives = arr<string>(p.tardives).filter(estUnJour)
    let sous: string
    if (tardives.length > 0) {
      const k = tardives.length
      const jours = joursDits(tardives)
      sous = k === 1
        ? `Prévue ${jours}, mais ${mort ? 'elle est périmée' : `elle périme ${m}`}`
        : `${k} prévues ${jours}, mais ${mort ? 'elles sont périmées' : `elles périment ${m}`}`
    } else {
      sous = mort ? 'Périmée : à jeter' : `Périme ${m}`
    }
    return { point: (mort ? 'creux' : 'safran') as 'creux' | 'safran', titre: p.label, sous, droite: String(p.n) }
  })

  const vue = nVivants > 0
  return {
    famille: 'encre',
    sujet,
    preEntete: `${titre} : ${intro}`,
    ...commun('barquette_perime', ctx),
    titre,
    intro,
    bouton: vue
      ? { texte: nVivants === 1 ? 'La prévoir pour un repas' : 'Les prévoir pour un repas', url: lien(ctx.base, '/semaine') }
      : { texte: 'Ouvrir le frigo', url: lien(ctx.base, '/frigo') },
    lien: vue ? { texte: nVivants === 1 ? 'La congeler' : 'Les congeler', url: lien(ctx.base, '/frigo') } : undefined,
    plat: {
      photo: photoSure(pressee.image_url),
      alt: pressee.label,
      pastille: perimee(pressee) ? 'Périmée' : momentDePeremption(new Date(pressee.expire), ctx.maintenant).pastille,
      legende: `${pressee.label}, ${barquettes(pressee.n)} au frigo${trie.length > 1
        ? ` et ${trie.length - 1} autre${s(trie.length - 1)} plat${s(trie.length - 1)}` : ''}`,
    },
    carte: { titre: trie.length > 1 ? 'Ce qui périme' : 'La barquette concernée', lignes },
  }
}

// ── Choisir les repas (herbe) ───────────────────────────────────────────────

function choisir(d: DonneesChoisir, ctx: Contexte): Contenu {
  const jours = arr<DonneesChoisir['jours'][number]>(d.jours)
  exige(d.vides > 0 && jours.length > 0 && jours.every(j => estUnJour(j.jour)), 'choisir_les_repas')
  const vides = d.vides
  const titre = `${vides} dîner${s(vides)} à choisir cette semaine`
  const dispo = [
    d.congelateur > 0 ? `${barquettes(d.congelateur)} au congélateur` : '',
    d.frigo > 0 ? `${barquettes(d.frigo)} au frigo` : '',
  ].filter(Boolean)
  const intro = dispo.length
    ? `Il reste ${dispo.join(' et ')}. Choisis tes dîners, ou prévois une session.`
    : 'Il ne reste rien au frigo ni au congélateur : choisis tes repas, ou prévois une session.'
  return {
    famille: 'herbe',
    sujet: titre,
    preEntete: `Il reste ${vides} dîner${s(vides)} sans repas prévu dans les 7 prochains jours.`,
    ...commun('choisir_les_repas', ctx),
    titre,
    intro,
    bouton: { texte: 'Choisir mes repas', url: lien(ctx.base, '/semaine') },
    lien: { texte: 'Préparer une session', url: lien(ctx.base, '/cuisine-accueil') },
    grille: jours.map((j, i) => {
      const l = lisLeJour(j.jour)
      return { court: JOURS_COURTS[l.semaine], num: l.jour, midi: j.midi, soir: j.soir, premier: i === 0 }
    }),
    carte: {
      titre: 'Ce qu’il vous reste',
      lignes: [
        { point: 'bleu', titre: 'Au congélateur', sous: d.congelateur > 0 ? 'À sortir la veille' : 'Plus rien', droite: String(d.congelateur) },
        { point: 'herbe', titre: 'Au frigo', sous: d.frigo > 0 ? 'Prêt à manger' : 'Plus rien', droite: String(d.frigo) },
      ],
      legende: true,
    },
  }
}

// ── Noter les dépenses (sable) ──────────────────────────────────────────────

function noter(d: DonneesNoter, ctx: Contexte): Contenu {
  exige(estUnJour(d.mois), 'noter_les_depenses')
  const titre = d.depuis_jours === null
    ? 'Aucune dépense notée pour l’instant'
    : `Rien de noté depuis ${d.depuis_jours} jours`
  const intro = `Le budget ${deMois(d.mois)} est ouvert. Touche « Déclarer », écris le montant, et c’est rangé.`
  return {
    famille: 'sable',
    sujet: titre,
    preEntete: intro,
    ...commun('noter_les_depenses', ctx),
    titre,
    intro,
    bouton: { texte: 'Noter mes dépenses', url: lien(ctx.base, '/budget') },
    lien: { texte: 'Mes charges', url: lien(ctx.base, '/charges') },
    image: {
      src: illustration(ctx.base, 'ticket'),
      alt: 'Un ticket de caisse au total inconnu, un crayon, et la semaine sans rien de coché.',
    },
    carte: {
      titre: 'Trois gestes, une minute',
      lignes: [
        { point: 'safran', titre: 'Touche « Déclarer »', sous: 'En haut de l’écran du mois', droite: '1' },
        { point: 'herbe', titre: 'Écris le montant', sous: '« 47 » ou « 47,90 »', droite: '2' },
        { point: 'bleu', titre: 'Choisis le jour', sous: 'Aujourd’hui, hier ou un autre jour', droite: '3' },
      ],
    },
  }
}

// ── Confirmer les charges (sable) ───────────────────────────────────────────

function confirmer(d: DonneesConfirmer, ctx: Contexte): Contenu {
  exige(estUnJour(d.mois) && d.n > 0, 'confirmer_les_charges')
  const mois = moisEnToutesLettres(d.mois)
  const n = d.n
  const lignes = arr<DonneesConfirmer['lignes'][number]>(d.lignes)
  const titre = `${n} facture${s(n)} à confirmer pour ${mois}`
  const intro = `${majuscule(mois)} est fini. Confirme ce que tu as vraiment payé : « C’est ça » si c’est le montant habituel, « Modifier » sinon.`
  const reste = n - lignes.length
  return {
    famille: 'sable',
    sujet: titre,
    preEntete: intro,
    ...commun('confirmer_les_charges', ctx),
    titre,
    intro,
    bouton: { texte: 'Confirmer mes factures', url: lien(ctx.base, `/budget/${d.mois.slice(0, 7)}`) },
    lien: { texte: 'Mes charges', url: lien(ctx.base, '/charges') },
    carte: {
      titre: 'À confirmer',
      lignes: lignes.map(l => ({
        point: 'safran' as const, titre: l.libelle, sous: 'Montant habituel', droite: euros(l.montant_cents),
      })),
      note: reste > 0 ? `Et ${reste} autre${s(reste)} sur l’écran du mois.` : undefined,
    },
  }
}

// ── Clôturer le mois (sable) ────────────────────────────────────────────────

function cloturer(d: DonneesCloturer, ctx: Contexte): Contenu {
  exige(estUnJour(d.mois), 'cloturer_le_mois')
  const mois = moisEnToutesLettres(d.mois)
  /* La clôture est refusée tant qu'un AUTRE membre du foyer n'a pas posé son revenu du mois (`cloture_le_mois`,
     0108) : le mail le dit au lieu de promettre une clôture qui ne viendra pas. */
  const absent = typeof d.absent === 'string' && d.absent.trim() ? prenomSur(d.absent, 'Quelqu’un') : null
  const titre = `${majuscule(mois)} se termine ce soir`
  const intro = absent
    ? `${absent} doit encore poser son revenu ${deMois(d.mois)} : tant que ce n’est pas fait, le mois ne peut pas être clôturé.`
    : 'Demain, tu pourras le clôturer : tu confirmes les factures, puis tu choisis quoi faire de ce qui reste.'
  const lignes: Contenu['carte']['lignes'] = [
    { point: 'herbe', titre: `${d.lignes} ligne${s(d.lignes)} à ton nom`, sous: 'Prévues pour le mois', droite: String(d.lignes) },
    d.a_confirmer > 0
      ? { point: 'safran', titre: `${d.a_confirmer} facture${s(d.a_confirmer)} à confirmer`, sous: 'Avant la clôture', droite: String(d.a_confirmer) }
      : { point: 'herbe', titre: 'Toutes les factures sont confirmées', sous: 'Rien à valider', droite: '0' },
  ]
  if (absent) {
    lignes.push({ point: 'safran', titre: `Le revenu ${deMois(d.mois)} de ${absent}`, sous: 'À poser avant la clôture', droite: '1' })
  }
  return {
    famille: 'sable',
    sujet: absent
      ? `${majuscule(mois)} se termine : ${absent} doit poser son revenu`
      : `${majuscule(mois)} se termine : demain, on le clôture`,
    preEntete: intro,
    ...commun('cloturer_le_mois', ctx),
    titre,
    intro,
    bouton: { texte: `Voir ${mois}`, url: lien(ctx.base, `/budget/${d.mois.slice(0, 7)}`) },
    lien: { texte: 'Mes charges', url: lien(ctx.base, '/charges') },
    carte: { titre: `Où en est ${mois}`, lignes },
  }
}

// ── Une facture annuelle approche (sable) ───────────────────────────────────

/**
 * UN mail par membre et par jour : toutes les charges annuelles qui approchent (elles tombent le même jour,
 * donc le même mois).
 */
function facture(d: DonneesFacture, ctx: Contexte): Contenu {
  const charges = arr<DonneesFacture['charges'][number]>(d.charges)
  exige(charges.length > 0 && charges.every(c =>
    typeof c.libelle === 'string' && c.libelle.trim() && estUnJour(c.mois) && estUnJour(c.derniere_paye_le)), 'facture_annuelle')
  const n = charges.length
  const mois = moisEnToutesLettres(charges[0].mois)
  const dit = (c: DonneesFacture['charges'][number]) => {
    const p = lisLeJour(c.derniere_paye_le)
    return { date: `${premier(p.jour)} ${MOIS[p.mois - 1]} ${p.annee}`, montant: euros(c.derniere_montant_cents) }
  }
  const un = dit(charges[0])
  const titre = n === 1 ? `${charges[0].libelle} : la facture arrive en ${mois}` : `${n} factures annuelles arrivent en ${mois}`
  const intro = n === 1
    ? `La dernière fois, elle est tombée le ${un.date} : ${un.montant}. Quand tu l’as, touche la ligne « mis de côté chaque mois » et ajoute la facture : seul l’écart avec le prévu s’ajoute au mois.`
    : 'Voici ce que chacune a coûté la dernière fois. Quand tu les as, touche la ligne « mis de côté chaque mois » de chaque charge et ajoute la facture : seul l’écart avec le prévu s’ajoute au mois.'
  return {
    famille: 'sable',
    sujet: n === 1 ? `${charges[0].libelle} : la facture approche` : `${n} factures annuelles approchent`,
    preEntete: intro,
    ...commun('facture_annuelle', ctx),
    titre,
    intro,
    bouton: { texte: 'Ouvrir le budget', url: lien(ctx.base, '/budget') },
    lien: { texte: 'Mes charges', url: lien(ctx.base, '/charges') },
    carte: {
      titre: n === 1 ? 'La dernière facture' : 'Les dernières factures',
      lignes: charges.map(c => {
        const x = dit(c)
        return { point: 'safran' as const, titre: x.date, sous: c.libelle, droite: x.montant }
      }),
    },
  }
}

// ── L'assemblage ────────────────────────────────────────────────────────────

/** Le contenu d'un mail, avant d'être habillé. Lève si le type est inconnu ou si les données sont fausses. */
export function contenuDe(type: string, donnees: unknown, contexte: Contexte): Contenu {
  if (!estUnType(type)) throw new Error(`Type de rappel inconnu : ${type}`)
  /* Le destinataire s'appelle « toi » quand son prénom est vide : le même repli que la base. */
  const ctx = { ...contexte, prenom: prenomSur(contexte.prenom, 'toi') }
  const d = donnees as never
  const c = {
    sortir_du_congelateur: () => sortir(d, ctx),
    barquette_perime: () => perime(d, ctx),
    choisir_les_repas: () => choisir(d, ctx),
    noter_les_depenses: () => noter(d, ctx),
    confirmer_les_charges: () => confirmer(d, ctx),
    cloturer_le_mois: () => cloturer(d, ctx),
    facture_annuelle: () => facture(d, ctx),
  }[type]()
  return ctx.exemple ? { ...c, sujet: `[Exemple] ${c.sujet}` } : c
}

/** Le mail prêt à partir : sujet, pré-en-tête, HTML et texte brut. */
export function construis(type: string, donnees: unknown, ctx: Contexte): Mail {
  const c = contenuDe(type, donnees, ctx)
  return { sujet: c.sujet, preEntete: c.preEntete, html: html(c), texte: texte(c) }
}
