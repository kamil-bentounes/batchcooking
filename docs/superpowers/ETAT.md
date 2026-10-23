# Finaliser Popote : où on en est

Mis à jour le 22/10/2026. Le chantier 2 (Recettes) est EN LIGNE depuis le 21/10 (migration 0092,
fonction `importer`, recalcule, site, 1 426 photos relues). Le chantier 3 (Budget) est CODÉ sur
`feat/budget-refait` ; le chantier 4 (le grand test) est en cours. Kamil a donné son « go » le 21/10 : finir seul, tout tester en local
(front et base, tous les parcours), tout corriger, puis tout pousser en prod.

Kamil voulait « finaliser ce projet qui date depuis un MOMMMMMMENT ». Il a pris six
décisions ce jour-là ; la mémoire les garde sous `decisions-du-19-octobre`.

1. **Invitation : le lien suffit.** Pas de mail : le compte naît quand on ouvre le lien.
2. **Budget : on code maintenant**, sans plus de tours de relecture de la spec.
3. **Recettes : les 5 points tels quels.** La relecture des 1 426 pages est accordée.
4. **Prod : je déploie après tests verts**, migrations, fonctions, site et push compris.
   Jamais au nom de Thauba.
5. **À la fin, tout tester** : le parcours complet d'un vrai compte depuis l'invitation,
   le rendu comparé aux maquettes, tous les parcours de l'app.
6. **Le projet Supabase ne doit plus s'endormir** : un réveil quotidien gratuit.

Sa règle de méthode, le 19/10 après-midi : **on ferme chantier par chantier**, avec de
vrais tests au navigateur.

- Le serveur est lancé, et le banc clique à l'écran.
- Chaque capture est regardée.
- La base est relue, pour vérifier que les comptes existent vraiment.

Les tests unitaires seuls ne suffisent pas. Les agents tournent en **Sonnet 5.5, effort
high** : c'est sa demande, notée en mémoire sous `agents-en-sonnet-high`.

## Reprendre ici

