---
id: budget-declarer
titre: Déclarer ce que j’ai dépensé
ecrans: [/budget]
questions:
  - Comment je note mes courses ?
  - J’ai fait une erreur de montant, comment corriger ?
  - Comment je valide ma facture d’électricité ?
  - Je peux déclarer une dépense d’hier ?
  - Pourquoi je ne peux plus déclarer sur septembre ?
  - Qu’est-ce que « C’est ça » ?
sources:
  - src/ui/budget/ChoixDeLaLigne.tsx
  - src/ui/budget/FeuilleDeclarer.tsx
  - src/ui/budget/FeuilleFactureMois.tsx
  - src/ui/budget/FeuillesDuMois.tsx
  - src/ui/budget/Ligne.tsx
  - src/lib/budget/feuilles.ts
  - src/lib/budget/mois.ts
  - src/lib/donnees/budget.ts
  - supabase/migrations/0097_budget_tables.sql
  - supabase/migrations/0099_budget_garde_des_saisies.sql
  - supabase/migrations/0104_budget_confirmer.sql
verifie_sur: bd10d8c
---
## Déclarer une dépense

Seules les lignes « Plusieurs dépenses dans le mois » (les courses, par exemple) se déclarent. S'il n'y en a aucune, la feuille te dit d'aller dans « Mes charges » choisir « Plusieurs dépenses dans le mois ».

1. Touche **« Déclarer »** en haut de l'écran du mois, puis choisis la ligne dans « Pour quelle ligne ? ». Ou touche le bouton « Déclarer » sur la ligne.
2. Écris le montant dans **« Nouvelle dépense »** : « 47 » ou « 47,90 ».
3. Choisis le jour : **« Aujourd’hui »**, **« Hier »** (pas proposé le 1er du mois : ouvre alors le mois précédent, s'il n'est pas clôturé) ou **« Autre jour »** (un jour du mois affiché, jusqu'à aujourd'hui).
4. Touche **« Ajouter 47,90 € »**.

La feuille montre « 120 € sur 400 € », la barre, puis « Il reste 280 € pour octobre. » ou « 50 € au-delà du prévu. ». Plus bas, **« Déjà ce mois-ci »** liste chaque dépense : sa date, qui l'a saisie (à deux) et son montant. Les dépenses d'une ligne s'additionnent, qu'elles viennent de toi ou de l'autre.

Règles : un montant au-dessus de 0 €, et une ligne ne dépasse pas 1 000 000 € en tout. Sur un mois passé non clôturé, tu peux aussi déclarer : le jour proposé est le dernier jour du mois, plus « Autre jour ».

## Corriger

Une dépense déclarée ne se modifie pas : retire-la avec la corbeille, à droite de sa ligne dans « Déjà ce mois-ci », puis déclare le bon montant. Aucune confirmation n'est demandée. Chacun peut retirer une dépense, même celle de l'autre.

## Valider une facture

Pour une ligne « Une facture chaque mois » (l'électricité, par exemple), touche la ligne. La feuille dit « Le montant habituel : … ».

- **« C’est ça »** : tu valides le montant habituel.
- **« Modifier »** : tu tapes le vrai montant dans « Le montant de la facture », puis **« Valider 82,40 € »**. 0 € est accepté : c'est ainsi qu'on note un avoir.

Une fois validée, la feuille dit « Le montant retenu : … » et tu peux encore « Modifier ». Une facture non validée est confirmée à son montant habituel par la clôture.

## Sur un mois clôturé

Plus rien ne se déclare ni ne se valide : « Déclarer » disparaît, les feuilles s'ouvrent en lecture seule avec « Revenir dessus » (voir la page sur le mois clôturé). Seule la feuille d'une charge « Mise de côté » reste utilisable.
