---
id: cuisine-semaine-en-plus
titre: La semaine : le petit déjeuner, la collation, un en-plus
ecrans: [/semaine]
questions:
  - Comment noter mon petit déjeuner ?
  - Comment noter une collation ?
  - Comment ajouter un yaourt en plus de mon plat ?
  - Pourquoi mon yaourt n’a pas les mêmes calories que le repère « Yaourt » ?
  - Comment effacer ce que j’ai noté en plus ?
  - Les calories d’un jour sans rien coché comptent-elles pour zéro ?
sources:
  - src/pages/Semaine.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/lib/reperes.ts
  - src/lib/aliments/ordre.ts
  - src/lib/donnees/barquettes.ts
  - src/lib/semaine.ts
  - supabase/migrations/0125_semaine_corrections.sql
verifie_sur: 0a2536e
---
## Ce que fait l’appli

« La semaine » te fait choisir le midi et le soir (voir « cuisine-semaine »). Le reste de la journée — le petit déjeuner, la collation, ce que tu manges en plus d’un plat — se note après coup, en un geste, et seulement pour toi.

## Comment faire

- Sous **« Autres moments »**, « Mangé sans barquette ? » propose **« Petit déjeuner »** et **« Collation »** (ceux que tu n’as pas déjà notés ce jour-là). Touche-en un, puis choisis un repère ou écris la tienne.
- Sur la carte d’un plat, **« + ce que j’ai mangé en plus »** ouvre trois façons d’écrire :
  - « Nos aliments » : ceux du foyer, avec leurs vraies valeurs — un geste = une unité, un pot (voir « cuisine-nos-aliments ») ;
  - « Ce que vous reprenez souvent » : les habitudes du foyer ;
  - « Un repère, pas une pesée » : des repères en un geste, selon le repas — « Restaurant » 900 kcal, « Sandwich » 550, « Pizza » 850, « Yaourt » 60. Un repère n’apparaît plus quand un de nos aliments le remplace : il le nomme (champ « Remplace le repère » : « Yaourt dessert protéiné » peut remplacer « Yaourt ») ou porte exactement son nom. Rien ne les distingue ensuite d’une saisie ;
  - « Autre chose », ses kcal et ses g de protéines, puis « Ajouter ».
- **« retirer »** efface un en-plus. Retirer le dernier d’un petit déjeuner ou d’une collation efface aussi ce moment : tu peux le noter de nouveau.
- **« Je saute le petit déjeuner »** (ou **« Je saute la collation »**) dit que tu ne manges rien à ce moment ; **« annuler »** le remet.

## Les règles

- Une barquette ne compte dans les calories du jour que si le repas est **mangé**. Un en-plus noté après coup compte **toujours** ; un repère choisi dans la feuille d’un repas (« Autre chose ») ne compte qu’une fois « Je l’ai mangé » touché, ou son jour passé.
- **Un jour sans rien coché ni noté n’est pas un jour à zéro** : c’est un trou, hors des moyennes du bilan. Sur l’accueil : « N repas pas encore renseignés ».
- « On saute ce repas » (dans la feuille d’un repas) est une réponse : le jour est renseigné, avec zéro pour ce repas.

## Ce que l’appli ne fait pas

Elle ne demande pas de saisir des calories chaque jour, et il n’existe pas aujourd’hui de rappel pour noter ses repas.
