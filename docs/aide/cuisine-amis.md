---
id: cuisine-amis
titre: Les foyers amis et les recettes partagées
ecrans: [/reglages]
questions:
  - Comment ajouter un foyer ami pour échanger des recettes ?
  - Que voit mon ami de mon foyer ?
  - Combien de temps marche le lien d’ami ?
  - Comment rompre une amitié ?
  - Comment partager une recette avec mes amis ?
sources:
  - src/pages/Settings.tsx
  - src/pages/AccepteAmi.tsx
  - src/lib/donnees/amis.ts
  - src/pages/Importer.tsx
  - src/pages/Choisir.tsx
  - src/ui/recettes/Vignette.tsx
  - supabase/migrations/0035_amis.sql
  - supabase/migrations/0037_cuisiner_ensemble.sql
  - supabase/migrations/0038_convive_frontiere.sql
verifie_sur: 1b57e94
---
## Ce que fait l’appli

Deux foyers peuvent devenir **amis** : ils échangent des recettes, et l’un peut convier l’autre à cuisiner (voir « cuisine-session-partagee »). À ne pas confondre avec inviter quelqu’un dans ton propre foyer (« foyer-inviter »).

## Devenir amis

1. « Réglages », section « Vos amis » : « Inviter un foyer ». Un lien apparaît (« Invitation en attente, valable jusqu’au … »).
2. « Copier le lien » et envoie-le ; « Annuler » le retire.
3. L’autre foyer l’ouvre (il lui faut déjà un foyer et un mot de passe) : « Devenir amis ? », puis « Accepter » ou « Non merci ».

Le lien vaut **7 jours** et ne sert qu’une fois (« Ce lien a déjà servi. », « Ce lien a expiré. Demande-lui d’en refaire un. », « C’est ton propre lien. »). Passé 7 jours, il disparaît de la liste.

## Les règles

- L’amitié est dans les deux sens : « rompre » (avec confirmation : « Ne plus partager avec … ? ») la coupe pour les deux, et les recettes partagées cessent d’être visibles des deux côtés. Les invitations à cuisiner entre ces deux foyers cessent aussi.
- Un foyer ami est nommé par les prénoms de ses membres.
- Un foyer ami voit les recettes marquées **« partagée »**, avec ton prénom : « Partagée par … » dans « Choisir ». Les recettes « publiques » sont vues par tous les foyers, amis ou non.
- Tu choisis la visibilité en collant une recette (« Qui peut la voir » : « Nous deux », « Nos amis » ou « Tout le monde »). Une recette inventée reste privée.
- Courses, barquettes, prix et objectifs ne sortent pas du foyer. Seule exception : quand tu convies un ami à ta session de cuisine, il voit les gestes et le nom de tes recettes pendant la session.

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de choix de visibilité pour une recette déjà enregistrée.
