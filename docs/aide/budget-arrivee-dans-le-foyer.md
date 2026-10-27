---
id: budget-arrivee-dans-le-foyer
titre: L’arrivée dans le foyer et les mois qui comptent
ecrans: [/, /budget, /profil]
questions:
  - Pourquoi mon budget dit « Dans 5 jours » ?
  - Pourquoi je n’ai aucune part sur octobre ?
  - Où je change ma date d’arrivée ?
  - Pourquoi mon revenu compte à partir d’un autre mois ?
  - Pourquoi septembre dit « clôturé avant que ton revenu soit posé » ?
  - Pourquoi le partage est à parts égales ?
sources:
  - src/pages/Hub.tsx
  - src/pages/Budget.tsx
  - src/pages/Cloture.tsx
  - src/pages/Profil.tsx
  - src/pages/BudgetReglages.tsx
  - src/lib/budget/mois.ts
  - src/lib/budget/cloture.ts
  - src/lib/donnees/budget.ts
  - src/ui/budget/MoisType.tsx
  - supabase/migrations/0065_gardes_manquantes.sql
  - supabase/migrations/0100_budget_mois_gele.sql
  - supabase/functions/accept-invite/index.ts
  - supabase/migrations/0098_budget_lignes_nees.sql
  - supabase/migrations/0102_budget_mois_suivis.sql
  - supabase/migrations/0103_budget_arrivees.sql
verifie_sur: 264dd60
---
## La date d'arrivée

Ta date d'arrivée est le champ **« Ton arrivée dans le foyer »** de ton profil (touche l'avatar, « Mon profil ») : elle décide des mois que tu partages.

Quand quelqu'un accepte une invitation, son arrivée est posée d'office au **1er du mois suivant** ; il la corrige dans son profil.

## Les mois qui comptent pour toi

Un mois compte pour toi si ton arrivée n'est pas après son dernier jour : arriver le 15 novembre fait compter novembre en entier.

Avant ton arrivée :

- tu ne portes aucune part et on ne te demande aucun revenu ;
- la tuile « Budget » de l'accueil dit ton **mois type** (« 420 € pour toi ») et compte les jours : « 5 jours avant ton premier mois, le 1er novembre ». Sans charges posées : **« Commence en novembre »** ;
- l'écran du mois dit « Tu n’es pas encore dans le foyer : tu y entres en novembre. Ce mois-là ne te compte aucune part. » (« Tu n’étais pas encore… » sur un mois passé). Sur un mois vide, il montre le **mois type** de ton arrivée (« budget-mois-type ») ; tant qu’aucune charge n’est posée, il dit « Pas encore » ;
- aucun bandeau « … est fini : on le clôture ? » ne paraît pour ces mois.

## Ton revenu et ton arrivée

- Un revenu posé aujourd'hui est daté de **ce mois-ci**, ou du **mois de ton arrivée** si elle est à venir : pas de reste avant ton arrivée.
- Ton **premier** revenu remonte au mois de ton arrivée, mais jamais avant le mois qui suit la dernière clôture du foyer. Exemple : arrivée le 15 novembre, revenu posé le 2 décembre : il vaut dès novembre.
- Les revenus suivants prennent effet le mois où tu les poses ; celui d'un mois antérieur est gardé.
- Corriger ton arrivée refait le partage des mois entre l'ancienne et la nouvelle date (pas les mois clôturés ni les lignes déjà validées ou réglées). Reculée, elle ajoute aussi ton revenu à la nouvelle date, s'il datait de l'ancienne arrivée.

## Parts égales

Tant que quelqu'un qui est là ce mois-là n'a pas de revenu, tout se partage à parts égales.

## Un mois clôturé sans toi

Un mois clôturé avant ton premier revenu ne se recalcule pas : « Le mois de septembre a été clôturé avant que ton revenu soit posé. »

## Les mois suivis

Popote suit le budget depuis le premier mois où un revenu est posé (ou un mois clôturé).
