---
id: compte-connexion
titre: Se connecter, mot de passe, déconnexion
ecrans: [/motdepasse]
questions:
  - J’ai oublié mon mot de passe, comment faire ?
  - Comment changer mon mot de passe ?
  - Comment me déconnecter ?
  - L’appli dit « Ta session a expiré », pourquoi ?
  - À quoi sert « Première connexion » ?
sources:
  - src/pages/SignIn.tsx
  - src/pages/Password.tsx
  - src/pages/Settings.tsx
  - src/pages/Profil.tsx
  - src/App.tsx
  - src/lib/supabase.ts
  - src/lib/session-perdue.ts
  - src/lib/lien.ts
  - src/pages/Onboarding.tsx
  - supabase/config.toml
verifie_sur: e4c18ef
---
## Se connecter

L’écran de connexion s’intitule « On s’y met ? ». Des liens en bas choisissent ce que tu fais (celui du mode en cours est masqué).

- **« J’ai déjà un mot de passe »** : « Ton e-mail », « Mot de passe », puis « Se connecter ». Si ça échoue : « E-mail ou mot de passe incorrect. »
- **« Première connexion »** : à utiliser quand ton compte n’a pas encore de mot de passe. « Recevoir le lien » envoie un lien par mail. Il sert une fois ; ouvre-le depuis le même appareil, puis choisis ton mot de passe.
- **« Mot de passe oublié »** : « Réinitialiser mon mot de passe » envoie un lien de réinitialisation, valable une heure. L’appli répond « Si un compte existe pour … » : même message avec ou sans compte. Le lien mène droit à l’écran du nouveau mot de passe, qu’on ne peut pas passer.

Un lien trop vieux ou déjà utilisé affiche « Ce lien a expiré ou a déjà servi » : redemande-en un. Si tu redemandes trop vite : « Doucement : attends une minute avant de redemander un lien. »

## Choisir ou changer son mot de passe

Il faut **8 caractères au moins**. Pour le changer : accueil de la cuisine, rond avec ton initiale (« Réglages »), section « Ton mot de passe », « Changer mon mot de passe ». Écris-le dans « Mot de passe », puis « Enregistrer ». Refus possibles : « C’est déjà ton mot de passe : choisis-en un autre. » ou « Ce mot de passe est trop facile à deviner : allonge-le, ou mélange lettres et chiffres. »

## Se déconnecter

« Me déconnecter » dans les réglages (section « Te déconnecter »), « Me déconnecter » en bas de ton profil (le rond de l’accueil de Popote ; une fois ton revenu posé), et « Ce n’est pas moi » sur un lien d’invitation. Ces déconnexions valent pour **cet appareil seulement**, les autres restent connectés. Seul « Se déconnecter » de l’écran « Il te faut une invitation » ferme tous les appareils. Sans réseau, elle peut échouer (« La déconnexion n’a pas abouti… »).

## Quand la session expire

Si l’appli ne te reconnaît plus, elle te ramène à l’écran de connexion avec « Ta session a expiré : reconnecte-toi. » Une coupure de réseau n’est pas une session expirée (« installation-hors-ligne »).

## Ce que l’appli ne fait pas

Je n’ai pas trouvé de connexion par Google ou Apple, ni de moyen de changer l’adresse e-mail d’un compte.
