---
id: foyer-rejoindre
titre: Rejoindre un foyer avec un lien
ecrans: []
questions:
  - J’ai reçu un lien d’invitation, que faire ?
  - Faut-il avoir un compte pour rejoindre le foyer ?
  - Le lien dit « Ce lien a expiré » ou « Ce lien a déjà servi »
  - L’appli dit « Tu es déjà dans un foyer »
  - J’ai déjà un compte et je reçois une invitation
sources:
  - src/pages/Rejoindre.tsx
  - src/pages/AcceptInvite.tsx
  - src/App.tsx
  - supabase/functions/accept-invite/index.ts
  - supabase/migrations/0089_le_lien_suffit.sql
  - supabase/migrations/0071_invitation_trente_jours.sql
  - supabase/migrations/0103_budget_arrivees.sql
verifie_sur: e4c18ef
---
## Ce que fait l’appli

Le lien d’invitation suffit : **pas besoin d’avoir déjà un compte**. Tu choisis ton mot de passe, ton compte est créé et tu entres dans le foyer. Aucun mail à attendre.

## Sans compte : comment faire

1. Ouvre le lien. L’écran s’intitule « <prénom> t’invite » (ou « On t’attend dans un foyer » si l’invitant n’a pas de prénom).
2. « Ton e-mail » est déjà rempli : c’est l’adresse pour laquelle l’invitation a été créée. Tu ne peux pas la modifier.
3. Dans « Choisis ton mot de passe », tape au moins 8 caractères. « Afficher le mot de passe » sert à vérifier.
4. Appuie sur « Créer mon compte ».
5. Tu arrives dans l’appli, puis sur ton profil : prénom, revenu, date d’arrivée. Voir la page « compte-profil ».

## Si tu as déjà un compte

- Sur la page du lien, appuie sur « J’ai déjà un compte », connecte-toi, puis appuie sur « Rejoindre le foyer » (écran « On t’attend »). Cela ne marche que si ton compte n’a pas encore de foyer ; l’adresse de ton compte peut différer de celle de l’invitation.
- Si l’adresse de l’invitation appartient déjà à quelqu’un qui est dans un foyer, l’appli répond « Cette adresse a déjà un compte Popote. Connecte-toi avec ton mot de passe. » Un lien ne reprend jamais le compte de quelqu’un qui est déjà dans un foyer. Si elle a un compte sans foyer, ce compte prend le mot de passe que tu choisis.

## Les messages possibles

- « Ce lien a expiré » : demande-en un nouveau (un lien vaut 30 jours).
- « Ce lien a déjà servi » : un lien ne sert qu’une fois. Si c’était toi, appuie sur « Me connecter » avec ton e-mail et ton mot de passe.
- « Ce lien ne mène nulle part » : il a sans doute été mal recopié.
- « Ce lien n’a pas pu être lu » : vérifie ta connexion, puis « Recharger ».
- « Tu es déjà dans un foyer » : tu es connecté(e) avec un compte qui a déjà un foyer. L’écran affiche « Compte ouvert ici : » et l’adresse. Si ce n’est pas toi, « Ce n’est pas moi » te déconnecte de cet appareil seulement.

## La date d’arrivée

En rejoignant, ta date d’arrivée est posée au **1er du mois suivant**, pas à aujourd’hui. Tu ne participes donc à aucune charge avant.

## Ce que l’appli ne fait pas

Je n’ai pas trouvé de code qui envoie un mail de bienvenue ou de rappel.
