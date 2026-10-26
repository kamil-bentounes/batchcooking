---
id: installation-hors-ligne
titre: Installer Popote et la hors ligne
ecrans: []
questions:
  - Comment installer Popote sur mon téléphone ?
  - Est-ce que ça marche sans réseau ?
  - L’appli dit « Hors ligne », que faire ?
  - L’appli dit « Ça ne répond pas », pourquoi ?
  - Ce que j’ai saisi est-il perdu si le réseau coupe ?
sources:
  - vite.config.ts
  - index.html
  - src/App.tsx
  - src/pages/HorsLigne.tsx
  - src/ui/BandeauDePanne.tsx
  - src/lib/reseau.ts
  - src/lib/client-requetes.ts
  - src/lib/session-perdue.ts
  - src/lib/budget/ecran.ts
  - .github/workflows/reveil.yml
verifie_sur: 7409ab5
---
## Installer sur le téléphone

Popote est une appli web qui peut s’installer comme une vraie appli : elle s’appelle « Popote », a son icône, et s’ouvre sans la barre du navigateur. L’installation passe par le menu de ton navigateur (l’ajout à l’écran d’accueil). Je n’ai pas trouvé de bouton « Installer » dans l’appli elle-même.

Elle se met à jour toute seule. Après une nouvelle version, il peut falloir l’ouvrir une fois de plus avant de voir la nouveauté.

## Ce qui marche sans réseau

Presque rien. Une fois chargée, l’appli s’ouvre sans réseau : son code, ses icônes et les photos du budget sont gardés sur l’appareil. Mais **toutes les données vivent en ligne** (recettes, courses, stock, budget, foyer). Je n’ai pas trouvé de copie des données sur l’appareil. À l’ouverture sans réseau, tu vois donc :

- **« Hors ligne »** : « Pas de réseau : vérifie ta connexion, puis réessaie. » Le bouton « Réessayer » relit tout. Le retour du réseau relance tout seul.
- Une photo du frigo, un ticket, une dictée ou une recette inventée demandent aussi le réseau.

## Quand le réseau coupe en cours de route

- Une saisie qui part échoue tout de suite, avec « Pas de réseau : vérifie ta connexion, puis réessaie. » Rien n’est mis en attente : refais le geste une fois le réseau revenu.
- Si l’appli ne peut plus relire le foyer pendant que tu t’en sers, l’écran reste et un bandeau apparaît en haut : « … Ce que tu as saisi est gardé. » avec « Réessayer ». Tes champs à moitié remplis ne disparaissent pas.
- Sur le budget, une lecture ratée dit « Je n’ai pas pu lire le budget : tu n’as plus de connexion. »

## « Ça ne répond pas »

L’écran dit « La base ne répond pas : réessaie dans un instant. » Le réseau est là, mais la lecture de ton foyer échoue (la base ne répond pas, ou répond par une erreur). Réessaie plus tard. Une base d’une offre gratuite se met en pause après sept jours sans activité : une requête automatique chaque matin est prévue pour l’éviter, mais je ne sais pas si elle tourne.

## Session expirée ou simple panne ?

Une coupure de réseau n’est pas une session expirée : tu n’es pas déconnecté(e). Quand la session a vraiment disparu, l’appli affiche l’écran de connexion avec « Ta session a expiré : reconnecte-toi. » (voir « compte-connexion »).

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de mode hors ligne qui laisse lire ou saisir sans réseau.
