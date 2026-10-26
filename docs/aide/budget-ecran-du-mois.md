---
id: budget-ecran-du-mois
titre: L’écran du mois
ecrans: [/budget]
questions:
  - Comment je change de mois ?
  - Pourquoi je ne peux pas aller au mois prochain ?
  - À quoi servent les quatre boutons en haut ?
  - Pourquoi mon mois est vide ?
  - Pourquoi l’écran dit qu’il n’a pas pu lire le budget ?
sources:
  - src/pages/Budget.tsx
  - src/App.tsx
  - src/ui/budget/Gestes.tsx
  - src/ui/budget/CarteEpargne.tsx
  - src/lib/budget/mois.ts
  - src/lib/budget/ecran.ts
  - src/lib/horloge.ts
  - src/ui/budget/MoisType.tsx
verifie_sur: e4c18ef
---
L'écran du mois s'ouvre depuis la carte « Budget » de l'accueil. Il montre un mois à la fois : le mois en cours au départ.

## De haut en bas

- **Changer de mois.** Sur septembre : « ‹ Août » (le mois précédent, toujours là) et « Octobre › » (le mois suivant, seulement sur un mois passé : on ne va jamais au-delà du mois en cours). L'année s'ajoute dès qu'elle n'est pas l'année en cours.
- **Les jours**, sur le mois en cours seulement : « Il reste 8 jours. », « Il reste un jour. » ou « Dernier jour. ».
- **Quatre gestes** : « Mes charges », « Déclarer », « Revenus » (les réglages du budget), « Épargne ». « Déclarer » disparaît sur un mois clôturé.
- **Le reste du mois** : une carte sombre avec « Il te reste » (voir la page sur le calcul).
- **Une phrase en ocre**, à deux sur un mois ouvert, si quelqu'un n'a pas dit son revenu : « [prénom] n’a pas encore dit son revenu : tant qu’il manque, le partage se fait à parts égales. » (ou « Aucun revenu n’est posé : le partage se fait à parts égales. »).
- **Une carte par poche d'épargne**, si tu en as.
- **« Le mois type »** : une carte sous l'épargne, quand le mois a des lignes. Elle ouvre le tableau de bord du mois type (« budget-mois-type »).
- **« Par catégorie »** : les lignes du mois, avec le filtre « Tout / Commun / Moi ».
- **Le bandeau de clôture**, entre le filtre et les catégories, quand il y a lieu (voir la page « Quand clôturer »).

## Quand l'écran est vide ou prudent

- **« Rien de posé »** : sur le mois en cours, « Aucune charge ce mois-ci. On commence par là. » avec un bouton : « Commencer par les revenus et les comptes » si aucun compte n'existe, sinon « Poser les charges ». Sur un mois passé : « Aucune charge n’était posée ce mois-là. »
- **Avant ton arrivée** dans le foyer, sur un mois vide : l'écran montre le mois type du mois où tu entres (« budget-mois-type ») ; sans aucune charge posée, il dit « Pas encore ».
- **Une panne de lecture** : « Je n’ai pas pu lire le budget… » et le bouton « Réessayer ». Aucun chiffre avant d'avoir tout lu.

## À savoir

Une adresse de mois à venir te ramène sur le mois en cours. Un mois passé s'ouvre toujours : Popote crée alors les lignes qui manquaient, sauf s'il est clôturé.
