---
id: cuisine-fiche-recette
titre: La fiche d’une recette
ecrans: [/choisir]
questions:
  - Que veut dire « à 40 kcal près » sur la fiche ?
  - Que signifie « Tout est pesé » ?
  - Quelle différence entre « actives » et « en tout » ?
  - Que veut dire « sans toi » sur une étape ?
  - Pourquoi « Macros inconnues » sur une recette ?
  - Comment voir la recette d’origine sur le site ?
sources:
  - src/ui/recettes/FicheRecette.tsx
  - src/lib/recettes/fiche.ts
  - src/lib/recettes/temps.ts
  - src/lib/nutrition/macros.ts
  - src/lib/donnees/fiche.ts
  - scripts/recalcule.mjs
  - src/lib/donnees/importer.ts
  - src/pages/Inventer.tsx
verifie_sur: bd10d8c
---
## Ce que fait l’appli

Dans « Choisir », le **i** d’une recette ouvre sa fiche, par-dessus la liste. La croix « Fermer » la referme. En bas : le bouton « Ajouter à dimanche · N parts », ou, si la recette est déjà retenue, le simple message « Retenue pour dimanche · N parts ».

## Ce que montre la fiche

- En haut : la provenance (le site, ou « Ajoutée par … » pour une recette de foyer, même d’un ami), le titre et trois tuiles : « actives », « en tout », « parts ».
- La carte « Par part » : protéines, calories, fibres.
- Les appareils nécessaires.
- « Ingrédients » (« pour N parts ») : la quantité, puis le nom.
- « Étapes », avec à droite « N de gestes », suivi de « , le reste cuit seul » quand une étape cuit sans toi ; « Gestes non comptés » si aucun geste n’est connu.
- « Voir la recette sur … » ouvre le site d’origine, quand il y a un lien web.

## Les règles

- **« actives »** est le temps de tes gestes. **« en tout »** est la durée annoncée par le site ; si le site annonce moins que tes gestes, ou rien, l’appli montre la somme de ses étapes (« — » sinon).
- Chaque étape porte une pastille : « tes gestes » (tu travailles), « à surveiller » (étape bloquante : tu restes là), « sans toi » (cuisson qui n’occupe personne). Une étape qui cuit seule peut avoir les deux : ses gestes, puis son attente.
- Les protéines et les calories sont **en fourchette** (« 28–34 g »). À côté de « Par part » :
  - « Tout est pesé » : la marge d’erreur de la recette, arrondie, est de 0 kcal ;
  - « à N kcal près » : cette marge d’erreur ;
  - « N % des ingrédients connus » : sous 90 %, c’est ce pourcentage qui est affiché à la place.
- « Macros inconnues : trop d’ingrédients non reconnus. » : aucun chiffre n’est donné quand moins de 75 % des lignes ont à la fois un aliment reconnu et un poids connu ou habituel. Même message pour une part impossible (plus de 1,5 kg, ou hors de 20 à 2 000 kcal).
- Une recette devenue inaccessible (un ami ne la partage plus) : « Cette recette n’est plus accessible. »

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de bouton pour corriger une recette du catalogue.
