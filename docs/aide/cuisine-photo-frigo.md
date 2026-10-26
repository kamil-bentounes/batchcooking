---
id: cuisine-photo-frigo
titre: La photo du frigo
ecrans: [/photo]
questions:
  - Comment remplir mon stock avec une photo du frigo ?
  - Pourquoi l’appli ne coche pas tous les articles ?
  - Combien de photos puis-je prendre par mois ?
  - Que veut dire « deviné, à vérifier » ?
  - La photo ajoute-t-elle les aliments toute seule ?
  - Que faire si l’appli n’a rien su lire ?
sources:
  - src/pages/Photo.tsx
  - src/pages/Frigo.tsx
  - src/lib/photo.ts
  - src/lib/donnees/barquettes.ts
  - supabase/functions/frigo/index.ts
verifie_sur: d61ae46
---
## Ce que fait l’appli

Un modèle de langage qui sait lire les images regarde ta photo et **propose** une liste d’aliments : **rien n’entre dans le frigo sans que tu l’aies coché**.

## Comment faire

1. Dans le frigo, porte ouverte, « Photo du frigo ».
2. Choisis le lieu : « Frigo », « Congélateur » ou « Placard ». Il est sur « Frigo » au départ ; c’est seulement une indication pour le modèle.
3. « Prendre la photo » : cadre une étagère à la fois, de face. L’appli attend environ quinze secondes (« Je regarde… »). La photo est réduite avant l’envoi (1 400 pixels au plus).
4. Lis la liste : quantité, nom, variété (« yaourt aux fruits » et « yaourt nature » n’ont pas les mêmes macros), endroit vu sur la photo, remarques.
5. Décoche ce qui n’y est pas, puis « Ajouter N articles » : tu arrives au frigo. Pas satisfait : « Reprendre une photo ».

## Les règles

- Sont cochés d’avance **seulement** les articles dont le modèle est sûr (confiance d’au moins 0,8). Les autres portent « deviné, à vérifier » et ne sont pas cochés.
- Chaque article est rangé dans le lieu que **le modèle** lui attribue (givre = congélateur, bacs = frigo, boîtes = placard), pas dans celui que tu as choisi.
- Ces lignes ne sont pas rattachées à un aliment : « Avec ce que j’ai » et « il manque … » les ignorent.
- L’écran écrit « Tu pourras toujours retirer une ligne depuis le frigo » : la fiche d’un ingrédient permet de corriger sa quantité et « Fini » le retire.
- **Quota : 30 photos par mois** pour le foyer ; il repart le 1er. « N photos restantes ce mois-ci » s’affiche sous la liste, après la lecture. Au-delà : « Quota atteint : 30 photos par mois. Il repart le 1er. »
- Une panne du modèle ne consomme pas de photo ; une photo où rien n’est reconnu, si.
- Le modèle ne reçoit que la photo et le lieu : pas tes objectifs, pas ton prénom.
- « Je n’ai rien su lire » : photo floue, trop sombre ou sans nourriture ; reprends-en une.

## Ce que l’appli ne fait pas

Elle n’ajoute rien automatiquement, ne fixe aucune date de péremption et ne calcule aucune macro d’après la photo : seulement des noms et des quantités.
