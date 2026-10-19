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

## Fait et en prod

| Quoi | Commit | En prod |
|---|---|---|
| Invitation par lien seul (`Rejoindre`, `invitation_par_jeton`, `accept-invite` qui crée le compte, plus de mail) | f59b064 | migration 0089, fonctions `invite` et `accept-invite`, site |
| Le hub relit le foyer après le profil (avatar vide, « Complète ton profil ») | ad5591a | site |
| Supprimer son compte avec un compte perso (échouait pour Kamil) | 909ba7e | migration 0090 |
| La mesure de couverture se construit de nouveau | d9cd539 | — |
| Réveil quotidien de la base (GitHub Actions, 06:17 UTC) | d4d630a | poussé sur `main` |
| Maquettes du Budget et des recettes remises dans le dépôt | bda37ab | — |
| Fumée de la prod en lecture seule (`node scripts/fumee-prod.mjs`) | cec159e | — |

Le 19/10, le projet Supabase était **en pause** (`INACTIVE`) : l'appli en ligne était
morte pour tout le monde. Réveillé le jour même.

Tests au 19/10 : `npm run build` et `npm run lint` passent, 858 tests de la base, 75
bancs navigateur (dont 7 d'invitation), tous verts. Il faut `npx supabase functions
serve` à côté, sinon les tests d'invitation échouent.

## Côté Kamil

- **Réinviter Thauba** : son invitation du 17/09 a expiré le 17/10. Dans Réglages →
  Inviter, puis « Partager » le lien. Son compte existe déjà, sans foyer : le lien lui
  pose son mot de passe et la fait entrer.
- **Les mails de connexion et de réinitialisation** sont encore les modèles anglais
  de Supabase, expéditeur « Batch cooking ». La modification par l'API a été bloquée
  par le contrôle de sécurité : il faut son accord explicite, ou qu'il les change dans
  le tableau de bord (Authentication → Emails).
- Une fois Thauba entrée : refermer la création de foyer (`docs/dev.md`).

## En cours

- **Plan du Budget** : `docs/superpowers/plans/2026-10-19-budget.md` (agent). Spec :
  `docs/superpowers/specs/2026-10-01-ecran-budget-design.md`. Migrations à partir de
  0092. ⚠️ `delete_my_account` a été redéfinie en 0090 : le lot qui la réécrit part
  de celle-là.
- **Spec et plan des recettes** : `docs/superpowers/specs/2026-10-19-recettes-design.md`
  et `docs/superpowers/plans/2026-10-19-recettes.md` (agent). Migration 0091.

## Ensuite, dans l'ordre

1. Recettes : implémentation (worker `image_url`, titres, temps actif ; écran Choisir
   liste B paginée, fiche (i), pictos), relecture des 1 426 pages en prod, déploiement.
2. Budget : lots 1 et 2, puis 3 (clôture), puis 4 (à deux), chacun déployé.
3. Le grand test final : un banc qui suit un vrai compte de l'invitation jusqu'au bout
   de chaque écran, les captures comparées aux maquettes
   (`docs/superpowers/maquettes/captures/`), et tous les parcours de l'app.

## Repères

- Une seule base locale : les tâches qui y touchent ne tournent pas en parallèle.
- Ce poste intercepte le TLS de supabase.co (Cloudflare Gateway) : Chromium vers la
  prod demande `RESEAU_INTERCEPTE=1` (voir `scripts/fumee-prod.mjs`).
- Lire la prod : `q.py` (SQL en lecture seule) et l'API de gestion, jeton dans
  `~/PERSO/supabase_token.txt`, jamais affiché.
