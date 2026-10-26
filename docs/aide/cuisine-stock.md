---
id: cuisine-stock
titre: Ce que j’ai : frigo, congélateur, placard
ecrans: [/stock]
questions:
  - À quoi sert « Ce que j’ai » ?
  - Comment remplir le stock ?
  - Comment congeler ou décongeler une barquette ?
  - Combien de temps se garde une barquette au congélateur ?
  - Comment supprimer un aliment du stock ?
  - Le stock diminue-t-il quand je cuisine ?
sources:
  - src/pages/Stock.tsx
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
verifie_sur: 7409ab5
---
## Ce que fait l’appli

« Ce que j’ai » est l’inventaire du foyer, en trois onglets (« Frigo », « Congélateur », « Placard »). Deux sortes de lignes : les **barquettes** (plats dressés : poids, kcal, protéines, mot d’urgence) et les **ingrédients**.

## Comment le remplir

- **En cochant la liste de courses** : l’article entre tout seul, sauf Entretien et Hygiène. Son rayon décide du lieu : « Surgelés » au congélateur ; « Frais », « Fruits et légumes » et « Boucherie, poissonnerie » au frigo ; le reste au placard. Décocher le retire.
- **Les boutons du bas** : « + À la main » (« cuisine-ajout-stock »), « Photo du frigo » ou du congélateur, du placard selon l’onglet (« cuisine-photo-frigo »), « Peser ce qu’on compte à l’unité » (« cuisine-peser »).
- Les barquettes arrivent à « On range », à la fin du dressage, avec leur lieu (frigo ou congélateur) et l’heure de rangement. À ce moment, les ingrédients que les recettes ont pris sortent de la liste (« cuisine-dressage »).

## Les barquettes

Touche une barquette pour voir « Préparée le … ». Tu peux :

- **Congeler** : « Congeler repart de zéro : la part tiendra trois mois. »
- **Décongeler** : à manger le lendemain.
- **Jetée** : elle sort du stock ; si elle vient d’une session, le bilan la compte parmi les jetées.
- **Supprimer** : sans confirmation.

Mots d’urgence au frigo : « encore N jours », « demain dernier délai », « à manger aujourd'hui », « périmée ». Au congélateur : « N j au congélateur », puis « à sortir sous N j » la dernière semaine. N est arrondi à la baisse (« encore 3 jours » pour une barquette neuve).

## Les durées

- Frigo : **4 jours** après la préparation. Congélateur : **90 jours** après la mise au froid. Décongelée : **24 heures**.
- Au congélateur seulement, une date saisie à la main (« À manger avant ») prime. Au frigo, on ne peut pas en saisir.
- Les ingrédients n’ont ni mot d’urgence ni date à l’écran. Pour en supprimer un, appuie sur la croix.

## Ailleurs dans l’appli

« Avec ce que j’ai » et « il manque … » (dans « Choisir ») ne comptent que les ingrédients **reconnus**, rattachés à un aliment connu. Ce que tu ajoutes à la main ou par photo ne l’est pas : ils l’ignorent. « Envie spéciale ? » pioche dans tous les ingrédients.

## Ce que l’appli ne fait pas

Il n’existe pas aujourd’hui de retrait automatique du stock quand tu cuisines (j’ai cherché : seuls les courses, l’ajout, la photo et « Supprimer » y écrivent), ni de bouton pour modifier une quantité : supprime la ligne et ajoute-la de nouveau. La liste de courses ne retranche pas le stock.
