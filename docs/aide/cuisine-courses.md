---
id: cuisine-courses
titre: La liste de courses et le magasin
ecrans: [/magasin]
questions:
  - Comment la liste de courses est-elle calculée ?
  - Pourquoi la liste ne retire pas ce que j’ai déjà au frigo ?
  - Comment ajouter un article à la liste ?
  - Que se passe-t-il quand je coche un article ?
  - Comment changer le magasin d’un article ?
  - Que devient la liste si je la refais ?
sources:
  - src/pages/Magasin.tsx
  - src/lib/donnees/courses.ts
  - src/lib/liste.ts
  - src/lib/rayons.ts
  - supabase/migrations/0021_cocher_remplit.sql
  - supabase/migrations/0117_cuisine_corrections.sql
  - seed/conversions.json
verifie_sur: 73f1b27
---
## Ce que fait l’appli

« Faire la liste » (dans « Choisir ») calcule la liste d’après les recettes retenues ; « La liste » sert au magasin.

## Comment la liste est calculée

- Chaque quantité est multipliée par **parts retenues ÷ parts de la recette**. Exemple : recette pour 4 avec 200 g de crème, retenue pour 6 parts : 300 g.
- Un même aliment dans plusieurs recettes fait **une ligne**, additionnée.
- Ce qui se compte à l’unité (« 2 oignons ») passe en grammes si l’appli connaît le poids : celui que tu as pesé (voir « Peser »), sinon un poids de référence.
- Ce qu’elle ne sait pas additionner devient une note (« + 1 à l’unité à compter »).
- **Ce que tu as déjà n’est pas retiré** : la liste donne tout ce que les recettes demandent.

## Au magasin

- Articles groupés par magasin, puis par rayon (au départ : Fruits et légumes, Boucherie, poissonnerie, Frais, Surgelés, Épicerie salée, Épicerie sucrée, Boissons, Entretien, Hygiène, Autre). L’ordre s’apprend ensuite de tes cochages, magasin par magasin.
- Touche une ligne pour changer son magasin, noter le « Prix payé », ou « Supprimer ». Une ligne cochée ou payée ne se supprime pas : « Décoche-le pour le supprimer. » ou « Efface le prix pour le supprimer. »
- « + Ajouter » : « Ce qu’il faut prendre », rayon, prix estimé, « Ajouter à la liste ».
- « Compléter ma liste » : des catégories (Boissons, Entretien, Épicerie, Frais du quotidien, Hygiène, Maison) et « Ce que vous reprenez souvent ». Une suggestion va au rayon de sa catégorie : Boissons, Frais (« Frais du quotidien »), Épicerie salée (« Épicerie »), Entretien (« Maison » et « Entretien »), Hygiène. Une habitude : rayon deviné d’après son nom, sinon « Autre ».
- « Où fais-tu tes courses ? » crée ton premier magasin.

## Quand tu coches

L’article entre dans le frigo, le congélateur ou le placard, selon son rayon (« cuisine-stock »), sauf Entretien et Hygiène, non rangés. Décocher le retire ; l’ordre des rayons appris reste.

## Terminer

« J’ai tout, rentrons » (ou « Rentrer sans N articles ») passe à « Tout est là » et ouvre le plan.

## Refaire la liste

Depuis « Choisir », avant la session, les lignes venues des recettes sont recalculées. Ce que tu as ajouté, et ce qui est coché ou payé, reste. Si le besoin dépasse ce qui est pris, la nouvelle ligne est le manque : 200 g de beurre cochés, besoin de 400 g : une ligne de 200 g revient.
