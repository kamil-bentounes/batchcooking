---
id: cuisine-session-fin
titre: Finir, interrompre ou reprendre la cuisine
ecrans: [/cuisine]
questions:
  - Que faire quand tout est cuit ?
  - Comment passer au dressage sans cocher toutes les actions ?
  - Comment interrompre la session de cuisine ?
  - Comment reprendre une session interrompue ?
  - Pourquoi l’accueil de Popote dit « Session interrompue » ?
  - Que veut dire « J’ai fini · passer au dressage » ?
sources:
  - src/pages/Cuisine.tsx
  - src/pages/Accueil.tsx
  - src/pages/Hub.tsx
  - src/lib/donnees/cycle.ts
  - supabase/migrations/0013_cycle.sql
  - supabase/migrations/0117_cuisine_corrections.sql
  - supabase/migrations/0119_reprendre_une_session_recente.sql
verifie_sur: 5f54c2b
---
## Quand tout est coché

L’écran dit « C’est cuit. », avec « N actions en … ». **« Passer au dressage »** ouvre l’écran suivant.

## Quand tout n’est pas coché : « J’ai fini »

Tant que toutes les actions ne sont pas cochées, le bouton **« J’ai fini · passer au dressage »** se tient au-dessus de « Interrompre la session ». Il n’existe que chez toi : un convié ne le voit pas.

Il demande « Tout est cuit ? » et nomme les actions non cochées (quatre au plus, puis « … »). Si aucune action d’une recette n’est cochée, il le dit : « Aucune action de « … » n’est cochée : elle sera dressée quand même. » Le dressage prend toutes les recettes de la semaine, cuisinées avec l’appli ou sans.

- **« Oui, au dressage »** passe au dressage. Ces actions restent non cochées.
- **« Non, je continue »** (ou Échap) referme la question. Pendant l’envoi, elle reste ouverte.
- Si l’autre téléphone coche la dernière action entre-temps, la question disparaît et « C’est cuit. » prend le relais.

## Interrompre

« Interrompre la session » demande « Interrompre la session ? » : « Non, je continue » ou « Oui, interrompre ». Pour dire que la cuisine est finie, prends plutôt « J’ai fini ». Un convié n’interrompt pas : il a « Quitter la session ».

## Reprendre

- L’accueil de la cuisine titre **« Session interrompue »** quand aucune semaine n’est ouverte, avec **« Reprendre la session interrompue »** en gros bouton et « Choisir de nouvelles recettes » en second.
- La carte sombre de l’accueil de Popote dit « Session interrompue » et « Reprends-la depuis la cuisine. », avec le même bouton « Reprendre la session interrompue ».
- Une session se reprend si sa semaine est la précédente, la courante ou une à venir, **ou** si elle a commencé il y a moins de 7 jours. Au-delà, elle ne se propose plus.
- La semaine n’aura pas d’autre session : « Cette semaine a une session interrompue : reprends-la. »
