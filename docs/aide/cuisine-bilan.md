---
id: cuisine-bilan
titre: Le bilan de la cuisine
ecrans: [/bilan]
questions:
  - Que montre le bilan ?
  - Comment est calculé le coût d’une part ?
  - Pourquoi mon bilan dit « Aucun repas renseigné » ?
  - Comment clore la semaine ?
  - Pourquoi certains jours sont des traits et pas des barres ?
  - À quoi sert le budget des courses dans le bilan ?
sources:
  - src/pages/Bilan.tsx
  - src/ui/bilan/Barquettes.tsx
  - src/ui/bilan/CartePersonne.tsx
  - src/ui/bilan/CeQuiEstPasse.tsx
  - src/ui/bilan/Courses.tsx
  - src/ui/bilan/Graphe.tsx
  - src/ui/bilan/echelle.ts
  - src/lib/donnees/bilan.ts
  - src/lib/suivi.ts
  - src/pages/Settings.tsx
  - src/lib/donnees/cycle.ts
  - supabase/migrations/0013_cycle.sql
  - src/pages/Choisir.tsx
  - src/lib/donnees/catalogue.ts
verifie_sur: 0021cf9
---
## Ce que fait l’appli

« Bilan » (barre du bas) se remplit tout seul : payé, mangé, jeté, et suivi de tes calories et protéines. Période : « 7 jours » (six jours d’avant et aujourd’hui), « Ce mois » (depuis le 1er) ou « 3 mois » (depuis le 1er d’il y a deux mois).

## Le budget

- « 0,00 € », en très gros, avec « payés » dessous : le total imprimé des tickets de la période, à leur date d’achat ; sans total lu, la somme des lignes.
- « X € », à droite, avec « de budget sur la période » dessous : ton « Budget des courses » mensuel (réglages), ramené à la période. La jauge dessous se remplit du payé, et passe à l’ocre au-delà.
- « N € la part » : payé ÷ barquettes dressées en session sur la période. Les plats achetés ne comptent pas.
- « N € encore estimés » : les articles sans prix payé, **jamais additionnés** au payé.
- Exemple : 320 € par mois, 7 jours : plafond 320 × 7 ÷ 30,44 = 73,59 €. Payé 87,40 € : « 13,81 € au-dessus du budget. » Sur 14 barquettes : 6,24 € la part.

## Les barquettes

Celles préparées dans la période, en trois cartes : « N mangées », « N au frais » et, s’il y en a, « N jetées ». « Ce qui est passé » : une ligne par recette, avec sa photo, une barre et « mangées / dressées » (« 6 / 6 » : tout est mangé), puis « N jetées » s’il y en a. Rien dans « Choisir » ne lit ce tableau, qui « garde la trace de ce qu’on finit et de ce qu’on jette ».

## Les courbes

Chaque personne a sa carte, avec deux graphiques : les calories (« N kcal en moyenne », en vert) et les protéines (« N g de protéines en moyenne », en safran), jamais sur le même dessin. La moyenne est en très gros. Les deux personnes se lisent à la **même échelle** : une barre de 840 kcal a la même hauteur chez l’une et chez l’autre. Une personne qui a des objectifs voit sa cible : « cible 2 200 kcal » et un trait en pointillés ; sans objectifs, rien n’est tracé. Sous chaque graphique, les jours de la semaine (sur « 7 jours »), ou les deux dates des bouts (« Ce mois », « 3 mois »).

- Calories = **plafond** : « N jours sous la cible sur les M renseignés ».
- Protéines = **plancher** : « N jours au-dessus de la cible sur les M renseignés ».
- Un **jour non renseigné est un trait gris, pas un zéro**, hors de la moyenne.
- Un jour est renseigné dès qu’un repas est « mangé » ou « sauté », ou qu’un extra est noté. Un repère choisi dans « La semaine » (« Autre chose ») ne compte que quand son repas est mangé, ou que son jour est passé.
- Les cibles viennent de tes objectifs. Sans jour renseigné : « Aucun repas renseigné sur la période. »

## Clore la semaine

La carte « Clore la semaine » n’apparaît que sous « La semaine tourne ». « Clore et préparer la semaine prochaine » demande confirmation : la semaine se termine et l’accueil repasse à « Rien de prévu ». La semaine suivante ne s’ouvre que si c’est une autre semaine.

## Ce que l’appli ne fait pas

« Rien à mesurer encore » tant qu’il n’y a ni barquette, ni ticket, ni article estimé, ni repas renseigné. Le bilan ne suit que les calories et les protéines (ni glucides, ni lipides).
