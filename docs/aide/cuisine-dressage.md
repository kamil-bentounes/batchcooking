---
id: cuisine-dressage
titre: Le dressage et les barquettes
ecrans: [/dressage]
questions:
  - Comment dresser les barquettes après la cuisine ?
  - Que fait le bouton « C’est dressé, ranger » ?
  - Pourquoi mes barquettes vont au frigo ou au congélateur ?
  - Combien de temps se garde une barquette ?
  - Comment sont réparties les barquettes sur la semaine ?
sources:
  - src/pages/Dressage.tsx
  - src/lib/nutrition/portions.ts
  - src/lib/donnees/barquettes.ts
  - src/lib/semaine.ts
  - supabase/migrations/0047_peremption_donnee.sql
  - src/pages/Stock.tsx
verifie_sur: bd10d8c
---
## Ce que fait l’appli

Une session produit des **barquettes**, pas des recettes : nommées, datées, avec leurs calories et leurs protéines. « Dresse N barquettes » dit combien en faire, de quel poids, pour qui. Tu y arrives par « Passer au dressage » ou « Dresser les barquettes ». Le calcul des poids est expliqué dans « cuisine-portions ».

## Comment faire

1. Pour chaque recette : « N × G g pour <prénom> », les kcal et les g de protéines d’une part, et une phrase d’explication. S’il faut un complément : « + N g de skyr pour <prénom> ».
2. Remplis tes barquettes en suivant ces poids. L’écran dit « Pèse-les : c’est la seule pesée de la semaine », mais il n’y a pas de champ pour saisir une pesée : rien ne s’enregistre.
3. **« C’est dressé, ranger »** (« Je range… ») crée les barquettes, propose une répartition sur la semaine, puis ouvre « La semaine ».

## Frigo ou congélateur

Pour chaque personne, les **4 premières barquettes** (toutes recettes confondues, dans l’ordre des recettes retenues) vont au frigo, les suivantes au congélateur. Une barquette se garde **4 jours** au frigo à partir de sa préparation, **90 jours** au congélateur, **24 heures** une fois décongelée.

## La répartition proposée

Chacun reçoit **un dîner par jour, à partir de demain**, les barquettes les plus pressées d’abord : celles du frigo, puis celles du congélateur. Avec plus de quatre barquettes, la cinquième tombe donc sur le cinquième jour, et ainsi de suite, même au-delà de sept jours. L’appli ne dit pas de sortir du congélateur à l’avance : « Décongeler » se fait à la main dans « Ce que j’ai ». Une case déjà mangée ou sautée n’est jamais écrasée (sa barquette reste « sans jour »). Tout se déplace ensuite dans « La semaine ». Sous le bouton, le texte écrit la date de demain en chiffres (« 2026-10-24 »).

## Si ça échoue

Le bouton reste actif : appuie de nouveau, les barquettes déjà créées ne sont pas refaites. Le dressage n’a lieu qu’une fois par semaine. Sans recette retenue : « Rien à dresser ». Si personne n’a fixé ses objectifs, le bouton répond aussi « Rien à dresser. ».
