---
id: cuisine-stock
titre: Le frigo : plats, ingrédients, congélateur, placard
ecrans: [/frigo]
questions:
  - À quoi sert le frigo dans l’appli ?
  - Que dit l’aimant sur la porte du frigo ?
  - Combien de temps se garde une barquette au congélateur ?
  - Comment retirer un ingrédient fini ?
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
verifie_sur: 9b03c3e
---
## Ce que fait l’appli

« Frigo », dans la barre du bas, dessine un frigo américain. À gauche le **congélateur**, à droite le **frigo**. L’ancien écran « Ce que j’ai » (`/stock`) renvoie ici.

Fermé, il parle sans qu’on y touche :

- **L’afficheur** du congélateur : « Ce soir » et ton dîner prévu, ou « Rien de prévu ce soir ». S’ils ne se lisent pas, l’afficheur dit « Indisponible ».
- **L’aimant** du frigo, un seul : des barquettes congelées à sortir, posées sur ce soir ou sur demain quand l’heure de les sortir est venue (« Sors les 2 wraps : c’est ce soir », « Sors la barquette de burger de feuilles de riz : c’est demain soir ») ; sinon des barquettes du frigo périmées (« 2 barquettes de pizza vietnamienne à jeter ») ou qui périment sous 72 heures sans qu’aucun repas les réclame (« 2 barquettes de pizza vietnamienne à prévoir avant jeudi ») ; sinon rien.
- **La photo** du plat de demain, s’il en a une.

Touche une porte : elle pivote, puis l’intérieur prend l’écran. Échap ou « Fermer la porte » le ferme.

## Dedans

- **Frigo** : une carte par plat (recette, lieu et état), avec la photo, « ×N » parts, et quand c’est prévu (« mar. midi à mer. midi ») ou le mot d’urgence. Dessous, les ingrédients par étagère (« Laitages et frais », « Viandes et poissons », « Autres »), le « Bac à légumes », « + Ajouter au frigo » et « Photo du frigo ».
- **Congélateur** : les plats congelés, le « Tiroir du bas » pour les ingrédients, « + Ajouter au congélateur ».
- **Le placard** : lien sous le frigo, une liste, « + Ajouter au placard ». « Peser ce qu’on compte à l’unité » est juste dessous.

Le stock se remplit en cochant la liste de courses (le rayon décide du lieu : « Surgelés » au congélateur ; « Frais », « Fruits et légumes », « Boucherie, poissonnerie » au frigo ; le reste au placard ; ni Entretien ni Hygiène), à la main, par photo, et au dressage (« cuisine-on-range »).

Touche une carte pour ouvrir sa **fiche** (« cuisine-fiche-plat » : parts, dates, photo ; « cuisine-fiche-plat-gestes » : manger, congeler, sortir, jeter, retirer).

## Un ingrédient

Quantité (« Enregistrer »), lieu (Frigo, Congélateur, Placard : le congélateur date la mise au froid), « À manger avant » (« Retirer la date »), « Fini » (supprime, sans confirmation). Changer de lieu recalcule la date comme pour une barquette : 90 jours au congélateur, 24 heures à la sortie vers le frigo, aucune vers le placard ; entre frigo et placard, elle reste.

## Ce que l’appli ne fait pas

Seul le rappel « Une barquette va périmer » (voir « rappels-les-sept »), que chacun active lui-même, prévient par mail, et il ne parle que des barquettes. Le stock ne diminue pas quand tu manges : seuls « On range » (ce que la session a pris), « Fini » et la liste de courses le font.
