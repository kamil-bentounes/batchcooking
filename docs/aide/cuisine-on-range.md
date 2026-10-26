---
id: cuisine-on-range
titre: « On range » : frigo, congélateur et ingrédients de la session
ecrans: [/dressage]
questions:
  - Comment choisir ce qui va au frigo et ce qui va au congélateur ?
  - Combien de temps se garde une barquette ?
  - Que veut dire « La session a pris » ?
  - Pourquoi mes ingrédients ont disparu du frigo ?
  - Comment changer l’heure de rangement ?
  - Que fait « Ranger les barquettes » ?
sources:
  - src/pages/Ranger.tsx
  - src/pages/Dressage.tsx
  - src/lib/ranger.ts
  - src/lib/donnees/barquettes.ts
  - src/App.tsx
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0120_la_session_prend_dans_le_stock.sql
verifie_sur: d61ae46
---
## Ce que fait l’écran

Après « C’est dressé » (« cuisine-dressage »), « On range » te fait choisir, pour le foyer entier, combien de barquettes de chaque recette restent au frigo : le reste part au congélateur.

## Comment faire

Une carte par recette : le total, une barre frigo / congélateur, « Frigo · N » avec **−** et **+**, « Congélateur · N », et la date : « à manger avant le … » au frigo, « se garde jusqu’au … » au congélateur.

- **La proposition de départ** remplit le frigo jusqu’à **4 jours de dîners pour le foyer** (4 × le nombre de personnes), recette par recette dans l’ordre retenu ; le reste va au congélateur.
- **« Rangé le »** : maintenant par défaut. « Modifier » ouvre un champ date et heure (pas dans le futur). Cette heure devient celle de préparation de chaque barquette, et celle de congélation pour celles du congélateur.
- **Le bilan** : « N barquettes au frigo », de quoi tenir tant de jours de dîners. Au-delà de 4 jours, il passe en ocre : « congèle-en quelques-unes, les dernières périmeront après le … ».
- Une barquette se garde **4 jours** au frigo, **90 jours** au congélateur, **24 heures** une fois décongelée.

## « La session a pris »

Les ingrédients des recettes sortent du frigo et du placard : une puce par ingrédient (« Poireaux 1,5 kg »). Touche-la, écris « il en reste … » puis « Corriger » (ou « Comme prévu »). Un stock tombé à zéro disparaît. L’appli ne touche ni à ce qui n’a pas de quantité, ni à ce qu’elle ne sait pas calculer (un pot, une ligne de recette sans poids) : « Reste au frigo : … » les liste. Le retrait n’a lieu qu’**une fois** par session.

## Ranger

**« Ranger les N barquettes »** crée les barquettes avec leur lieu, retire les ingrédients, passe la semaine à « La semaine tourne » et ouvre le frigo (écran « Frigo »). Rien n’est posé tout seul sur les jours : tu choisis ce que tu manges quand.

## Si ça échoue

Le bouton reste actif : appuie de nouveau. Les barquettes déjà créées ne sont pas refaites, et les ingrédients ne sont pas retirés deux fois.
