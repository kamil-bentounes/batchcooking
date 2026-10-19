# Finaliser Popote : où on en est

Mis à jour le 19/10/2026, vers 15 h. Le travail s'est arrêté là, à la demande de Kamil :
« Tu peux arrêter tout stp ? Et mettre dans un plan tout ce qui reste ? On finira plus
tard. »

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

1. Le dépôt est sur la branche **`feat/recettes`**, poussée sur `origin`. `main` n'a pas
   changé depuis le chantier 1.
2. Pour les bancs :
   - relancer `npx supabase start`, si la pile locale est arrêtée ;
   - lancer `npx supabase functions serve` en fond, sans quoi les tests d'invitation
     échouent.
3. Chantier 2, dans cet ordre :
   1. faire les corrections des relectures (liste plus bas) ;
   2. relancer la relecture de la tâche 2 ;
   3. reprendre les tâches 6 et 7, mises de côté ;
   4. puis les tâches 8 à 24.

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

## Chantier 2 · Recettes — EN COURS sur `feat/recettes`, rien en prod

La spec est `docs/superpowers/specs/2026-10-19-recettes-design.md`. Le plan, en 25
tâches, est `docs/superpowers/plans/2026-10-19-recettes.md` ; chaque tâche y a sa section
`### Tâche N`, avec son code complet.

Deux relectures adverses du plan ont eu lieu avant le code. Elles n'ont trouvé aucun
bloquant. Leurs corrections sont **à la fin du plan** (« Amendements… ») et priment sur
le texte des tâches.

### Fait

| Tâche | Commit | Relecture |
|---|---|---|
| 1 · titres nettoyés, entités décodées (`src/lib/recettes/texte.ts`) | 5718164 | approuvée, 2 retouches mineures |
| 2 · la photo du JSON-LD (`worker/src/jsonld.ts`) | 86c97f5 | interrompue : à relancer |
| 3 · les gestes d'une étape (`gestesMin`, `worker/src/etape.ts`) | 1a2e813 | à corriger |
| 4 · une part plausible (`plausible`, `src/lib/nutrition/macros.ts`) | 0f5c72f | à corriger, un point mineur |
| 5 · le temps des mains (`src/lib/recettes/temps.ts`) | 1e39299 | à corriger, des tests manquent |
| Vitest ignore `.claude/`, où vivent les worktrees des agents | 0a2885e | — |

Au 19/10, les 1 363 tests purs passent (`npx vitest run --fileParallelism=false src/lib
worker/test`), et `npm run build` aussi. La base locale est en 0091 : la migration 0092
n'y est pas appliquée.

### Corrections à faire avant de continuer

Chaque correction commence par un test rouge.

- **Tâche 1**
  - Ne pas décoder une entité numérique de la plage 0xD800–0xDFFF : `&#55357;` et
    `&#xD83D;` restent tels quels.
  - Écrire la classe des diacritiques en échappements, `[̀-ͯ]`, et non en
    caractères invisibles.
- **Tâche 4.** La borne de densité s'écrit sans division : `k * 100 <=
  PART_PLAUSIBLE.densiteMax * g`.
- **Tâche 5**
  - Tester `enTout` :
    - total du site égal au temps actif → le total du site ;
    - total du site à 0 → la somme des étapes ;
    - étape passive dont les gestes dépassent la durée → la somme compte au moins les
      gestes ;
    - l'arrondi au dixième.
  - Tester `tempsActif([])` → 0.
  - `nombre()` rend 0 pour NaN.
  - Ne pas toucher à l'arrondi : durées et gestes sont déjà au dixième à la source
    (`etape.ts:365` et `440`).
- **Tâche 3**, `gestesMin`. Voici les cas faux relevés par la relecture et que la § 10
  de la spec ne couvre pas :

  | Étape | Obtenu | Attendu |
  |---|---|---|
  | « Mélangez farine, sucre, beurre, œufs. » | 3 | 1 |
  | « Ne pas mélanger. » | 1 | rien |
  | « Faites cuire sans trop remuer. » | 1 | rien |
  | « Laissez mijoter en les remuant. » | rien | 1 |
  | « La casserole retirée du feu, ajoutez la crème. » | 2 | 1 |
  | « Sans retirer du feu, remuez. » | 2 | 1 |
  | « Avant de retirer du feu, ajoutez le sel. » | 2 | 1,5 |

  Les règles à poser :
  - une négation (« ne pas », « sans trop ») écarte le verbe : enjamber `trop`,
    `jamais`, `bien` et `surtout`, et écarter après `pas`, `plus`, `jamais` ;
  - le gérondif compte aussi avec un pronom entre les deux (« en les remuant ») ;
  - les verbes de plusieurs mots (« retirer du feu ») suivent la même grammaire
    (participe, « sans », « avant de ») ;
  - une liste de noms sans article ne fait pas de chaque nom un verbe au « tu » ;
  - **lenteur** : `analyserEtape` passe de 0,05 à 2,6 ms par étape, parce que le texte
    est redécoupé pour chacun des ~47 verbes. Découper et plier le texte une seule fois
    par appel.
- **Tâche 2.** Relancer sa relecture : graphes imbriqués, `//cdn…`, `data:`, cycles
  d'`@id`, `&` légitimes dans les ingrédients.

