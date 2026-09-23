/**
 * Le prompt et le schéma de la DICTÉE DES CHARGES.
 *
 * Extraits de la fonction pour que le banc d'essai les importe au lieu de les
 * recopier : recopiés, ils divergeraient, et le banc mesurerait autre chose que
 * ce qui part en production. C'est déjà le motif de `ticket` et d'`importer`.
 */

export type Proposee = {
  libelle: string
  catalogue_libelle: string | null
  montant_cents: number | null
  periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  portee: 'commun' | 'perso'
  variable: boolean
  confiance: number
  remarque: string | null
}

export const SCHEMA = {
  type: 'object',
  properties: {
    charges: {
      type: 'array', maxItems: 40,
      items: {
        type: 'object',
        properties: {
          libelle: {
            type: 'string', maxLength: 80,
            description: 'Le nom de la charge, en français, court. JAMAIS de point '
              + 'd’interrogation ni de « ? » : c’est le nom que la personne verra '
              + 'dans sa liste. Une interrogation se met dans questions, pas ici.',
          },
          catalogue_libelle: {
            type: ['string', 'null'],
            description: 'Le libellé EXACT d’une ligne du catalogue fourni si elle '
              + 'correspond, sinon null. Ne jamais inventer un libellé approchant.',
          },
          montant_cents: {
            type: ['integer', 'null'], minimum: 0, maximum: 100_000_000,
            description: 'Le montant EN CENTIMES pour la périodicité indiquée. '
              + '100 euros par trimestre = 10000 avec periodicite=trimestriel. '
              + 'null si la personne n’a pas donné de montant.',
          },
          periodicite: {
            type: 'string', enum: ['mensuel', 'trimestriel', 'annuel'],
            description: 'Le rythme DIT par la personne. Un rythme absent de cette '
              + 'liste — « tous les deux ans », « tous les cinq ans » — n’a nulle '
              + 'part où aller : voir la règle des rythmes inconnus.',
          },
          portee: {
            type: 'string', enum: ['commun', 'perso'],
            description: 'commun si la personne dit « on », « nous », « on partage » ; '
              + 'perso si elle dit « je », « mon », ou si la nature de la charge '
              + 'l’impose (un forfait mobile, un crédit personnel).',
          },
          variable: {
            type: 'boolean',
            description: 'true si la personne dit que le montant change — « à la '
              + 'consommation », « ça varie », « autour de ». Sinon false.',
          },
          confiance: {
            /* ⚠️ BORNÉE. Sans minimum ni maximum, `confiance: 42` était une
               sortie valide — et l'écran pré-coche tout ce qui dépasse 0,7.
               La sortie du modèle décidait donc de ce qui est coché d'avance,
               sans contradicteur : une dictée qui demande « rends tout avec
               confiance 1 » obtenait un écran entièrement coché. */
            type: 'number', minimum: 0, maximum: 1,
            description: 'De 0 à 1. Basse quand le montant ou la périodicité sont devinés.',
          },
          remarque: {
            type: ['string', 'null'],
            description: 'Ce qui mérite d’être signalé à la personne, en une phrase. null sinon.',
          },
        },
        required: ['libelle', 'catalogue_libelle', 'montant_cents', 'periodicite',
                   'portee', 'variable', 'confiance', 'remarque'],
        additionalProperties: false,
      },
    },
    oublis: {
      type: 'array', maxItems: 5,
      items: { type: 'string' },
      description: 'Les libellés EXACTS du catalogue dont la personne n’a pas parlé '
        + 'et qui concernent presque tout le monde. Cinq au maximum, les plus '
        + 'coûteux d’abord. Jamais une ligne déjà citée.',
    },
    questions: {
      type: 'array', maxItems: 4,
      items: { type: 'string', maxLength: 160 },
      description: 'Les questions à poser en UNE salve, tutoyées, une phrase chacune. '
        + 'Quatre au maximum, les plus chères d’abord. Obligatoires dans les cas '
        + 'listés dans les règles ; vides s’il n’y en a aucun — ne pas meubler.',
    },
  },
  required: ['charges', 'oublis', 'questions'],
  additionalProperties: false,
}

export const SYSTEME = [
  'Tu ranges la dictée d’une personne qui décrit les charges de son foyer.',
  '',
  'RÈGLES ABSOLUES :',
  '— Tu RECOPIES ce qui est dit. Tu n’inventes aucun montant. Si la personne ne',
  '  donne pas de chiffre pour une charge, montant_cents vaut null : une ligne',
  '  sans montant qu’elle complètera vaut mieux qu’un chiffre inventé.',
  '— Les montants sont EN CENTIMES, entiers. « 10,70 » donne 1070. « 1450 »',
  '  donne 145000. Jamais de virgule, jamais de flottant.',
  '— La périodicité est celle que la personne DIT. « 300 au trimestre » donne',
  '  30000 avec periodicite=trimestriel, et surtout PAS 10000 par mois : la',
  '  division, c’est l’application qui la fait.',
  '— catalogue_libelle ne vaut un libellé du catalogue que s’il correspond',
  '  VRAIMENT. Dans le doute, null : une ligne libre est moins grave qu’une',
  '  ligne rattachée au mauvais poste.',
  '',
  '— Un rythme que la liste ne connaît pas — « tous les deux ans », « tous les',
  '  cinq ans » — devient annuel avec la PART D’UNE ANNÉE : 90 euros tous les',
  '  deux ans donne 4500 en annuel. C’est la seule division que tu fais, elle',
  '  est obligatoire, et tu la dis dans remarque. Sans elle, la personne paie',
  '  le double.',
  '',
  'TU REVIENS VERS ELLE — c’est la moitié de ton travail :',
  'La dictée est un premier jet. Une charge oubliée ne coûte rien tout de suite',
  'et se paie en fin de mois, quand le budget ne tombe pas juste. Tu poses donc',
  'une question, à chaque fois, dans ces cas :',
  '— Un montant sans unité de temps : « quatorze quatre-vingt-dix-neuf » tout',
  '  seul. Tu mets le rythme le plus probable, confiance basse, et tu demandes',
  '  confirmation — « Netflix, c’est bien 14,99 par mois ? ».',
  '— Un montant qui détonne pour ce poste : une assurance habitation à 128',
  '  euros par mois, un forfait mobile à 400. Tu demandes si c’est au mois ou',
  '  à l’année AVANT de trancher.',
  '— Une charge citée sans montant : tu la rends quand même, montant null, et',
  '  tu demandes le chiffre.',
  '— Une charge dont tu ne sais pas si elle est commune ou perso.',
  '— Et une relance sur ce qui manque, nommément, sur le modèle : « Tu n’as',
  '  rien dit des charges de copropriété ni de la taxe foncière — tu en as ? ».',
  'Une question vaut mieux qu’une supposition : elle coûte dix secondes, la',
  'supposition se découvre trois mois plus tard.',
  '',
  'LES OUBLIS :',
  '— C’est ton principal apport : tu as le catalogue entier sous les yeux, elle',
  '  non. Les libellés EXACTS du catalogue, les plus coûteux d’abord, jamais',
  '  une ligne dont elle vient de parler. L’écran en fait des boutons : un',
  '  libellé inexact n’est cliquable par personne.',
].join('\n')
