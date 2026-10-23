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
verifie_sur: bd10d8c
---
L'écran du mois s'ouvre depuis la carte « Budget » de l'accueil. Il montre un mois à la fois : le mois en cours au départ.

## De haut en bas

- **Les mois.** Sur septembre : « ‹ Août » (le mois précédent, toujours là) et « Octobre › » (le mois suivant, seulement sur un mois passé : on ne va jamais au-delà du mois en cours). Le nom du mois est écrit en grand ; l'année s'ajoute dès qu'elle n'est pas l'année en cours.
- **Les jours**, sur le mois en cours seulement : « Il reste 8 jours. », « Il reste un jour. » ou « Dernier jour. ». Popote compte les jours entre aujourd'hui et le dernier jour du mois : le 23 octobre, il en reste 8.
- **Quatre gestes** : « Mes charges », « Déclarer », « Revenus » (les réglages du budget), « Épargne ». « Déclarer » disparaît sur un mois clôturé.
- **Le reste du mois** : une carte sombre avec « Il te reste » (voir la page sur le calcul).
- **Une phrase en ocre**, à deux sur un mois ouvert, si quelqu'un n'a pas dit son revenu : « [prénom] n’a pas encore dit son revenu : tant qu’il manque, le partage se fait à parts égales. » (ou « Aucun revenu n’est posé : le partage se fait à parts égales. »).
- **Une carte par poche d'épargne**, si tu en as.
- **« Par catégorie »** : les lignes du mois, avec le filtre « Tout / Commun / Moi ».
- **Le bandeau de clôture**, entre le filtre et les catégories, quand il y a lieu (voir la page « Quand clôturer »).

## Quand l'écran est vide ou prudent

- **« Rien de posé »** : sur le mois en cours, « Aucune charge ce mois-ci. On commence par là. » avec un bouton : « Commencer par les revenus et les comptes » si aucun compte n'existe, sinon « Poser les charges ». Sur un mois passé : « Aucune charge n’était posée ce mois-là. »
- **« Pas encore »** : ton arrivée dans le foyer est après ce mois (voir la page sur l'arrivée).
- **Une panne de lecture** : « Je n’ai pas pu lire le budget… » et le bouton « Réessayer ». Aucun chiffre n'est montré avant d'avoir tout lu.

## À savoir

Une adresse de mois à venir te ramène sur le mois en cours. Un mois passé s'ouvre toujours : Popote crée alors les lignes qui manquaient, sauf s'il est clôturé.
