# Le frigo, la semaine qu'on choisit, nos aliments, les rappels par mail

Validé par Kamil le 26/10/2026 sur maquettes (canvas « Popote · Frigo et semaine », direction **A, le frigo
qu'on ouvre**), réponse « Oui, code tout ». Les maquettes (`.dc.html`, à ouvrir dans un navigateur ou à lire
comme du HTML) sont HORS dépôt, dans `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/` :
`Main.dc.html` (le frigo), `Ranger.dc.html`, `Semaine.dc.html`, `Aliment.dc.html`, `Rappels.dc.html`.
Elles fixent l'aspect et les mots ; le code doit leur ressembler, dans les jetons de l'appli
(`src/index.css` : fond #F2F4EF, surface #FBFCFA, encre #1C2B23, doux #5D6E62, herbe #2F5D45,
safran #E8A33D (aplat seulement), ocre #8F5A0D (texte), brume #DCE2D6, piste #E4E9E1, sable #F6EAD2 ;
Fraunces pour les titres et les chiffres, Instrument Sans pour le texte). Bleu « congélateur » : aplat
#3E6A84, texte #2C4A58, fond #DCE8EE.

Ce que Kamil a demandé, mot pour mot ou presque :
- « quand on décide de congeler, on peut décider pour tout le foyer » ;
- c'est LUI qui choisit ce qu'il congèle et ce qu'il met au frigo, après la session, et on garde les dates et
  heures de mise au frigo, modifiables ;
- c'est LUI qui choisit ce qu'il mange chaque jour ; s'il choisit du congelé, on lui propose de le décongeler
  et on l'alerte par mail ; il peut changer le repas le jour même ;
