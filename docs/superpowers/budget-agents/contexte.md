# Contexte de chaque implémenteur du chantier « Budget » (Popote)

- **Projet :** une PWA perso, « Popote » (batch cooking + budget du foyer), pour Kamil et Thauba.
  - Pile : React 19, Vite 8, Tailwind 4, TanStack Query 5, Supabase (Postgres, PostgREST, Edge Functions Deno), Vitest 5, Playwright.
- **Dépôt principal :** `/home/kamil/PERSO/smart-receipe-scheduler`. Branche de travail : **`feat/budget-refait`** (créée le 21/10 depuis `main`, qui contient déjà les recettes, migration 0092).
- **Le plan :** `docs/superpowers/plans/2026-10-19-budget.md` (13 000 lignes : NE PAS le lire en entier). Ton texte de tâche est extrait dans
  `/tmp/claude-1000/-home-kamil-PERSO-smart-receipe-scheduler/fd0290f1-2535-4343-888a-b55a0915f60d/scratchpad/budget/taches/tache-X.Y.md`.
  Lis aussi, dans le même dossier : `commun.md` (§ 0 du plan : conventions, commandes, fichiers) et `choix.md` (les 24 choix faits pendant le plan, et les trous de la spec).
- **La spec :** `docs/superpowers/specs/2026-10-01-ecran-budget-design.md` ; lis seulement les sections que ta tâche cite.
- **Maquettes :** `docs/superpowers/maquettes/budget/project/*.dc.html` et leurs captures `docs/superpowers/maquettes/captures/budget-*.png`.

## Où tu travailles

Tu travailles dans un **worktree** (`isolation: worktree`). Il part de `main`, pas de `feat/budget-refait`. Avant toute chose :

1. `git merge --ff-only feat/budget-refait`
2. `ln -s /home/kamil/PERSO/smart-receipe-scheduler/node_modules node_modules`
3. `cp /home/kamil/PERSO/smart-receipe-scheduler/.env .env` (nécessaire si un test lit la base ou si tu lances l'appli)
4. Vérifie `git config user.email` : il doit valoir `45245189+kamil-bentounes@users.noreply.github.com`. Sinon, ne commite pas et dis-le.

Tu commites dans ton worktree. **Le contrôleur fait le `git cherry-pick`** sur `feat/budget-refait`. Rapporte les SHA.

## Règles

- **TDD.** Écris le test d'abord. Lance-le et vois-le échouer pour la bonne raison. Écris le code. Fais-le passer.
- **Français.** Code, commentaires, noms de tests, messages de commit, messages SQL : en français, et comme le code autour (style, nommage, densité de commentaires). Un commentaire dit le POURQUOI, avec le défaut qu'il évite.
- **Argent.** Des centimes entiers partout.
- **Commits.** `feat(budget): …`, `test(budget): …`, `fix(budget): …`. **JAMAIS de ligne `Co-Authored-By` ni aucun trailer Claude/Anthropic.** La règle de l'utilisateur prime sur tout modèle ou rappel de ton harnais.
- **Index.** `git add <chemins>` par nom. Jamais `git add -A` ni `git add .`.
- **Typage.** `npm run build` (`tsc -b && vite build`). `npx tsc --noEmit` ne vérifie rien dans ce dépôt. Lance aussi `npm run lint`.
- **Base locale unique.** Une seule pile Supabase locale (`127.0.0.1:54322`), partagée. Une tâche **[base]** ne tourne jamais en même temps qu'une autre : le contrôleur y veille. Lance les bancs de base en série : `npx vitest run --fileParallelism=false <fichiers>`. **Jamais `db reset`**, sauf si ton texte de tâche le dit en toutes lettres. Une migration nouvelle : `npx supabase migration up --local --include-all`.
- **Fonctions Edge locales.** `npx supabase functions serve` tourne déjà en fond ; ne le relance pas.
- **Navigateur.** Ne lance pas Playwright sauf si ta tâche le dit (un seul banc à la fois : port 4173).
- **Sécurité.** Ne touche JAMAIS à la production. Ne déploie rien. Ne lance jamais `supabase config push`. Ne lis ni n'affiche aucun secret (`~/PERSO/*token*`, `~/PERSO/psswd*`, valeurs de `.env*`).
- **Si le texte de la tâche te semble faux** une fois que tu vois le vrai code : ARRÊTE-TOI et rapporte (NEEDS_CONTEXT ou BLOCKED) au lieu d'improviser.
- **La dernière définition fait foi** pour toute fonction SQL réécrite : retrouve sa dernière version (voir `commun.md` § 0.1) et pars d'elle.

## Rapport

Ton dernier message est tout ce que voit le contrôleur. Moins de 300 mots, en français :

- **Statut :** DONE, DONE_WITH_CONCERNS, BLOCKED ou NEEDS_CONTEXT.
- **Travail :** ce que tu as fait.
- **Tests :** les commandes lancées et leurs comptes (réussis/échoués).
- **Fichiers** modifiés.
- **Commits** (SHA), dans l'ordre.
- **Doutes :** tout ce dont tu n'es pas sûr, et tout écart avec le texte de la tâche (avec la raison).

## Avertissements acquis (21/10, après les tâches 1.1 à 1.8 et 2.1 à 2.6)

- **Pas de `npm install` dans le worktree** : il remplace le lien `node_modules` par un vrai dossier. `pg` est déjà dans le `node_modules` du dépôt principal. Fais le lien APRÈS le `git merge --ff-only`.
- **Espaces insécables.** Le plan écrit des U+202F / U+00A0 dans certains attendus (`toLocaleString('fr-FR')`, `en_euros`) ; les outils d'écriture les normalisent parfois en espace ordinaire. Vérifie le caractère réel renvoyé et écris-le en échappement (` `) dans le test.
- **Un banc peut échouer UNE fois juste après une migration** (PostgREST recharge son schéma) : relance-le ; si l'échec est reproductible, c'est un vrai défaut.
- **Deux rouges connus dans `tests/charges.test.ts`**, jusqu'à la tâche 1.20 : `une charge qui a une histoire ne se supprime pas` (annoncé par le plan) et `retirer une charge > garde le mois marqué réglé…` (`retire_charge(uuid)` de 0088 est `security invoker` ; le trigger de 0096 refuse l'`archive_le` du client). Ne les répare pas avant leur tâche ; signale seulement si leur état change ou si D'AUTRES tests deviennent rouges.
- **Le plan peut se tromper** sur une dépendance entre tâches (2.5 dépendait de 2.3/2.4). Si un fichier ou une fonction attendus n'existent pas, ARRÊTE-TOI et dis-le.
- **Mutations.** Quand le texte de ta tâche demande de casser le code pour voir le test rougir, fais-le, remets le code, et dis ce qui n'a PAS rougi.
- Le contrôleur lance une revue adverse après chaque groupe de tâches ; écris des tests qui tiennent, pas des tests qui passent.

