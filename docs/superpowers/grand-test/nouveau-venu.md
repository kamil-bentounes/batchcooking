# Grand test, parcours A — « le nouveau venu » (22/10/2026)

Joué sur le build servi (`vite preview`, mode development, port 4173), Pixel 7, 390 × 844, `fr-FR`, `Europe/Paris`
(l'écran d'invitation et la connexion aussi à 360 px : aucun défilement horizontal). Base locale remise à zéro,
foyer d'amorce solo (Kamil), Thauba invitée par lien, puis son compte supprimé par l'interface.
152 captures prises (`.shots/nouveau-venu/`, non versionné), réseau et console écoutés sur tout le parcours.

## Bugs trouvés et corrigés

| Gravité | Où | Ce qu'on voyait | Cause | Correctif |
|---|---|---|---|---|
| P2 | Réglages → Inviter | Sa propre adresse (ou celle d'une membre) : « Invitation créée, envoie-lui ce lien », lien inutile | `invite` ne regardait pas si l'adresse était déjà dans le foyer | `0a5582f` : 409 « Cette personne est déjà dans ton foyer. » |
| P2 | Réglages → Inviter | Double clic : « duplicate key value violates unique constraint "invitation_pending_unique" » sous un lien valide | deux requêtes concurrentes, la seconde heurte l'index unique ; bouton jamais désactivé | `0a5582f` : la fonction rend le lien gagnant ; le bouton s'éteint pendant l'envoi |
| P2 | Profil (arrivée) | Revenu « 999 999 999 » accepté par le champ, « noté », puis `value "99999999900" is out of range for type integer` en anglais — et le prénom déjà écrit | `enCentimes` allait à 9 chiffres, les colonnes sont des `integer` | `8331279` : 7 chiffres ; une phrase quand le montant est illisible ; prénom borné à 40 |
| P2 | Budget septembre / clôture, vu par Kamil ET par elle | Elle entre le 1er octobre : en septembre Kamil lisait « Thauba n'a pas encore dit son revenu : parts égales » (faux, elle n'a aucune part) ; elle, « Ajoute ton revenu de septembre pour clôturer septembre » (cul-de-sac) | le front comptait tous les membres actuels, sans `entre_le` | `44a2be5` : `estLaCeMois`, `membresSansRevenu`, porte `pas-encore-la` |
| P3 | `/peser` | `GET /weighing?food_id=eq.` → 400 à chaque ouverture | `usePesees('')` sans `enabled` | `3c083e9` |
| P2 | Réglages → Changer mon mot de passe | Écran sans aucune sortie | `Password` n'a ni barre ni retour (voulu pour l'écran obligatoire) | `7b6e2b5` : bouton « ‹ Réglages » seulement depuis les réglages |
| P2 | Session perdue en cours de geste | « Aucun foyer. » (ou `permission denied for function …`) alors que c'est la session qui manque | requêtes parties avec la clé anonyme, 401 lu comme « pas de foyer » | `f7b09d9` : le 401 « sans jeton » ramène à la connexion, « Ta session a expiré » |
| P2 | Charges → ajouter « Salle de sport » | Charge perso (une seule participante) enregistrée COMMUNE : comptée dans « Commun » pour Kamil, et toute 3e personne y entrerait | `commune` pré-cochée `|| membres.length > 1`, case invisible à deux | `db1e1cd` : `communeDeLaCharge` |
| P2 | Réseau coupé | Connexion : « E-mail ou mot de passe incorrect » ; mot de passe oublié : « le lien vient de partir » ; inviter, accepter, profil : « Failed to fetch » | panne de `fetch` traitée comme une réponse | `d25dec9` : `Pas de réseau : vérifie ta connexion, puis réessaie.` |
| P3 | Objectifs | Curseurs de 16 px de haut | — | `51bbe16` : 44 px |

Banc de non-régression : `e2e/nouveau-venu.spec.ts` (6 tests, `d0d8221`).

## À arrêter : défauts de la base (migrations 0093–0115 non touchées)

1. **P1, argent — `delete_my_account` (0112) ne repartage pas les mois ouverts.** Thauba (entrée le 01/09, revenu 2 400,50 €)
   supprime son compte avec octobre ouvert. Relu juste après :
   `select d.libelle, p.user_profile_id, p.part_cents from depense d join depense_part p … where d.mois = '2026-10-01'`
   → Courses 800 € : Kamil 485,20 € (60,65 %) + 314,80 € sur une `user_profile_id` qui n'existe plus ; 14 `depense_part`
   orphelines en tout. Kamil, seul, voyait « Il te reste 1 274,91 € après 2 425,09 € de charges » alors qu'il en doit 3 958,57 €.
   Les charges (`charge_participant`) sont bien retirées, les lignes non repartagées. `select refige_pour('<foyer>', '2026-10-01')`
   en rôle de service rend bien Kamil à 100 % (Courses : `K:80000/10000`), je l'ai rejoué en local pour la suite du test.
   Piège pour le correctif : `repartit_les_lignes` passe par `parts_du_foyer`, qui exige `is_service_role()` ou un
   `current_household()` non nul — après `delete from user_profile`, un appel depuis la fonction ne lirait personne.
