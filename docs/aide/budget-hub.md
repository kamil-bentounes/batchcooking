---
id: budget-hub
titre: La tuile Budget de l’accueil
ecrans: [/]
questions:
  - Pourquoi mon budget dit « Dans 5 jours » ?
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
  - src/ui/budget/MoisType.tsx
  - src/lib/budget/mois-type.ts
  - src/lib/donnees/cycle.ts
verifie_sur: 02a9f37
---
La tuile « Budget » de l'accueil (« Le budget », à côté du frigo) donne l'état du mois en cours. Un toucher dessus ouvre l'écran du mois. Ouvrir l'accueil ouvre aussi le mois en cours : Popote crée ses lignes.

## Ce que la tuile peut dire

Dans cet ordre :

1. **« … »** : Popote lit encore ses données.
2. **« Je n’ai pas pu lire le budget : tu n’as plus de connexion. »** (ou la raison de la panne) : aucun chiffre tant que tout n'est pas lu.
3. **Avant ton arrivée** : ton mois type (« budget-mois-type ») — **« 420 € pour toi »** ou « Il te manque 90 € », tes charges, une barre — et le compte à rebours **« 5 jours avant ton premier mois, le 1er novembre »** (« Dans 5 jours » sur téléphone). Sans charge posée : **« Commence en novembre »** et « Tu entres dans le foyer à cette date : rien n’est à poser avant. »
4. **« Rien de posé »**, avec « Les charges du foyer, et ce que chacun verse. » : aucune ligne ce mois-ci.
5. **« Ajoute ton revenu »** : le mois a des lignes, pas ton revenu.
6. **« Il te reste 560 € en octobre »** ou **« Il te manque 40 € en octobre »** : même calcul que sur l'écran du mois.

## La ligne sous le chiffre

Sous le chiffre (cas 5 et 6), une seule phrase, la première qui s'applique (une pastille la résume sur téléphone) :

- **« Septembre est à clôturer »** : le mois précédent n'est pas clôturé, tu y avais un revenu et tu étais déjà dans le foyer.
- **« 2 montants à dire : Courses et Essence »** : des lignes « Plusieurs dépenses dans le mois » n'ont encore aucune dépense déclarée. Trois lignes nommées au plus, puis « et 2 autres ».
- **« Tout est à jour »** : rien à clôturer, rien à dire.


## Le reste de l'accueil

- **La carte sombre du jour** dit « Session interrompue » et « Reprends-la depuis la cuisine. » quand une session est à reprendre (« cuisine-session-fin »). Son bouton « Cuisine » ouvre l'accueil de la cuisine.
- **« Inviter quelqu’un. »** (« Tu obtiens un lien à lui envoyer. ») : tant que tu es seul dans le foyer.
- **« Complète ton profil. »** : il manque ton prénom ou ton revenu ; un toucher mène au profil.
- **« Fixe tes objectifs. »** : prénom et revenu sont posés, pas tes objectifs.
- L'avatar (« Mon profil ») ouvre ton profil : prénom, revenu, date d'arrivée.
