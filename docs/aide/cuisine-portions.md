---
id: cuisine-portions
titre: Le calcul des portions et le complément de skyr
ecrans: [/dressage]
questions:
  - Comment sont calculées les portions de chacun ?
  - Pourquoi l’appli propose du skyr en complément ?
  - Pourquoi mes parts sont-elles égales à celles de l’autre ?
  - Que veut dire « la part est en dessous de l’objectif » ?
  - Pourquoi ma part est plus grosse que celle de l’autre ?
  - Que veut dire « Recette mal quantifiée » ?
sources:
  - src/pages/Dressage.tsx
  - src/lib/nutrition/portions.ts
  - src/lib/nutrition/macros.ts
  - src/lib/donnees/recettes.ts
  - src/lib/donnees/foyer.ts
verifie_sur: 7bb3825
---
## Ce que fait l’appli

Tout le monde mange la même chose ; seule la **portion** diffère. Une part plus grosse donne plus de tout : quand le plat manque de protéines, l’appli ajoute du skyr plutôt que de grossir la part.

## Les règles de calcul

- Les parts d’une recette se répartissent **à parts égales entre les membres du foyer** (6 parts, 2 personnes : 3 et 3). Si c’est impair, la première personne du foyer en a une de plus.
- Le **poids du plat** est la somme de ses ingrédients reconnus dont le poids est connu ou habituel. Il se découpe au prorata de l’objectif de chacun pour un dîner, soit **35 %** de sa journée en calories, pondéré par son nombre de parts.
- Exemple : plat de 1 200 g, 6 parts, deux personnes à 2 500 et 1 800 kcal par jour. Cibles du repas : 875 et 630 kcal ; 3 × 875 + 3 × 630 = 4 515. Parts : 1 200 × 875 ÷ 4 515 ≈ **233 g**, 1 200 × 630 ÷ 4 515 ≈ **167 g**.

## Les trois cas

- Part **sous 90 %** de l’objectif en calories : « la part est N % en dessous de l’objectif ». Le plat est trop petit pour ce nombre de barquettes : cuisine plus, ou prévois moins de parts. Le skyr n’y change rien.
- Part **au-dessus de 115 %** : fais une barquette de plus plutôt que des parts trop grosses.
- Calories bonnes mais protéines **sous 90 %** de l’objectif du repas : « + N g de skyr pour <prénom> ». Le skyr compte 10 g de protéines pour 100 g ; la quantité est arrondie à 25 g. Exemple : 30 g de protéines pour un objectif de 40 g : « + 100 g de skyr ».

## Sans objectifs

Quelqu’un qui n’a pas fixé ses objectifs a quand même ses barquettes : « … n’a pas encore fixé ses objectifs : ses barquettes sont dressées à parts égales. » Chacune pèse la **moyenne** des parts des autres, et aucun complément de skyr ne lui est proposé. Si personne n’a d’objectifs, toutes les parts sont égales. « Fixe tes objectifs » mène à l’écran des objectifs.

## Recette mal quantifiée

Si moins de 75 % des lignes ont à la fois un aliment connu et un poids, l’écran affiche « Recette mal quantifiée : les parts sont égales, faute de mieux. » Elles ne le sont pas : le calcul est le même, sur un plat qui ne pèse que les ingrédients reconnus, donc trop léger.

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de réglage du complément (c’est toujours du skyr) ni de la part du dîner (35 %).
