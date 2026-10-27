---
id: budget-revenus-comptes
titre: Les revenus et les comptes
ecrans: [/budget-reglages]
questions:
  - Où poser mon revenu ?
  - À partir de quand mon revenu compte-t-il ?
  - Mon revenu est-il visible par l’autre ?
  - À quoi servent les comptes ? Comment en ajouter ?
  - Où sont passées les enveloppes ?
sources:
  - src/pages/BudgetReglages.tsx
  - src/pages/Charges.tsx
  - src/ui/budget/Gestes.tsx
  - src/lib/budget/revenu.ts
  - src/lib/budget/mois.ts
  - src/lib/donnees/budget.ts
  - supabase/migrations/0102_budget_mois_suivis.sql
  - supabase/migrations/0103_budget_arrivees.sql
  - supabase/migrations/0076_apres_la_regularisation.sql
  - supabase/migrations/0106_budget_factures.sql
  - supabase/migrations/0114_budget_donnees.sql
verifie_sur: 02a9f37
---
Tout se pose dans « Réglages du budget » : le bouton « Revenus » de l’écran du mois.

## Ton revenu

Section « Les revenus » : tape ton net mensuel après impôt dans « Mon net mensuel (€) », puis « Enregistrer mon revenu » (« Mettre à jour mon revenu » si tu en as déjà un). Chacun pose le sien : il n’y a pas de champ pour celui de l’autre.

- Il sert au partage au prorata. Le foyer le voit (la liste affiche le revenu de chacun, ou « pas encore renseigné »).
- Sous 100 € par mois, l’appli demande « Tu déclares X par mois. C’est bien ça ? » (« Oui, c’est ça » / « Non, je corrige »).

## À partir de quand

- Il prend effet au mois en cours. Si ton arrivée est à venir, au mois d’arrivée.
- Ton tout premier revenu remonte à ton mois d’arrivée, sans passer avant le mois qui suit la dernière clôture. Arrivée en septembre, premier revenu posé en octobre : il vaut dès septembre.
- Les lignes ouvertes depuis ce mois sont repartagées, pas les mois clôturés ni les lignes confirmées.
- L’ancien revenu est gardé. Posé deux fois le même mois, le second remplace le premier (sauf si le premier est daté de ton arrivée, plus tôt : il reste).
- Un mois ne compte pour le suivi qu’à partir du premier revenu du foyer (ou d’une clôture) : avant, une facture mise de côté est refusée (« Ajoute ton revenu d'abord. »).

## Les comptes

Section « Les comptes » (« Un par vrai compte bancaire : chaque charge note de quel compte elle est payée. »). Suggestions : « Compte joint », « Mon compte courant », « Livret A », « LDDS ». Choisis le genre (« Commun », « Le mien » ou « Épargne »), puis « Ajouter ce compte ».

- « Ranger » retire un compte des listes sans effacer ce qu’il a payé ; refusé tant que des charges ou poches l’utilisent (« Ce compte porte encore 1 charge(s). Rattache-les ailleurs d'abord. »).
- À l’ajout d’une charge, « Payée depuis » propose les comptes ; le compte commun est choisi d’office (sinon le premier). Une charge sans compte affiche « sans compte » et un bouton « Rattacher ».
- Aucun écran n’affiche aujourd’hui de virement entre vous : le compte est un renseignement sur la charge.

## Les enveloppes

Il n’y a plus d’enveloppes à poser. Une charge « Plusieurs dépenses dans le mois » porte elle-même son plafond : c’est son montant prévu.
