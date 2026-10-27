---
id: budget-charges-corriger-retirer
titre: Corriger, retirer, rattacher une charge
ecrans: [/charges]
questions:
  - Comment corriger le montant d’une charge ?
  - Comment retirer une charge ?
  - Que se passe-t-il pour les mois passés quand je corrige ou je retire ?
  - C’est quoi « Retirées, encore à régler » ?
  - C’est quoi « Rattacher » ?
sources:
  - src/pages/Charges.tsx
  - src/lib/budget/charges.ts
  - src/lib/donnees/budget.ts
  - supabase/migrations/0096_budget_facon.sql
  - supabase/migrations/0110_budget_corrige.sql
  - supabase/migrations/0111_budget_retire.sql
verifie_sur: 9504cf2
---
Sur chaque ligne de la page « Les charges », sous le nom : « Corriger », « Retirer », et selon le cas « Rattacher » ou « Changer qui participe ».

## Corriger

« Corriger » ouvre un panneau : « Son nom », « Son montant », « Catégorie », « Comment elle se paie », et « Elle court depuis » pour une « Mise de côté ». Puis « Enregistrer ».

- « Les mois déjà confirmés gardent leur montant. Les autres se refont. » Un mois clôturé ne change pas, ni une année déjà soldée.
- L’appli dit combien de mois elle a refaits : « « X » corrigée, 2 mois refaits. »
- Changer seulement la catégorie ne touche aucun montant.
- Une charge « Mise de côté » qui a déjà une facture, un mois confirmé ou clôturé, ne devient plus mensuelle. Les trois autres façons sont grisées. Pour la payer chaque mois, retire-la et ajoute-en une nouvelle.
- Si tu quittes « Plusieurs dépenses dans le mois » alors que des dépenses sont déclarées, l’appli refuse : « Des dépenses sont déclarées en octobre sur cette charge. Retire-les d'abord. »
- La façon de partager (« Comme le foyer », « Au prorata », « Moitié-moitié ») se choisit à l’ajout : le panneau « Corriger » ne la propose pas.

## Retirer

« Retirer » demande : « Retirer « X » ? Elle disparaîtra de tous les mois. » 
- Les lignes des mois ouverts, non confirmées, disparaissent.
- Une « Mise de côté » retirée avec des factures : l’écart de l’année se recalcule aussitôt, sur le mois en cours.
- Si des dépenses sont déjà déclarées, l’appli demande : « Retirer X et ses N € déclarés ? ». Tu peux refuser, rien ne part.
- Une charge sans histoire est supprimée : « « X » retirée. »
- Une charge qui a de l’argent sorti (mois confirmé ou clôturé, facture, année soldée) est seulement rangée : « Les mois que tu as confirmés ou réglés la gardent : c’est de l’argent sorti. »

## « Retirées, encore à régler »

Une charge « Mise de côté » retirée reste visible dans cette liste, avec « Ajouter une facture ». Elle y reste jusqu’au 31 décembre de l’année qui suit son retrait (la facture arrive souvent après). Le texte dit « Retirée en 2026 » ou « 2026 reste à régler ».

## « Rattacher »

Une charge « sans compte » montre « Rattacher » (s’il existe un compte). Il la relie au compte commun, sinon au premier compte de la liste.
