/**
 * Le prompt et le schéma de la REVUE DES CHARGES.
 *
 * Extraits de la fonction pour que le banc d'essai les importe au lieu de les
 * recopier — même motif que `charges/prompt.ts`, `ticket` et `importer` :
 * recopiés, ils divergeraient, et le banc mesurerait autre chose que ce qui
 * part en production.
 *
 * Ce que fait cette revue, et ce qu'elle ne fait PAS :
 *
 *  · Elle LIT les charges déjà posées et dit ce qui cloche. Elle n'écrit rien,
 *    ne corrige rien, ne supprime rien. Comme la dictée (D28, D57), c'est un
 *    accélérateur, jamais une autorité : l'écran montre, la personne décide.
 *  · Elle n'a le droit de citer QUE des libellés qu'on lui a donnés. Un modèle
 *    qui invente une ligne pour avoir quelque chose à dire fait perdre plus de
 *    temps qu'il n'en fait gagner — on relit tout pour trouver une charge qui
 *    n'existe pas.
 *  · Elle se tait quand tout va bien. Une revue qui trouve toujours trois
 *    choses n'est plus une revue, c'est un horoscope.
 */

export type Doublon = { libelles: string[]; pourquoi: string }
export type Incoherence = { libelle: string; quoi: string; question: string }

export type Revue = {
  doublons: Doublon[]
  incoherences: Incoherence[]
  oublis: string[]
  verdict: string
}

export const SCHEMA = {
  type: 'object',
  properties: {
    doublons: {
      type: 'array', maxItems: 6,
      items: {
        type: 'object',
        properties: {
          libelles: {
            type: 'array', minItems: 2, maxItems: 4,
            items: { type: 'string', maxLength: 80 },
            description: 'Les libellés EXACTS, recopiés de la liste fournie, des '
              + 'lignes qui font double emploi. Jamais un libellé reformulé : '
              + 'l’écran s’en sert pour retrouver la ligne.',
          },
          pourquoi: {
            type: 'string', maxLength: 200,
            description: 'Pourquoi c’est la même dépense deux fois, en une phrase '
              + 'tutoyée. Dis laquelle des deux tu garderais.',
          },
        },
        required: ['libelles', 'pourquoi'],
        additionalProperties: false,
      },
      description: 'La même dépense saisie deux fois, sous deux noms, ou une ligne '
        + 'déjà comprise dans une autre. Vide s’il n’y en a pas.',
    },
    incoherences: {
      type: 'array', maxItems: 8,
      items: {
        type: 'object',
        properties: {
          libelle: {
            type: 'string', maxLength: 80,
            description: 'Le libellé EXACT, recopié de la liste fournie. Jamais '
              + 'un nom approchant : l’écran ne retrouverait pas la ligne.',
          },
          quoi: {
            type: 'string', maxLength: 200,
            description: 'Ce qui cloche, en une phrase tutoyée, avec le chiffre '
              + 'qui te fait tiquer et celui que tu attendrais.',
          },
          question: {
            type: 'string', maxLength: 160,
            description: 'La question fermée à poser pour trancher. Une seule.',
          },
        },
        required: ['libelle', 'quoi', 'question'],
        additionalProperties: false,
      },
    },
    oublis: {
      type: 'array', maxItems: 5,
      items: { type: 'string' },
      description: 'Les libellés EXACTS du catalogue absents de la liste et qui '
        + 'concernent presque tout le monde. Cinq au maximum, les plus coûteux '
        + 'd’abord. Jamais une ligne déjà posée. L’écran en fait des boutons : '
        + 'un libellé inexact n’est cliquable par personne.',
    },
    verdict: {
      type: 'string', maxLength: 200,
      description: 'Une phrase tutoyée qui dit l’état général. Quand tout va bien, '
        + 'dis-le franchement et n’ajoute rien.',
    },
  },
  required: ['doublons', 'incoherences', 'oublis', 'verdict'],
  additionalProperties: false,
}

