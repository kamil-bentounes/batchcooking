---
id: budget-hub
titre: La carte Budget de l’accueil
ecrans: [/]
questions:
  - Pourquoi ma carte Budget dit « Commence en novembre » ?
  - Pourquoi la carte dit « Rien de posé » ?
  - Que veut dire « 2 montants à dire » ?
  - Pourquoi « Ajoute ton revenu » alors que je l’ai déjà mis ?
  - Qu’est-ce que « Tout est à jour » ?
  - Pourquoi « Septembre est à clôturer » ?
sources:
  - src/pages/Hub.tsx
  - src/lib/budget/mois.ts
  - src/lib/budget/ecran.ts
  - src/lib/donnees/foyer.ts
  - src/lib/donnees/budget.ts
verifie_sur: bd10d8c
---
La carte « Budget » de l'accueil donne l'état du mois en cours. Un toucher dessus ouvre l'écran du mois. Ouvrir l'accueil ouvre aussi le mois en cours (Popote crée ses lignes si elles n'existent pas encore).

## Ce que la carte peut dire

Dans cet ordre :

1. **« … »** : Popote lit encore ses données.
2. **« Je n’ai pas pu lire le budget : tu n’as plus de connexion. »** (ou la raison de la panne) : aucun chiffre n'est donné tant que tout n'est pas lu.
3. **« Commence en novembre »** (sans l’année), avec « Tu entres dans le foyer à cette date : rien n’est à poser avant. » : ton arrivée dans le foyer tombe après le mois en cours.
4. **« Rien de posé »**, avec « Les charges du foyer, et ce que chacun verse. » : le mois en cours n'a aucune ligne.
5. **« Ajoute ton revenu »** : le mois a des lignes, mais tu n'as pas de revenu pour ce mois.
6. **« Il te reste 560 € en octobre »** ou **« Il te manque 40 € en octobre »** : même calcul que sur l'écran du mois. Le gros chiffre est arrondi à l'euro.

## La ligne sous le chiffre

Sous le chiffre (cas 5 et 6), une seule phrase, la première qui s'applique :

- **« Septembre est à clôturer »** : le mois précédent n'est pas clôturé, tu y avais un revenu et tu étais déjà dans le foyer. Seul le mois précédent compte ici.
- **« 2 montants à dire : Courses et Essence »** : des lignes « Plusieurs dépenses dans le mois » n'ont encore aucune dépense déclarée. La phrase nomme trois lignes au plus, puis « et 2 autres ». Pour une seule : « 1 montant à dire ».
- **« Tout est à jour »** : rien à clôturer, rien à dire.

Sous le chiffre, rien tant que les clôtures ne sont pas lues.

## Les autres cartes de l'accueil

- **« Inviter quelqu’un. »** (« Tu obtiens un lien à lui envoyer. ») : tant que tu es seul dans le foyer. Elle disparaît dès que vous êtes deux.
- **« Complète ton profil. »** : il manque ton prénom ou ton revenu (« Sans ton revenu, le partage se fait à parts égales. »). Un toucher mène au profil.
- **« Fixe tes objectifs. »** : prénom et revenu sont posés, pas tes objectifs ; un toucher mène aux objectifs.
- L'avatar (« Mon profil ») ouvre ton profil : prénom, revenu, date d'arrivée.