### Mis de côté (`git stash list`)

- « wip recettes tâche 6 (ingere) » : le début de la tâche 6.
- « wip recettes tâche 7 (banc tests/recettes.test.ts) » : le banc de la migration, rouge.

On peut les reprendre (`git stash pop`), ou refaire ces tâches depuis le plan.

### Reste, dans l'ordre

1. **Les tâches 6 à 23 du plan.** Les tâches pures peuvent tourner en parallèle, une seule
   tâche en base à la fois.
   1. Tâche 6 : l'ingestion.
   2. Tâche 7 : la migration 0092. Elle s'applique avec `npx supabase migration up --local
      --include-all`, jamais `db reset`.
   3. Tâche 8 : l'import d'une recette collée.
   4. Tâche 9 : la relecture, côté pur. Un domaine est aussi laissé après cinq erreurs de
      suite.
   5. Tâche 10 : le script `relis-photos`.
   6. Tâche 11 : `recalcule`, avec ses passes T et G.
   7. Tâche 12 : la pagination et la fiche, côté pur.
   8. Tâche 15 : les bancs navigateur rouges. Elle passe AVANT la 13.
   9. Tâche 13 : le catalogue léger.
   10. Tâche 14 : `useFiche`.
   11. Tâche 16 : les jetons, les pictos, la photo.
   12. Tâche 17 : la vignette et la pagination.
   13. Tâche 18 : la fiche (i).
   14. Tâche 19 : les filtres et la carte encre.
   15. Tâche 20 : l'écran Choisir.
   16. Tâche 21 : tout vert.
   17. Tâche 22 : la doc.
   18. Tâche 23 : la revue adverse et les mutations.
2. **Fermer le chantier comme le chantier 1.**
   - Écrire un banc `e2e/recettes.spec.ts`, joué au clic, avec une capture à chaque
     écran et la base relue après chaque geste. Il couvre :
     - l'ajout depuis la liste et depuis la fiche, les parts, « Retirer » ;
     - les filtres, la recherche sans accents, la pagination, « Avec ce que j'ai » ;
     - l'image neutre ;
     - une recette collée.
   - Le jouer sur le serveur de dev ET sur l'appli construite.
   - Comparer les captures à la maquette : `docs/superpowers/maquettes/captures/recettes-*.png`,
     non versionnées (`node docs/superpowers/maquettes/captures.mjs` les refait).
   - Publier une page de compte rendu.
3. **Tâche 24, la mise en ligne** (§ 12 de la spec et amendements) :
   1. `migration list`, puis `db push --dry-run`, puis `db push` ;
   2. déployer la fonction `importer` ;
   3. **avant le recalcule**, une sauvegarde en lecture seule des titres, des temps et
      des macros, hors de `/tmp` ;
   4. le recalcule à sec, lu, puis le vrai ;
   5. la requête de cohérence, qui doit rendre 0 ;
   6. le site ;
   7. la relecture des photos à sec sur 20 pages, puis la vraie (35 à 50 min) ;
   8. les comptes.

   Elle demande la clé de service de la prod, qui n'est pas dans `.env.production` : la
   lire par l'API de gestion, sans jamais l'afficher.

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
