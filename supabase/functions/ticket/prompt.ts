/**
 * Le prompt et le schéma de la lecture de ticket.
 *
 * Séparés de la fonction pour une raison précise : le banc d'essai
 * (`scripts/banc-ticket.mjs`) les IMPORTE. Recopiés, ils divergeraient — et le
 * banc mesurerait alors autre chose que ce qui part en production, ce qui est
 * la façon la plus coûteuse de se rassurer.
 */
export type Ligne = {
  label: string
  quantity: number | null
  unit: string | null
  unit_price_eur: number | null
  price_eur: number
  remise_eur: number | null
  confiance: number
}

export const SCHEMA = {
  type: 'object',
  properties: {
    enseigne: {
      type: ['string', 'null'],
      description: 'Le nom du magasin, lu en haut du ticket : « Carrefour », '
        + '« Lidl », « Grand Frais ». null s’il n’est pas lisible.',
    },
    date: {
      type: ['string', 'null'],
      description: 'La date d’achat au format AAAA-MM-JJ. null si illisible. '
        + 'N’invente pas la date du jour.',
    },
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Le libellé TEL QU’IMPRIMÉ sur le ticket, sans le '
              + 'développer ni le corriger : « PDT CHARLOTTE 2.5KG », '
              + '« FIL PLT x2 ». C’est lui qui permettra de reconnaître le même '
              + 'produit au ticket suivant.',
          },
          quantity: {
            type: ['number', 'null'],
            description: 'La quantité achetée, quand le ticket l’imprime : le '
              + 'nombre d’articles, ou le poids pesé. null sinon.',
          },
          unit: {
            type: ['string', 'null'],
            enum: ['u', 'g', 'kg', 'ml', 'l', null],
            description: 'L’unité de cette quantité. « u » pour un nombre '
              + 'd’articles, « kg » pour un poids pesé en caisse.',
          },
          unit_price_eur: {
            type: ['number', 'null'],
            description: 'Le prix unitaire quand le ticket l’imprime (souvent '
              + '« 2,49 €/kg » ou « x 1,20 »). null sinon.',
          },
          price_eur: {
            type: 'number',
            description: 'Le montant PAYÉ pour cette ligne, en euros, remise '
              + 'déduite. C’est le chiffre de la colonne de droite. Toujours '
              + 'positif : une remise n’est pas une ligne.',
          },
          remise_eur: {
            type: ['number', 'null'],
            description: 'Le montant de la remise appliquée à CE produit, en '
              + 'positif, quand une ligne de remise le suit. null sinon.',
          },
          confiance: {
            type: 'number',
            minimum: 0,
            maximum: 1,
            description: '1 quand la ligne est nette. 0,5 quand le papier est '
              + 'froissé ou l’impression pâle. En dessous de 0,3, ne la liste pas.',
          },
        },
        required: ['label', 'quantity', 'unit', 'unit_price_eur', 'price_eur',
                   'remise_eur', 'confiance'],
        additionalProperties: false,
      },
    },
    total_eur: {
      type: ['number', 'null'],
      description: 'Le TOTAL imprimé en bas du ticket, en euros. Recopie-le, '
        + 'ne l’additionne pas toi-même : c’est ce qui permettra de vérifier '
        + 'la lecture ligne à ligne.',
    },
    lisible: {
      type: 'boolean',
      description: 'false si la photo est floue, coupée, ou ne montre pas un '
        + 'ticket de caisse. Dans ce cas, lignes doit être vide.',
    },
    commentaire: {
      type: ['string', 'null'],
      description: 'Une phrase si quelque chose gêne la lecture : « le bas du '
        + 'ticket est coupé », « trois lignes sont effacées ». Sinon null.',
    },
  },
  required: ['enseigne', 'date', 'lignes', 'total_eur', 'lisible', 'commentaire'],
  additionalProperties: false,
}

export const SYSTEME = [
  '<role>',
  'Tu lis un ticket de caisse de supermarché pour une application de cuisine qui',
  's’en sert pour apprendre le prix de chaque produit dans chaque enseigne.',
  '</role>',
  '',
  '<pourquoi>',
  'Ces prix serviront à estimer les courses des semaines suivantes. Un prix lu de',
  'travers ne fait pas une erreur isolée : il se propage à toutes les estimations',
  'qui viendront. Une ligne que tu n’es pas sûr d’avoir lue doit donc porter une',
  'confiance basse, jamais un chiffre inventé.',
  '</pourquoi>',
  '',
  '<methode>',
  'Procède dans cet ordre, sans sauter d’étape :',
  '1. Lis l’en-tête : l’enseigne et la date.',
  '2. Descends ligne à ligne, dans l’ordre du papier. Ne réordonne pas.',
  '3. Pour chaque ligne, recopie le libellé TEL QU’IMPRIMÉ, puis le montant de',
  '   la colonne de droite.',
  '4. Si une ligne de remise suit un produit, soustrais-la du montant de CE',
  '   produit et note-la dans remise_eur.',
  '5. Recopie le total imprimé en bas, sans le recalculer.',
  '</methode>',
  '',
  '<regles>',
  '· Ne développe pas les abréviations et ne corrige pas l’orthographe : c’est',
  '  le libellé imprimé qui permettra de reconnaître le produit la fois suivante.',
  '· price_eur est toujours POSITIF et correspond à ce qui a été payé pour cette',
  '  ligne, remise déduite.',
  '· N’invente aucune ligne pour faire tomber le total juste. Si ta lecture ne',
  '  tombe pas sur le total imprimé, laisse l’écart : il est plus utile qu’un',
  '  chiffre arrangé.',
  '· Ignore tout ce qui n’est pas un achat : sous-totaux, TVA, points de',
  '  fidélité, cagnotte, rendu monnaie, moyen de paiement, publicité.',
  '· Les articles non alimentaires (sacs, papier, lessive) se listent comme les',
  '  autres : ils comptent au budget.',
  '· Les montants sont en euros, avec un point décimal.',
  '</regles>',
  '',
  '<exemple>',
  'Pour un ticket portant :',
  '  PDT CHARLOTTE 2.5KG              3.99',
  '  FIL PLT                          6.49',
  '  REMISE FIDELITE                 -0.50',
  '  CARTE FIDELITE 12 POINTS',
  '  TOTAL                            9.98',
  'tu rends :',
  '[',
  '  {"label":"PDT CHARLOTTE 2.5KG","quantity":2.5,"unit":"kg",',
  '   "unit_price_eur":1.60,"price_eur":3.99,"remise_eur":null,"confiance":1},',
  '  {"label":"FIL PLT","quantity":null,"unit":null,',
  '   "unit_price_eur":null,"price_eur":5.99,"remise_eur":0.50,"confiance":1}',
  ']',
  'La ligne de fidélité n’est pas un achat, et la remise a été déduite du poulet.',
  '</exemple>',
].join('\n')

