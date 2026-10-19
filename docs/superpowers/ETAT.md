# Finaliser Popote : où on en est

Mis à jour le 19/10/2026. Kamil : « il faut finaliser ce projet qui date depuis un
MOMMMMMMENT ». Ses décisions du jour (en mémoire : `decisions-du-19-octobre`) :

1. **Invitation : le lien suffit.** Pas de mail, le compte naît sur le lien.
2. **Budget : on code maintenant**, sans plus de tours de relecture de la spec.
3. **Recettes : les 5 points tels quels** (relecture des 1 426 pages accordée).
4. **Prod : je déploie après tests verts** (migrations, fonctions, site, push), jamais
   au nom de Thauba.
5. **À la fin, tout tester** : parcours complet d'un vrai compte depuis l'invitation,
   rendu comparé aux maquettes, tous les parcours de l'app.
6. **Le projet Supabase ne doit plus s'endormir** : réveil quotidien gratuit.

Et sa règle de méthode (19/10, après-midi) : **on ferme chantier par chantier**, avec
de vrais tests au navigateur — serveur lancé, clics, captures regardées, et la base
relue pour vérifier que les comptes existent vraiment. Pas que des tests unitaires.

## Chantier 1 · Inscription et invitation — FERMÉ le 19/10

Banc : `e2e/inscription.spec.ts`, 8 parcours au clic, capture à chaque écran
(`.shots/inscription/`, `journal.json` relie chaque capture à ce que disait la base).
Joué sur le serveur de dev et sur l'appli construite. Compte rendu avec les captures :
https://claude.ai/artifact/JKzrwPqxTw7w8DuJ4BGEkU

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

Vérifié en prod sans rien y écrire : base `ACTIVE_HEALTHY`, `invite` et `accept-invite`
déployées (`verify_jwt` faux, la clé publique passe), connexion par mot de passe ouverte
(min 8, sans captcha), création de foyer déjà fermée (0070 la referme d'elle-même).

Tests au 19/10 : `npm run build` et `npm run lint` passent, 858 tests de la base, 83
bancs navigateur sur l'appli construite. Il faut `npx supabase functions serve` à côté,
sinon les tests d'invitation échouent.

## Côté Kamil

- **Réinviter Thauba : feu vert.** Réglages → Inviter → son e-mail → « Partager » (ou
  « Copier le lien »). Son compte existe déjà (l'ancien mail du 17/09) : le lien lui pose
  son mot de passe et la fait entrer. Sa date d'arrivée sera réglée au 1er novembre par
  défaut : si elle habite déjà là, qu'elle la corrige sur son profil.
- **Les mails de connexion et de réinitialisation** sont encore les modèles anglais
  de Supabase, expéditeur « Batch cooking ». Ils ne servent plus à l'invitation. La
  modification par l'API a été bloquée par le contrôle de sécurité : il faut son accord
  explicite (« vas-y pour les mails »), ou qu'il les change dans le tableau de bord
  (Authentication → Emails).

## Ensuite, dans l'ordre, chacun fermé comme le chantier 1

1. **Recettes** (migration 0092) : spec et plan ÉCRITS le 19/10, pas encore relus ni
   committés (`docs/superpowers/specs/2026-10-19-recettes-design.md`,
   `docs/superpowers/plans/2026-10-19-recettes.md`, 25 tâches TDD). Choix du rédacteur,
   annoncés à Kamil : temps actif compté sur toutes les étapes (les temps montent,
   19 → 33 min) ; une recette à 0 min dit « Gestes non comptés » et passe en fin de tri ;
   l'en-tête garde « ← Accueil » ; « Avec ce que j'ai » cherche dans tout le catalogue.
   Point ouvert, non bloquant : « Au four 30 minutes » (sans verbe) compte encore comme
   du travail. La relecture des 1 426 pages en prod écrit `image_url`, que seul le rôle
   de service peut écrire. Ensuite : relire le plan, coder, fermer comme le chantier 1.
2. **Budget** (migrations à partir de 0093) : plan en cours d'écriture
   (`docs/superpowers/plans/2026-10-19-budget.md`, spec
   `docs/superpowers/specs/2026-10-01-ecran-budget-design.md`). Lots 1 et 2, puis 3
   (clôture), puis 4 (à deux), chacun déployé. ⚠️ `delete_my_account` a été redéfinie
   en 0090 : le lot qui la réécrit part de celle-là.
3. **Le grand test final** : tous les parcours de l'app, captures comparées aux
   maquettes (`docs/superpowers/maquettes/captures/`).

## Repères

- Une seule base locale : les tâches qui y touchent ne tournent pas en parallèle.
- **Le serveur de dev recharge parfois la page tout seul** (le serveur envoie
  `full-reload`, vu le 19/10) : un banc long y casse au hasard, jamais sur l'appli
  construite. La référence reste `npx playwright test` (build + preview) ; pour jouer
  un banc sur le serveur de dev, le lancer sur le port 4173 (`npm run dev -- --host
  127.0.0.1 --port 4173 --strictPort`), Playwright le réutilise.
- Hors ligne simulé : `setOffline` ne coupe pas l'adresse locale dans Chromium ; couper
  la requête voulue avec `page.route(…, r => r.abort('internetdisconnected'))`.
- Ce poste intercepte le TLS de supabase.co (Cloudflare Gateway) : Chromium vers la
  prod demande `RESEAU_INTERCEPTE=1` (voir `scripts/fumee-prod.mjs`).
- Lire la prod : `q.py` (SQL en lecture seule) et l'API de gestion, jeton dans
  `~/PERSO/supabase_token.txt`, jamais affiché.
