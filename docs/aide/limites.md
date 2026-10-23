---
id: limites
titre: Ce que Popote ne fait pas aujourd’hui
ecrans: []
questions:
  - Popote marche-t-elle sans réseau ?
  - Peut-on brancher sa banque ?
  - Peut-on changer son adresse e-mail ?
  - Peut-on avoir plusieurs foyers ou quitter un foyer ?
  - Combien de photos ou de dictées par mois ?
sources:
  - src/App.tsx
  - src/pages/Settings.tsx
  - src/pages/SignIn.tsx
  - src/pages/Onboarding.tsx
  - src/pages/Password.tsx
  - src/lib/client-requetes.ts
  - src/lib/supabase.ts
  - src/lib/donnees/convives.ts
  - src/pages/Accueil.tsx
  - src/pages/Cuisine.tsx
  - src/pages/Inventer.tsx
  - src/pages/AjoutManuel.tsx
  - src/pages/Dictee.tsx
  - .github/workflows/reveil.yml
  - supabase/functions/invite/index.ts
  - supabase/functions/frigo/index.ts
  - supabase/functions/ticket/index.ts
  - supabase/functions/etiquette/index.ts
  - supabase/functions/charges/index.ts
  - supabase/functions/revue-charges/index.ts
  - supabase/functions/inventer/index.ts
  - supabase/functions/importer/index.ts
  - supabase/migrations/0070_un_seul_foyer.sql
  - vite.config.ts
verifie_sur: bd10d8c
---
Chaque « je n’ai pas trouvé » vient d’une recherche dans les écrans, les fonctions et la base. Cette page ne couvre que le compte, le foyer et l’installation ; la cuisine et le budget ont leurs pages.

## Compte et foyer

- **Je n’ai pas trouvé de mode hors ligne.** Sans réseau, l’appli s’ouvre sans données (« installation-hors-ligne »).
- **Je n’ai pas trouvé de notification qui s’affiche sur le téléphone.** Une invitation à cuisiner se découvre en ouvrant l’appli.
- **Je n’ai pas trouvé d’envoi d’e-mail pour inviter** : c’est toi qui envoies le lien. Je n’ai pas trouvé non plus d’écran qui liste ou annule une invitation de foyer en attente.
- **Je n’ai pas trouvé de connexion par Google ou Apple.** On entre avec un e-mail et un mot de passe.
- **Je n’ai pas trouvé de moyen de changer son adresse e-mail.**
- **Une personne, un seul foyer.** Je n’ai pas trouvé d’écran pour changer de foyer, en quitter un sans supprimer son compte, ou renommer le foyer. Dès qu’un foyer existe, la création d’un autre est fermée.
- **Je n’ai pas trouvé de bouton « me déconnecter partout ».** « Me déconnecter » ne vaut que pour l’appareil en main (sauf « Se déconnecter » de « Il te faut une invitation »).
- **Je n’ai pas trouvé de lien avec une banque** : ni import de relevé, ni synchronisation de compte.
- **Je n’ai pas trouvé d’export autre que le fichier « mes-donnees.json ».** Ni tableur ni PDF.
- **Je n’ai pas trouvé de version pour les magasins d’applications** : on installe le site.
- **Je n’ai pas trouvé de choix de thème ni de langue** : l’appli est en français ; certains écrans de cuisine sont sombres par conception.

## Les plafonds de l’IA

Chaque foyer a un nombre d’usages **par mois**, qui repart le 1er. Au-delà, l’appli répond « Quota atteint : … Il repart le 1er. »

- photos du frigo : 30
- tickets : 30
- étiquettes : 40
- dictées de charges : 20
- relectures des charges : 30
- recettes inventées : 10 (le reste s’affiche sous la recette)
- imports de recette : 40

Le plafond en euros des Réglages (« Ce que coûtent les photos ») n’est pas ce qui bloque : je n’ai pas trouvé de code qui l’applique.

## Du côté de l’hébergement

Une base d’une offre gratuite se met en pause après sept jours sans activité ; l’appli répond alors « Ça ne répond pas ». Une requête automatique quotidienne est prévue pour l’éviter ; je ne sais pas si elle tourne.