- des alertes par mail (décongeler, budget…) ;
- enregistrer nos propres aliments (son yaourt : 60 kcal / 4 g, c'est faux) à la main ou en photographiant
  le tableau nutritionnel pour 100 g, avec le poids d'un pot ;
- un frigo et un congélateur dessinés, qu'on ouvre, avec les plats dedans, combien, quand c'est prévu,
  la péremption, congeler / décongeler maintenant ;
- les ingrédients utilisés par les recettes sortent du contenu du frigo, sauf ceux qui ne sont dans
  aucune recette.

Règles du dépôt : `CLAUDE.md`, la mémoire du projet, ETAT.md. Commits en français, identité locale du dépôt,
**jamais** de ligne `Co-Authored-By` ni de mention de Claude/Anthropic. Vérifier avec `npm run build -- --mode
development` (pas `tsc --noEmit`, muet ici), `npx vitest run src`, `npm test` (base locale, un seul à la
fois), `npx playwright test <spec>` (jamais pendant un build), `npm run lint`, `npm run manuel:verifie`.
Chaque écran nouveau a sa page de manuel dans `docs/aide/` (et `npm run manuel:genere`), sa porte dans
`supabase/functions/_shared/portes.ts` ET `src/lib/aide/portes.ts`, et ses suggestions dans
`src/lib/aide/suggestions.ts`.

Les données réelles (prod, 26/10) que les maquettes reprennent : cycle `d75c8320…` passé en `semaine` ;
30 barquettes (6 lasagnes et 2 pizzas au frigo, rangées le 25/10 à 21 h 26 ; 2 burgers et 20 wraps au
congélateur) ; le frigo ne contient plus, en vrai, que des yaourts dessert protéinés (tout le reste des
courses a servi aux recettes).

## Chantier 1 — Le dressage dresse pour tout le foyer, puis « On range »

**Défaut corrigé.** `src/pages/Dressage.tsx` omet les parts d'un membre sans objectifs (`objectifDe`) : en
prod, Thauba n'en a pas et la moitié des 30 parts n'a jamais été créée. Un membre sans objectifs reçoit
désormais des parts au poids égal (le plat partagé à parts égales entre ses parts), jamais rien.

**« On range » (maquette `Ranger.dc.html`).** Le bouton du dressage ne range plus tout seul : il mène à une
seconde étape, sur le même écran (`/dressage`), où l'hôte choisit, recette par recette et pour le foyer
entier, combien de barquettes restent au frigo (le reste part au congélateur) :
- une carte par recette : nom, total, barre frigo/congélateur, « Frigo · n » avec − / + (cibles ≥ 44 px),
  « Congélateur · n », et la conséquence (« à manger avant le jeu. 29 oct. » / « se garde jusqu'au … ») ;
- proposition par défaut = la règle d'aujourd'hui transposée au foyer : on remplit le frigo jusqu'à 4 jours
  de dîners pour le foyer (4 × nombre de membres), recette par recette dans l'ordre du cycle, le reste au
  congélateur ;
- « Rangé le » : date ET heure, maintenant par défaut, modifiables (champ `datetime-local`). Elle devient
  `prepared_at` de chaque barquette, et `frozen_at` de celles du congélateur ; la péremption suit (trigger
  `tg_portion_peremption` : frigo +4 j, congélateur +90 j) ;
- un bilan : « 8 barquettes au frigo — de quoi tenir 4 jours de dîners pour vous deux. Le frigo garde
  4 jours. », en ocre sur sable s'il y en a plus de 4 jours (« celles du jeudi périmeront ») ;
- « La session a pris » (chantier 1 bis) ;
- « Ranger les N barquettes » : crée les barquettes avec leur lieu, retire du stock, passe le cycle en
  `semaine`, et mène au frigo (`/frigo`). **Plus de distribution automatique** sur la semaine
  (`repartitionAuto` n'est plus appelé) : c'est Kamil qui choisit (chantier 3). Le geste reste reprenable
  (voir le commentaire « REPRENABLE » de `Dressage.tsx`).

**Chantier 1 bis — les ingrédients sortent du stock.** Migration `0120_la_session_prend_dans_le_stock.sql` :
- `ce_que_la_session_prend(p_cycle uuid)` (lecture, `security definer`, réservée au foyer du cycle) : pour
  chaque `stock_item` du foyer dont le `food_id` est celui d'un ingrédient des recettes du cycle, ce que les
  recettes en demandent : Σ `grams_reference` × `cycle_recipe.servings` / `coalesce(recipe.yield_servings,1)`
  quand le stock est compté en `g` (ou `ml`, pris comme des grammes) ; Σ `qty` × même facteur quand le stock
  est compté à l'unité (`unit` nul) et la ligne de recette aussi ; sinon « non calculable ». Rend : id, libellé,
  lieu, quantité en stock, unité, quantité prise (bornée au stock), reste, calculable.
  Vérifié sur la prod du 25/10 : tout ce qui est en grammes ou à l'unité tombe exactement à zéro (poireaux
  1 500 g, saumon 750 g, œufs 2 250 g, tortillas 20, carrés 4…) ; restent les yaourts (pas de `food_id`) et
  ce qui n'a pas de quantité (ail, sel, épices).
- `retire_du_stock(p_cycle uuid, p_restes jsonb)` (écriture, idempotente) : applique le calcul, avec les
  corrections de l'écran (`{"<stock_item_id>": <reste>}`), supprime ce qui tombe à zéro, laisse intact ce
  qui n'a pas de quantité ou n'est pas calculable, et note `cycle.stock_retire_le` (nouvelle colonne) pour ne
  jamais retirer deux fois.
- À l'écran : la liste des ingrédients pris (puces « Poireaux 1,5 kg »), chacune touchable pour dire « il en
  reste … » ; puis « Reste au frigo : … » pour ce que les recettes n'ont pas touché.
- Tests : `tests/stock-session.test.ts` (calcul, idempotence, corrections, isolation entre foyers).

## Chantier 2 — Le frigo (maquette `Main.dc.html`)

Route `/frigo`, onglet « Frigo » (icône frigo) à la place de « Ce que j'ai » ; `/stock` redirige vers
`/frigo`. Le contenu de `Stock.tsx` est remplacé ; ce qui n'a plus d'usage s'en va.
- **Fermé** : le frigo dessiné (caisse, porte du haut, tiroir du congélateur en bas, poignées). Sur la porte :
  un afficheur sombre « Ce soir — <plat> — pour vous deux » (le dîner du jour) ou « Rien de prévu ce soir » ;
  un magnet safran pour le plus pressé qui n'est pas prévu (« 2 pizzas à prévoir avant jeudi »), absent sinon ;
  en bas « Frigo — 8 barquettes et … ». Sur le tiroir : « Congélateur — 22 barquettes, … ».
- **Ouvrir** : toucher la porte la fait pivoter (CSS 3D, `perspective`, `rotateY(-104deg)`, 0,75 s) ; toucher
  le tiroir le fait glisser vers le bas. Un bouton « Fermer » dans l'en-tête. `prefers-reduced-motion` : sans
  animation. La porte et le tiroir sont de vrais `<button>` (`aria-expanded`).
- **Dedans** : étagère « plats » (les barquettes groupées par recette, lieu et état : une pile dessinée,
  badge « ×6 », nom, mot d'urgence de `peremption.ts`) ; étagères d'ingrédients rangées par rayon
  (`rayonDe`) : laitages, viandes et poissons, autres ; le bac à légumes ; « + Ajouter au frigo » (le
  `FormulaireAjout` actuel, et « Photo du frigo » vers `/photo`). Au congélateur, vu d'en haut, givré : les
  barquettes congelées (grille de boîtes, badge) et les ingrédients congelés. Le placard reste accessible
  (un lien sous le frigo, une liste).
- **La fiche** (feuille du bas, `role="dialog"`) d'un groupe : lieu, combien, nom, poids et macros par
  barquette ; « Au frigo depuis » (`prepared_at`) / « Congelé le » (`frozen_at`), « À manger avant »
  (`expires_at`) — modifiables, appliqués au groupe ; « Prévue(s) » : les repas où elles sont posées, ou
  « Pas encore » en ocre ; actions :
  - frigo : « En manger une maintenant » (case du repas en cours pour moi, aujourd'hui, mangée), « Congeler »
    (combien ?), « Prévoir un repas » (→ la semaine, feuille de choix ouverte), « Jeter » ;
  - congélateur : « Prévoir et me rappeler » (→ la semaine), « Décongeler maintenant » (combien ? → au frigo,
    24 h), « Jeter » ;
  - ingrédient : quantité, lieu, date limite, « Fini » ; s'il n'a pas de valeurs nutritives, « Remplir ses
    valeurs » (→ chantier 4).
- Tests : unitaires pour les regroupements et le magnet ; e2e (ouvrir, fiche, congeler, décongeler, modifier
  une date, la base relue).

## Chantier 3 — La semaine qu'on choisit (maquette `Semaine.dc.html`)

- Sept jours à partir d'aujourd'hui, en bandeau (`aria-pressed`) ; sous chaque jour deux points (midi,
  soir) : vert = du frigo, bleu = du congélateur, safran = autre chose, creux = rien.
- Le jour choisi : « Midi » (`dejeuner`) et « Soir » (`diner`). Une carte vide « + Choisir le midi » ; une
  carte pleine : pastille du plat, nom, « Du frigo, pour vous deux » / « pour Kamil »…, « Changer » ; aujourd'hui
  et avant, « Je l'ai mangé ». Plat congelé : bandeau bleu « Mail mardi à 19 h : sortir 2 wraps du
  congélateur pour la nuit au frigo » (ou, si le rappel est coupé, « Pense à les sortir la veille au soir ») ;
  pour aujourd'hui, « décongèle-les au micro-ondes ».
- La feuille « Lundi midi » : « Pour » = Vous deux / chaque membre ; « Au frigo » (le plus pressé d'abord,
  combien de libres), « Au congélateur » (à sortir la veille), « Autre chose » (nos aliments — chantier 4 —,
  les repères du repas, « On saute ce repas »). Choisir pose une barquette libre du groupe (la plus pressée)
  dans la case de chaque personne visée ; « Changer » libère l'ancienne (message « Les lasagnes retournent
  au frigo, libres pour un autre jour. »).
- Ce qui existe et se garde : les extras (`EnPlus`) pour le petit-déjeuner, la collation et « en plus » ;
  « Sauté ». Les filtres par personne disparaissent (les cartes disent pour qui).
- Tests : unitaires (libres, points, phrases), e2e (choisir, changer le jour même, congelé → bandeau).

## Chantier 4 — Nos aliments (maquette `Aliment.dc.html`)

Migration `0121_nos_aliments.sql` : table `aliment` du foyer (libellé, kcal / protéines / glucides /
lipides / fibres pour 100 g, unité « pot », poids d'une unité, code-barres, source `main` | `etiquette` |
`code_barres`), RLS du foyer. Écran `/aliments` (liste, création, modification) : trois façons de remplir —
« Étiquette » (photo → fonction `etiquette` existante, qui rend déjà les valeurs pour 100 g et le poids net ;
« Vérifie-les avant d'enregistrer »), « À la main », « Code-barres » (saisie des chiffres, et l'appareil
photo quand `BarcodeDetector` existe → Open Food Facts, `world.openfoodfacts.org/api/v2/product/<code>.json`,
nutriments pour 100 g et `serving_quantity`). Un pot = valeurs × poids / 100, affiché en grand. Nos aliments
passent AVANT les repères dans la semaine (« Autre chose ») et dans « en plus » : un geste = une unité.
Tests : base (RLS, contraintes), unitaires (calcul, lecture OFF), e2e (créer à la main, l'utiliser).

## Chantier 5 — Les rappels par mail (maquette `Rappels.dc.html`)

Migration `0122_rappels.sql` : `rappel_reglage` (membre, type, actif), `rappel_envoye` (membre, type, clé,
envoyé le — unique, pour ne jamais envoyer deux fois). Écran `/rappels` (depuis Réglages) : chacun règle LES
SIENS (on ne règle pas ceux d'un autre). Types et moments (heure de Paris) :
- `sortir_du_congelateur` — la veille à 19 h, pour un repas prévu avec une barquette congelée ; le mail porte
  « C'est fait » (lien vers l'appli, qui passe ces barquettes au frigo après confirmation) et « Changer le
  repas » ;
- `barquette_perime` — 8 h, une barquette du frigo qui périme avant demain soir et n'est prévue nulle part ;
- `choisir_les_repas` — dimanche 18 h, s'il reste des dîners vides dans les 7 jours ;
- `noter_les_depenses` — dimanche 20 h, si rien n'a été noté depuis 7 jours ;
- `confirmer_les_charges` — le 1er à 9 h, s'il y a des lignes du mois à confirmer ;
- `cloturer_le_mois` — le dernier jour à 19 h, si le mois n'est pas clos ;
- `facture_annuelle` — 15 jours avant le mois d'une charge annuelle.
Envoi : fonction `rappels` (Deno), SMTP Gmail sur le port 465 (secrets `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
`APP_BASE_URL`, et un secret d'appel), appelée chaque heure par `pg_cron` + `pg_net` (le secret d'appel dans
Vault). Les adresses viennent de `auth.users` (rôle de service). En local, le SMTP est remplacé par Mailpit
(port 54324) pour les tests. Tests : base (qui reçoit quoi, à quelle heure, jamais deux fois), fonction
(rendu du mail), e2e de l'écran.