2. **P2 — reculer `entre_le` après avoir posé son premier revenu (0103, `tg_entre_le_refige`).** Thauba pose son revenu
   le 01/10, puis recule son arrivée au 01/09 sur son profil : ses parts de septembre passent à 50/50 (aucun revenu), et
   `cloture_le_mois` refuse : « Thauba n'a pas encore posé son revenu : septembre attend. » — alors que l'interface ne lui
   permet de poser un revenu qu'à partir du mois courant (`poseRevenu` : `valid_from = moisDe()`). Septembre ne peut plus
   se clôturer par l'interface. `tg_revenu_premier` ne joue qu'à l'insertion du premier revenu. Recommandation : que
   `tg_entre_le_refige` recule aussi le premier revenu (sans passer sous la dernière clôture), comme 0103 le fait déjà à l'insertion.

## À trancher par Kamil

- Les `depense_part` orphelines des mois CLÔTURÉS (7 lignes de septembre) et la saisie de 40 € de Thauba sur « Courses »
  restent après son départ (`saisi_par` nul) : c'est « le total reste », je recommande de laisser.
- Aucune liste des membres dans Réglages : on ne voit « qui est dans le foyer » que par Semaine, Charges et les revenus.
  Recommandé : une ligne « Dans le foyer : Kamil, Thauba » sous « Inviter ».
- Une nouvelle arrivée sans objectifs enregistrés est omise de l'écran « Dresse 4 barquettes » (« pour Kamil » seulement),
  sans un mot. Le bandeau du hub ne parle que du revenu. Recommandé : y ajouter « Fixe tes objectifs ».
- « 2 montants à dire » sur la carte Budget du hub d'une arrivante : vague.
- Mails de connexion et de réinitialisation : toujours le modèle anglais « Admin <admin@email.com> » (déjà noté dans ETAT.md).
- `/choisir` affiche « mercredi 21 octobre » un 22 : `week_of` de l'amorce vaut aujourd'hui (jeudi), pas un lundi. Artefact de l'amorce.
- 403 en console après la suppression d'un compte (`auth/v1/logout`, user_not_found) : inhérent à supabase-js, laissé.
- « e-\nmail » coupé au tiret dans « Ce lien a déjà servi » : cosmétique, laissé.

## Ce qui a été joué

Avant connexion (connexion, mauvais mot de passe, e-mail invalide, `/invite/<bidon | inconnu | expiré | utilisé>`, adresse
inexistante, lien Supabase mort, mot de passe oublié jusqu'au mail Mailpit et au nouveau mot de passe : trop court, identique,
accepté) ; Kamil invite (vide, invalide, joker `%`, déjà membre, espaces et majuscules, double clic, copie du lien, ligne
`invitation` relue : 30 jours) ; elle arrive (trop court, 80 caractères refusé en français, espaces, emoji, double clic, compte
créé et confirmé, profil dans le foyer, `entre_le` au 1er du mois suivant, lien réutilisé connectée ou non, retour arrière) ;
profil, objectifs, accueil ; isolation (44 tables à `household_id`, lectures et écritures hostiles par REST : aucune fuite) ;
25 écrans de l'appli vus par elle et 6 par Kamil ; déconnexion, reconnexion avec espaces et emoji, deux onglets, jeton retiré ;
suppression du compte de Thauba (refus de la confirmation, puis acceptation, base relue avant/après, jeton mort, Kamil rechargé)
et de Kamil seul sur un foyer jetable (plus aucune ligne, aucun orphelin).

Serveur de dev (`npm run dev`, port 5173) : rejoué pour les écrans qui ont changé (invitation refusée et double clic, sortie du mot de
passe, septembre) : mêmes résultats, aucun rechargement intempestif.

Non joué : le bouton « Partager » (pas de `navigator.share` dans Chromium de test) ; les écrans de cuisine en profondeur (parcours B) ;
Firefox et Safari ; une vraie expiration de jeton (le jeton retiré du stockage est la seule version jouée).

## Bancs

- `npx playwright test` (build development + `vite preview`, 4173) : 126 tests, 125 verts au premier passage ; le seul rouge,
  `cloture.spec.ts › une clôture refusée par la base…`, l'était déjà avant le grand test (vérifié sur un export de `240cba8`) :
  son attente (« Novembre est clôturé le… ») était celle de la page de clôture, qu'on quitte après le clic qui passe. Corrigé,
  `e2e/cloture.spec.ts` 11/11.
- `npx vitest run src` : 1 319 verts sur 1 320. Le rouge, `plan/ordonnance.test.ts › tient le budget sur une grosse session`, est un
  test de durée : vert seul, rouge quand la machine est chargée (charge 6 pendant le passage). Non lié.
- `npm run build` et `npm run lint` : build vert, lint sans nouvelle alerte (mêmes trois avertissements qu'avant).
- Tests de base : `npx vitest run --fileParallelism=false tests/invitation.test.ts` : 23/23.
- Horloge de la base : `show popote.maintenant` → « unrecognized configuration parameter ».
