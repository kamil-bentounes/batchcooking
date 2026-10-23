---
id: budget-cloture
titre: Les trois étapes de la clôture
ecrans: [/cloture]
questions:
  - Comment je clôture septembre ?
  - Que veut dire « Rien dépensé » ?
  - Qu’est-ce que je dois choisir à l’étape « Ce qui reste » ?
  - Que devient l’argent que je mets de côté ?
  - Pourquoi « Le mettre de côté » est grisé ?
  - Que fait le bouton « Clôturer septembre » ?
sources:
  - src/pages/Cloture.tsx
  - src/lib/budget/cloture.ts
  - src/lib/budget/etapes.ts
  - src/lib/budget/mois.ts
  - src/ui/budget/EtapeFactures.tsx
  - src/ui/budget/EtapeDepenses.tsx
  - src/ui/budget/EtapeReste.tsx
  - src/ui/budget/VueReste.tsx
  - supabase/migrations/0108_budget_cloture.sql
verifie_sur: bd10d8c
---
Aucune étape n'est obligatoire. Les conditions sont dans la page « Quand clôturer ».

## Les étapes

1. **« Les factures du mois »** : chaque facture non validée montre son montant habituel, avec « C’est ça » ou « Modifier » (ils valident tout de suite). Rien de non validé : « Tout est validé. »
2. **« Tes dépenses du mois »** : chaque ligne « Plusieurs dépenses dans le mois » montre ce qui est déclaré (« 350 € sur 500 € ») ou « Rien de déclaré ». Le bouton « + » ouvre la feuille pour ajouter. L'interrupteur **« Rien dépensé »**, proposé aux lignes sans aucune dépense, compte la ligne pour 0 €. Une phrase résume l'écart : « Tu as dépensé 90 € de moins que prévu. »
3. **« Ce qui reste »** : « Tu décides où va l’argent qui n’a pas servi. » La carte donne « Il te reste ce mois-ci » et son détail : « 650 € prévus, plus 90 € dépensés en moins » font 740 €. Quand la clôture solde l'année d'une charge « Mise de côté » (décembre, ou une année passée), une phrase le dit au-dessus (« [charge] : 120 € non dépensés en 2025 reviennent. »).

## Ce que tu en fais

- **« Le mettre de côté »**, choisi d'office : tu verses dans une poche d'épargne (d'urgence si elle existe, sinon la première ; tu choisis la poche s'il y en a plusieurs). Le champ **« Combien mettre de côté »** propose tout le reste. Tu peux taper moins, ou 0 pour ne rien verser. Plus que le reste est ramené au reste. Le bouton « Tout ce qui reste » remet tout. À deux, si une année est soldée, la carte dit « Il te reste, avant les soldes d’année » : tape un montant, ou touche « Tout ce qui reste ».
- **« Le garder sur le compte »** : « Il reste disponible pour octobre. »

« Le mettre de côté » est grisé s'il n'y a aucune poche (« Il n’y a pas encore de poche d’épargne. ») ou s'il ne reste rien (« Il ne reste rien à mettre de côté ce mois-ci. »). La clôture reste possible.

## Ce que fait « Clôturer septembre »

Les factures non validées prennent leur montant habituel. Chaque ligne au fil du mois prend la somme des dépenses déclarées, ou 0 € si « Rien dépensé », sinon son prévu. Le mois est figé, ton reste est enregistré, le versement part, et tu reviens sur le mois clôturé. Tu pourras revenir dessus depuis le mois.
