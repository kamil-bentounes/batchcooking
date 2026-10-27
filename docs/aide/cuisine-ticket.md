---
id: cuisine-ticket
titre: Le ticket de caisse et les prix appris
ecrans: [/ticket]
questions:
  - Comment photographier mon ticket de caisse ?
  - Comment l’appli connaît le prix de mes courses ?
  - Que veut dire « écart avec le total imprimé » ?
  - Comment corriger un article mal rattaché à ma liste ?
  - Combien de tickets puis-je lire par mois ?
  - Mon ticket est long, comment faire ?
sources:
  - src/pages/Ticket.tsx
  - src/pages/Magasin.tsx
  - src/pages/Bilan.tsx
  - src/lib/prix.ts
  - src/lib/donnees/prix.ts
  - src/lib/donnees/bilan.ts
  - supabase/functions/ticket/index.ts
  - supabase/functions/ticket/lignes.ts
  - supabase/migrations/0024_prix.sql
  - supabase/migrations/0031_apprentissage.sql
verifie_sur: 4e9b6f4
---
## Ce que fait l’appli

Ton ticket est la seule source de prix : l’appli n’en devine aucun. Tu le photographies, un modèle de langage en tire les lignes, l’appli les **rapproche de ta liste de courses** et apprend le prix de chaque produit **chez cette enseigne**.

## Comment faire

1. Sur la liste : « J’ai payé — photographier le ticket ». Choisis l’« Enseigne » (sinon le magasin par défaut).
2. « Photographier le ticket » : à plat, bien éclairé, de haut (environ vingt secondes). Ticket long : photographie-le en deux fois.
3. Relis « Le ticket lu » : l’enseigne, la date, le total, puis « N lignes lues », « N rattachées à la liste » et, s’il y en a un, l’écart.
4. Touche le ticket photographié pour le lire en grand (Échap le referme). Décoche une ligne fausse. Touche une ligne pour la rattacher ailleurs (« Rattacher à : » un article, ou « rien »).
5. « Enregistrer N lignes · X € » (somme des lignes cochées) te ramène à la liste. « Reprendre une photo » recommence.

## Les règles

- Une ligne est cochée d’avance si la confiance du modèle est d’au moins 0,5. Une ligne rattachée à un article dit « sur la liste : » et son nom. Une ligne **absente de la liste** reste possible : « pas sur la liste : le prix s’apprend quand même ».
- Le rapprochement compare les mots du libellé de caisse (« PDT CHARLOTTE 2.5KG ») à ceux de ta liste. Score d’au moins 0,72 : sûr. Entre 0,4 et 0,72 : proposé, « deviné, à vérifier ». En dessous : sans article. Un rapprochement deviné que tu ne changes pas est enregistré : vérifie-le.
- **L’écart** compare la somme des lignes lues au total imprimé : « écart de X € avec le total imprimé ». Une ligne manquée se voit ici avant de se voir sur le papier. Sans écart, rien n’est écrit.
- Une remise listée mais non soustraite est déduite, seulement si le compte tombe juste au centime : « remises déduites ».
- Le **prix payé** des articles rattachés est reporté sur la liste.
- Le prix appris est la **moyenne** des relevés, par enseigne et par libellé de caisse : 2,00 € puis 3,00 € donnent 2,50 €. L’appli préfère la même enseigne.
- « Estimer les prix d’après mes tickets » (sur la liste, tant qu’une ligne n’a pas de prix) ne remplit que ces lignes.
- Le total imprimé alimente « payés » du bilan, à la date d’achat ; sans total lu, la somme des lignes.

## Quota

**30 tickets par mois** pour le foyer ; il repart le 1er. « N tickets restants ce mois-ci » s’affiche sous « Reprendre une photo ». Au-delà : « Quota atteint : 30 tickets par mois. Il repart le 1er. »