1. `main` est à 49cca8d (les recettes), poussé. Le Budget se code sur **`feat/budget-refait`**.
2. **Chantier 2 (Recettes) : en ligne le 21/10** (compte rendu : https://claude.ai/artifact/KZAnyZt9JqY5JRi4vyZSeG). Vérifié, seul sur la base et sur le port
   4173 : `npm run build` vert, `npm run lint` sans erreur, 65 fichiers et 1 493 tests (purs et
   base), 99 bancs navigateur sur l'appli construite, le banc de clôture `e2e/recettes.spec.ts`
   (10 parcours) aussi sur le serveur de dev. Deux relectures adverses indépendantes, les
   mutations du code (28, deux trous comblés) et de la base (4, toutes attrapées).
3. La mise en ligne (tâche 24) est faite : voir « Fait le 21/10 » plus bas. La sauvegarde de la prod
   est dans `~/PERSO/sauvegardes-popote/2026-10-21/`.
4. Pour les bancs : relancer `npx supabase start` si la pile locale est arrêtée, et `npx supabase
   functions serve` en fond (sans lui, les tests d'invitation échouent : 503).
5. Chantier 3 (Budget) : CODÉ sur `feat/budget-refait` (3.5 et 3.9 faites le 22/10, revue adverse du
   front du lot 3 et ses 9 constats corrigés). Reste le chantier 4 : le grand test (parcours A nouveau
   venu, B cuisine, C budget, joués par des agents l'un après l'autre : consignes dans le dossier de
   travail, rapports dans `docs/superpowers/grand-test/`), puis la mise en ligne D1+D2.
6. Les deux anciens `git stash` ont été supprimés le 22/10 (à la demande de Kamil).

## Chantier 1 · Inscription et invitation — FERMÉ le 19/10

Le banc est `e2e/inscription.spec.ts` : 8 parcours joués au clic.

- Chaque écran a sa capture, dans `.shots/inscription/`.
- `journal.json` relie chaque capture à ce que disait la base au même moment.
- Le banc a tourné sur le serveur de dev et sur l'appli construite.

Le compte rendu, avec les captures : https://claude.ai/artifact/JKzrwPqxTw7w8DuJ4BGEkU

| Quoi | Commit | En prod |
|---|---|---|
| Invitation par lien seul (`Rejoindre`, `invitation_par_jeton`, `accept-invite` qui crée le compte, plus de mail) | f59b064 | migration 0089, fonctions `invite` et `accept-invite`, site |
| Le hub relit le foyer après le profil (avatar vide, « Complète ton profil ») | ad5591a | site |
| Supprimer son compte avec un compte perso (échouait pour Kamil) | 909ba7e | migration 0090 |
| Celui qui crée le foyer choisit son prénom (plus de « kamil-1792… ») | 4d6e610 | migration 0091, site |
| Un prénom vide se lit partout (« ? », « Sans prénom ») | 3d8e5d8 | site |
| Se déconnecter (Réglages, profil), et le dire quand ça échoue sans réseau ; messages des Réglages sous leur section | 1f1e2ae | site |
| Écran du mot de passe : texte juste, refus en français | 7442a66 | site |
| Le banc d'inscription | 67c4fe3 | — |
| Réveil quotidien de la base (GitHub Actions, 06:17 UTC) | d4d630a | poussé sur `main` |
| Fumée de la prod en lecture seule (`node scripts/fumee-prod.mjs`) | cec159e | — |

## Chantier 2 · Recettes — EN LIGNE le 21/10

La spec est `docs/superpowers/specs/2026-10-19-recettes-design.md`. Le plan, en 25
tâches, est `docs/superpowers/plans/2026-10-19-recettes.md` (ses amendements, à la fin, priment
sur le texte des tâches).

### Fait (tâches 1 à 23, et la fermeture)

- **Données** : titres sans réclame, entités décodées, photo en lien (JSON-LD), gestes d'une
  étape, macros impossibles écartées, temps actif qui compte les gestes. Migration **0092**
  (`recipe.image_url`, `recipe_step.gesture_min`, `tg_recipe_agrege`, `recettes_faisables()`,
  triggers `recipe_photo` et `recipe_source`).
- **Scripts** : `scripts/recalcule.mjs` (passes T, 0, 1, 2, G, 3, `--sec`, `--recette`) et
  `scripts/relis-photos.mjs` (le robot : 1 requête par seconde et par site, `robots.txt`
  RFC 9309, arrêt au premier 429 ou défi, hôtes privés refusés, reprise par
  `.relis-photos.etat.json`).
- **Écran** : « Choisir » refait (liste par dix, fiche (i), photos, 8 pictos, filtres, carte
  encre), `src/ui/recettes/`.
- **Tests** : bancs unitaires, bancs de base, bancs navigateur (`e2e/recettes.spec.ts`, 10
  parcours au clic, capture à chaque écran, base relue, comptes identiques avant et après).
  Les captures sont dans `.shots/recettes/{build,dev}/` (non versionnées).
- **Docs** : `docs/ingestion.md`, `schema.md`, `api.md`.

### Ce que la revue finale a fait changer

- **La source du catalogue est gelée** pour les foyers (`recipe_source`) : sans cela, un foyer
  pouvait réécrire `source_url` et faire poser par le rôle de service la photo d'un autre site.
- **`relis-photos` refuse les hôtes privés** avant la première requête (littéral ou résolu).
- **Une réingestion n'efface plus une photo.**
- **Les écrans** : échecs de « + » / « Retirer » / parts dits, anneau de focus lisible sur la
  carte encre, champ des parts (se vide, 44 px, plafonné, écritures mises à la file : « 12 » ne
  finit plus à « 1 »), mots longs, pictos qui passent à la ligne, fourchettes sur une ligne.

### Limites connues, acceptées

- **DNS rebinding** : `relis-photos` contrôle l'adresse, puis `fetch` la résout une seconde fois.
  Peu de risque ici (deux comptes) ; le fermer demande un `dispatcher` undici qui épingle
  l'adresse contrôlée.
- **`texteDe`** (`worker/src/sitemap.ts`, ingestion et `sonde`) suit encore les redirections sans
  limite et lit des corps sans plafond, contrairement à `relis-photos`.
- **« Avec ce que j'ai »** ignore les lignes d'ingrédient non rattachées (décision de la spec :
  seule une recette sans aucun ingrédient reconnu est exclue). L'ingestion ne rend planifiable
  qu'une recette dont plus de la moitié des lignes sont rattachées.
- **`titrePropre` coupe parfois trop** : « Gâteau, recette de grand-mère » devient « Gâteau »
  (la règle de la spec retire toute fin qui contient « recette »). **À lire au relevé à sec en
  prod, avant le vrai passage.**
- L'en-tête de « Choisir » dit « ‹ Accueil » sans avatar, la maquette « ‹ Popote » et le « K ».
- Un test lent peut sortir rouge sous charge : `ordonnance.test.ts` (400 ms) a échoué une fois,
  vert aux autres passages.

### Fait le 21/10 : la tâche 24, la mise en ligne (par le contrôleur)

À faire dans cet ordre, en disant à Kamil ce qui est parti. Jamais rien au nom de Thauba.

1. `npx supabase migration list`, puis `db push --dry-run`, puis `db push` (ajouter
   `--include-all` si la prod a des migrations plus récentes). La prod était à **0091** le 20/10 :
   1 426 recettes, 8 108 étapes, 1 foyer.
2. Déployer la fonction `importer`. **La migration d'abord, le site ensuite** : un nouveau client
   sans la 0092 échoue à chaque import.
3. **Avant le recalcule, la sauvegarde en lecture seule**, hors de `/tmp` : `recipe` (`id`,
   `title`, `active_time_min`, `total_time_min`), `recipe_nutrition` entier, `recipe_step`
   (`id`, `duration_min`) **et `recipe_ingredient` (`id`, `food_id`, `resolution_source`,
   `confidence`, `grams_reference`)** : les passes 0 et 1 réécrivent ces quatre colonnes (trou
   trouvé par la revue finale).
4. `npm run recalcule -- --prod --sec`, le lire (surtout la liste des titres changés), puis le
   vrai passage, puis la requête de cohérence de l'amendement 24 (doit rendre 0).
5. Le site : `main` en avance rapide sur `feat/recettes`, puis push.
6. `npm run relis-photos -- --prod --sec --limite 20` (il demande quand même les pages), le
   regarder, puis `npm run relis-photos -- --prod` (35 à 50 minutes).
7. Les comptes, la fumée de la prod en lecture seule (`node scripts/fumee-prod.mjs`), puis la
   page de compte rendu avec les captures.

La clé de service de la prod n'est pas dans `.env.production` : la lire par l'API de gestion
(`name === 'service_role'`, sinon `type === 'secret'`), sans jamais l'afficher.

### Ce qui a marché

- **Les tâches pures tournent en parallèle dans des worktrees** (`isolation: worktree`).
  - Ils partent de `main` : faire `git merge --ff-only feat/recettes`, poser un lien vers
    `node_modules`, et copier `.env` si un test lit la base.
  - Ensuite, `git cherry-pick` sur `feat/recettes`, puis retirer le worktree.
- **Une tâche qui touche la base passe seule**, dans le dépôt principal.
- **Après chaque tâche, une relecture** : la conformité à la spec d'abord, la qualité ensuite.

## Chantier 3 · Budget — CODÉ sur `feat/budget-refait` (21–22/10), pas encore en prod

Le plan est `docs/superpowers/plans/2026-10-19-budget.md` (56 tâches, migrations 0093 à 0115).
La branche est LOCALE (non poussée) : 120 commits environ devant `main`.

**Fait** (chaque tâche : un agent Sonnet high en worktree, puis cherry-pick ; des revues adverses
après chaque groupe, leurs défauts corrigés en place puisque rien n'est en prod) :
- **Lot 1, le modèle (1.1 à 1.27)** : migrations 0093 à 0114, bancs `tests/budget-*.test.ts`, types,
  `docs/budget.md`. 0114 est la migration des DONNÉES de prod : ses arrêts, son banc
  (`scripts/banc-migration-budget.sh --tout`, qui remet la base locale à zéro) et ses variantes
  (`tests/fixtures/`) ont été durcis après revue. La copie de la prod
  (`tests/fixtures/budget-prod.local.sql`, gitignorée, budget réel de Kamil) est refaite par
  `scripts/copie-budget-prod.sql` lu en lecture seule par l'API de gestion.
- **Lot 2, l'écran du mois (2.1 à 2.19)** : `src/lib/budget/*`, `src/ui/budget/*`, `Budget.tsx`,
  `Hub.tsx`, `Charges.tsx`, `BudgetReglages.tsx`, bancs `e2e/budget.spec.ts` (110 bancs
  navigateur verts à la 2.19).
- **Lot 3, la clôture** : 3.1 (e2e rouge `e2e/cloture.spec.ts`), 3.2, 3.3, 3.4, 3.6, 3.7 (partielle), 3.8,
  3.10 (0115, `regularise_annuel` s'en va), **3.5** (page `Cloture.tsx`, `RevenirDessus`, les
  branchements) et **3.9** (parcours de la clôture vert, captures à 390 px) faites. Revue adverse du
  front du lot 3 (22/10) : 9 constats, tous corrigés (réponse perdue → relecture des clôtures,
  mois courant de Paris, aperçu des soldes à deux, champ vidé, reste négatif, focus, tests de clics).
  Playwright : 115 verts ; Vitest `src` : 1 301 verts ; banc de migration `--tout` vert (copie de la
  prod, 9 arrêts, variantes).
- **Décision de Kamil du 22/10 : le compte qui se ferme.** Un membre qui supprime son compte emporte sa
  charge perso (lignes des mois ouverts et saisies ; la charge s'archive si elle a une histoire ; les mois
  clôturés restent) : `delete_my_account` (0112, commit 0c02528), `docs/budget.md`. Le premier revenu qui
  remonte à l'arrivée (`tg_revenu_premier`) était déjà son choix du 01/10.
- **Décision du 22/10 : nettoyer le compte de Thauba en prod** s'il en traîne, « on refait tout proprement ».
  Lu le 22/10 (lecture seule) : 2 comptes `auth.users`, dont 1 SANS profil, 1 profil, 1 foyer, 1 invitation
  expirée non acceptée. À faire au moment de D1, après sauvegarde ; puis réinviter par un lien neuf.
- Les contextes et la liste des défauts relevés par les revues : `docs/superpowers/budget-agents/`.

**Chiffres de la prod relus le 21/10** (identiques à ceux du plan § 5, rien n'a bougé depuis le 01/10) :
1 foyer, 1 membre, octobre 22 lignes / 389 820, septembre 23 / 389 824, relevés Taxe foncière 145 000/4
et copropriété 120 000/0, trois lignes confirmées en septembre, revenu 432 500 depuis 2026-09-01.

**Décisions de Kamil du 21/10** : tout finir seul, puis le test final, puis pousser en prod en UNE fois.
Donc **D1 et D2 se jouent ensemble** : migrations 0093 à 0115 d'un seul coup, le site une fois.
Avant D1 : relire la prod (mêmes chiffres ? sinon recalculer `ATTENDU` et le dire), sauvegarde
en lecture seule, banc de migration `--tout` vert sur une copie du jour. Voir D1 et D2 dans le plan.

**À dire à Kamil dans le compte rendu** :
- « Il te manque » est en safran et non en ocre (contraste, noté dans le code) ;
- les photos santé, impôts et autre ont été choisies pendant le code (`public/budget/SOURCES.md`) ;
- départ partiel d'un membre : un remboursement porté par un partant ET un présent revient entier au
  présent (conforme à la lettre de la spec) ;
- le premier revenu d'un membre remonte à son arrivée (`entre_le`) : poser celui de Thauba en octobre
  rend « suivis » les mois depuis son arrivée ;
- `delete_my_account` : la charge perso du partant et ses lignes ouvertes restent (décision à prendre) ;
- 0114 s'arrête (et dit quoi faire) sur ce qu'elle ne sait pas migrer : ligne confirmée à 0 €, ligne
  confirmée du mois en cours, plusieurs foyers, enveloppes ambiguës, ligne `modele` sans charge.

## Chantier 4 · Le grand test final — JOUÉ le 22/10, corrections en cours

Consigne de Kamil du 21/10 : lancer le front ET la base en local, cliquer sur TOUS les parcours, regarder ce
que répondent le front et la base, lister tous les bugs, tout corriger, puis tout pousser en prod.

**Joué par trois agents, l'un après l'autre** (consignes dans le dossier de travail `scratchpad/grand-test/`,
comptes rendus versionnés dans `docs/superpowers/grand-test/` : `nouveau-venu.md`, `cuisine.md`, `budget.md`) :
- A, le nouveau venu : 9 bugs corrigés, 2 défauts de base (corrigés ensuite par moi, 0103 et 0112).
- B, la cuisine : 16 bugs corrigés dont 3 P1 (hors ligne, accueil sans cycle, « Interrompre la session »).
- C, le Budget : 8 bugs corrigés dont un P1 (retrait d'épargne sans plancher), arithmétique juste au centime.
- Derniers écarts (dérive de 6 centimes après « Revenir dessus », reste de l'autre membre, Choisir replié…) : corrigés.

**Corrections de BASE faites à la main (22/10)** : 0112 repartage les mois ouverts au départ d'un membre
(`repartit_les_lignes` lit `parts_du_mois`) et retire sa charge perso ; 0103 recule le premier revenu avec
l'arrivée (geste de la personne seulement, revenu accroché à l'ancienne arrivée) ; **0116** plancher
d'épargne (INSERT, UPDATE, DELETE). Commits 857b83f, 00c60af, af45104. **0117** : les quatre défauts de base
de `cuisine.md` (session interrompue, ligne protégée, non-alimentaire, position des recettes).

**Deux revues adverses finales (SQL et front, sur bc1c1e3)** : le SQL est corrigé (af45104). Le front : 11
constats confiés à un agent (réseau coupé : mutations en pause et jeton expiré, courses, épargne, mois clos
avant l'arrivée, md5 des égalités, focus…) ; **à vérifier à son retour** (`git log`, rapport).

**MISE EN LIGNE DU BUDGET — faite le 22/10 (D1 + D2 en une fois).**
- Avant : prod relue (mêmes chiffres que le 21/10 : octobre 22 lignes / 389 820, septembre 23 / 389 824,
  1 foyer, 1 membre, aucun arrêt de 0114), sauvegarde complète en lecture seule dans
  `~/PERSO/sauvegardes-popote/2026-10-22-budget/` (31 883 lignes, 13 Mo), atomicité de l'API de requête
  prouvée (`create table …; select 1/0;` n'a rien laissé).
- Migrations **0093 à 0117 en une seule transaction** (script hors dépôt, `prod/applique.py` du dossier de
  travail : il lit le jeton de gestion, donc non versionné). Après : mêmes chiffres, 13 charges migrées
  avec le bon mode et la bonne catégorie, 3 charges nouvelles (Coiffeur, Droguerie, Pharmacie), 2 relevés
  devenus factures, 0 clôture, propriétaire `postgres`, positions des recettes du cycle 0, 1, 2.
- Compte orphelin de Thauba (créé le 22/09, jamais de profil) et invitation expirée du 17/09 : supprimés
  (accord de Kamil du 22/10, sauvegarde faite avant). Prod : 1 compte, 1 profil, 1 foyer, 0 invitation.
- Fonction `invite` déployée (`--use-api`) ; `importer` l'était depuis le 21/10.
- Mails d'authentification en français poussés (PATCH `config/auth` : objets, modèles, expéditeur
  « Popote ») ; le modèle d'invitation de la prod, déjà français, n'a pas été touché.
- `main` poussé à 08d2cdd (fast-forward de `feat/budget-refait`), `npm run deploy` (bundle
  `index-BZBfibp7.js`). GitHub Pages a mis plus de dix minutes à servir le nouveau bundle (travail de
  déploiement resté en file d'attente chez GitHub) : un site « pas encore à jour » juste après `deploy`
  n'est pas une panne.
- Fumée prod : trois OK, aucune erreur.

**Contrôles avant la mise en ligne** : Vitest en série 156 fichiers / 2 828 tests, Playwright 166/166,
`vitest run src` 1 524, build, lint (11 avertissements anciens, 0 erreur), banc de migration `--tout` vert
(copie nue, 9 arrêts, 5 variantes), base locale rejouée de 0001 à 0117 sur un `db reset` neuf.

**Joué sur la prod après la mise en ligne (22/10)** :
- Parcours d'une invitée, sur le vrai site, avec un foyer et des adresses jetables (supprimés ensuite, la prod est
  revenue à 1 compte / 1 profil / 1 foyer) : l'hôte se connecte, crée l'invitation, le lien ouvre « Hôte t'invite »,
  l'invitée choisit son mot de passe, son compte naît confirmé, elle arrive dans le foyer, remplit son profil,
  atteint le hub, se déconnecte et revient avec son mot de passe. Le script vit hors dépôt
  (`.shots/prod-invitee.mjs`, non versionné : il lit la clé de service). Console propre ; le seul HTTP ≥ 400 est le
  404 du repli de GitHub Pages sur `/invite/<jeton>` (l'application s'affiche : `404.html`).
- Écrans du Budget sur les VRAIES données de Kamil, migrées, connecté comme lui (copie locale du banc, bundle de
  développement) : octobre « Il te reste 316,80 € sur 4 325 € de revenus, après 4 008,20 € de charges prévues »
  (22 lignes de la prod + 3 lignes créées à l'ouverture du mois : Droguerie 60, Coiffeur 30, Pharmacie 20, soit
  25 lignes), septembre 426,76 € (23 lignes, 3 898,24 €), charges, réglages, épargne, page de clôture de
  septembre : tous les totaux se recoupent à la main, aucune erreur de console.

**Reste** :
1. (fait) compte rendu du Budget : https://claude.ai/artifact/6bPixfrDyFTAMxte8BnfBe
2. **Branche par défaut du dépôt GitHub = `feat/lot-0a-1-schema-et-acces`, pas `main`** : un cron ne tourne que depuis elle,
   donc `reveil.yml` ne s'était jamais exécuté. Sans `gh` ni jeton perso, je ne peux pas changer le réglage : une COPIE du
   workflow (checkout de `main`) est posée sur cette branche (commit 516e3de), GitHub la liste « active ». **À vérifier le
   23/10 vers 8 h 20 (Paris)** : un run « Réveil de la base » doit exister (API publique des runs). Quand Kamil passera la
   branche par défaut sur `main`, supprimer la copie.
3. Safari/WebKit ne se joue pas sur ce poste (bibliothèques système absentes, `sudo` demande un mot de passe).

## Côté Kamil

- **Réinviter Thauba : PAS de feu vert tant que je ne l'ai pas dit.**
  - Décision de Kamil du 22/10 : il ne la réinvite qu'une fois que j'ai confirmé avoir testé tous les
    recoins avec le front, la base et de vraies actions. Elle a déjà buté trois fois avant même la
    page de création de compte.
  - Ce que je dois donc jouer APRÈS la mise en ligne, sur la vraie prod : tout le chemin d'une invitée
    (lien → mot de passe → foyer → écrans), en Chromium mobile ET en WebKit (Safari), avec un foyer
    jetable que je supprime ensuite, sans toucher au foyer de Kamil.
  - Le geste, plus tard : Réglages → Inviter → son e-mail → « Partager », ou « Copier le lien ».
  - Son compte orphelin de prod est nettoyé au moment de D1 (autorisé le 22/10, après sauvegarde) : le
    lien neuf lui fait créer son compte.
- **Les mails d'authentification sont en français** (commit 3a7d802, `supabase/templates/`). Kamil l'a
  demandé le 22/10 (« Fais-les en français non ? ») : lu comme le « vas-y pour les mails ». À D1, les
  envoyer en production (API de gestion, `PATCH /config/auth`, modèles + objets + nom d'expéditeur
  « Popote »). Si le contrôle de sécurité refuse encore, le dire à Kamil (tableau de bord :
  Authentication → Emails).

## Repères

- **Une seule base locale.** Les tâches qui y touchent ne tournent pas en parallèle.
- **Le serveur de dev recharge parfois la page tout seul.**
  - Il envoie `full-reload` (vu le 19/10). Un banc long y casse alors au hasard, ce qui
    n'arrive jamais sur l'appli construite.
  - La référence reste `npx playwright test` (build et preview).
  - Pour jouer un banc sur le serveur de dev, le lancer sur le port 4173 : `npm run dev
    -- --host 127.0.0.1 --port 4173 --strictPort`. Playwright le réutilise.
- **Hors ligne simulé.** `setOffline` ne coupe pas l'adresse locale dans Chromium. Couper
  plutôt la requête voulue : `page.route(…, r => r.abort('internetdisconnected'))`.
- **Ce poste intercepte le TLS de supabase.co** (Cloudflare Gateway). Chromium vers la
  prod demande `RESEAU_INTERCEPTE=1` (voir `scripts/fumee-prod.mjs`).
- **Lire la prod.** Passer par `q.py` (SQL en lecture seule) et l'API de gestion. Le jeton
  est dans `~/PERSO/supabase_token.txt` et ne s'affiche jamais.

## Répétition de l'arrivée de Thauba (22/10, copie locale des vraies données)
Arrivée au 01/09, revenu 2 500 € : reste d'octobre de Kamil 316,80 → 850,75 € (Thauba : 1 966,05 €, 533,95 € de charges),
septembre 426,76 → 462,55 € (ses 3 lignes confirmées restent à lui). Si Kamil clôt septembre AVANT : le mois reste clos,
et Thauba y lit « Le mois de septembre a été clôturé avant que ton revenu soit posé. Il ne te compte aucune part. »
(`clotureSansMoi`, `src/lib/budget/mois.ts`). Rien ne bouge avant novembre pour qui arrive en novembre (voir la correction du 23/10 plus bas : l'arrivée « par défaut » n'est PAS le 1er novembre, c'est la date d'inscription, que l'écran du profil relève désormais à la première arrivée du foyer).

## Remise à zéro du budget de la prod, et début en novembre (22/10, soir, à la demande de Kamil)
- **Demande de Kamil :** « tout me supprimer et faire en sorte que le budget commence en novembre ».
  Lue comme : vider TOUT le budget (pas la cuisine, pas les recettes). Sauvegarde complète avant :
  `~/PERSO/sauvegardes-popote/2026-10-22-avant-remise-a-zero/` (31 899 lignes, chmod go-rwx).
- **Fait en prod, en UNE transaction** (essai à blanc d'abord, rien n'a bougé ; puis réel) : `saisie`, `depense`
  (+ parts), `facture`, `releve_annuel`, `charge` (+ participants), `poche_epargne` (+ versements, postes),
  `enveloppe`, `compte`, `revenu`, `regle_partage`, `cloture` (+ choix) : tout à 0. Ne bougent pas : le catalogue
  de charges (52), les recettes (1 426), le cycle de cuisine, le profil, le foyer. Le script n'est pas versionné
  (`scratchpad/prod/remise-a-zero.sql`).
- **`entre_le` de Kamil : 2022-11-17 → 2026-11-01.** Sans cela son premier revenu aurait été remonté à novembre 2022
  par `tg_revenu_premier` (`least(…)` : il remonte à l'arrivée, jamais plus tard).
- **Code (commit 0d008eb, en ligne ensuite) :** `moisDeDepart` (`src/lib/budget/mois.ts`) : un revenu ou une charge
  posés avant l'arrivée prennent effet à l'arrivée ; hub « Commence en novembre » ; écran du mois « Pas encore »
  sans porte « Commencer » ; porte « Inviter quelqu'un » sur le hub quand on est seul (Kamil ne trouvait pas
  « Réglages » : l'avatar mène au profil, pas aux réglages). Banc : `e2e/inviter-et-novembre.spec.ts`.
- **Revue adverse neuve, avant l'arrivée de Thauba** : rien de bloquant ; deux défauts réels d'affichage (le hub lisait
  « Il te reste 2 400 € en octobre » à une invitée qui arrive le 1er novembre ; « Octobre est à clôturer » sur un mois
  qui n'est pas le sien), tous deux corrigés ci-dessus parce que son revenu n'est plus daté d'octobre. Reste, non
  corrigé : la phrase « n'étais pas encore » (corrigée au présent), la liste « manquants » des réglages du budget
  (cosmétique), et la page `/cloture/<mois clos>` d'une personne sans revenu ni part (atteignable par URL seulement).
- **Piège pour la suite :** le premier revenu qu'il pose AVANT le 1er novembre prend effet en novembre (bon) ; une
  charge posée avant aussi. Mais `tg_revenu_premier` garde `least(valid_from, arrivée)` : une arrivée à venir ET un
  revenu daté du passé reste daté du passé (le front ne le fait plus, la base l'accepterait encore).

## Seconde revue adverse, et ce qu'elle a fait corriger (23/10)
- **Dictée contournait `moisDeDepart`** : `debut` vide pour une charge mensuelle → octobre pour qui n'entre qu'en novembre
  (compté dans le total d'octobre ; et si Thauba arrivait avant le 1er novembre, la base ouvrait octobre avec 100 % des
  parts sur elle). Corrigé en UN endroit : `useAjouteCharge` borne `debut` à l'arrivée (`arrivee` passée par le
  formulaire ET la dictée). Une date tapée à la main avant l'arrivée est donc aussi relevée à l'arrivée.
- **L'arrivée « par défaut » de Thauba n'était PAS le 1er novembre** : `user_profile.entre_le` vaut `current_date`
  (0049) ; invitée le 23/10 sans toucher au champ, elle serait entrée en octobre. L'écran du profil propose maintenant
  `arriveeParDefaut` : jamais avant la première arrivée du foyer (donc le 01/11 tant que Kamil y est), modifiable ; si
  un revenu est déjà posé, la date de la base reste celle affichée.
- **Porte « Inviter quelqu'un » des réglages du budget** : arrive sur la section (`/reglages#inviter`).
- **Gardes d'arrivée** : « Octobre est à clôturer » (hub) et le bandeau de clôture de l'écran du mois exigent que le mois
  soit celui de la personne (`estLaCeMois`), même si un revenu y est daté (cas : profil enregistré en octobre, arrivée
  repoussée ensuite à novembre ; `tg_entre_le_refige` ne déplace pas un revenu quand l'arrivée avance).
- Bancs : `arriveeParDefaut` (3 tests), `e2e/inviter-et-novembre.spec.ts` (+2 : charge au début antérieur, profil de
  l'invitée) ; les deux échouent sans le correctif.
- **Réveil quotidien** (`reveil.yml`) : à 07:13 UTC le 23/10, toujours 0 exécution (cron prévu 06:17 UTC) ; le workflow
  est actif des deux côtés. À revérifier ; GitHub retarde souvent la première exécution d'un cron neuf.
