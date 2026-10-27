---
id: accueil-ta-journee
titre: « Ta journée » sur l’accueil
ecrans: [/]
questions:
  - Où je vois combien de calories j’ai mangé aujourd’hui ?
  - Où sont mes protéines du jour ?
  - Pourquoi « Ta journée » dit 0 kcal alors que j’ai mangé ?
  - Que veut dire « 1 repas pas encore noté aujourd’hui » ?
sources:
  - src/pages/Hub.tsx
  - src/ui/hub/TuileJournee.tsx
  - src/lib/semaine.ts
  - src/lib/donnees/foyer.ts
verifie_sur: 5fc4aa2
---
La carte **« Ta journée »** est sur l’accueil de Popote, sous la carte sombre du jour. Elle dit où tu en es aujourd’hui :

- **les calories** : « 600 kcal, sur 2 200 », avec une barre verte ;
- **les protéines** : « 50 g de protéines, sur 150 », avec une barre jaune.

Le second chiffre, ce sont tes objectifs du jour (« compte-objectifs »). La barre s’arrête pleine quand tu les dépasses, mais le chiffre continue.

## Ce qui compte

Le même calcul que le bilan (« cuisine-bilan ») et l’accueil de la cuisine, pour toi seul :

- une barquette compte quand tu as touché **« Je l’ai mangé »** ;
- ce que tu as noté **« en plus »** (un yaourt, des céréales) compte tout de suite ;
- un **« autre chose »** choisi pour un repas (un resto, un sandwich) compte une fois noté mangé.

Annuler un repas (« cuisine-semaine-annuler ») le retire aussitôt du chiffre.

## « Pas encore noté »

**« 1 repas pas encore noté aujourd’hui. »** : un repas d’aujourd’hui est prévu, et rien n’est noté dessus. Ce n’est pas un repas à zéro : le chiffre ne le compte pas encore. Note-le avec « Je l’ai mangé », ou dans « La semaine ».

## Sans objectifs

Les deux chiffres s’affichent sans « sur … » ni barre, avec **« Fixe tes objectifs pour voir où tu en es »**, qui ouvre « Objectifs ».

## Aller plus loin

Toucher la carte (ou « Le bilan », au bureau) ouvre **« Bilan »** (« cuisine-bilan »).

Pendant le chargement, la carte affiche « … ». Si la semaine ne se lit pas, la carte n’apparaît pas : c’est la carte du jour qui dit la panne.
