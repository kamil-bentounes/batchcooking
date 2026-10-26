---
id: cuisine-nos-aliments
titre: Nos aliments : ton yaourt, avec ses vraies valeurs
ecrans: [/aliments]
questions:
  - Comment ajouter mon propre yaourt avec ses vraies calories ?
  - Comment enregistrer un aliment en photographiant l’étiquette ?
  - Comment ajouter un aliment avec son code-barres ?
  - Pourquoi le repère « Yaourt » n’apparaît plus ?
  - Comment modifier ou retirer un de nos aliments ?
sources:
  - src/pages/Aliments.tsx
  - src/ui/aliments/Formulaire.tsx
  - src/ui/aliments/LecteurDeCodes.tsx
  - src/lib/aliments/brouillon.ts
  - src/lib/aliments/calcul.ts
  - src/lib/aliments/etiquette.ts
  - src/lib/aliments/openfoodfacts.ts
  - src/lib/aliments/ordre.ts
  - src/lib/aliments/retour.ts
  - src/lib/donnees/aliments.ts
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/pages/Settings.tsx
  - supabase/functions/etiquette/index.ts
  - supabase/migrations/0124_nos_aliments.sql
verifie_sur: e4c18ef
---
## Ce que fait l’appli

Un repère comme « Yaourt » (60 kcal, 4 g de protéines) est un ordre de grandeur. **« Nos aliments »** range ce que vous mangez vraiment, avec les valeurs de l’étiquette : le foyer en a une liste commune. La semaine et « en plus » les proposent **avant** les repères, en un geste : une unité (un pot, une part…).

## Où

« Réglages », section **« Nos aliments »**, bouton « Ouvrir nos aliments ». Ou, dans la feuille de choix d’un repas de la semaine, section « Autre chose » : « Ajouter un aliment à nous… » ou « Ajouter ou modifier nos aliments ». Le retour rouvre la feuille là où tu l’avais laissée.

## Créer un aliment

« Ajouter un aliment », un nom, puis trois façons de remplir, qui ne remplissent que les champs du dessous :
- **« Étiquette »** : photographie le tableau nutritionnel. L’appli recopie les valeurs pour 100 g et le poids net, elle n’estime rien. « Vérifie-les avant d’enregistrer ». « Reprendre la photo », ou « Ajouter l’autre face » (jusqu’à trois photos). Chaque lecture compte dans les 40 étiquettes par mois du foyer.
- **« À la main »** : tape les valeurs pour 100 g.
- **« Code-barres »** : les chiffres puis « Chercher », ou « Lire avec l’appareil photo » si ton navigateur sait le faire. Les valeurs viennent d’Open Food Facts, une base collaborative : vérifie-les. S’il n’annonce pas le poids d’une unité, tu le dis toi-même.

Les calories et les protéines sont **obligatoires** ; glucides, lipides et fibres vides valent zéro. Plafonds : 900 kcal et 100 g pour 100 g. L’unité (« pot » au départ) et son poids (« Un pot pèse 125 g ») donnent **le calcul d’une unité**, en grand : valeurs × poids ÷ 100. Exemple : 76 kcal et 10 g de protéines pour 100 g, un pot de 125 g → **95 kcal et 12,5 g de protéines**. Puis « Enregistrer dans mes aliments ».

Deux aliments ne peuvent pas avoir le même nom (ni le même code-barres) dans le foyer.

## Les utiliser

Un geste = une unité, avec ces valeurs, pour chaque personne visée. Dans la semaine : « Autre chose ». Dans « en plus » : « Nos aliments ». Ils comptent dans le bilan du jour comme un repère.

**Le repère qu’un de nos aliments remplace disparaît** : « Yaourt dessert protéiné » remplace « Yaourt » (même nom, ou le nôtre le prolonge d’un mot). Les autres repères restent.

## Modifier, retirer

Touche l’aliment dans la liste. « Enregistrer les changements », ou « Retirer cet aliment » (une question avant). Les repas déjà notés **gardent leurs chiffres** : le repas écrit est une copie.

## Ce que l’appli ne fait pas

Aucune photo de l’aliment n’est gardée. Je n’ai pas trouvé de modification de plusieurs aliments à la fois.
