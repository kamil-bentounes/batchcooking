---
id: cuisine-dressage
titre: Le dressage, « On range » et les barquettes
ecrans: [/dressage]
questions:
  - Comment dresser les barquettes après la cuisine ?
  - Que fait le bouton « C’est dressé » ?
  - Pourquoi celle qui n’a pas d’objectifs a-t-elle des parts égales ?
  - Que se passe-t-il quand j’appuie sur « C’est dressé » ?
sources:
  - src/pages/Dressage.tsx
  - src/lib/nutrition/portions.ts
  - src/lib/donnees/barquettes.ts
verifie_sur: 99e3953
---
## Ce que fait l’appli

Une session produit des **barquettes**, pas des recettes : nommées, datées, avec leurs calories et leurs protéines. Le dressage a **deux étapes sur le même écran** : on dresse, puis « On range » (« cuisine-on-range »). Tu y arrives par « Passer au dressage » ou « Dresser les barquettes ». Le calcul des poids est expliqué dans « cuisine-portions ».

## Étape 1 : dresser

Pour chaque recette : « N × G g pour <prénom> », les kcal et les g de protéines d’une part, et une phrase d’explication. S’il faut un complément : « + N g de skyr pour <prénom> ». Remplis tes barquettes à ces poids ; il n’y a rien à saisir. Celui ou celle qui n’a pas fixé ses objectifs a quand même ses parts, au poids moyen des autres (« … parts égales »). **« C’est dressé »** ouvre la seconde étape ; rien n’est encore créé.

## Étape 2 : « On range »

Frigo ou congélateur, l’heure du rangement, « La session a pris » et « Ranger les N barquettes » : tout est dans « cuisine-on-range ». Rien n’est posé tout seul sur les jours de la semaine : tu choisis ce que tu manges quand.

## Si ça échoue

Appuie de nouveau sur « Ranger » : les barquettes déjà créées ne sont pas refaites et les ingrédients ne sont pas retirés deux fois (« cuisine-on-range »). Sans recette retenue : « Rien à dresser ».
