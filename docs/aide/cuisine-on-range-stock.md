---
id: cuisine-on-range-stock
titre: « La session a pris » : ce que le rangement retire du stock
ecrans: [/dressage]
questions:
  - Que veut dire « La session a pris » ?
  - Pourquoi mes ingrédients ont disparu du frigo ?
  - Comment corriger ce que la session a retiré ?
  - Pourquoi l’appli n’a pas retiré mon pot de yaourt ou mon ail ?
  - Pourquoi n’a-t-elle retiré qu’une partie de ma farine ?
sources:
  - src/pages/Ranger.tsx
  - src/lib/ranger.ts
  - src/lib/donnees/barquettes.ts
  - supabase/migrations/0120_la_session_prend_dans_le_stock.sql
verifie_sur: 73f1b27
---
## Ce que fait l’écran

Les ingrédients des recettes sortent du frigo, du congélateur et du placard : une puce par ingrédient (« Poireaux 1,5 kg »). Touche-la, écris « il en reste … » puis « Corriger » (ou « Comme prévu ») ; un texte qui n’est pas un nombre est refusé avec un message. Un stock tombé à zéro disparaît.

Le calcul suit la liste de courses : la quantité de la recette, mise à l’échelle des parts cuisinées ; une recette dont on ne connaît pas le nombre de parts d’origine compte telle qu’elle est écrite. À la pièce, on arrondit vers le bas : trois quarts d’oignon, rien ne sort. L’appli ne touche **ni** à ce qui n’a pas de quantité, **ni** à ce qu’elle ne sait pas calculer : un pot, un ingrédient dont une ligne de recette n’a ni poids ni unité compatible, ou un ingrédient que tu as à la fois en grammes et à la pièce. « Reste au frigo : … » liste le reste. Le retrait n’a lieu qu’**une fois** par session.

Le reste de l’écran (frigo, congélateur, heure du rangement) est dans « cuisine-on-range ».
