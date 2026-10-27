---
id: cuisine-semaine-changer
titre: La semaine : changer un repas, le manger, sortir un plat congelé
ecrans: [/semaine]
questions:
  - Comment changer un repas le jour même ?
  - Comment indiquer que j’ai mangé ma barquette ?
  - Que devient la barquette quand je change de repas ?
  - Que se passe-t-il quand je choisis un plat congelé ?
  - Quand faut-il sortir un plat du congélateur ?
  - Que veut dire « Je l’ai mangé » ?
sources:
  - src/pages/Semaine.tsx
  - src/pages/Accueil.tsx
  - src/ui/semaine/Bandeau.tsx
  - src/ui/semaine/Carte.tsx
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/ui/semaine/EnPlus.tsx
  - src/lib/choix.ts
  - src/lib/semaine.ts
  - src/lib/reperes.ts
  - src/lib/aliments/ordre.ts
  - src/lib/donnees/barquettes.ts
  - supabase/migrations/0123_choisir_un_repas.sql
  - supabase/migrations/0125_semaine_corrections.sql
  - supabase/migrations/0128_semaine_hier.sql
  - src/lib/peremption.ts
verifie_sur: e52e2c5
---
## Changer

La carte pleine d’un repas (voir « cuisine-semaine ») dit le plat, « Du frigo, pour vous deux » ou « Du congélateur, pour Kamil », et propose **« Changer »**, y compris le jour même. Sur l’accueil, « Changer » ouvre « La semaine » sur aujourd’hui avec la feuille du bon repas déjà ouverte.

Quand tu changes, l’ancienne barquette est lâchée, et l’appli le dit : « Les 2 wraps restent au congélateur. » ; pour un plat à plusieurs mots, « Les 2 barquettes de lasagnes au saumon-poireaux retournent au frigo, libres pour un autre jour. » (« La barquette de … retourne au frigo » s’il n’y en a qu’une).

## Manger

**« Je l’ai mangé »** apparaît aujourd’hui, et sur un jour passé (voir « cuisine-semaine-hier »), sur ta carte, pour un plat comme pour « Autre chose » : la barquette est marquée mangée et quitte le frigo. Un repas que quelqu’un a mangé ne se change plus pour cette personne.

## Annuler « Je l’ai mangé »

Un faux appui se rattrape : bandeau « Noté : mangé. » pendant 6 secondes, puis le lien « Pas mangé ? Annuler » (voir « cuisine-semaine-annuler »).

## Un plat congelé

Un plat **congelé** a un bandeau bleu :
- aujourd’hui : « C’est pour aujourd’hui : décongèle les 2 wraps au micro-ondes. » ;
- un autre jour : « Pense à sortir les 2 wraps la veille au soir. » (« la barquette de … » pour un plat à plusieurs mots) ;
- si ton rappel « Sortir du congélateur » est activé : « Mail mardi à 19 h : sortir 2 wraps du congélateur pour la nuit au frigo. » (voir « rappels-par-mail »).

Demain, une fois l’heure venue (vingt-quatre heures avant le repas), la même phrase que la fiche du plat dans « Frigo ».
