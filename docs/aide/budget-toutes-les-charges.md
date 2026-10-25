---
id: budget-toutes-les-charges
titre: Toutes nos charges : le tableau, la recherche et les filtres
ecrans: [/toutes-les-charges]
questions:
  - Où voir toutes nos charges ?
  - Comment filtrer les charges par personne ?
  - Comment chercher une charge ?
  - Comment voir seulement les charges communes ?
  - Comment trier les charges par montant ?
sources:
  - src/pages/ToutesLesCharges.tsx
  - src/lib/budget/mois-type.ts
  - src/ui/budget/MoisType.tsx
  - src/App.tsx
  - src/lib/budget/categories.ts
verifie_sur: 79ed802
---
## Ce que fait l’écran

« Toutes nos charges » liste chaque charge posée, ramenée au mois (un trimestre compte un tiers, une année un douzième), et ce que chacun en paie : une colonne par personne, puis « Total ». Les chiffres sont ceux du mois type (« budget-mois-type »), à partir du mois où tu entres dans le foyer, ou du mois en cours.

## Y aller

- Sur l’écran « Le mois type » : **« Toutes les lignes »**.
- Ou touche la carte d’une catégorie : le tableau s’ouvre déjà filtré sur elle, et sur la personne choisie en haut si tu en avais choisi une.

## Chercher, filtrer, trier

- **« Chercher »** : par le nom (« Netflix, prêt, assurance… »).
- **« Qui paie »** : « Tout le monde », « Commun » (s’il y a plusieurs personnes), ou un prénom : les charges dont il paie une part.
- **« Catégorie »**, **« Rythme »** (« Chaque mois », « Chaque trimestre », « Chaque année ») et **« Façon de payer »** (« Fixe », « Une facture chaque mois », « Plusieurs dépenses dans le mois », « Mise de côté »).
- **« Tout effacer »** retire les filtres.
- **« Trier : montant »** ou **« Trier : nom »** : un toucher passe de l’un à l’autre.

## Les lignes et les totaux

- Sous chaque nom : qui paie (« Commun » ou les prénoms), le montant d’origine d’une charge trimestrielle ou annuelle (« / trim. », « / an »), la façon de payer, et « commence plus tard » pour une charge grisée, qui n’entre dans aucun total.
- Un tiret remplace « 0 € » quand quelqu’un ne paie rien.
- Les totaux suivent les filtres : la dernière ligne dit « Total filtré ». Sans filtre elle dit « Total par mois », suivie du revenu et de « Il reste » de chacun.
- Si rien ne correspond : « Aucune charge ne correspond à ces filtres. »

## Ce que l’écran ne fait pas

On n’y modifie rien : pour corriger une charge, passe par « Mes charges ».
