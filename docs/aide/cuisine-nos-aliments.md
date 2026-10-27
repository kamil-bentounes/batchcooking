---
id: cuisine-nos-aliments
titre: Nos aliments : le yaourt du foyer, avec ses vraies valeurs
ecrans: [/aliments]
questions:
  - Comment ajouter mon propre yaourt avec ses vraies calories ?
  - Comment enregistrer un aliment en photographiant l’étiquette ?
  - Comment ajouter un aliment avec son code-barres ?
  - Comment choisir le repère qu’un aliment remplace ?
  - Comment modifier ou retirer un de nos aliments ?
  - Pourquoi l’appli me demande si mes calories sont des kJ ?
sources:
  - src/pages/Aliments.tsx
  - src/ui/aliments/Formulaire.tsx
  - src/ui/aliments/LecteurDeCodes.tsx
  - src/lib/aliments/brouillon.ts
  - src/lib/aliments/calcul.ts
  - src/lib/aliments/etiquette.ts
  - src/lib/aliments/openfoodfacts.ts
  - src/lib/aliments/absents.ts
  - src/lib/aliments/ordre.ts
  - src/lib/aliments/retour.ts
  - src/lib/donnees/aliments.ts
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/pages/Settings.tsx
  - supabase/functions/etiquette/index.ts
  - supabase/migrations/0124_nos_aliments.sql
verifie_sur: 84225ae
---
## Ce que fait l’appli

Un repère comme « Yaourt » (60 kcal, 4 g de protéines) est un ordre de grandeur. **« Nos aliments »** range ce que vous mangez vraiment, avec les valeurs de l’étiquette : le foyer en a une liste commune. La semaine et « en plus » les proposent **avant** les repères, en un geste : une unité (un pot, une part…).

## Où

« Réglages », carte **« Nos aliments »**, bouton « Ouvrir nos aliments ». Ou, dans la feuille de choix d’un repas de la semaine, section « Autre chose » : « Ajouter un aliment à nous… » ou « Ajouter ou modifier nos aliments ». Le retour rouvre la feuille là où tu l’avais laissée.

## Créer un aliment

« Ajouter un aliment », un nom, puis trois façons de remplir, qui ne remplissent que les champs du dessous :
- **« Étiquette »** : photographie le tableau nutritionnel. L’appli recopie les valeurs pour 100 g et le poids net, elle n’estime rien. « Reprendre la photo », « Ajouter l’autre face » (jusqu’à trois photos), « Réessayer » si la lecture échoue ou dépasse 30 secondes. Chaque lecture compte dans les 40 étiquettes par mois du foyer.
- **« À la main »** : tape les valeurs pour 100 g.
- **« Code-barres »** : les chiffres puis « Chercher », ou « Lire avec l’appareil photo » si ton navigateur sait le faire. Les valeurs viennent d’Open Food Facts, une base collaborative : vérifie-les.

Ce qu’une lecture ne donne pas **reste vide**, avec une phrase pour le dire : l’appli n’écrit jamais un 0 à la place. Une nouvelle photo ou un nouveau code remplace ce qui avait été lu avant, mais **jamais ce que tu as tapé**. Si tu tapes pendant la lecture, rien n’est écrasé : « Remplacer par les valeurs lues » le fait si tu veux.

Les calories et les protéines sont **obligatoires** ; glucides, lipides et fibres vides valent zéro. Plafonds : 900 kcal et 100 g pour 100 g. L’unité (« pot » au départ) et son poids (« Un pot pèse 125 g ») donnent **le calcul d’une unité**, en grand : valeurs × poids ÷ 100. Exemple : 76 kcal et 10 g de protéines pour 100 g, un pot de 125 g → **95 kcal et 12,5 g de protéines**. Si le poids vient d’un paquet divisé par ses portions, le calcul s’affiche (« 500 g en 4 portions = 125 g ») et le champ reste modifiable.

**Des kJ pris pour des kcal** : l’appli compare les calories aux macros (4 kcal par g de protéines et de glucides, 9 de lipides, 2 de fibres). Hors de 0,6 à 1,5 fois cette valeur, elle te demande : « 318 kcal pour 100 g, c’est beaucoup pour ces macros : ce serait des kJ ? 318 kJ = 76 kcal. » Touche « Corriger en 76 kcal », ou coche « Les valeurs sont justes » pour enregistrer quand même.

Puis « Enregistrer dans mes aliments ». Deux aliments ne peuvent pas avoir le même nom (accents, majuscules et espaces en trop ne comptent pas) ni le même code-barres dans le foyer.

## Le repère remplacé

Le champ **« Remplace le repère »** (facultatif) est proposé d’après le premier mot du nom : « Yaourt dessert protéiné » propose « Yaourt ». Tu peux le changer ou le retirer. **Un repère n’est caché que s’il est nommé là, ou s’il porte exactement le même nom qu’un aliment.** « Yaourt grec » ne cache donc rien tant que tu ne le lui dis pas. Même règle pour « Ce que vous reprenez souvent ».

## Les utiliser

Un geste = une unité, avec ces valeurs, pour chaque personne visée. Dans la semaine : « Autre chose ». Dans « en plus » : « Nos aliments ». Ils comptent dans le bilan du jour comme un repère.

## Modifier, retirer

Touche l’aliment dans la liste. « Enregistrer les changements », ou « Retirer cet aliment » (une question avant). Les repas déjà notés **gardent leurs chiffres** : le repas écrit est une copie. Si l’aliment a été retiré entre-temps depuis l’autre téléphone, l’appli te le dit.

## Ce que l’appli ne fait pas

Aucune photo de l’aliment n’est gardée. Je n’ai pas trouvé de modification de plusieurs aliments à la fois. Si deux personnes modifient le même aliment en même temps, la dernière écriture gagne.
