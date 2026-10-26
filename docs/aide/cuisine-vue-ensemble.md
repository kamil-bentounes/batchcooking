---
id: cuisine-vue-ensemble
titre: La cuisine, du choix des recettes au bilan
ecrans: [/cuisine-accueil]
questions:
  - Comment ça marche, la cuisine dans Popote ?
  - Par où je commence pour préparer la semaine ?
  - Que faire maintenant ? Quelle est la prochaine étape ?
  - Pourquoi l’accueil me propose « Choisir les recettes » alors que j’ai déjà commencé ?
  - Comment reprendre une session interrompue ?
  - Pour quelle semaine je choisis les recettes ?
sources:
  - src/pages/Accueil.tsx
  - src/lib/donnees/cycle.ts
  - src/pages/Choisir.tsx
  - src/pages/Cuisine.tsx
  - src/pages/Bilan.tsx
  - src/pages/Hub.tsx
  - src/ui/coque.tsx
  - src/lib/peremption.ts
  - src/lib/frigo.ts
  - supabase/migrations/0013_cycle.sql
  - supabase/migrations/0117_cuisine_corrections.sql
  - supabase/migrations/0119_reprendre_une_session_recente.sql
verifie_sur: fd13da7
---
## Ce que fait l’appli

On choisit les recettes maintenant, on cuisine dimanche, on mange la semaine d’après. L’accueil de la cuisine (carte « Cuisine » de l’accueil de Popote) ne pose qu’une question, « et maintenant ? » : un titre et un gros bouton. Au-dessus, le petit frigo (« N parts au frigo », « N au congélateur », « Ouvrir le frigo ») mène à « cuisine-stock ».

## Les états, dans l’ordre

1. **Rien de prévu** : « Choisir les recettes » ouvre la semaine et mène à « Choisir ». Tant que tu n’as pas touché « Faire la liste », l’accueil reste là.
2. **Votre liste est prête** : « Je pars faire les courses ».
3. **Tout est là** : « Voir le plan de dimanche ».
4. **Session en cours** : « Reprendre la cuisine ».
5. **Il reste à dresser** : « Dresser les barquettes ».
6. **La semaine tourne** : « Voir la semaine ». Si un repas est prévu aujourd’hui, l’accueil l’affiche en carte sombre (« Ce soir, pour vous deux ») avec « Je l’ai mangé » et « Changer » — « Je les sors » (« Je le sors » s’il n’y en a qu’une) à la place quand la barquette est au congélateur —, puis « Demain, midi et soir » et « La semaine ». « Changer » ouvre « La semaine » sur ce repas, « La semaine » sous « Demain » sur demain.

« Clore et préparer la semaine prochaine » (dans « Bilan ») referme la semaine : retour à « Rien de prévu ». « Semaine close » ne s’affiche jamais. Une session à reprendre fait titrer « Session interrompue », avec « Reprendre la session interrompue » en gros bouton et « Choisir de nouvelles recettes » en second ; la carte « Cuisine » de l’accueil de Popote le dit aussi.

## Les règles

- Un foyer n’a **qu’une semaine ouverte à la fois**.
- « Choisir les recettes » ouvre la semaine du **lundi suivant** ; on cuisine le dimanche, la veille. Par défaut : **10 parts** à couvrir.
- Rouvrir la même semaine est refusé : « Cette semaine a déjà eu sa session : reprends-la, ou attends la semaine suivante. » Une semaine close ne se reprend pas.
- « Interrompre la session » se fait depuis l’écran de cuisine ; la reprise a ses règles (voir « cuisine-session-fin »). Une semaine interrompue ne se rouvre pas : « Cette semaine a une session interrompue : reprends-la. »

## Aussi sur l’accueil

- Hors de « La semaine tourne », la carte sombre du repas d’aujourd’hui vient **sous** le gros bouton.
- En bas, « À manger bientôt », sans titre visible : jusqu’à deux plats qui pressent, un par ligne avec son nombre de barquettes, avec « à manger aujourd'hui », « demain dernier délai », « périmée » ou « à sortir sous N j », quand leur date approche.
- « Envie spéciale ? » invente une recette.

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de notification : tout se lit en ouvrant l’appli.
