---
id: cuisine-fiche-plat
titre: La fiche d’un plat : dates, congeler, sortir, jeter, photo
ecrans: [/frigo]
questions:
  - Comment congeler ou sortir une barquette du congélateur ?
  - Comment corriger la date d’une barquette ?
  - Que veut dire « Prévues pour vous deux » ?
  - Comment manger une barquette maintenant ?
  - Comment ajouter la photo d’un plat ?
  - Combien de temps se garde une barquette au congélateur ?
sources:
  - src/ui/frigo/FichePlat.tsx
  - src/ui/frigo/Combien.tsx
  - src/ui/frigo/ChampDate.tsx
  - src/lib/frigo.ts
  - src/lib/donnees/frigo.ts
  - src/lib/peremption.ts
  - src/lib/ranger.ts
  - supabase/migrations/0017_triggers_lot1.sql
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0092_la_photo_et_les_gestes.sql
  - supabase/migrations/0121_photo_des_plats.sql
verifie_sur: 18b0c7f
---
## Ce que fait l’appli

Dans le frigo, touche la carte d’un plat : sa fiche s’ouvre en bas de l’écran (« cuisine-stock » décrit le frigo).

## Ce que dit la fiche

Lieu, nom, nombre de parts, macros par part, les repas où il est posé (« Prévues pour vous deux », « Prévues pour Kamil », ou « Pas encore »), les dates.

- **Dates** : « Au frigo depuis » ou « Congelés le » (pas dans le futur) recalcule « À manger avant » : **4 jours** (96 heures pleines) au frigo, **90 jours** au congélateur. Une part décongelée se mange dans les **24 heures** : pas de « depuis » pour elle. « À manger avant », saisie à la main, prime (jusqu’à 23 h 59 ce jour-là). Tout s’applique à toutes les parts du plat.
- **Au frigo** : « En manger une maintenant » (ton repas du moment : matin avant 10 h, midi avant 16 h, sinon soir ; refusé s’il est déjà noté mangé ; si toutes les parts sont posées, celle du repas le plus lointain est prise et ce repas la perd), « Congeler » et « Jeter » (« combien ? » s’il y en a plusieurs ; les parts non posées d’abord).
- **Au congélateur** : « Je les sors du congélateur » (celles posées aujourd’hui ou demain, sinon « combien ? »), « Changer le repas » (mène à « La semaine »), « Jeter ». Si c’est pour ce soir, une note te dit de les sortir ou de passer au micro-ondes.

Mots d’urgence au frigo : « encore N jours », « demain dernier délai », « à manger aujourd'hui », « périmée ». Au congélateur : « N j au congélateur », puis « à sortir sous N j ».

## La photo d’un plat

« Prendre le plat en photo » (ensuite « Changer la photo ») n’existe que pour une recette **à ton foyer** (collée, inventée ou saisie), pas pour le catalogue. Elle est réduite (1 400 px), envoyée dans un seau public à ton foyer (2 Mo, JPEG, PNG ou WebP au plus) et devient la photo de la recette.

