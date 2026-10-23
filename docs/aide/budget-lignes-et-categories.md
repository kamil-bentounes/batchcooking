---
id: budget-lignes-et-categories
titre: Les lignes, les catégories et le filtre
ecrans: [/budget]
questions:
  - Pourquoi une ligne est « mis de côté chaque mois » ?
  - Je touche une ligne et il ne se passe rien, pourquoi ?
  - C’est quoi un montant à dire ?
  - À quoi sert le filtre Tout, Commun, Moi ?
  - Pourquoi les catégories ne sont pas toujours dans le même ordre ?
  - Pourquoi je vois les lignes de l’autre ?
sources:
  - src/ui/budget/Ligne.tsx
  - src/ui/budget/Categorie.tsx
  - src/ui/budget/Filtre.tsx
  - src/ui/budget/Jauge.tsx
  - src/lib/budget/mois.ts
  - src/lib/budget/categories.ts
  - src/lib/budget/ouvertes.ts
  - src/lib/budget/feuilles.ts
  - supabase/migrations/0096_budget_facon.sql
  - supabase/migrations/0114_budget_donnees.sql
verifie_sur: bd10d8c
---
Sous « Par catégorie », chaque charge du mois est une ligne. Ce qui se passe quand tu la touches dépend de sa façon : celle de la ligne, figée le jour où elle est née.

## Les lignes

- **Plusieurs dépenses dans le mois** : « 120 € sur 400 € », une barre, et un bouton « Déclarer » (absent sur un mois clôturé). La barre change de couleur (ocre, jamais rouge) au-delà du prévu.
- **Une facture chaque mois** : le montant à droite ; un toucher ouvre sa feuille, où tu valides ou corriges la facture.
- **Mise de côté**, la façon de toute charge non mensuelle : « 1 200 € par an, mis de côté chaque mois » (« par trimestre » pour une trimestrielle) et le montant du mois. Un toucher ouvre la feuille de la charge, où tu ajoutes une facture payée avec « Ajouter la facture ». Avant d'envoyer, la feuille dit en une phrase ce que ça change pour le mois.
- **Fixe** : rien ne se passe. Pour corriger une ligne fixe, passe par « Mes charges ».
- **Ajustement** : un montant qui peut être négatif. Rien à faire dessus.

Un « montant à dire », c'est une ligne « Plusieurs dépenses dans le mois » d'un mois ouvert sans aucune dépense déclarée. Dès qu'une dépense est déclarée, la ligne n'est plus à dire. Les factures ne sont jamais à dire : on les valide à la clôture.

## Les catégories

Huit catégories : Vie courante, Maison, Crédits, Auto, Abonnements, Santé, Impôts, Autre. Une ligne sans catégorie connue va dans « Autre ».

- Elles se rangent par total décroissant ; à total égal, dans l'ordre de la liste ci-dessus.
- Une catégorie sans ligne ne s'affiche pas.
- Chaque catégorie montre « N montants à dire » (en ocre) ou « N lignes », et son total.
- Elle est ouverte d'office si elle a des montants à dire, repliée sinon. Ton choix de l'ouvrir ou la replier est retenu sur cet appareil seulement.
- Dans une catégorie, les lignes les plus lourdes viennent d'abord.

## Le filtre « Tout », « Commun », « Moi »

Chaque choix montre son total.

- **Tout** : toutes les lignes du foyer, y compris celles que seule l'autre personne porte : chacun voit tout.
- **Commun** : les lignes dont la charge est commune.
- **Moi** : tes lignes personnelles (non communes) où tu as une part.

Attention : les totaux des catégories et du filtre comptent chaque ligne en entier. « Il te reste » et sa barre ne comptent que ta part.
