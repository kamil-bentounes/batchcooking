/**
 * Découper une recette collée en texte libre.
 *
 * ⚠️ Le modèle ne fait QU'UNE chose ici : séparer le titre, les parts, les
 *    lignes d'ingrédient et les étapes. Il ne convertit pas, ne calcule rien,
 *    n'invente aucune quantité.
 *
 *    Tout le reste — lire « 500 g de poireaux », reconnaître le verbe, trouver
 *    l'appareil, rattacher à CIQUAL, calculer les macros — est fait par le
 *    déterministe qui fait déjà tourner l'ingestion de 1 400 recettes. Il est
 *    mesuré, corrigeable et gratuit ; un modèle ne ferait pas mieux et le
 *    ferait différemment à chaque appel.
 *
 *    C'est aussi ce qui garantit qu'une recette collée a EXACTEMENT la même
 *    forme en base qu'une recette ingérée : mêmes filtres, même ordonnanceur,
 *    mêmes macros avec leur fourchette.
 */

export const SCHEMA = {
  type: 'object',
  properties: {
    titre: {
      type: ['string', 'null'],
      description: 'Le nom du plat, tel qu’il est écrit. null si le texte n’en '
        + 'donne pas — ne l’invente pas.',
    },
    parts: {
      type: ['integer', 'null'],
      minimum: 1,
      maximum: 50,
      description: 'Pour combien de personnes. Attention : « 1 tarte pour 8 '
        + 'personnes » fait 8, pas 1. null si le texte ne le dit pas.',
    },
    ingredients: {
      type: 'array',
      description: 'Une entrée par LIGNE d’ingrédient, recopiée TELLE QUELLE, '
        + 'quantité comprise : « 500 g de poireaux », « 2 oignons ». Ne convertis '
        + 'rien, ne normalise rien, n’ajoute aucune quantité absente.',
      items: { type: 'string' },
    },
    etapes: {
      type: 'array',
      description: 'Une entrée par GESTE, dans l’ordre. Si une phrase en contient '
        + 'plusieurs (« épluchez puis émincez »), coupe-la. Recopie le texte sans '
        + 'le réécrire : les durées et les températures qu’il contient serviront.',
      items: { type: 'string' },
    },
    manque: {
      type: 'array',
      description: 'Ce que le texte ne dit pas et qu’il faudra compléter à la '
        + 'main : « aucune durée », « pas de nombre de parts ». Une phrase par '
        + 'manque, au plus trois. Vide si tout y est.',
      items: { type: 'string' },
    },
  },
  required: ['titre', 'parts', 'ingredients', 'etapes', 'manque'],
  additionalProperties: false,
}

export const SYSTEME = [
  '<role>',
  'Tu ranges une recette écrite en texte libre — collée depuis un site, un',
  'carnet ou un message — dans quatre cases : le titre, le nombre de parts, les',
  'lignes d’ingrédients, les gestes.',
  '</role>',
  '',
  '<pourquoi>',
  'Ce que tu rends sera relu et corrigé à l’écran, puis servira à faire des',
  'courses et à calculer des apports. Une ligne recopiée fidèlement se corrige',
  'd’un geste ; une quantité inventée passe inaperçue et fausse tout le reste.',
  'Dans le doute, laisse null et dis-le dans « manque ».',
  '</pourquoi>',
  '',
  '<regles>',
  '· RECOPIE, ne réécris pas. « 500 g de poireaux » reste « 500 g de poireaux ».',
  '  Le reste de l’application sait lire ces lignes ; elle ne sait pas deviner',
  '  ce que tu aurais reformulé.',
  '· N’invente AUCUNE quantité, AUCUNE durée, AUCUN ingrédient. Ce qui manque',
  '  se dit dans « manque », et quelqu’un le complétera.',
  '· Un geste par étape. « Épluchez et émincez les oignons » fait deux étapes.',
  '· Laisse dans le texte des étapes les durées et les températures : « 40 min »,',
  '  « 180 °C ». Elles seront lues ensuite.',
  '· Jette ce qui n’est ni ingrédient ni geste : l’introduction, les conseils de',
  '  service, les commentaires, la publicité.',
  '· Écris en français.',
  '</regles>',
  '',
  '<exemple>',
  'Pour « Tarte aux poireaux (pour 6). Il vous faut : 3 poireaux, 200 g de crème,',
  'une pâte brisée. Préchauffez le four à 180°C. Émincez les poireaux et faites-les',
  'revenir 10 minutes. Versez sur la pâte et enfournez 35 minutes. Servez chaud. »',
  'tu rends :',
  '{"titre":"Tarte aux poireaux","parts":6,',
  ' "ingredients":["3 poireaux","200 g de crème","une pâte brisée"],',
  ' "etapes":["Préchauffez le four à 180°C","Émincez les poireaux",',
  '           "Faites-les revenir 10 minutes","Versez sur la pâte",',
  '           "Enfournez 35 minutes"],',
  ' "manque":[]}',
  'Remarque : « Servez chaud » n’est pas un geste de préparation, il disparaît.',
  '</exemple>',
].join('\n')
