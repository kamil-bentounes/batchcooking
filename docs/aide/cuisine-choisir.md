---
id: cuisine-choisir
titre: Choisir les recettes de la semaine
ecrans: [/choisir]
questions:
  - Comment choisir les recettes de dimanche ?
  - Que veut dire « 6 / 10 parts » ?
  - Comment changer le nombre de parts d’une recette ?
  - Comment filtrer les recettes rapides ou riches en protéines ?
  - À quoi sert « Avec ce que j’ai » ?
  - Pourquoi une recette est-elle affichée avec une fourchette de protéines ?
sources:
  - src/pages/Choisir.tsx
  - src/lib/donnees/catalogue.ts
  - src/lib/recettes/parts.ts
  - src/lib/recettes/pages.ts
  - src/ui/recettes/Filtres.tsx
  - src/ui/recettes/Vignette.tsx
  - src/ui/recettes/Retenues.tsx
  - src/ui/recettes/FicheRecette.tsx
  - src/lib/recettes/temps.ts
  - src/lib/nutrition/macros.ts
  - supabase/migrations/0092_la_photo_et_les_gestes.sql
  - src/lib/donnees/cycle.ts
  - src/pages/Inventer.tsx
  - supabase/migrations/0003_class_b.sql
verifie_sur: 02a9f37
---
## Ce que fait l’appli

Tu retiens les recettes de dimanche. L’écran compte les parts : « 6 / 10 parts » en bas : 6 parts retenues sur 10 visées.

## Comment faire

1. Cherche ou filtre, puis touche le **+** rond d’une recette (sur sa photo). Le **i**, en haut à droite de la photo, ouvre sa fiche ; une coche verte (« Retenue ») et un cadre vert marquent une recette retenue.
2. En haut, la carte sombre montre une bande de photos qui défile de côté : une petite carte par recette retenue, toutes ensemble. Le **−** et le **+** changent ses parts d’une en une (de 1 à 20 ; tu peux aussi taper le nombre ; deux appuis rapides font deux pas, et si l’écriture échoue le chiffre revient à celui de la base avec l’erreur), et la croix (« Retirer ») la retire.
3. « N repas à couvrir » règle les « Parts visées cette semaine » (jusqu’à 40 ; 10 par défaut).
4. « Faire la liste » (dès une recette) mène aux courses.

## Les parts

La carte dit « Il manque N parts », « C’est couvert » ou « Au-delà du prévu ». Le + propose ce qui manque pour atteindre l’objectif, sans dépasser ce que la recette donne. Exemple : objectif 10, 4 parts déjà retenues, recette pour 8 : il propose 6 parts. Objectif atteint : 2 parts ; dépassé : 1.

## Ce qu’affiche une recette

Sur la photo, le temps actif en pastille (« Gestes non comptés » si inconnu). Dessous : le nom, les parts et « se congèle », puis les protéines **en gros** et les calories, **en fourchette** (« 28–34 g de protéines par part »), et « il manque … » d’après ton stock. « Macros inconnues » : trop d’ingrédients non reconnus ; sous 90 % d’ingrédients connus, le pourcentage est indiqué.

Le **temps actif** est celui de tes gestes : le four ne compte pas, enfourner oui. Tri : le plus rapide d’abord, temps inconnus à la fin.

## Les filtres

Les puces passent à la ligne : « ≤ 20 min actives », « ≥ 30 g de protéines », « Se congèle », « Avec ce que j’ai ». Le bouton à droite de la recherche (« Appareils et filtres ») ouvre : « Temps les mains prises », « Protéines au moins », « Calories au plus », « Avec seulement » (appareils), « Jamais essayée ».

- Protéines et calories jouent la **borne défavorable** : « au moins 30 g » écarte une recette annoncée entre 28 et 34.
- La recherche ne lit que le titre ; chaque mot doit s’y trouver, dans n’importe quel ordre.
- « Avec ce que j’ai » : tous les ingrédients reconnus de la recette sont dans ton stock.
- « Jamais essayée » écarte les recettes déjà retenues une autre semaine.

La liste se lit dix par dix : « Les 10 suivantes », ou les numéros de page. Elle ne montre que les recettes planifiables (chaque étape a une durée) : pas les inventées gardées avant le dernier changement.
