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
  - src/ui/dressage/Habillage.tsx
  - src/lib/dressage.ts
  - src/lib/nutrition/portions.ts
  - src/lib/donnees/barquettes.ts
verifie_sur: 2ff18ce
---
## Ce que fait l’appli

Une session produit des **barquettes**, pas des recettes : nommées, datées, avec leurs calories et leurs protéines. Le dressage a **deux étapes sur le même écran**, rappelées en haut par « 1 Dresser · 2 Ranger » (l’étape en cours est en safran) : on dresse, puis « On range » (« cuisine-on-range »). Tu y arrives par « Passer au dressage » ou « Dresser les barquettes ». Le calcul des poids est expliqué dans « cuisine-portions ».

## Étape 1 : dresser

Le titre donne le total en grand : « Dresse 30 barquettes », avec « Remplis chacune au poids indiqué : c’est ce qui rend les parts justes. » Dessous, une rangée de compteurs : le nombre de barquettes de chaque recette (« 6 Lasagnes », « 2 Pizza »).

Puis une carte par recette, avec sa photo quand elle en a une, son titre et « N barquettes à remplir ». Pour chaque personne, une ligne : son initiale, « N × G g », « pour <prénom> », les kcal et les g de protéines d’une part. S’il faut un complément, il s’affiche sous la personne : « + N g de skyr pour <prénom> ». Une phrase explique le calcul. Il n’y a rien à saisir : remplis tes barquettes à ces poids.

- Celui ou celle qui n’a pas fixé ses objectifs a quand même ses parts, au poids moyen des autres (« … parts égales »). Un encart le dit en haut ; il porte « Fixe tes objectifs » quand c’est toi.
- Une recette dont trop peu d’ingrédients sont chiffrés dit : « Recette mal quantifiée : les parts sont égales, faute de mieux. »

**« C’est dressé »** ouvre la seconde étape ; rien n’est encore créé.

## Étape 2 : « On range »

Frigo ou congélateur, l’heure du rangement, « La session a pris » et « Ranger les N barquettes » : tout est dans « cuisine-on-range ». Rien n’est posé tout seul sur les jours de la semaine : tu choisis ce que tu manges quand.

## Si ça échoue

Appuie de nouveau sur « Ranger » : les barquettes déjà créées ne sont pas refaites et les ingrédients ne sont pas retirés deux fois (« cuisine-on-range »). Sans recette retenue : « Rien à dresser » ; sans session : « Aucune session ». Si la lecture échoue, l’écran dit « Je n’ai pas pu lire la session » et propose « Réessayer ».
