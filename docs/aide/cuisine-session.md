---
id: cuisine-session
titre: La cuisine pas à pas
ecrans: [/cuisine]
questions:
  - Comment fonctionne l’écran de cuisine ?
  - Que veut dire « Je prends » et « C’est fait » ?
  - Comment interrompre la session de cuisine ?
  - Comment reprendre une session interrompue ?
  - Que signifie « Pendant ce temps » ?
  - Que faire quand tout est cuit ?
sources:
  - src/pages/Cuisine.tsx
  - src/lib/donnees/session.ts
  - src/pages/Accueil.tsx
  - src/lib/donnees/cycle.ts
  - supabase/migrations/0013_cycle.sql
  - supabase/migrations/0117_cuisine_corrections.sql
verifie_sur: bd10d8c
---
## Ce que fait l’appli

Écran sombre, sans barre du bas : un seul geste à la fois, selon le plan de dimanche.

## Comment faire

1. En haut : « Session en cours · » et le temps écoulé.
2. Le geste à faire s’affiche avec « À prendre · N sur M faites » et sa durée « prévues ». S’il sert plusieurs recettes : « Pour … et … à la fois. »
3. **« Je prends »** met le geste à ton nom (« À toi » remplace « À prendre ») et lance un compte à rebours (« restantes »).
4. **« C’est fait »** quand c’est fini : le geste suivant apparaît.

- « Pendant ce temps » : les actions qui cuisent seules une fois prises, avec leur temps restant.
- « Ensuite, si quelqu’un est libre » : au plus deux gestes déjà possibles, à prendre en touchant la ligne. Avec un geste en cours, le premier des suivants est masqué.
- « Rien à faire, ça cuit. » : rien n’est à prendre ; « La suite s’ouvrira toute seule. »
- Un geste pris par l’autre personne disparaît de ton écran.

## Les règles

- Un geste n’est proposé que lorsque ceux dont il dépend sont faits.
- Deux téléphones suivent la même session en direct.
- Une action qui cuit seule se prend aussi, mais ne se termine pas seule : à 0:00 celui qui l’a prise appuie sur « C’est fait ».
- L’appli mesure la durée réelle de chaque geste sans te la demander ; « C’est fait » sans « Je prends » compte le début à la durée prévue en arrière.

## Quand tout est cuit

« C’est cuit. », avec « N actions en … ». **« Passer au dressage »** ouvre l’écran suivant.

## Interrompre, reprendre

« Interrompre la session » demande : « Interrompre la session ? », « Non, je continue » ou « Oui, interrompre ». Tu pourras la reprendre depuis l’accueil (« Reprendre la session interrompue », quand aucune semaine n’est ouverte), mais la semaine n’aura pas d’autre session.

## Si tu es invité

Un ami convié (voir « cuisine-session-partagee ») lit : « Tu cuisines chez quelqu’un d’autre : tu prends des gestes, tu ne touches pas au plan. » Il ne peut ni interrompre ni faire avancer la session ; il a « Quitter la session » puis « Revenir chez moi ». Le dressage revient à l’hôte.

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de notification ni de sonnerie quand un compte à rebours arrive à 0:00 : tu regardes l’écran.
