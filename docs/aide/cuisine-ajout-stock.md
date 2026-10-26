---
id: cuisine-ajout-stock
titre: Ajouter à la main un produit ou un plat acheté
ecrans: [/frigo]
questions:
  - Comment ajouter un produit au congélateur ?
  - Comment ajouter un plat acheté tout prêt ?
  - Comment lire l’étiquette d’un plat avec une photo ?
  - Pourquoi je ne peux pas ajouter un plat sans calories ?
  - Quelle différence entre « Un produit » et « Un plat » ?
  - Combien d’étiquettes puis-je lire par mois ?
sources:
  - src/pages/AjoutManuel.tsx
  - src/pages/Frigo.tsx
  - src/lib/donnees/barquettes.ts
  - src/lib/donnees/bilan.ts
  - src/lib/quantite.ts
  - supabase/functions/etiquette/index.ts
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0048_stock_congele.sql
verifie_sur: 7a0673e
---
## Ce que fait l’appli

Dans le frigo, porte ouverte, **« + Ajouter au frigo »** (ou **« + Ajouter au congélateur »**) ajoute ce que tu n’as pas cuisiné ; au placard, « Le placard » puis « + Ajouter au placard ». Au frigo et au congélateur, choisis d’abord « Un produit » (un ingrédient, il compte dans tes courses) ou « Un plat » (un repas, il compte dans ta semaine). Le placard ne prend que des produits.

## Un produit

Le nom (champ « Ce qu’il y a »), une quantité facultative (plus grande que zéro) et l’unité (g, ml ou u), puis « Ajouter ». Au congélateur, deux dates : « Congelé le » (aujourd’hui par défaut) et « À manger avant » (3 mois plus tard, jamais avant la mise au froid) ; changer la première recale la seconde. Elle se relit dans la fiche de l’ingrédient (« À manger avant »).

## Un plat

Il devient une ou plusieurs **barquettes**, mangées depuis « La semaine » et comptées dans les calories du jour. Remplis « Le plat », « Parts », « g / part », « kcal / part », puis « Protéines », « Glucides », « Lipides », « Fibres » (par part).

« Ajouter la barquette » (ou « Ajouter N parts ») ne s’active que si le nom, le poids d’une part, ses calories et ses protéines sont remplis : sans eux, ce repas compterait pour zéro. Péremption au frigo : 4 jours. Une barquette ajoutée à la main ne compte pas dans les barquettes du bilan ni dans son coût par part.

## Lire l’étiquette d’un plat acheté

1. « Photographier » (jusqu’à **trois** photos : face, tableau nutritionnel, date ; « Une de plus »).
2. « Lire l’étiquette ». Le modèle de langage **recopie** ce qui est imprimé, il n’estime rien. Les champs se remplissent sans rien valider : corrige.

- Le tableau, pour 100 g, est ramené au poids d’une part (poids de la boîte ÷ parts) ; ignoré au-delà de 900 kcal pour 100 g.
- Les calories « par portion » du fabricant ne sont préférées que si l’emballage annonce autant de portions que ton nombre de parts, à 25 % près du calcul.
- La date imprimée remplit « À manger avant », mais ne sert qu’au congélateur : au frigo, 4 jours.
- Rien de lisible : « Je n’ai rien pu lire sur ces photos. » Tableau flou : « Lu — à vérifier, le tableau n’est pas net. »

**Quota : 40 lectures par mois** pour le foyer, remis à zéro le 1er. Au-delà : « Quota atteint : 40 étiquettes par mois. Il repart le 1er. »

## Ce que l’appli ne fait pas

Elle n’estime pas les calories d’un plat d’après sa photo.
