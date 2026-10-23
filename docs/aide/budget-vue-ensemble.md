---
id: budget-vue-ensemble
titre: Le budget, en gros
ecrans: [/, /budget]
questions:
  - C’est quoi le budget dans Popote ?
  - Comment Popote calcule ce qu’il me reste ?
  - Pourquoi je ne peux pas voir le mois prochain ?
  - Quand est-ce qu’un mois est fini ?
  - Comment on se partage les charges ?
  - Est-ce que Popote est branchée à la banque ?
sources:
  - src/pages/Hub.tsx
  - src/pages/Budget.tsx
  - src/pages/BudgetReglages.tsx
  - src/lib/budget/mois.ts
  - src/lib/budget/categories.ts
  - src/lib/donnees/budget.ts
  - supabase/migrations/0096_budget_facon.sql
  - supabase/migrations/0098_budget_lignes_nees.sql
  - supabase/migrations/0100_budget_mois_gele.sql
  - supabase/migrations/0102_budget_mois_suivis.sql
  - supabase/migrations/0108_budget_cloture.sql
  - supabase/migrations/0114_budget_donnees.sql
verifie_sur: e058ce7
---
Popote ne sert pas qu'à cuisiner : elle tient aussi le budget du foyer. Sur l'accueil (le hub), il y a deux cartes : « Cuisine » et « Budget ». La carte « Budget » te donne le chiffre qui compte : ce qu'il te reste ce mois-ci.

## Ce que fait le budget

Tu poses les charges du foyer (loyer, électricité, courses…) dans « Mes charges ». Chaque mois, chaque charge en cours devient une ligne du mois. Popote partage chaque ligne entre les personnes du foyer, puis calcule ton « Il te reste » : ton revenu du mois, moins ta part de chaque ligne.

Une ligne se règle selon sa façon, choisie dans « Mes charges » :

- « Fixe » : rien à faire, le montant est posé.
- « Une facture chaque mois » : tu valides le montant habituel, ou tu le corriges.
- « Plusieurs dépenses dans le mois » : tu déclares tes dépenses au fil du mois (les courses, par exemple).
- « Mise de côté » : la façon de toute charge qui n'est pas mensuelle (annuelle, trimestrielle) ; une charge mensuelle n'y est jamais. Une part en est mise de côté chaque mois.

## Le partage

Les parts se calculent au prorata des revenus, ou en « Moitié-moitié » : tu choisis dans « Réglages du budget », rubrique « Comment vous partagez ». Exemple au prorata : revenus de 3 000 € et de 2 000 € donnent des parts de 60 % et 40 %. Une charge commune de 1 000 € fait alors 600 € et 400 €.

Tant que le revenu de quelqu'un qui est dans le foyer ce mois-là manque, tout se partage à parts égales.

## La logique du mois

- Le mois s'ouvre tout seul. La première fois que quelqu'un ouvre le hub ou le budget, Popote crée les lignes du mois. Un mois passé que personne n'avait ouvert est rattrapé à l'ouverture (jusqu'à deux ans en arrière).
- Un mois à venir ne s'ouvre jamais : on ne peut pas le consulter.
- Un mois reste ouvert jusqu'à sa clôture. Le mois en cours ne se clôture jamais : on le clôture à partir du 1er du mois suivant.
- Une fois clôturé, un mois est figé : plus aucune dépense à y déclarer. Seul « Revenir dessus » le rouvre.

## Ce que le budget ne fait pas

Il n'existe pas aujourd'hui de lien avec une banque : les dépenses se déclarent à la main.
