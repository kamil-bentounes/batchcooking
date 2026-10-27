---
id: cuisine-nos-aliments
titre: Nos aliments : le yaourt du foyer, avec ses vraies valeurs
ecrans: [/aliments]
questions:
  - Comment choisir le repère qu’un aliment remplace ?
  - Comment modifier ou retirer un de nos aliments ?
  - À quoi sert « Nos aliments » ?
  - Où trouver nos aliments ?
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
  - src/ui/aliments/Quantite.tsx
  - src/pages/Settings.tsx
  - supabase/functions/etiquette/index.ts
  - supabase/migrations/0124_nos_aliments.sql
verifie_sur: b730eb1
---
## Ce que fait l’appli

Un repère comme « Yaourt » (60 kcal, 4 g de protéines) est un ordre de grandeur. **« Nos aliments »** range ce que vous mangez vraiment, avec les valeurs de l’étiquette : le foyer en a une liste commune. La semaine et « en plus » les proposent **avant** les repères : un appui demande **combien** (deux pots, 30 g : voir « cuisine-semaine-en-plus-quantite »).

## Où

« Réglages », carte **« Nos aliments »**, bouton « Ouvrir nos aliments ». Ou, dans la feuille de choix d’un repas de la semaine, section « Autre chose » : « Ajouter un aliment à nous… » ou « Ajouter ou modifier nos aliments ». Le retour rouvre la feuille là où tu l’avais laissée.

Pour en créer un (étiquette, à la main, code-barres), voir « cuisine-nos-aliments-creer ».

## Le repère remplacé

Le champ **« Remplace le repère »** (facultatif) est proposé d’après le premier mot du nom : « Yaourt dessert protéiné » propose « Yaourt ». Tu peux le changer ou le retirer. **Un repère n’est caché que s’il est nommé là, ou s’il porte exactement le même nom qu’un aliment.** « Yaourt grec » ne cache donc rien tant que tu ne le lui dis pas. Même règle pour « Ce que vous reprenez souvent ».

## Les utiliser

Un appui ouvre « combien ? », puis la quantité s’écrit avec ces valeurs, pour chaque personne visée. Dans la semaine : « Autre chose ». Dans « en plus » : « Nos aliments ». Un aliment dont l’unité est le gramme (« g ») se pèse ; les autres se comptent (« 2 pots »). Ils comptent dans le bilan du jour comme un repère.

## Modifier, retirer

Touche l’aliment dans la liste. « Enregistrer les changements », ou « Retirer cet aliment » (une question avant). Les repas déjà notés **gardent leurs chiffres** : le repas écrit est une copie. Si l’aliment a été retiré entre-temps depuis l’autre téléphone, l’appli te le dit.

## Ce que l’appli ne fait pas

Aucune photo de l’aliment n’est gardée. Je n’ai pas trouvé de modification de plusieurs aliments à la fois. Si deux personnes modifient le même aliment en même temps, la dernière écriture gagne.
