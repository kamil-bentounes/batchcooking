---
id: rappels-les-sept
titre: Les sept rappels, leurs heures et « C’est fait »
ecrans: [/rappels]
questions:
  - À quelle heure arrive le mail pour sortir du congélateur ?
  - Que veut dire « C’est fait, c’est au frigo » dans le mail ?
  - Quand reçois-je le rappel pour clôturer le mois ?
  - Pourquoi je reçois un rappel de facture annuelle ?
  - Quels sont les rappels par mail ?
sources:
  - src/lib/rappels.ts
  - src/ui/frigo/SortirParLien.tsx
  - src/pages/Semaine.tsx
  - supabase/migrations/0126_rappels.sql
  - supabase/functions/_shared/rappels/mails.ts
verifie_sur: 0000000
---
## Les sept rappels (heure de Paris)

Le mail part à l’heure dite, à quelques minutes près. Un rappel est dû à partir de son heure et jusqu’à la fin du jour : un passage manqué se rattrape dans la journée. Chacun ne part qu’une fois pour son jour, sa semaine, son mois ou sa barquette.

- **« Sortir du congélateur »** : la veille à 19 h, quand un repas prévu demain porte une barquette du congélateur.
- **« Une barquette va périmer »** : le matin à 8 h, si une barquette du frigo périme avant demain soir et n’est prévue dans aucun repas.
- **« Choisir les repas »** : le dimanche à 18 h, s’il reste des dîners sans repas choisi dans les 7 jours qui viennent.
- **« Noter les dépenses »** : le dimanche à 20 h, si personne n’a déclaré de dépense depuis 7 jours et que tu as une ligne « Plusieurs dépenses dans le mois ».
- **« Confirmer les charges »** : le 1er du mois à 9 h, s’il reste des factures (« Une facture chaque mois ») du mois fini à confirmer, tant qu’il n’est pas clôturé.
- **« Clôturer le mois »** : le dernier jour du mois à 19 h, si le mois n’est pas clôturé. On ne peut le clôturer qu’à partir du lendemain, et seulement si tu y as un revenu.
- **« Une facture annuelle approche »** : à 9 h, 15 jours avant le mois où ta dernière facture saisie d’une charge annuelle avait été payée, si la facture de l’année n’est pas déjà saisie. Sans facture déjà saisie, il n’y a pas de rappel.

## « C’est fait, c’est au frigo »

Dans le mail « Sortir du congélateur », ce bouton ouvre le frigo et demande « Sortir 4 wraps du congélateur ? » avec « Oui, je les sors » et « Pas maintenant ». Rien ne bouge avant ta réponse. Les barquettes passent au frigo, décongelées, à manger dans les 24 heures. Si elles ne sont plus au congélateur (déjà sorties, mangées…), la feuille dit « Rien à sortir ». « Changer les repas de demain » ouvre « La semaine » sur ce jour.

Dans « La semaine », sous un plat congelé, ton rappel activé change le bandeau bleu : « Mail mardi à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo. »
