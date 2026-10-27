---
id: reglages
titre: Les réglages
ecrans: [/reglages]
questions:
  - Où sont les réglages ?
  - À quoi sert « Ce que coûtent les photos » ?
  - Comment fixer le budget des courses ?
  - Comment inviter un foyer ami ?
  - Comment exporter mes données ?
  - Comment me déconnecter ?
  - Comment ajouter ou retirer un magasin ?
  - Où est le sélecteur Objectifs et Réglages ?
  - Où régler mes rappels par mail ?
sources:
  - src/pages/Settings.tsx
  - src/pages/Accueil.tsx
  - src/ui/reglages/coque.tsx
  - src/ui/reglages/cartes.tsx
  - src/lib/donnees/amis.ts
  - src/lib/donnees/foyer.ts
  - supabase/migrations/0001_class_c.sql
  - supabase/migrations/0014_magasin.sql
  - supabase/migrations/0024_prix.sql
  - supabase/migrations/0007_llm_budget.sql
  - supabase/migrations/0027_ecriture_croisee.sql
  - supabase/migrations/0035_amis.sql
  - supabase/migrations/0037_cuisiner_ensemble.sql
verifie_sur: 3640727
---
## Où

Accueil de Popote, carte « Cuisine », puis le rond avec ton initiale : « Réglages ». En haut de l’écran, un sélecteur « Objectifs | Réglages » passe de l’un à l’autre, et « Accueil » (en haut à gauche) ramène à l’accueil de la cuisine. Le budget a ses « Réglages du budget ».

## Les cartes, de haut en bas

- **« Inviter »** : voir « foyer-inviter ».
- **« Budget des courses »** : le repère du bilan. « Par mois (€) », puis « Enregistrer ». Vide : pas de jauge. Zéro ou moins : « Un budget se compte en euros, au-dessus de zéro. »
- **« Tes magasins »** (dans la même carte que le budget des courses) : écris le nom puis « Ajouter ». Le premier magasin créé est « par défaut ». « Retirer » demande confirmation : les articles qui portaient ce magasin deviennent « sans magasin », et les prix notés pour lui partent avec. Après une sortie de courses dans ce magasin, il ne peut plus être retiré : « <nom> a déjà servi pour une sortie de courses : il ne peut plus être retiré. »
- **« Nos aliments »** : « Ouvrir nos aliments » mène à la liste des aliments du foyer, avec leurs vraies valeurs (page « cuisine-nos-aliments »).
- **« Ce que coûtent les photos »** : un plafond en euros par mois pour lire une photo du frigo ou un ticket, 5 € au départ. Le montant « restants ce mois-ci » s’affiche en grand ; champ « Plafond mensuel (€) », bouton « Enregistrer ». Aucun coût n’est jamais enregistré : les euros restants ne baissent pas, et rien ne bloque au plafond. Seuls les quotas par mois limitent (page « limites »).
- **« Vos amis »** : d’autres foyers, pour échanger des recettes. « Inviter un foyer » donne un lien valable **7 jours**, à usage unique (« Copier le lien », « Annuler »). « Rompre » met fin à l’amitié des deux côtés, après confirmation. Seules les recettes marquées « partagée » circulent, avec le prénom de qui les a ajoutées ; courses, barquettes, prix et objectifs ne sortent jamais du foyer. Exception : une session de cuisine où tu convies un foyer ami (« donnees-et-vie-privee »).
- **« Les rappels par mail »** : « Régler mes rappels » ouvre l’écran des rappels (voir « rappels-par-mail »). Chacun règle les siens, et tout est coupé au départ.
- **Trois lignes dans une même carte** : « Changer mon mot de passe » (ouvre son écran, voir « compte-connexion »), « Exporter mes données » et « Me déconnecter » (sur cet appareil seulement).
- **« Supprimer mon compte »**, seul, en rouge, tout en bas (voir « donnees-et-vie-privee »).

## Ce que l’appli ne fait pas

Aucun réglage pour renommer le foyer, changer l’adresse e-mail, ni choisir la langue ou un thème ; les quotas du mois, le poids d’un dîner (35 %) et les 10 recettes par page sont fixes.
