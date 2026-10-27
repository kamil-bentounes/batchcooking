---
id: cuisine-inventer
titre: Inventer une recette (Envie spéciale)
ecrans: [/inventer]
questions:
  - Comment inventer une recette avec ce que j’ai ?
  - Que signifie « Inventée · jamais testée » ?
  - Combien de recettes puis-je inventer par mois ?
  - Le modèle connaît-il mes objectifs ?
  - Que veut dire « + 3 courses » ?
  - Que devient la recette si je ne la garde pas ?
sources:
  - src/pages/Inventer.tsx
  - supabase/functions/inventer/index.ts
  - src/lib/nutrition/portions.ts
  - src/lib/donnees/foyer.ts
  - src/lib/donnees/catalogue.ts
  - src/pages/Accueil.tsx
  - src/pages/Choisir.tsx
verifie_sur: 9504cf2
---
## Ce que fait l’appli

Quand rien de prévu ne fait envie ce soir, « Envie spéciale ? » fait **inventer une recette par un modèle de langage**, d’après ton envie, ton stock et des bornes chiffrées. Accès : l’accueil de la cuisine (« Envie spéciale ? ») ou « Choisir » (« Rien ne va ? Invente-moi une recette »).

## Comment faire

1. Écris « Ce soir j’ai envie de… » ou touche une des six idées (« Réconfortant », « Asiatique », « Sans cuisson »…).
2. « Avec quoi » : « Ce qu’on a » (on demande au modèle de s’en tenir à ton stock), « + 3 courses » (ton stock plus trois ingrédients à acheter au plus) ou « Libre ».
3. « Sans négocier » : « Au moins » N g de protéines, « Au plus » N kcal la part, « En moins de » N min actives (25 au départ). Tu peux cocher des appareils.
4. « Invente-moi ça », puis « Garder cette recette » ou « Autre idée ».

## Ce que tu reçois

Le badge **« Inventée · jamais testée »**, des fourchettes de protéines et de kcal par part (**proposées par le modèle**, pas mesurées), les minutes actives, « Il te manque N chose(s) » ou « Tu as tout. », les ingrédients, les étapes.

## Les règles

- Bornes de départ : tes objectifs ramenés à un repas, **35 %** de ta journée. Exemple : 2 000 kcal et 150 g de protéines donnent « Au plus 700 kcal » et « Au moins 53 g ». Sans objectifs enregistrés : 30 g et 620 kcal.
- Le modèle ne voit **jamais tes objectifs ni ton prénom** : seulement ces bornes, ton envie, et les noms et quantités des ingrédients du frigo et du placard (60 lignes au plus ; rien en « Libre »).
- Recette demandée pour **2 parts**.
- **Quota : 10 générations par mois** pour le foyer ; il repart le 1er. « N générations restantes ce mois-ci » s’affiche sous le résultat, pas avant. Un échec ne consomme rien.

## Garder ou non

« Garder cette recette » l’enregistre (privée, pour ton foyer), puis t’envoie sur « Choisir ». « Choisir » ne montre que les recettes planifiables ; une recette inventée l’est quand chaque étape a une durée (le modèle en donne une à chacune) : cherche son titre, tu peux la retenir. Gardée avant le dernier changement, elle n’y est pas. Sans « Garder », elle **disparaît**.

## Ce que l’appli ne fait pas

Elle ne calcule pas les macros de la recette inventée.
