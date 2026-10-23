---
id: budget-dictee-charges
titre: Dicte tout, je range
ecrans: [/charges]
questions:
  - Comment marche « Dicte tout, je range » ?
  - Qu’est-ce que le modèle voit de mes données quand je dicte ?
  - Combien de dictées puis-je faire par mois ?
  - Pourquoi une ligne n’est-elle pas ajoutée ?
  - À quoi sert « Vérifier mes charges » ?
sources:
  - src/pages/Dictee.tsx
  - src/pages/Charges.tsx
  - src/pages/RevueCharges.tsx
  - supabase/functions/charges/index.ts
  - supabase/functions/charges/prompt.ts
  - supabase/functions/revue-charges/index.ts
  - supabase/functions/revue-charges/prompt.ts
  - supabase/migrations/0027_ecriture_croisee.sql
verifie_sur: bd10d8c
---
« Dicte tout, je range » (page « Les charges ») pose plusieurs charges à partir de ce que tu racontes. Le modèle propose, tu valides. Rien n’est enregistré tant que tu n’as pas touché « Ajouter N charges ».

## Comment faire

1. Choisis une section : « Le logement », « La voiture », « Les abonnements », « Les crédits » ou « Tout le reste, d’un coup ».
2. Écris, ou touche le micro de ton clavier : l’appli n’enregistre pas ta voix. Il faut au moins 10 caractères et au plus 8 000.
3. Touche « Range tout ça ».
4. Sur « Ce que j’ai compris », décoche ce qui est faux. Pour chaque ligne tu peux changer le rythme (mois, trimestre, an), « en commun » ou « à toi », et le montant. Une charge non mensuelle a un champ « Elle court depuis » : janvier de l’année en cours par défaut.
5. Touche « Ajouter N charges ».

Sont cochées d’office les lignes sûres (confiance d’au moins 0,7) avec un montant. Une ligne sans montant ne part pas.

« Il me manque ça » liste des questions du modèle. « Tu n’en as pas parlé — tu en as ? » propose des postes du catalogue : touche-les, il reste à mettre le montant.

## Ce que le modèle voit

- Voit : ton texte, et le catalogue (section, libellé, rythme, partage habituel) de la section choisie, tout le catalogue pour « Tout le reste, d’un coup ».
- Ne voit pas : tes revenus, tes charges déjà posées, les prénoms, les comptes. Il ne choisit ni la clé de partage ni le compte. Rien n’empêche de poser deux fois la même charge.
- Les charges « en commun » sont posées avec tout le foyer ; celles « à toi » avec toi seul. Le compte commun est utilisé d’office (sinon le premier compte).

## Le quota

20 dictées par mois pour tout le foyer. Chaque envoi compte, même si le rangement échoue. Au-delà : « Quota atteint : 20 dictées par mois. Il repart le 1er. »

## « Vérifier mes charges »

Ce bouton, en haut de la liste (dès qu’il y a une charge), fait relire tes charges : doublons (« Deux fois la même chose »), montants qui détonnent (« À vérifier »), postes courants oubliés (« Tu n’en as pas parlé »). Il ne corrige rien. Il envoie au modèle, pour chaque charge, libellé, montant, rythme, commun ou perso, fixe ou variable, compte et date de début ; jamais les revenus ni les prénoms. Quota séparé : 30 relectures par mois.
