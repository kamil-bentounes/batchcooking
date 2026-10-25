---
id: cuisine-session-fin
titre: Finir, interrompre ou reprendre la cuisine
ecrans: [/cuisine]
questions:
  - Que faire quand tout est cuit ?
  - Comment passer au dressage sans cocher toutes les actions ?
  - Comment interrompre la session de cuisine ?
  - Comment reprendre une session interrompue ?
  - Pourquoi la carte Cuisine dit « Session interrompue » ?
  - Que veut dire « J’ai fini · passer au dressage » ?
sources:
  - src/pages/Cuisine.tsx
  - src/pages/Accueil.tsx
  - src/pages/Hub.tsx
  - src/lib/donnees/cycle.ts
  - supabase/migrations/0013_cycle.sql
  - supabase/migrations/0117_cuisine_corrections.sql
  - supabase/migrations/0119_reprendre_une_session_recente.sql
verifie_sur: 79ed802
---
## Quand tout est coché

L’écran dit « C’est cuit. », avec « N actions en … ». **« Passer au dressage »** ouvre l’écran suivant.

## Quand tout n’est pas coché : « J’ai fini »

Tant que toutes les actions ne sont pas cochées, le bouton **« J’ai fini · passer au dressage »** se tient au-dessus de « Interrompre la session ». Il n’existe que chez toi : un convié ne le voit pas.

Il demande « Tout est cuit ? » et nomme les actions non cochées (quatre au plus, puis « … »).

- **« Oui, au dressage »** passe au dressage. Ces actions restent non cochées.
- **« Non, je continue »** referme la question.

## Interrompre

« Interrompre la session » demande « Interrompre la session ? » : « Non, je continue » ou « Oui, interrompre ». Pour dire que la cuisine est finie, prends plutôt « J’ai fini ». Un convié n’interrompt pas : il a « Quitter la session ».

## Reprendre

- L’accueil de la cuisine propose **« Reprendre la session interrompue »**, quand aucune semaine n’est ouverte. Son titre reste « Rien de prévu ».
- La carte « Cuisine » de l’accueil de Popote dit « Session interrompue » et « Reprends-la depuis la cuisine. »
- Une session se reprend si sa semaine est la précédente, la courante ou une à venir, **ou** si elle a commencé il y a moins de 7 jours. Au-delà, elle ne se propose plus.
- La semaine n’aura pas d’autre session : « Cette semaine a une session interrompue : reprends-la. »
