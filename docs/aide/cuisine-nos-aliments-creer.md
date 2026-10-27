---
id: cuisine-nos-aliments-creer
titre: Créer un aliment à nous : étiquette, à la main, code-barres
ecrans: [/aliments]
questions:
  - Comment ajouter mon propre yaourt avec ses vraies calories ?
  - Comment enregistrer un aliment en photographiant l’étiquette ?
  - Comment ajouter un aliment avec son code-barres ?
  - Pourquoi l’appli me demande si mes calories sont des kJ ?
  - Combien d’étiquettes puis-je photographier par mois ?
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
  - src/lib/aliments/consigne.ts
  - src/pages/Settings.tsx
  - supabase/functions/etiquette/index.ts
  - supabase/migrations/0124_nos_aliments.sql
verifie_sur: 99e3953
---
## Créer un aliment

Dans « Nos aliments » (voir « cuisine-nos-aliments »), « Ajouter un aliment », un nom, puis trois façons de remplir, qui ne remplissent que les champs du dessous :
- **« Étiquette »** : photographie le tableau nutritionnel. L’appli recopie les valeurs pour 100 g et le poids net, elle n’estime rien. « Reprendre la photo », « Ajouter l’autre face » (jusqu’à trois photos), « Réessayer » si la lecture échoue ou dépasse 30 secondes. Le champ facultatif **« Dis-moi ce que c’est (facultatif) »** et **« Relire avec cette consigne »** donnent un indice (le nom, l’unité, le poids), jamais des chiffres. Chaque lecture compte dans les 40 étiquettes par mois du foyer.
- **« À la main »** : tape les valeurs pour 100 g.
- **« Code-barres »** : les chiffres puis « Chercher », ou « Lire avec l’appareil photo » si ton navigateur sait le faire. Les valeurs viennent d’Open Food Facts, une base collaborative : vérifie-les.

Ce qu’une lecture ne donne pas **reste vide**, avec une phrase pour le dire : l’appli n’écrit jamais un 0 à la place. Une nouvelle photo ou un nouveau code remplace ce qui avait été lu avant, mais **jamais ce que tu as tapé**. Si tu tapes pendant la lecture, rien n’est écrasé : « Remplacer par les valeurs lues » le fait si tu veux.

## Les valeurs et le calcul d’une unité

Les calories et les protéines sont **obligatoires** ; glucides, lipides et fibres vides valent zéro. Plafonds : 900 kcal et 100 g pour 100 g. L’unité (« pot » au départ) et son poids (« Un pot pèse 125 g ») donnent **le calcul d’une unité**, en grand : valeurs × poids ÷ 100. Exemple : 76 kcal et 10 g de protéines pour 100 g, un pot de 125 g → **95 kcal et 12,5 g de protéines**. Si le poids vient d’un paquet divisé par ses portions, le calcul s’affiche (« 500 g en 4 portions = 125 g ») et le champ reste modifiable.

## Des kJ pris pour des kcal

L’appli compare les calories aux macros (4 kcal par g de protéines et de glucides, 9 de lipides, 2 de fibres). Hors de 0,6 à 1,5 fois cette valeur, elle te demande : « 318 kcal pour 100 g, c’est beaucoup pour ces macros : ce serait des kJ ? 318 kJ = 76 kcal. » Touche « Corriger en 76 kcal », ou coche « Les valeurs sont justes » pour enregistrer quand même.

## Enregistrer

« Enregistrer dans mes aliments ». Deux aliments ne peuvent pas avoir le même nom (accents, majuscules et espaces en trop ne comptent pas) ni le même code-barres dans le foyer.