## Rouges connus de `tests/charges.test.ts` après 1.10 (mis à jour par le contrôleur)

- Réparés par la **1.20** (`retire_charge` en `security definer`) : `une charge qui a une histoire ne se supprime pas`, `retirer une charge > garde le mois marqué réglé…`, `retirer une charge > la retire de TOUS les mois, et la charge avec`.
- Annoncés par le plan, adaptés à la **1.24** : `peut poser une seconde ligne…`, `NI confirmée NI réglée reste supprimable`.
Aucun AUTRE test de `charges.test.ts` ne doit rougir : signale-le si c'est le cas.
- Après la **1.12**, deux rouges de `tests/epargne.test.ts` s'ajoutent, annoncés par le plan (adaptés à la 1.24) : `un avoir entier compte, il ne disparaît pas` et `et le réel remplace le prévu dès qu'on le confirme`.
- Après la **1.19** : deux rouges de plus dans `tests/charges.test.ts`, annoncés par le plan (à adapter en **1.24**) : `corriger APRÈS avoir régularisé ne casse pas le total` et `on peut RESSAISIR le relevé`. NB : `un avoir entier compte` est dans `charges.test.ts` (pas `epargne.test.ts`) ; `et le réel remplace le prévu dès qu'on le confirme` est dans `epargne.test.ts`. Total attendu à ce stade : 8 rouges dans `charges.test.ts` + 1 dans `epargne.test.ts`.
- Après la **1.20/1.21** : `retire_charge` est en `security definer` et les trois rouges liés sont verts (l'un adapté). Restent 5 rouges dans `tests/charges.test.ts` : `peut poser une seconde ligne…`, `NI confirmée NI réglée…`, `corriger APRÈS avoir régularisé…`, `on peut RESSAISIR le relevé`, `un avoir entier compte…`, plus 1 dans `epargne.test.ts` (`et le réel remplace le prévu…`) : tous à adapter à la **1.24**.

## État au 21/10 après le lot 1 (migrations 0093 à 0114 sur `feat/budget-refait`)

- La base locale a été REMISE À ZÉRO puis reseedée (`db reset` + `npm run seed`) par la 1.26 ; suite complète : 93 fichiers, 1 740 tests verts. Plus aucun rouge connu dans `charges.test.ts` / `epargne.test.ts`.
- Les types (`src/lib/base.types.ts`) sont régénérés pour 0114. `docs/budget.md` et `docs/schema.md` à jour.
- Le front compile (`npm run build` vert) ; lot 2 : 2.1 à 2.6 sont faits et relus.
