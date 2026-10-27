---
id: cuisine-semaine-en-plus-quantite
titre: La semaine : combien d’un de nos aliments, et l’étiquette photographiée
ecrans: [/semaine]
questions:
  - Comment ajouter deux yaourts en dessert ?
  - Comment noter 30 g de céréales ?
  - Comment ajouter un produit en photographiant son étiquette ?
  - À quoi sert « Dis-moi ce que c’est (facultatif) » ?
  - Puis-je garder le produit photographié dans nos aliments ?
sources:
  - src/ui/aliments/Quantite.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/ui/semaine/EtiquetteEnPlus.tsx
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/lib/aliments/en-plus.ts
  - src/lib/aliments/consigne.ts
  - src/lib/aliments/etiquette.ts
  - src/lib/donnees/barquettes.ts
  - supabase/functions/etiquette/index.ts
  - supabase/functions/_shared/consigne.ts
  - supabase/migrations/0128_semaine_hier.sql
verifie_sur: 99e3953
---
## Combien ?

Dans « en plus » (voir « cuisine-semaine-en-plus »), appuyer sur un de nos aliments ouvre sous les pastilles le panneau **« Yaourt nature : combien ? »**. La pastille dit son unité (« pot », « 100 g »).

- **Un aliment à l’unité** : un compteur **« − 2 pots + »**, avec les grammes dessous (« 250 g »). Il commence à un pot, ou au même nombre que la dernière fois si c’était un nombre entier de pots (jusqu’à 20). **« ou en grammes »** passe aux grammes ; **« ou en pots »** revient.
- **Un aliment au gramme** (son unité est le gramme) ou **« en grammes »** : tes **quantités récentes** pour cet aliment, les trois dernières différentes (« 30 g », « 60 g »), et **« Autre »** pour taper. Sans historique, le champ est là d’emblée. La dernière quantité est déjà choisie : deux gestes, l’aliment puis « Ajouter ».
- Refus : « Dis combien, en grammes. », « Je ne lis pas ce nombre. », « Pas de valeur négative. », « Il faut au moins 0,1 g. », « Pas plus de 5 000 g. »

Le calcul s’affiche (« 114 kcal · 3 g de protéines »), puis **« Ajouter au soir »**. La ligne dit la quantité : « Yaourt nature × 2 pots », « Céréales, 30 g ». Les valeurs écrites sont **une copie** : corriger l’aliment demain ne change pas le bilan d’hier. Dans la feuille de choix d’un repas, le même panneau a pour bouton « Choisir pour le soir » (« Noter pour le soir » sur un jour passé).

## Photographier l’étiquette

Sous la saisie à la main, après « ou », **« Photographier l’étiquette »** ouvre une feuille « L’étiquette, en plus du soir » et lance la lecture :
- la photo, jusqu’à trois (« Reprendre la photo », « Ajouter l’autre face ») ;
- **« Dis-moi ce que c’est (facultatif) »**, 300 caractères au plus (« Skyr vanille, pot de 150 g. J’ai mangé le pot entier. »), puis **« Relire avec cette consigne »**. C’est un indice pour le nom, l’unité et le poids : les valeurs nutritionnelles se recopient toujours de l’étiquette. Ce que tu as corrigé à la main reste ;
- « Lu sur l’étiquette, pour 100 g », avec **« Corriger »** pour retaper un chiffre ;
- **« J’en ai mangé, en grammes »**, déjà rempli du poids lu, et le calcul (« 96 kcal · 14,3 g prot. ») ;
- la case **« Le garder dans nos aliments, sous « Skyr vanille » »**, cochée d’office. Il garde ses valeurs pour 100 g et, si l’étiquette ou la consigne la donne, son unité (« pot ») et son poids ; sinon c’est un aliment au gramme. Si ce nom existe déjà dans nos aliments, c’est lui qui sert. Décochée, rien n’est gardé ;
- **« Ajouter au soir »**.

Calories et protéines sont exigées (« Il manque les calories. »). Le délai, les pannes et le quota (40 étiquettes par mois et par foyer, chaque lecture compte) sont ceux de la lecture dans « cuisine-nos-aliments-creer ».
