---
id: cuisine-semaine
titre: La semaine : choisir ce que je mange
ecrans: [/semaine]
questions:
  - Comment choisir ce que je mange à midi et le soir ?
  - Que veulent dire les points sous chaque jour ?
  - Comment choisir le repas d’un seul de nous deux ?
  - Comment noter un repas au restaurant ?
  - Que veut dire « On saute ce repas » ?
sources:
  - src/pages/Semaine.tsx
  - src/pages/Accueil.tsx
  - src/ui/semaine/Bandeau.tsx
  - src/ui/semaine/Carte.tsx
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/lib/choix.ts
  - src/lib/semaine.ts
  - src/lib/reperes.ts
  - src/lib/aliments/ordre.ts
  - src/lib/donnees/barquettes.ts
  - supabase/migrations/0123_choisir_un_repas.sql
  - supabase/migrations/0125_semaine_corrections.sql
  - supabase/migrations/0128_semaine_hier.sql
  - src/lib/peremption.ts
verifie_sur: b730eb1
---
## Ce que fait l’appli

« La semaine » est l’écran où **tu choisis ce que tu manges** à midi et le soir. Après « On range », rien n’est posé tout seul : c’est ici que la semaine se remplit.

Le bandeau du haut montre quatorze jours : les **sept jours passés** (en pointillé, qu’on note : voir « cuisine-semaine-hier »), aujourd’hui, puis les six suivants. Il s’ouvre sur aujourd’hui. Sous chaque jour, deux points, midi puis soir : **vert**, du frigo ; **bleu**, du congélateur ; **safran**, autre chose (ou un repas sauté) ; **creux**, rien de choisi.

## Choisir un repas

1. Sur un jour, la carte vide dit **« + Choisir le midi »** (ou « le soir »). Touche-la : une feuille s’ouvre (« Lundi midi »).
2. **« Pour »** : « Vous deux » (tout le foyer) ou une seule personne, par son prénom.
3. Choisis : **« Au frigo »** (ce qui presse d’abord, avec le nombre de barquettes libres), **« Au congélateur »** (à sortir la veille), ou **« Autre chose »** : **nos aliments** d’abord (un appui demande « combien ? » : voir « cuisine-semaine-en-plus-quantite ») ; puis ce que vous reprenez souvent, les repères du repas (« Restaurant » 900 kcal, « Sandwich » 550…) et **« On saute ce repas »**. Un repère qu’un de nos aliments remplace n’apparaît plus. Le lien **« Ajouter ou modifier nos aliments »** ouvre leur écran, et le retour rouvre la feuille. Si la liste ne se lit pas : « Je n’ai pas pu lire nos aliments : les repères sont proposés à leur place. »

Choisir un plat pose une barquette libre dans la case de **chaque** personne visée, la plus pressée d’abord. Pour chacune, l’appli prend d’abord une barquette faite pour elle, puis une sans destinataire, puis celle d’un autre en dernier recours. Pas assez pour tout le monde : la ligne est grisée (« il en faut 2, 1 libre »).

Pour changer un repas ou le manger, voir « cuisine-semaine-changer ».

## Les règles

- « On saute ce repas » est une réponse : le jour est renseigné, sans rien compter. **Un repas jamais choisi n’est pas un repas à zéro** : c’est un trou, hors des moyennes du bilan.
- Choisir autre chose pour un repas remplace le plat : ses en-plus s’en vont avec lui.
- Un repas « Autre chose » (restaurant, sandwich) ne compte dans tes calories qu’une fois « Je l’ai mangé » touché, ou son jour passé.
- Le petit déjeuner, la collation et ce qu’on mange en plus d’un plat se notent à part : voir « cuisine-semaine-en-plus ».
- La péremption et la part de chacun sont dites sur la carte : voir « cuisine-semaine-peremption ».
