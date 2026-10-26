---
id: cuisine-importer
titre: Coller sa propre recette
ecrans: [/importer]
questions:
  - Comment ajouter ma propre recette ?
  - Pourquoi ma recette ne part pas au plan du dimanche ?
  - Que veut dire « pas reconnu — il ne comptera pas dans les macros » ?
  - Qui peut voir la recette que j’ai collée ?
  - Combien de recettes puis-je coller par mois ?
  - Le modèle calcule-t-il les calories de ma recette ?
sources:
  - src/pages/Importer.tsx
  - src/pages/Choisir.tsx
  - src/lib/donnees/importer.ts
  - src/lib/donnees/catalogue.ts
  - supabase/functions/importer/index.ts
  - supabase/migrations/0033_import.sql
  - src/lib/nutrition/macros.ts
verifie_sur: e058ce7
---
## Ce que fait l’appli

Tu colles une recette d’un carnet, d’un message ou d’un site, et elle rejoint le catalogue. **Le modèle de langage ne fait que découper le texte** (titre, parts, ingrédients, gestes) ; il ne reçoit que ce texte et ta précision. Le reste est du calcul ordinaire, comme pour les autres recettes : quantités, verbe, appareil, aliment reconnu, macros avec fourchette. Accès : « J’ai ma propre recette à coller » dans « Choisir ».

## Comment faire

1. Colle le texte dans « La recette, telle quelle » (40 caractères au moins, 24 000 au plus). Option : « Une précision à ajouter ? (facultatif) », attachée à la recette.
2. « Ranger la recette ».
3. Vérifie « Ce que j’ai compris » : titre, « Pour combien de parts ? » (1 à 20), ingrédients (« retirer »), étapes avec leur durée en minutes.
4. Choisis « Qui peut la voir » : « Nous deux » (par défaut, au foyer seul), « Nos amis » (les foyers amis, avec ton prénom) ou « Tout le monde » (catalogue commun).
5. « Garder cette recette » (avec un titre et une étape au moins) t’envoie sur « Choisir ».

## Ce qui est signalé

- « À compléter » : ingrédients non reconnus, étapes sans durée.
- « reconnu : » suivi du nom de l’aliment retenu, ou « pas reconnu — il ne comptera pas dans les macros ».
- « durée manquante » : tape les minutes.

## Les règles

- 60 ingrédients et 40 étapes au plus sont gardés ; une étape qui n’est pas une action est écartée.
- Une recette n’est **planifiable** que si **toutes** ses étapes ont une durée. **Seules les recettes planifiables apparaissent dans « Choisir »** : sinon elle est enregistrée sans y figurer (l’écran le dit). Complète les durées avant de la garder.
- Les macros se **calculent** : elles n’existent que si 75 % des lignes au moins sont reconnues et chiffrées, et sont écartées pour une part impossible (plus de 900 kcal/100 g).
- **Quota : 40 imports par mois** pour le foyer, remis à zéro le 1er. Au-delà : « Quota atteint : 40 imports par mois. Il repart le 1er. »
- Trop court : « Colle la recette : au moins quelques lignes. » Trop long : « Texte trop long. Colle la recette seule, sans la page. »

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui d’écran pour changer la visibilité d’une recette après coup. Elle n’est pas ajoutée toute seule à la semaine, et « Choisir » ne la met pas en avant (j’ai cherché : rien n’exploite l’adresse d’arrivée) : cherche-la par son titre.
