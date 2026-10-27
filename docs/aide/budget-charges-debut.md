---
id: budget-charges-debut
titre: La date de début d’une charge
ecrans: [/charges]
questions:
  - C’est quoi « Elle court depuis » ?
  - Pourquoi remonter la date de début d’une charge annuelle ?
  - J’ai posé ma taxe foncière en septembre, la facture me tombe d’un coup, pourquoi ?
  - Puis-je changer la date de début après coup ?
  - Pourquoi ma charge dit « commence en … » ?
sources:
  - src/pages/Charges.tsx
  - src/lib/budget/charges-liste.ts
  - src/lib/budget/charges.ts
  - src/lib/budget/feuilles.ts
  - src/lib/budget/mois.ts
  - src/lib/donnees/budget.ts
  - src/ui/budget/FeuilleMiseDeCote.tsx
  - supabase/migrations/0096_budget_facon.sql
  - supabase/migrations/0098_budget_lignes_nees.sql
  - supabase/migrations/0100_budget_mois_gele.sql
  - supabase/migrations/0102_budget_mois_suivis.sql
  - supabase/migrations/0105_budget_cible.sql
  - supabase/migrations/0110_budget_corrige.sql
verifie_sur: fa94f4a
---
« Elle court depuis » est le mois où la charge commence à compter : rien n’est mis de côté avant.

## Les règles

- Par défaut : le mois en cours. Si ton arrivée dans le foyer est à venir, c’est ton mois d’arrivée, et une date plus ancienne y est ramenée.
- Tu peux remonter dans le passé, mais pas avant janvier de l’année précédente. Plus tôt, l’appli répond « Pas avant janvier » suivi de l’année.
- Dès l’ajout, chaque mois écoulé depuis cette date reçoit sa ligne, dès qu’un participant est arrivé. Un mois clôturé n’en reçoit pas.
- Une charge qui commence plus tard apparaît dans la liste avec « commence en » et son mois. Elle n’est comptée ni dans le total « par mois » ni dans l’écran du mois. Une charge dont aucun participant n’est encore dans le foyer ce mois-là est grisée aussi (« pas encore dans le foyer »). Avant ton arrivée, la liste se cale sur ton mois d’arrivée : une charge qui court depuis lors y montre son montant, sans « commence en ».

## Pourquoi remonter la date d’une charge annuelle

Une charge « Mise de côté » met de côté un douzième par mois, seulement à partir de sa date de début. Ce qui a été prévu avant la facture réduit ce qu’il reste à payer d’un coup.

Exemple : taxe foncière de 1 200 € par an, donc 100 € par mois.
- Posée en septembre avec le début en septembre : 4 mois × 100 € = 400 € prévus. Une facture de 1 200 € ajoute 800 € d’un coup au mois en cours.
- Posée avec le début en janvier : 12 mois × 100 € = 1 200 € prévus. Une facture de 1 200 € n’ajoute rien.

C’est pour ça que le formulaire t’avertit : « On ne mettra de côté qu’à partir de ce mois-là. Si tu la paies depuis janvier, remonte la date — sinon la facture annuelle tombera d’un coup. » Il apparaît pour une charge non mensuelle, quand le début est dans l’année en cours après janvier.

## Une limite

Le prévu de l’année ne compte que les mois « suivis » : ceux à partir du premier mois où un revenu du foyer est en vigueur (ou d’un mois clôturé). Les lignes d’avant existent mais ne comptent pas dans le prévu. La feuille de facture l’écrit : « Prévu pour 2026, depuis septembre ». Remonter la date plus loin que ce premier mois ne réduit donc pas l’écart.

## Changer la date après coup

Touche la ligne de la charge, puis « Corriger ». Le champ « Elle court depuis » n’apparaît que pour une « Mise de côté » : « C’est elle qui décide sur combien de mois le montant se répartit. » Les mois déjà confirmés gardent leur montant, les autres se refont. Reculer la date fait naître les mois manquants, mais pas avant ton arrivée dans le foyer : « Pas avant ton arrivée, en novembre 2026. »
