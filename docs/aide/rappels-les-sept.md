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
  - supabase/functions/_shared/rappels/texte.ts
verifie_sur: 1d6efe2
---
## Les sept rappels (heure de Paris)

Le mail part à l’heure dite, à quelques minutes près. Un rappel est dû dès son heure et jusqu’à la fin du jour : un passage manqué se rattrape. Chacun ne part qu’une fois pour son jour, sa semaine ou son mois (voir « rappels-un-seul-mail »).

- **« Sortir du congélateur »** : la veille à 19 h, quand un repas prévu demain porte une barquette du congélateur.
- **« Une barquette va périmer »** : le matin à 8 h, un seul mail qui liste les barquettes du frigo qui périment avant demain soir (ou ont péri depuis moins de 24 heures) et ne sont prévues dans aucun repas.
- **« Choisir les repas »** : le dimanche à 18 h, s’il reste des dîners sans repas choisi dans les 7 jours qui viennent.
- **« Noter les dépenses »** : le dimanche à 20 h, si personne n’a déclaré de dépense depuis 7 jours et que tu as une ligne « Plusieurs dépenses dans le mois ».
- **« Confirmer les charges »** : le 1er du mois à 9 h, s’il reste des factures (« Une facture chaque mois ») du mois fini à confirmer, tant qu’il n’est pas clôturé.
- **« Clôturer le mois »** : le dernier jour du mois à 19 h, si le mois n’est pas clôturé. On ne peut le clôturer qu’à partir du lendemain, et seulement si tu y as un revenu.
- **« Une facture annuelle approche »** : à 9 h, 15 jours avant le mois où ta dernière facture saisie d’une charge annuelle avait été payée, si la facture de l’année n’est pas déjà saisie. Sans facture déjà saisie, il n’y a pas de rappel.

## « C’est fait, c’est au frigo »

Dans le mail « Sortir du congélateur », ce bouton ouvre le frigo et demande « Sortir 4 wraps du congélateur ? » (« Sortir 2 barquettes de petit salé aux lentilles du congélateur ? » pour un plat de plusieurs mots) avec « Oui, je les sors » et « Pas maintenant ». Rien ne bouge avant ta réponse. Les barquettes passent au frigo, décongelées, à manger dans les 24 heures. Déjà sorties ou mangées : « Rien à sortir ». « Changer les repas de demain » ouvre « La semaine » ce jour-là.

Dans « La semaine », sous un plat congelé, ton rappel activé change le bandeau bleu : « Mail mardi à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo. »

Frigo illisible : « Je n’ai pas pu lire ton frigo », rien n’est sorti, le lien reste valable.