export const SYSTEME = [
  'Tu relis les charges déjà saisies par un foyer et tu dis ce qui cloche.',
  '',
  'RÈGLES ABSOLUES :',
  '— La liste fournie est la VÉRITÉ. Tu n’inventes aucune ligne, aucun montant.',
  '  Chaque libelle que tu cites est RECOPIÉ CARACTÈRE POUR CARACTÈRE de la',
  '  liste : l’écran s’en sert pour retrouver la ligne et la mettre en avant.',
  '  Un libellé approchant ne désigne rien et fait chercher dans le vide.',
  '— Tu ne corriges rien et tu ne proposes aucune écriture. Tu signales, tu',
  '  poses une question, la personne tranche.',
  '— Tu te TAIS quand tout va bien. Trois listes vides et un verdict d’une',
  '  phrase est une réponse parfaitement valable. Une revue qui trouve toujours',
  '  quelque chose ne se lit plus.',
  '',
  'LES DOUBLONS — c’est ton PREMIER travail, celui qu’on te demande :',
  '— Deux noms pour une chose : « Internet » et « Box », « Netflix » et',
  '  « Streaming vidéo », « Élec » et « Électricité », « Mutuelle » et',
  '  « Complémentaire santé ». Un abrégé, une marque et un nom générique',
  '  désignent souvent le même prélèvement. Compare les MONTANTS : deux lignes',
  '  au même montant et au même rythme sont un doublon jusqu’à preuve du',
  '  contraire.',
  '— Une ligne DÉJÀ COMPRISE dans une autre : l’eau est souvent incluse dans',
  '  les charges de copropriété, l’assurance emprunteur dans la mensualité de',
  '  prêt. Signale-le comme un doublon probable, avec un « vérifie ».',
  '',
  'LES INCOHÉRENCES — par ordre de ce que ça coûte :',
  '— L’ERREUR D’UNITÉ, la plus chère et la plus fréquente : un montant annuel',
  '  saisi en mensuel, ou l’inverse. Une taxe foncière à 1450 par MOIS, une',
  '  assurance habitation à 128 par mois, un forfait mobile à 400. Un facteur',
  '  douze passe inaperçu à la saisie et fausse tout le budget.',
  '— Un montant nul ou absurde sur une charge qui, elle, existe.',
  '— Une charge dont le montant VARIE et qui n’a pas d’enveloppe : rien ne la',
  '  plafonnera, et sa jauge restera vide.',
  '— Une charge sans compte : l’application saura dire combien, jamais où virer.',
  '',
  'CE QUI EST NORMAL, et que tu ne signales donc PAS :',
  '— LE COMPTE QUI DÉBITE N’A RIEN À VOIR AVEC QUI PORTE LA CHARGE. Une charge',
  '  perso payée depuis le compte joint est le cas ORDINAIRE : l’application',
  '  sépare « où virer » de « qui paie », et elle sait rendre à chacun sa part.',
  '  Ne signale jamais ce croisement — c’est le bruit le plus fréquent, et il',
  '  revient à chaque relecture puisque rien ne change.',
  '— Une mensualité de prêt à 580, une taxe foncière à 1450 par AN, des charges',
  '  de copropriété à 300 par TRIMESTRE, une assurance habitation à 10,70 par',
  '  mois. Ce sont des ordres de grandeur ordinaires.',
  '— Une charge perso qui n’est pas partagée. C’est une décision, pas un défaut.',
  '— Un poste absent : ça se dit dans oublis, jamais dans incoherences.',
  '',
  'LES OUBLIS :',
  '— C’est ton second apport : tu as le catalogue entier sous les yeux, la',
  '  personne non. Les libellés EXACTS du catalogue, jamais un poste déjà posé.',
  '— Ne propose PAS un poste que la liste CONTREDIT. « Loyer » à quelqu’un qui',
  '  a une mensualité de prêt, « Taxe foncière — locatif » à qui n’a pas de',
  '  locatif : il ne peut pas avoir les deux, et tu lui fais relire pour rien.',
  '— Ne propose PAS un poste déjà COMPRIS dans un autre : l’eau quand il y a',
  '  des charges de copropriété, l’assurance emprunteur quand il y a une',
  '  mensualité de prêt.',
  '— Ne propose PAS un poste qui suppose un équipement dont rien ne prouve',
  '  l’existence : essence, assurance auto, contrôle technique, péages et',
  '  stationnement supposent une VOITURE. S’il n’y a aucune ligne d’auto dans',
  '  la liste, n’en propose au plus qu’UNE, et pas cinq.',
  '— Commence par ce que presque tout adulte paie quoi qu’il arrive : forfait',
  '  mobile, mutuelle, cadeaux et anniversaires, vêtements.',
].join('\n')

/**
 * Ce qui reste de la réponse du modèle une fois le vérifiable vérifié.
 *
 * ⚠️ Fonction PURE, et exportée, pour une seule raison : le filtre est la
 *    garantie, le prompt n'est qu'une consigne. Laissé au milieu de la
 *    fonction Deno, il n'était éprouvé par rien — or c'est lui qui tient les
 *    trois promesses qu'on fait à l'écran :
 *
 *      · aucune ligne citée qui n'existe pas chez ce foyer ;
 *      · aucun « oubli » qui est en réalité déjà posé ;
 *      · aucun « oubli » que ce qui est posé rend sans objet (0087).
 *
 *    Le banc mesure le modèle ; ce test-ci mesure ce qu'on affiche.
 */
export function filtre(brut: Partial<Revue>, foyer: {
  /** Les libellés des charges du foyer, et leur poste de catalogue s'il y en a. */
  postes: string[]
  /** Les libellés du catalogue rendus sans objet par ce que le foyer a posé. */
  exclus: string[]
}): Revue {
  const postes = new Set(foyer.postes)
  const exclus = new Set(foyer.exclus)
  return {
    doublons: (brut.doublons ?? [])
      .map(d => ({ ...d, libelles: (d.libelles ?? []).filter(l => postes.has(l)) }))
      /* Un « doublon » réduit à une seule ligne n'est plus un doublon : il ne
         désigne plus rien, et l'afficher ferait chercher le jumeau absent. */
      .filter(d => d.libelles.length >= 2),
    incoherences: (brut.incoherences ?? []).filter(i => postes.has(i.libelle)),
    oublis: (brut.oublis ?? []).filter(o => !postes.has(o) && !exclus.has(o)),
    verdict: brut.verdict ?? '',
  }
}

/** Les postes du catalogue que ce foyer rend sans objet. */
export function sansObjet(
  catalogue: { libelle: string; exclu_par: string[] | null }[],
  postes: string[],
): string[] {
  const p = new Set(postes)
  return catalogue
    .filter(l => (l.exclu_par ?? []).some(x => p.has(x)))
    .map(l => l.libelle)
}
