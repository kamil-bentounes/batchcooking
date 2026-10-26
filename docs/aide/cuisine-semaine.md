---
id: cuisine-semaine
titre: La semaine : choisir ce que je mange, changer un repas, le manger
ecrans: [/semaine]
questions:
  - Comment choisir ce que je mange à midi et le soir ?
  - Comment changer un repas le jour même ?
  - Que veulent dire les points sous chaque jour ?
  - Comment indiquer que j’ai mangé ma barquette ?
  - Que se passe-t-il quand je choisis un plat congelé ?
  - Comment noter un repas au restaurant ?
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
  - src/lib/peremption.ts
verifie_sur: 7a0673e
---
## Ce que fait l’appli

« La semaine » est l’écran où **tu choisis ce que tu manges** à midi et le soir, sur sept jours à partir d’aujourd’hui. Après « On range », rien n’est posé tout seul : c’est ici que la semaine se remplit.

Le bandeau du haut montre les sept jours. Sous chaque jour, deux points, midi puis soir : **vert**, du frigo ; **bleu**, du congélateur ; **safran**, autre chose (ou un repas sauté) ; **creux**, rien de choisi.

## Choisir un repas

1. Sur un jour, la carte vide dit **« + Choisir le midi »** (ou « le soir »). Touche-la : une feuille s’ouvre (« Lundi midi »).
2. **« Pour »** : « Vous deux » (tout le foyer) ou une seule personne, par son prénom.
3. Choisis : **« Au frigo »** (ce qui presse d’abord, avec le nombre de barquettes libres), **« Au congélateur »** (à sortir la veille), ou **« Autre chose »** : **nos aliments** d’abord, avec leurs vraies valeurs, un geste = une unité (voir « cuisine-nos-aliments ») ; puis ce que vous reprenez souvent, les repères du repas (« Restaurant » 900 kcal, « Sandwich » 550…) et **« On saute ce repas »**. Un repère qu’un de nos aliments remplace (nommé dans son formulaire, ou de même nom) n’apparaît plus.

Choisir un plat pose une barquette libre dans la case de **chaque** personne visée, la plus pressée d’abord. Pour chacune, l’appli prend d’abord une barquette faite pour elle, puis une sans destinataire, puis celle d’un autre en dernier recours. Pas assez pour tout le monde : la ligne est grisée (« il en faut 2, 1 libre »).

## Changer, manger

- La carte pleine dit le plat, « Du frigo, pour vous deux » ou « Du congélateur, pour Kamil », et propose **« Changer »**, y compris le jour même.
- Quand tu changes, l’ancienne barquette est lâchée, et l’appli le dit : « Les 2 wraps restent au congélateur. » ; pour un plat à plusieurs mots, « Les 2 barquettes de lasagnes au saumon-poireaux retournent au frigo, libres pour un autre jour. » (« La barquette de … retourne au frigo » s’il n’y en a qu’une).
- **« Je l’ai mangé »** apparaît aujourd’hui sur ta carte, pour un plat comme pour « Autre chose » : la barquette est marquée mangée et quitte le frigo. Un repas que quelqu’un a mangé ne se change plus pour cette personne.
- Un plat **congelé** a un bandeau bleu. Aujourd’hui : « C’est pour aujourd’hui : décongèle les 2 wraps au micro-ondes. » Un autre jour : « Pense à sortir les 2 wraps la veille au soir. » (« la barquette de … » pour un plat à plusieurs mots). Demain, une fois l’heure venue (vingt-quatre heures avant le repas), la même phrase que la fiche du plat dans « Frigo ». Il n’existe pas aujourd’hui de rappel par mail.

Sur l’accueil, « Changer » ouvre « La semaine » sur aujourd’hui avec la feuille du bon repas déjà ouverte.

Le petit déjeuner, la collation et ce qu’on mange en plus d’un plat se notent à part : voir « cuisine-semaine-en-plus ».

## Les règles

- « On saute ce repas » est une réponse : le jour est renseigné, sans rien compter. **Un repas jamais choisi n’est pas un repas à zéro** : c’est un trou, hors des moyennes du bilan.
- Choisir autre chose pour un repas remplace le plat : ses en-plus s’en vont avec lui.
- Un repas « Autre chose » (restaurant, sandwich) ne compte dans tes calories qu’une fois « Je l’ai mangé » touché, ou son jour passé.
- La péremption et la part de chacun sont dites sur la carte : voir « cuisine-semaine-peremption ».
