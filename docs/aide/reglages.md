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
sources:
  - src/pages/Settings.tsx
  - src/pages/Accueil.tsx
  - src/ui/kit.tsx
  - src/lib/donnees/amis.ts
  - src/lib/donnees/foyer.ts
  - supabase/migrations/0001_class_c.sql
  - supabase/migrations/0014_magasin.sql
  - supabase/migrations/0024_prix.sql
  - supabase/migrations/0007_llm_budget.sql
  - supabase/migrations/0027_ecriture_croisee.sql
  - supabase/migrations/0035_amis.sql
  - supabase/migrations/0037_cuisiner_ensemble.sql
verifie_sur: 7a0673e
---
## Où

Accueil de Popote, carte « Cuisine », puis le rond avec ton initiale : « Réglages ». Le budget a ses « Réglages du budget ».

## Les sections, de haut en bas

- **« Ce que coûtent les photos »** : un plafond en euros par mois pour lire une photo du frigo ou un ticket, 5 € au départ. Champ « Plafond mensuel (€) », bouton « Enregistrer le plafond ». Aucun coût n’est jamais enregistré : les euros « restants ce mois-ci » ne baissent pas, et rien ne bloque au plafond. Seuls les quotas par mois limitent (page « limites »).
- **« Budget des courses »** : le repère du bilan. « Par mois (€) », puis « Enregistrer le budget ». Vide : pas de jauge. Zéro ou moins : « Un budget se compte en euros, au-dessus de zéro. »
- **« Inviter »** : voir « foyer-inviter ». « Dans le foyer : » liste les prénoms.
- **« Vos amis »** : d’autres foyers, pour échanger des recettes. « Inviter un foyer » donne un lien valable **7 jours**, à usage unique (« Copier le lien », « Annuler »). « rompre » met fin à l’amitié des deux côtés, après confirmation. Seules les recettes marquées « partagée » circulent, avec le prénom de qui les a ajoutées ; courses, barquettes, prix et objectifs ne sortent jamais du foyer. Exception : une session de cuisine où tu convies un foyer ami (« donnees-et-vie-privee »).
- **« Tes magasins »** : écris le nom puis « Ajouter ». Le premier magasin créé est « par défaut ». « retirer » demande confirmation : les articles qui portaient ce magasin deviennent « sans magasin », et les prix notés pour lui partent avec. Après une sortie de courses dans ce magasin, il ne peut plus être retiré : « <nom> a déjà servi pour une sortie de courses : il ne peut plus être retiré. » Autre erreur : « <nom> n’a pas pu être retiré. Réessaie dans un instant. »
- **« Ton mot de passe »** : « Changer mon mot de passe » (voir « compte-connexion »).
- **« Te déconnecter »** : « Me déconnecter », sur cet appareil seulement.
- **« Tes données »** : « Exporter mes données » et « Supprimer mon compte » (voir « donnees-et-vie-privee »).

## Ce que l’appli ne fait pas

Aucun réglage pour renommer le foyer, changer l’adresse e-mail, ni choisir la langue ou un thème ; les quotas du mois, le poids d’un dîner (35 %) et les 10 recettes par page sont fixes.
