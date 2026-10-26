---
id: foyer-creer
titre: Créer son foyer
ecrans: []
questions:
  - Comment créer mon foyer ?
  - Pourquoi l’appli me dit « Il te faut une invitation » ?
  - Je me suis connecté mais je n’ai pas de foyer, que faire ?
  - Peut-on avoir deux foyers ?
sources:
  - src/pages/Onboarding.tsx
  - src/App.tsx
  - supabase/migrations/0009_create_household.sql
  - supabase/migrations/0070_un_seul_foyer.sql
  - supabase/migrations/0091_le_createur_choisit_son_prenom.sql
verifie_sur: 1b57e94
---
## Ce que fait l’appli

Un foyer, c’est le groupe qui partage tout : les courses, le budget, les sessions de cuisine. Chaque personne appartient à un seul foyer.

Quand tu es connecté(e) mais que tu n’as pas de foyer, l’appli te montre l’un de ces deux écrans.

## Si la création est ouverte : « Votre foyer »

1. Dans « Comment vous l’appelez », garde « Notre foyer » ou écris un autre nom.
2. Appuie sur « Créer le foyer ».
3. L’appli te demande ensuite de choisir un mot de passe (si tu n’en as pas encore), puis ton profil : prénom, revenu, date d’arrivée. Voir la page « compte-profil ».

L’écran rappelle aussi : si quelqu’un t’a déjà invité(e), ouvre plutôt le lien qu’on t’a envoyé.

## Si la création est fermée : « Il te faut une invitation »

Cet écran dit : « Cette application se rejoint sur invitation. » Il n’y a pas de bouton pour créer un foyer. Demande à la personne du foyer de t’envoyer son lien, puis ouvre-le : il te fait rejoindre le foyer. Ton compte est déjà créé, il ne te manque que le lien. Le bouton « Se déconnecter » est là pour changer de compte ; à la différence de « Me déconnecter » des réglages, il ferme aussi la session de tes autres appareils.

## La règle

Cette appli est privée. Dès qu’un foyer existe, la création de nouveaux foyers se ferme toute seule : le seul chemin qui reste est le lien d’invitation. Cela évite qu’une personne qui n’a pas ouvert son lien se retrouve, d’un clic, dans un foyer vide à elle, avec un budget séparé de celui de l’autre.

Concrètement : tant qu’un foyer existe, un nouveau compte sans lien voit « Il te faut une invitation ». Je ne sais pas dans quel état est ce réglage sur le serveur en ligne : il peut être rouvert à la main.

## Ce que l’appli ne fait pas

- Elle ne permet pas d’être dans deux foyers. Je n’ai pas trouvé d’écran pour changer de foyer, ni pour en quitter un sans supprimer son compte.
- Je n’ai pas trouvé d’écran pour renommer le foyer après sa création.

Pour inviter quelqu’un : page « foyer-inviter ».
