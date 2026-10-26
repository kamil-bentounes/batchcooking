---
id: cuisine-stock
titre: Le frigo : plats, ingrédients, congélateur, placard
ecrans: [/frigo]
questions:
  - À quoi sert le frigo dans l’appli ?
  - Comment congeler ou sortir une barquette du congélateur ?
  - Que dit l’aimant sur la porte du frigo ?
  - Comment corriger la date d’une barquette ?
  - Combien de temps se garde une barquette au congélateur ?
  - Comment ajouter la photo d’un plat ?
  - Le stock diminue-t-il quand je cuisine ?
sources:
  - src/pages/Frigo.tsx
  - src/ui/frigo/FrigoFerme.tsx
  - src/ui/frigo/Interieurs.tsx
  - src/ui/frigo/FichePlat.tsx
  - src/ui/frigo/FicheIngredient.tsx
  - src/lib/frigo.ts
  - src/lib/donnees/frigo.ts
  - src/pages/AjoutManuel.tsx
  - src/pages/Photo.tsx
  - src/pages/Choisir.tsx
  - src/lib/peremption.ts
  - src/lib/donnees/barquettes.ts
  - src/lib/quantite.ts
  - supabase/migrations/0021_cocher_remplit.sql
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0092_la_photo_et_les_gestes.sql
  - supabase/migrations/0117_cuisine_corrections.sql
  - supabase/migrations/0121_photo_des_plats.sql
verifie_sur: d61ae46
---
## Ce que fait l’appli

« Frigo », dans la barre du bas, dessine un frigo américain. À gauche le **congélateur**, à droite le **frigo**. L’ancien écran « Ce que j’ai » (`/stock`) renvoie ici.

Fermé, il parle sans qu’on y touche :

- **L’afficheur** du congélateur : « Ce soir » et ton dîner prévu, ou « Rien de prévu ce soir ».
- **L’aimant** du frigo, un seul : des barquettes congelées posées sur ce soir ou demain (« Sors les 2 burgers : c’est ce soir ») ; sinon des barquettes du frigo qui périment sous 72 heures et qu’aucun repas ne réclame (« 2 pizzas à prévoir avant jeudi ») ; sinon rien.
- **La photo** du plat de demain, s’il en a une.

Touche une porte : elle pivote, puis l’intérieur prend l’écran. « Fermer la porte » la referme.

## Dedans

- **Frigo** : une carte par plat (recette, lieu et état), avec la photo, « ×N » parts, et quand c’est prévu (« mar. midi → mer. midi ») ou le mot d’urgence. Dessous, les ingrédients par étagère (« Laitages et frais », « Viandes et poissons », « Autres »), le « Bac à légumes », « + Ajouter au frigo » et « Photo du frigo ».
- **Congélateur** : les plats congelés, le « Tiroir du bas » pour les ingrédients, « + Ajouter au congélateur ».
- **Le placard** : lien sous le frigo, une liste, « + Ajouter au placard ». « Peser ce qu’on compte à l’unité » est juste dessous.

Le stock se remplit en cochant la liste de courses (le rayon décide du lieu : « Surgelés » au congélateur ; « Frais », « Fruits et légumes », « Boucherie, poissonnerie » au frigo ; le reste au placard ; pas Entretien ni Hygiène), à la main, par photo, et au dressage (« cuisine-on-range »).

## La fiche d’un plat

Touche une carte : lieu, nom, nombre de parts, macros par part, les repas où il est posé (« Prévues pour vous deux », « Prévues pour Kamil », ou « Pas encore »), les dates.

- **Dates** : « Au frigo depuis » ou « Congelés le » (pas dans le futur) recalcule « À manger avant » : **4 jours** au frigo, **90 jours** au congélateur. Une part décongelée se mange dans les **24 heures** : pas de « depuis » pour elle. « À manger avant », saisie à la main, prime (jusqu’à 23 h 59 ce jour-là). Tout s’applique à toutes les parts du plat.
- **Au frigo** : « En manger une maintenant » (ton repas du moment : matin avant 10 h, midi avant 16 h, sinon soir ; refusé s’il est déjà noté mangé ; si toutes les parts sont posées, celle du repas le plus lointain est prise et ce repas la perd), « Congeler » et « Jeter » (« combien ? » s’il y en a plusieurs ; les parts non posées d’abord).
- **Au congélateur** : « Je les sors du congélateur » (celles posées aujourd’hui ou demain, sinon « combien ? »), « Changer le repas » (mène à « La semaine »), « Jeter ». Si c’est pour ce soir, une note te dit de les sortir ou de passer au micro-ondes.

Mots d’urgence au frigo : « encore N jours », « demain dernier délai », « à manger aujourd'hui », « périmée ». Au congélateur : « N j au congélateur », puis « à sortir sous N j ».

## Un ingrédient

Quantité (« Enregistrer »), lieu (Frigo, Congélateur, Placard : le congélateur date la mise au froid), « À manger avant » (« Retirer la date »), « Fini » (supprime, sans confirmation).

## La photo d’un plat

« Prendre le plat en photo » (ensuite « Changer la photo ») n’existe que pour une recette **à ton foyer** (collée, inventée ou saisie), pas pour le catalogue. Elle est réduite (1 400 px), envoyée dans un seau public à ton foyer (2 Mo, JPEG, PNG ou WebP au plus) et devient la photo de la recette.

## Ce que l’appli ne fait pas

Ni mail ni notification. Le stock ne diminue pas quand tu manges : seuls « On range » (ce que la session a pris), « Fini » et la liste de courses le font.
