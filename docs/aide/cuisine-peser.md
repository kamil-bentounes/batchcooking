---
id: cuisine-peser
titre: Peser ce qu’on compte à l’unité
ecrans: [/peser]
questions:
  - À quoi sert l’écran « Peser » ?
  - Combien de fois dois-je peser un oignon ?
  - Pourquoi ma pesée n’est pas retenue ?
  - Comment corriger une pesée fausse ?
  - Pourquoi « 2 oignons » ne donne pas de grammes ?
  - Que veut dire « 2 sur 3 » ?
sources:
  - src/pages/Peser.tsx
  - src/pages/Choisir.tsx
  - src/lib/pesee.ts
  - src/lib/donnees/pesee.ts
  - src/lib/donnees/courses.ts
  - supabase/migrations/0025_pesee.sql
verifie_sur: bd10d8c
---
## Ce que fait l’appli

« 2 oignons » ne fait pas des grammes tout seul : un oignon de chez toi n’est pas un oignon moyen. « Peser » te fait peser ces aliments **jusqu’à ce que l’appli connaisse leur poids chez toi**, puis ne le redemande plus. Ce poids sert à la liste de courses, au prochain « Faire la liste » de « Choisir ».

## Comment faire

1. Dans « Ce que j’ai », « Peser ce qu’on compte à l’unité ». La liste vient des recettes retenues de la semaine ; les aliments les plus utilisés passent d’abord.
2. Touche un aliment. Chaque ligne montre un exemple de recette (« 2 oignons ») et un poids de référence : « on compte 110 g en attendant », ou « aucun poids de référence ».
3. Remplis « Combien » et « Pèsent, en grammes ». Pèse ce que tu mets dedans (oignon épluché, poivron épépiné).
4. « Enregistrer · encore N après » (« Enregistrer · la dernière » pour la dernière).

## Les règles

- Il faut **3 pesées retenues** pour qu’un poids prime sur la référence, ou **5 si l’aliment n’a pas de référence**. Avant la première, la ligne dit « 2 recettes » ; ensuite l’avancement : « 2 sur 3 ».
- Le poids retenu est la **médiane** des pesées retenues.
- Une pesée est **écartée** si le poids d’une unité est sous 0,4 fois ou au-dessus de 2,5 fois la référence. L’écran te prévient avant d’enregistrer : « … cette pesée ne sera pas retenue. » Exemple : référence 110 g, accepté de 44 à 275 g ; 1 200 g pour un oignon, non. Une pesée écartée reste listée, mais ne compte pas.
- Sans référence, rien n’est écarté.
- Une fois connu, l’aliment quitte la liste.

## Corriger

Sous un aliment ouvert, chaque pesée est listée (« 2 → 236 g (118 g l’unité) ») avec « effacer ». Efface la fausse plutôt que d’en refaire trois autres.

## Effet sur les courses

« 2 oignons » devient 2 × le poids appris. Exemple : 118 g l’unité donne 236 g pour une recette prise avec ses parts d’origine (sinon la quantité suit les parts retenues) ; deux recettes à « 2 oignons » donnent 472 g.

## Ce que l’appli ne fait pas

« Rien à peser » : toutes les recettes de la semaine se convertissent déjà en grammes, ou aucune n’est retenue. Sans semaine ouverte, l’écran reste sur « Un instant… ». Il n’existe pas aujourd’hui d’effet de ces pesées sur les calories des recettes (seule la liste de courses lit les poids appris).
