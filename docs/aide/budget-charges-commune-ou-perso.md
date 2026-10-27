---
id: budget-charges-commune-ou-perso
titre: Charge commune ou à moi, et l’arrivée de l’autre
ecrans: [/charges]
questions:
  - Quelle différence entre une charge commune et une charge à moi ?
  - Je suis seul, que se passe-t-il si je pose une charge commune ?
  - Que devient une charge quand l’autre arrive dans le foyer ?
  - Comment changer qui participe à une charge ?
  - Pourquoi ma charge dit « partagée dès que quelqu’un arrive » ?
sources:
  - src/pages/Charges.tsx
  - src/lib/budget/charges.ts
  - src/lib/donnees/budget.ts
  - supabase/functions/accept-invite/index.ts
  - supabase/migrations/0061_charge_commune_et_debut.sql
  - supabase/migrations/0062_arrivee_juste.sql
  - supabase/migrations/0066_se_retirer_dune_commune.sql
  - supabase/migrations/0100_budget_mois_gele.sql
  - supabase/migrations/0103_budget_arrivees.sql
verifie_sur: 02a9f37
---
Il n’y a qu’une liste de charges. Chaque ligne dit qui y participe. « À moi » veut simplement dire : une seule personne participe.

## Poser une charge

Dans « Qui participe », touche les prénoms.
- Deux personnes : la charge est commune et se partage (voir la page sur le partage).
- Une seule : « Payée par une seule personne : elle n’entrera dans aucun partage. »

Chaque ligne du catalogue propose l’un ou l’autre (le loyer est commun, un forfait mobile est à toi). Ce n’est qu’une suggestion. La ligne « Autre chose » démarre à toi seul : elle ne présume rien.

## Quand tu es seul dans le foyer

Une case apparaît : « Elle se partagera avec le foyer ». Le texte dit : « Tu es seul pour l’instant. Coche si la personne que tu invites devra la partager : elle y entrera toute seule en arrivant. » Le catalogue la coche pour les charges communes comme la taxe foncière.

Tant que tu es seul, la ligne indique ton prénom suivi de « seul » et « partagée dès que quelqu’un arrive ». Tout est à ta charge. Cette ligne se retrouve sous le filtre « À moi », pas sous « En commun ».

À deux, la case n’existe plus : une charge payée par une seule personne est à elle.

## Quand l’autre arrive

- Elle entre dans toutes les charges communes, y compris celles posées quand tu étais seul. Les charges à toi ne bougent pas.
- Sa date d’entrée est par défaut le 1er du mois suivant l’acceptation de l’invitation.
- À partir de ce mois, les lignes encore ouvertes se partagent ; une ligne déjà confirmée ne bouge pas. Les mois d’avant restent entièrement à celui qui était là, et un mois clôturé ne bouge jamais.

## Changer qui participe

Le bouton « Changer qui participe » apparaît sur chaque ligne dès que le foyer a deux membres. Tu coches ou décoches un prénom, puis « Fermer ».
- Le mois en cours est refait, sauf ce qui est déjà confirmé ou réglé.
- Les mois passés ne changent pas. Les mois à venir naîtront avec les nouveaux participants.
- Se retirer d’une charge commune est permis, sans l’accord de l’autre.

## À savoir

Le foyer partage tout : chacun peut corriger la ligne de l’autre. Quand quelqu’un d’autre l’a modifiée en dernier, la ligne affiche « ✎ » et son prénom. Le filtre « Tout » montre toutes les charges, y compris celles de l’autre.
