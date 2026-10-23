---
id: cuisine-session-partagee
titre: Cuisiner avec un ami : la session partagée
ecrans: [/plan, /cuisine]
questions:
  - Comment inviter un ami à cuisiner avec moi ?
  - Mon ami peut-il modifier mon plan de cuisine ?
  - Comment rejoindre la session d’un ami ?
  - Comment retirer un invité de ma session ?
  - Mon ami est-il prévenu quand je l’invite ?
sources:
  - src/pages/Plan.tsx
  - src/pages/Cuisine.tsx
  - src/pages/Accueil.tsx
  - src/lib/donnees/convives.ts
  - supabase/migrations/0037_cuisiner_ensemble.sql
  - supabase/migrations/0038_convive_frontiere.sql
  - supabase/migrations/0043_amitie_pas_transitive.sql
verifie_sur: bd10d8c
---
## Ce que fait l’appli

Tu peux convier un foyer **ami** (voir « cuisine-amis ») à ta session de cuisine. Il suit l’avancement et prend des gestes ; il ne touche pas au plan.

## Inviter

1. Sur le plan, « Qui cuisine avec toi ? » liste tes foyers amis (la question n’apparaît que s’il y en a). Coche-les.
2. « Commencer la session » enregistre le plan et l’heure de début, envoie l’invitation, puis passe la session « en cuisine » et ouvre l’écran de cuisine. Si l’invitation échoue, une erreur s’affiche et tu restes sur le plan (qui, lui, est déjà enregistré).
3. **Il n’y a pas de notification** : l’ami découvre l’invitation en ouvrant l’appli.

## Rejoindre

Sur l’accueil de la cuisine, l’ami voit « … t’invite à cuisiner. » et « Rejoindre ». Ensuite : « … cuisine — tu suis la session. » avec « Reprendre la session ». L’invitation reste visible tant que la session est en préparation, en cuisine ou au dressage, et que l’amitié tient.

## Ce que fait le convié

Il voit le même plan en direct et prend des gestes (« Je prends », « C’est fait »). Il lit : « Tu cuisines chez quelqu’un d’autre : tu prends des gestes, tu ne touches pas au plan. » Il ne réordonne rien, ne supprime rien, n’interrompt pas la session et ne la fait pas avancer. Le dressage revient à l’hôte. Il peut « Quitter la session » et, à la fin (« C’est cuit. »), « Revenir chez moi ».

Il voit le nom de tes recettes, pas celui des recettes qu’un autre foyer t’a prêtées.

Si l’hôte a terminé : « Cette session n’est plus ouverte » (« Ton hôte l’a terminée, ou ne t’y attend plus. »), avec « Quitter cette session ».

## Côté hôte

Sur l’écran de cuisine, la liste des convives montre chacun (« — invité, pas encore là » tant qu’il n’a pas rejoint) avec « Retirer ». Rompre l’amitié met aussi fin à la session pour lui.
