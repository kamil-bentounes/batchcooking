# Le suivi

## Ce que ça mesure, et pourquoi c'est mesurable

Personne ne tient un journal alimentaire trois mois. C'est pour cela que la
session produit des **barquettes** et pas des recettes (D24) : chaque part est
nommée, porte ses macros, son coût et sa date limite. Manger, c'est cocher.

Le tableau de bord se remplit donc **tout seul** — il ne demande aucune saisie
qui n'ait déjà été faite pour une autre raison.

## Les trois règles d'honnêteté

### 1 · Un jour non renseigné n'est pas un jour à zéro (D33)

C'est la règle qui décide si l'écran ment. Compter les blancs comme des zéros
fait glisser les moyennes **vers le bas** — le pire sens possible : on croit
manquer de protéines alors qu'on a seulement oublié de cocher deux dimanches, et
on mange davantage pour rien.

Donc :

- un jour sans trace vaut `null`, jamais `0` ;
- il se **voit** sur le graphique, comme un trait plat et non comme une barre ;
- la moyenne divise par les jours **renseignés**, jamais par la durée de la
  période ;
- l'écran affiche toujours « N jours renseignés sur M ».

Un repas **sauté**, lui, est une information : ce jour-là compte, à sa vraie
valeur.

### 2 · Deux graphiques, jamais deux axes

Des kilocalories et des grammes de protéines sur un même dessin obligent à une
double échelle. Une double échelle se lit de travers, et on peut lui faire dire
à peu près n'importe quoi en choisissant les bornes. Les deux séries sont donc
tracées séparément, chacune avec sa cible en trait pointillé.

Les deux cibles ne se lisent d'ailleurs pas dans le même sens, et le code le dit
explicitement :

| | Sens | Jour « tenu » |
|---|---|---|
| Protéines | **plancher** | au-dessus de la cible |
| Calories | **plafond** | en dessous de la cible |

Inverser les deux rendrait l'écran encourageant au mauvais moment.

### 3 · Le payé ne se mélange pas à l'estimé

Additionner un prix payé et un prix supposé, puis appeler le total « dépensé »,
serait un mensonge : la moitié du chiffre serait une supposition. Les deux
vivent côte à côte, et **la jauge ne se remplit qu'avec ce qui est vraiment
sorti du compte** — c'est-à-dire avec les tickets (lot 5).

Le coût par part suit la même règle : tant qu'aucun ticket n'est enregistré, il
n'y a pas de coût par part, parce que « 0 € » serait faux là où « on ne sait pas
encore » est vrai.

## Le budget

`household.food_budget_eur`, mensuel, **nullable**. Ne pas se fixer de budget est
un choix légitime : sans budget, l'écran affiche ce qui est sorti du compte, sans
jauge et sans jugement. Il se pose dans les réglages.

## Les périodes

Trois : **7 jours**, **ce mois**, **3 mois**. Au-delà de quarante jours les
barres se resserrent d'elles-mêmes — c'est le seul réglage d'affichage lié à la
durée.

## Ce qui n'est pas fait

- Aucun export du suivi en PDF ou en image. L'export RGPD rend tout en JSON.
- Aucune comparaison entre mois (« +12 % de protéines »). Le recul de trois mois
  se lit à l'œil, et une variation calculée sur des périodes inégalement
  renseignées aurait été exactement le genre de chiffre que ce document passe
  son temps à refuser.
