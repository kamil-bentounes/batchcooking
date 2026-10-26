---
id: cuisine-on-range
titre: « On range » : frigo, congélateur et ingrédients de la session
ecrans: [/dressage]
questions:
  - Comment choisir ce qui va au frigo et ce qui va au congélateur ?
  - Combien de temps se garde une barquette ?
  - Comment changer l’heure de rangement ?
  - Que fait « Ranger les barquettes » ?
  - Pourquoi « Ranger » est grisé ?
  - Deux personnes ont rangé en même temps : que se passe-t-il ?
sources:
  - src/pages/Ranger.tsx
  - src/pages/Dressage.tsx
  - src/lib/ranger.ts
  - src/lib/donnees/barquettes.ts
  - src/lib/peremption.ts
  - src/App.tsx
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0120_la_session_prend_dans_le_stock.sql
verifie_sur: 7a0673e
---
## Ce que fait l’écran

Après « C’est dressé » (« cuisine-dressage »), « On range » te fait choisir, pour le foyer entier, combien de barquettes de chaque recette restent au frigo : le reste part au congélateur.

## Comment faire

Une carte par recette : le total, une barre frigo / congélateur, « Frigo · N » avec **−** et **+**, « Congélateur · N », et la date : « à manger avant le … » au frigo, « se garde jusqu’au … » au congélateur.

- **La proposition de départ** remplit le frigo jusqu’à **4 jours de dîners pour le foyer** (4 × le nombre de personnes), recette par recette dans l’ordre retenu ; le reste va au congélateur.
- **« Rangé le »** : maintenant par défaut. « Modifier » ouvre un champ date et heure : pas dans le futur, et au plus **4 jours** en arrière (sinon un message le dit et « Ranger » reste grisé). Cette heure devient celle de préparation de chaque barquette, et celle de congélation pour celles du congélateur.
- **Le bilan** : « N barquettes au frigo », de quoi tenir tant de jours de dîners. Au-delà de 4 jours, il passe en ocre : « congèle-en quelques-unes, les dernières périmeront après le … ».
- Une barquette se garde **4 jours** au frigo, **90 jours** au congélateur, **24 heures** une fois décongelée.

## « La session a pris »

Les ingrédients des recettes sortent du stock : une puce par ingrédient (« Poireaux 1,5 kg »), à corriger si besoin. Le détail est dans « cuisine-on-range-stock ».

## Ranger

**« Ranger les N barquettes »** fait tout d’un coup : il crée les barquettes avec leur lieu, retire les ingrédients, passe la semaine à « La semaine tourne » et ouvre « La semaine » : c’est là que tu choisis ce que tu manges chaque jour (voir « cuisine-semaine »). Rien n’est posé tout seul sur les jours. Il reste grisé le temps que l’appli lise ce que la session prend, pour ne rien retirer que tu n’aies vu.

Si deux personnes appuient en même temps, une seule range : l’autre arrive devant le travail déjà fait.

## Si ça échoue

- Si la lecture de « La session a pris » échoue, l’écran dit « il ne sera pas retiré » : on range quand même, sans toucher au stock.
- Si les barquettes existent déjà (un autre téléphone, une réponse perdue), l’écran les montre telles qu’elles sont écrites, sans réglage : le nombre au frigo et au congélateur de chaque recette, et la date. « Terminer le rangement » finit le travail et ouvre « La semaine » ; une fois la semaine commencée, le bouton devient « Choisir les repas de la semaine », avec « Voir le frigo » dessous.
- Rien n’est créé en double et les ingrédients ne sont pas retirés deux fois. Sans aucune barquette à ranger, l’écran le dit au lieu du bouton.
