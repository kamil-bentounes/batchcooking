---
id: budget-factures-regularisation
titre: Les factures et la régularisation annuelle
ecrans: [/budget, /charges]
questions:
  - Comment entrer la facture de ma taxe foncière ?
  - Comment se calcule la régularisation d’une charge annuelle ?
  - Pourquoi la facture ajoute de l’argent à ce mois-ci ?
  - Que veut dire « Prévu pour 2026, depuis septembre » ?
  - J’ai entré une mauvaise facture, comment la retirer ?
sources:
  - src/ui/budget/FeuilleMiseDeCote.tsx
  - src/lib/budget/feuilles.ts
  - src/ui/budget/Ligne.tsx
  - src/lib/donnees/budget.ts
  - src/pages/Charges.tsx
  - supabase/migrations/0102_budget_mois_suivis.sql
  - supabase/migrations/0105_budget_cible.sql
  - supabase/migrations/0106_budget_factures.sql
  - supabase/migrations/0107_budget_solde.sql
  - supabase/migrations/0108_budget_cloture.sql
  - supabase/migrations/0114_budget_donnees.sql
verifie_sur: e058ce7
---
Une charge « Mise de côté » met de côté un douzième (ou un tiers) par mois ; à la vraie facture, l’appli ne pose que l’écart avec le prévu : c’est la régularisation.

## Entrer une facture

1. Sur l’écran du mois, touche la ligne « mis de côté chaque mois » de la charge.
2. La feuille montre « Prévu pour 2026 » et « Factures payées en 2026 ».
3. Tape « Montant de la facture » (0,01 € à 1 000 000 €), « Payée » : « Aujourd’hui » ou « Autre jour » (du 1er janvier de l’an dernier à aujourd’hui).
4. Un encadré annonce ce qui sera posé ; « Ajouter la facture ».

L’année d’une facture est celle de son paiement. Un jour avant le premier mois suivi est refusé (« Popote ne suivait pas encore septembre 2026 : cette facture n'y compte pas. »), le mois en cours aussi tant que personne n’a posé de revenu (« Ajoute ton revenu d'abord. »).

## Le calcul

- Prévu = déjà mis de côté sur l’année + reste à mettre de côté jusqu’en décembre. Seuls les mois suivis comptent (« depuis septembre » : le suivi a commencé en septembre).
- Écart = factures de l’année − prévu. Positif, il s’ajoute au mois où tu saisis, ligne « Taxe foncière — facture 2026 » ; sinon rien n’est posé (« Il restera X de côté pour 2026. »).
- Chaque facture recalcule : seule la différence s’ajoute, ou revient si l’écart baisse.
- L’écart se répartit selon ce que chacun a porté des mises de côté de l’année.

Exemple : 1 200 € par an depuis janvier, vu en octobre (10 lignes faites, 2 à venir) : prévu 1 200 €.
- Facture de 1 320 € : « 120 € de plus que les 1 200 € prévus pour 2026 : ils s’ajoutent à octobre. »
- Facture de 1 100 € : « Il restera 100 € de côté pour 2026. »

## Retirer, corriger, solder

- La corbeille « Retirer la facture de X € » recalcule l’écart sur le mois en cours.
- Un « Relevé 2026 — total de l’année » se corrige (« Corriger le montant », « Corriger le relevé »), il ne se retire pas.
- La clôture de décembre (dès le 1er janvier) solde l’année (« 2026 est soldée. ») : le prévu est figé, l’écart exact est posé en décembre, dans un sens ou dans l’autre. Facture plus basse que le prévu, ou aucune : le trop mis de côté revient. Une facture ajoutée ensuite s’ajoute en entier au mois en cours.
