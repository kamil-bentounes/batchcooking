---
id: aide-integree
titre: L'aide « Demande à Popote »
ecrans: []
questions:
  - Comment fonctionne l'aide ?
  - Où poser une question à l'appli ?
  - L'aide voit-elle mes chiffres ?
  - Que faire si l'aide se trompe ?
sources:
  - src/ui/Aide.tsx
  - src/lib/aide/aide.ts
  - src/lib/aide/suggestions.ts
  - supabase/functions/aide/index.ts
  - supabase/functions/aide/prompt.ts
  - supabase/migrations/0118_aide_signalement.sql
verifie_sur: e058ce7
---
**Ce que c'est.** Un petit assistant qui répond à tes questions sur l'appli : où cliquer, comment c'est calculé, ce qu'elle ne fait pas. Il répond d'après un manuel écrit à partir du code de l'appli, pas de mémoire. Si plusieurs pages parlent du sujet, il retient celle qui traite le cas décrit, et la cite.

**Où le trouver.** Le bouton rond avec un « ? » est dans l'en-tête de l'accueil, du budget et de l'accueil de la cuisine, à côté de ton initiale. Sur tous les autres écrans, il flotte en haut à droite. Il ouvre la feuille « Demande à Popote », sur l'écran où tu es : tu n'as pas à le quitter. Tu la fermes avec la croix, en touchant à côté, ou avec la touche Échap.

**Poser une question.** Touche une des questions proposées (celles de l'écran, puis « Souvent demandé »), ou écris la tienne dans « Pose ta question sur l’appli… » : 500 caractères au plus. Il garde en tête ta dernière question, donc tu peux enchaîner par « et si… ? ».

**Ce qu'il te rend.**
- La réponse, en quelques lignes.
- Une ligne « Source » qui nomme la page du manuel et la date où elle a été relue contre le code.
- Parfois un bouton « Ouvrir … » qui t'amène à l'écran dont il parle.
- Une mise en garde en cas de doute : « Je n’ai pas pu confirmer dans le manuel : … » quand la réponse contient un chiffre ou un libellé que les pages du manuel ne contiennent pas, ou une note quand la réponse n'est que partielle.

**Ce qu'il ne fait pas.** Il ne voit ni tes revenus, ni tes charges, ni tes montants, ni ton écran : si tu lui demandes « combien », il t'explique où le lire et comment c'est calculé. Il ne donne pas de conseil de cuisine, de finances ou de droit. Quand le manuel ne répond pas, il le dit au lieu d'inventer.

**S'il se trompe.** Touche « Cette réponse est fausse » sous sa réponse : la question, sa réponse et les pages utilisées sont enregistrées dans ton foyer, puis « Merci, c’est noté. » s'affiche. Cela sert à corriger le manuel ; rien ne change tout de suite pour toi.

**Limite.** Chaque foyer a 300 questions par mois, le compteur repart au début du mois. Au-delà, l'aide répond « Quota atteint ». Si elle est très sollicitée, elle te demande de réessayer dans une minute.

**Avant la connexion.** L'aide n'existe que dans l'appli connectée : ni sur l'écran de connexion, ni sur un lien d'invitation.
