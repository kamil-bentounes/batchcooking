---
id: budget-mois-clos
titre: Un mois clôturé, et « Revenir dessus »
ecrans: [/budget, /cloture]
questions:
  - Que veut dire « Septembre est clôturé » ?
  - Comment je rouvre un mois clôturé ?
  - Que devient l’argent mis de côté si je reviens dessus ?
  - Si l’autre clôture le mois, est-ce que je dois le faire aussi ?
  - Pourquoi je ne peux plus déclarer de dépense sur septembre ?
  - Pourquoi « n’a pas pu être soldée » ?
sources:
  - src/pages/Budget.tsx
  - src/pages/Cloture.tsx
  - src/ui/budget/Recap.tsx
  - src/ui/budget/MoisClos.tsx
  - src/ui/budget/RevenirDessus.tsx
  - src/ui/budget/FeuillesDuMois.tsx
  - src/lib/budget/cloture.ts
  - supabase/migrations/0065_gardes_manquantes.sql
  - supabase/migrations/0098_budget_lignes_nees.sql
  - supabase/migrations/0099_budget_garde_des_saisies.sql
  - supabase/migrations/0100_budget_mois_gele.sql
  - supabase/migrations/0108_budget_cloture.sql
  - supabase/migrations/0109_budget_rouvre.sql
verifie_sur: 9504cf2
---
## Ce que dit un mois clôturé

Sur l'écran du mois, la carte sombre dit **« Septembre est clôturé. »** (ou **« … clôturé par [prénom]. »** si c'est l'autre), puis **« Il t’est resté »** (ou **« Il te manque »**) avec le chiffre du jour de la clôture, et **« dont 316,80 € mis de côté »** si tu as mis de l'argent de côté. Dessous : **« Revenir dessus »**.

Un mois clôturé est figé :

- « Déclarer » disparaît ; aucune dépense ne se déclare ni ne se retire ;
- les montants sont ceux que la clôture a laissés ;
- aucune ligne n'y naît : une charge ajoutée après coup n'y ajoute rien ;
- exception : la feuille d'une charge « Mise de côté ».

Si une année n'a pas pu être soldée, une phrase le dit sous le chiffre : « [charge] : 2025 n’a pas pu être soldée. Elle le sera à la prochaine clôture. » Elle ne s'affiche que sur l'appareil qui vient de clôturer, jusqu'au rechargement.

## Clôture à deux

Il n'existe pas aujourd'hui de clôture séparée pour chacun : un mois se clôture **une seule fois pour tout le foyer**. La première personne qui clôture le ferme pour les deux.

- **Celui qui clôture** : son reste et son versement sont enregistrés à son nom.
- **L'autre** n'a rien à faire. Elle lit « … clôturé par [prénom]. », un « Il t’est resté » calculé sur ses parts, et « Calculé sur tes parts du mois : tu n’as pas fait cette clôture. » Aucun versement n'est fait en son nom.

## « Revenir dessus »

Le bouton est sur la carte du mois clôturé et sur la page de clôture (« Septembre est clôturé le 02/10. »). Chacun du foyer peut s'en servir.

1. Popote demande : « Revenir sur septembre ? Les 316,80 € mis de côté seront retirés de l’épargne. » (sans la 2e phrase si rien n'a été mis de côté). Tu peux refuser.
2. Si tu acceptes, le mois est de nouveau ouvert **pour tout le foyer**.

Ce que ça fait :

- Les versements de la clôture sont retirés de l'épargne : celui de chaque personne encore dans le foyer. Le montant annoncé est ce total, pas ta part seule. Celui de quelqu'un parti du foyer reste dans la poche.
- Les lignes déjà là restent confirmées et le partage du mois ne se refait pas : un revenu posé après la clôture ne change pas ce mois.
- Le bandeau « … est fini : on le clôture ? » revient. Tu peux clôturer de nouveau.

