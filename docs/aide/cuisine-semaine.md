---
id: cuisine-semaine
titre: La semaine : manger, sauter, noter un extra
ecrans: [/semaine]
questions:
  - Comment indiquer que j’ai mangé ma barquette ?
  - Comment noter un repas au restaurant ?
  - Que veut dire « Sauté » ?
  - Pourquoi des jours sont vides dans la semaine ?
  - Comment poser une barquette sur un repas ?
  - Les calories d’un jour sans rien coché comptent-elles pour zéro ?
sources:
  - src/pages/Semaine.tsx
  - src/pages/Accueil.tsx
  - src/lib/semaine.ts
  - src/lib/reperes.ts
  - src/lib/donnees/barquettes.ts
  - src/lib/suivi.ts
  - supabase/migrations/0017_triggers_lot1.sql
  - src/lib/peremption.ts
verifie_sur: 02dd873
---
## Ce que fait l’appli

« La semaine » montre, sur sept jours à partir d’aujourd’hui, quelle barquette tu manges à quel repas. Cocher ce que tu manges, c’est tout le suivi.

## Comment faire

- Choisis qui regarder (« Tout le monde » ou un prénom ; par défaut, toi) et quel repas (« Tous les repas », « Petit déjeuner », « Déjeuner », « Dîner », « Collation »).
- Touche un repas : **« Je l’ai mangé »** marque la barquette mangée (elle quitte « Ce que j’ai »), **« Sauté »** dit que tu n’as rien mangé.
- Sur l’accueil, « Je l’ai mangé » est aussi proposé pour le repas prévu aujourd’hui.
- « Poser une barquette » apparaît sur un repas sans barquette et propose celles qui n’ont pas de jour (six au plus).

## Noter ce qui n’était pas prévu

« + ce que j’ai mangé en plus » ouvre trois façons d’écrire :

- « Ce que tu reprends souvent » : tes habitudes ;
- des repères en un geste, selon le repas : « Restaurant » 900 kcal, « Sandwich » 550, « Pizza » 850, « Yaourt » 60. rien ne les distingue ensuite d’une saisie ;
- « Autre chose », ses kcal et ses g de protéines, puis « Ajouter ».

« retirer » efface un extra. En regardant une seule personne, « Mangé sans barquette ? » crée un repas : « Petit déjeuner », « Déjeuner », « Dîner » ou « Collation ».

## Les règles

- La répartition ne pose que des **dîners**, un par jour et par personne, à partir de demain : aujourd’hui et les autres repas sont vides.
- Une barquette ne compte dans les calories du jour que si le repas est **mangé**. Un **extra compte toujours**.
- « Sauté » est une réponse : le jour est renseigné, avec zéro pour ce repas.
- **Un jour sans rien coché ni noté n’est pas un jour à zéro** : c’est un trou, hors des moyennes du bilan. Sur l’accueil : « N repas pas encore renseignés ».
- « N barquettes sans jour » (et « N encore libres » en haut) ne compte que celles qui n’ont **aucun** jour, où qu’il tombe.

## Les mots d’urgence

Au frigo : « à manger aujourd'hui », « demain dernier délai », « périmée ». Au congélateur : « à sortir sous N j » dans la dernière semaine seulement.

## Ce que l’appli ne fait pas

Elle ne demande pas de saisir des calories chaque jour, et il n’existe pas aujourd’hui de rappel pour cocher ses repas.
