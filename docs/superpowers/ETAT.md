# Finaliser Popote : où on en est

Mis à jour le 20/10/2026, vers 17 h. Le code du chantier 2 (Recettes) est fini, relu et
vérifié sur la branche `feat/recettes`. Il reste sa mise en ligne (tâche 24), qui demande
l'accès à la prod : voir « Reprendre ici ».

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

1. Le dépôt est sur la branche **`feat/recettes`**, poussée sur `origin`, 90 commits devant
   `main` (85eb7fb), qui est un ancêtre : le passage de `main` se fait en avance rapide.
2. **Chantier 2 (Recettes) : code terminé le 20/10.** Vérifié, seul sur la base et sur le port
   4173 : `npm run build` vert, `npm run lint` sans erreur, 65 fichiers et 1 493 tests (purs et
   base), 99 bancs navigateur sur l'appli construite, le banc de clôture `e2e/recettes.spec.ts`
   (10 parcours) aussi sur le serveur de dev. Deux relectures adverses indépendantes, les
   mutations du code (28, deux trous comblés) et de la base (4, toutes attrapées).
3. **Reste : la tâche 24, la mise en ligne**, puis la page de compte rendu. Voir plus bas. Elle
   demande des accès à la prod : le contrôle de sécurité de Claude Code a refusé une lecture de
   la prod le 20/10 (« Production Reads »). Kamil doit l'autoriser (règle de permission, ou un
   « go prod » dans la conversation), ou jouer lui-même les étapes.
4. Pour les bancs : relancer `npx supabase start` si la pile locale est arrêtée, et `npx supabase
   functions serve` en fond (sans lui, les tests d'invitation échouent : 503).
5. Ensuite, chantier 3 (Budget) : son plan est prêt.
6. Deux `git stash` sont devenus inutiles (« wip recettes tâche 6 » et « tâche 7 » : le travail est
   refait et livré). Les retirer avec `git stash drop` deux fois ; l'effacement a été refusé le 20/10
   par le contrôle de sécurité, donc à lui de le faire.

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

## Chantier 2 · Recettes — CODE FINI le 20/10 sur `feat/recettes`, pas encore en prod

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

### Reste : la tâche 24, la mise en ligne (par le contrôleur)

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

## Chantier 3 · Budget — plan écrit et relu, pas commencé

Le plan est `docs/superpowers/plans/2026-10-19-budget.md`, en 56 tâches, avec les
migrations 0093 à 0115.

- **D1** met en ligne les lots 1 et 2 : le modèle et l'écran du mois.
- **D2** met en ligne le lot 3 : la clôture.
- **Le lot 4**, à deux, n'est pas planifié : sa spec viendra quand Thauba sera dans le
  foyer.

Le plan liste à sa fin les 24 choix faits en l'écrivant. Trois sont à montrer à Kamil
le moment venu :

- « Il te manque » sera en safran et non en ocre : l'ocre ne fait que 2,4:1 sur la carte
  encre ;
- les photos santé, impôts et autre se choisissent pendant le code, sauf s'il veut les
  choisir lui-même ;
- avant D1 :
  - 0092 doit déjà être en prod (le script de D1 refuse sinon), donc les recettes partent
    d'abord ;
  - si ses données ont bougé depuis le 01/10, les chiffres attendus de la migration
    changent : les lui montrer avant de la lancer.

## Chantier 4 · Le grand test final

Il passe par tous les parcours de l'app et compare les captures aux maquettes
(`docs/superpowers/maquettes/captures/`).

## Côté Kamil

- **Réinviter Thauba : feu vert.**
  - Le geste : Réglages → Inviter → son e-mail → « Partager », ou « Copier le lien ».
  - Son compte existe déjà, depuis l'ancien mail du 17/09 : le lien lui fait choisir son
    mot de passe et la fait entrer.
  - Sa date d'arrivée sera réglée au 1er novembre par défaut. Si elle habite déjà là,
    elle la corrige sur son profil.
- **Les mails de connexion et de réinitialisation** sont encore les modèles anglais de
  Supabase, avec l'expéditeur « Batch cooking ». Ils ne servent plus à l'invitation.
  - Le contrôle de sécurité a bloqué leur modification par l'API.
  - Il faut donc son accord explicite (« vas-y pour les mails »), ou qu'il les change
    lui-même dans le tableau de bord (Authentication → Emails).

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
