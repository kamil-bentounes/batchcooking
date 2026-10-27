---
id: budget-cloture-quand
titre: Quand clôturer, et les rappels
ecrans: [/, /budget, /cloture]
questions:
  - Quand est-ce que je peux clôturer le mois ?
  - Que veut dire « Septembre est fini : on le clôture ? »
  - Pourquoi le bandeau change à partir du 27 ?
  - Pourquoi je ne peux pas clôturer octobre aujourd’hui ?
  - Pourquoi « Ajoute ton revenu de septembre pour clôturer septembre » ?
  - Pourquoi aucun bandeau ne me propose de clôturer ?
sources:
  - src/lib/budget/mois.ts
  - src/ui/budget/Bandeau.tsx
  - src/pages/Budget.tsx
  - src/pages/Hub.tsx
  - src/pages/Cloture.tsx
  - src/lib/budget/cloture.ts
  - supabase/migrations/0108_budget_cloture.sql
verifie_sur: 9504cf2
---
Clôturer un mois, c'est le fermer une fois fini. Cette page dit quand c'est possible et quand Popote te le rappelle.

## Quand on peut clôturer

- **Pas avant le 1er du mois suivant.** Octobre se clôture à partir du 1er novembre. Avant, la page dit « On clôture octobre une fois fini, à partir du 1er novembre. » avec « Revenir au mois » : les derniers jours d'un mois ont encore des dépenses.
- **Avec un revenu pour ce mois-là.** Sinon : « Ajoute ton revenu de septembre pour clôturer septembre. » et le bouton « Revenus ». Sans revenu, un mois ne se clôture pas, et rien ne le propose.
- **Si tu étais dans le foyer ce mois-là.** Sinon : « Tu n’étais pas encore dans le foyer en septembre : ce mois-là ne te concerne pas. Les autres peuvent le clôturer. »
- **Si l'autre personne présente ce mois-là a posé son revenu.** Sinon la clôture refuse, avec un message du type « [prénom] n'a pas encore posé son revenu : septembre attend. »
- Un mois déjà clôturé ne se clôture pas deux fois.

Aucun ordre n'est imposé entre les mois : septembre peut être clôturé avant août.

## Le bandeau de l'écran du mois

Entre le filtre et les catégories, un seul bandeau à la fois. Il n'y en a jamais sur un mois clôturé, ni sur un mois sans aucune ligne.

- **Du 1er au 26 du mois en cours** : « Le mois fini, on le clôture : tu confirmes les factures, et tu choisis quoi faire de ce qui reste. »
- **À partir du 27** (jusqu'à la fin du mois) : « Octobre se termine. Le 1er novembre, on le clôture. »
- **Le mois précédent n'est pas clôturé** : « Septembre est fini : on le clôture ? » avec le bouton « Clôturer septembre ». Ce bandeau passe devant les deux autres.
- **Sur un mois passé non clôturé** : le même bandeau « … est fini : on le clôture ? ».

Les bandeaux « … est fini » n'apparaissent que si tu avais un revenu ce mois-là et que tu étais déjà dans le foyer. Le bouton mène à la page de clôture.

## Sur la tuile Budget de l'accueil

La ligne « Septembre est à clôturer » apparaît dans les mêmes conditions : le mois précédent n'est pas clôturé, tu y avais un revenu, tu étais là. Seul le mois précédent compte sur l'accueil ; les mois plus anciens non clôturés se retrouvent en les ouvrant un par un dans l'écran du mois.
