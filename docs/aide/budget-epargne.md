---
id: budget-epargne
titre: L’épargne, les poches et les versements
ecrans: [/epargne]
questions:
  - Comment ouvrir une poche d’épargne ?
  - Comment verser ou retirer de l’argent d’une poche ?
  - À qui appartient l’argent d’une poche ?
  - C’est quoi un projet, et « par mois pour tenir la date » ?
  - Pourquoi je ne peux pas retirer plus que ce que j’ai versé ?
sources:
  - src/pages/Epargne.tsx
  - src/ui/epargne/CartePoche.tsx
  - src/ui/epargne/Projet.tsx
  - src/ui/epargne/OuvrirUnePoche.tsx
  - src/lib/budget/epargne-lecture.ts
  - src/lib/donnees/budget.ts
  - src/lib/budget/feuilles.ts
  - src/ui/budget/CarteEpargne.tsx
  - src/ui/budget/Gestes.tsx
  - src/lib/budget/mois.ts
  - supabase/migrations/0054_enveloppes_et_epargne.sql
  - supabase/migrations/0116_budget_plancher_epargne.sql
verifie_sur: ff8f371
---
L’épargne se range dans des poches. Le bouton « Épargne » de l’écran du mois, ou la carte d’une poche, ouvre cette page.

## Ce que dit l’appli

« Ce qui est versé appartient à qui l’a versé. » Chaque poche est une carte avec sa photo, son nom et son genre (« Fonds d’urgence » ou « Un projet »). Dessous : « 1 240 € sur 4 000 € », le pourcentage, une barre de progression et la date (« pour août 2027 » ou « pas de date »).

Le registre vient ensuite : une pastille par personne, avec le montant versé et le prénom, pas une moitié-moitié présumée. Une personne à 0 € n’a pas de pastille. Une poche vide le dit : « Rien n’y est encore versé. », ou « Tout a été retiré » si tout est ressorti.

## Ouvrir une poche

Sous « Ouvrir une poche » :
1. Choisis « Fonds d’urgence » ou « Un projet ».
2. Remplis « Son nom » et « Objectif (€) » (un objectif qui n’est pas un montant est refusé).
3. Pour un projet : « Pour quand (facultatif) » et « Comment le financer » (« Comme le foyer », « Au prorata », « Moitié-moitié »). Ce choix n’est qu’enregistré, aucun calcul ne s’en sert.
4. Touche « Ouvrir ».

Pour le fonds d’urgence, l’appli rappelle la règle : quatre mois de ce qui est nécessaire, le toit et les courses.

## Verser et retirer

Dans la poche, tape le montant dans « Verser (€) » puis « Je verse », ou « Je retire ». Le retrait demande confirmation : « Retirer X de « nom de la poche » ? »

- Tu ne peux retirer que ce que toi tu as versé. Sinon : « Tu n’as versé que X ici : tu ne peux pas en retirer plus. » (ou « Tu n’as rien versé ici : il n’y a rien à retirer. »)
- Un versement posé ne change plus.
- « Je verse » écrit dans le registre de la poche. Cela ne change pas « Il te reste » sur l’écran du mois.
- La clôture du mois peut aussi verser ton reste dans une poche.

## Un projet

Un projet a une date et des postes : sa carte les range sous « Le projet ».
- « Pour quand » donne le rythme : « X par mois pendant N mois pour tenir la date ». L’appli ajoute : « Il y a X dessus pour l’instant. » C’est ce qu’il reste à atteindre (objectif moins le total déjà versé par tous) divisé par le nombre de mois jusqu’à l’échéance, arrondi au centime supérieur. Exemple : objectif 1 200 €, déjà 200 €, 5 mois : 200 € par mois.
- Les postes détaillent ce qu’on va payer : tape le nom dans « Un poste », le montant, puis touche « + ». Si leur somme diffère de l’objectif, l’appli le dit et propose « Aligner l’objectif ».
- Rien d’annoncé si l’objectif ou la date manque. Date ce mois-ci ou passée : « C’est pour ce mois-ci. » Objectif atteint : « C’est déjà atteint. »
