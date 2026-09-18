# API

Base : `${VITE_SUPABASE_URL}` · Auth : `Authorization: Bearer <access_token>`.
Tout passe par PostgREST sauf les Edge Functions. Les droits sont appliqués par RLS, jamais par le client.

## Tables — verbes autorisés à un utilisateur authentifié

| Table | GET | POST | PATCH | DELETE | Portée |
|---|:-:|:-:|:-:|:-:|---|
| `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, `typical_quantity`, `appliance_catalog`, `ingestion_job`, `instance_setting` | ✅ | ❌ | ❌ | ❌ | Référentiel global, écriture réservée au rôle de service |
| `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` | ✅ | ❌ | ✅¹ | ❌ | Catalogue partagé, création réservée au worker d'ingestion |
| `household` | ✅ | ❌ | ✅ | ❌ | Son foyer. Création : `create_household`. Suppression : `delete_my_account` |
| `user_profile` | ✅ | ❌ | ✅² | ❌ | Lecture : le foyer. Écriture : soi. Porte `password_set`. |
| `nutrition_target` | ✅ | ✅² | ✅² | ✅² | Lecture : le foyer. Écriture : soi |
| `invitation` | ✅ | ✅ | ✅ | ✅ | Son foyer |
| `llm_usage` | ✅ | ❌ | ❌ | ❌ | Ses lignes. La ligne système (`household_id IS NULL`) reste invisible |
| `suggested_item`, `cycle_transition` | ✅ | ❌ | ❌ | ❌ | Référentiel global |
| `cycle`, `cycle_recipe`, `store`, `aisle_order`, `shopping_item`, `shopping_trip`, `shopping_habit`, `session_task`, `session_task_recipe`, `session_task_dependency`, `session_appliance`, `portion`, `meal_slot`, `meal_extra`, `frequent_food`, `stock_item` | ✅ | ✅ | ✅ | ✅ | Son foyer, les quatre verbes |
| `receipt`, `receipt_line`, `household_price`, `weighing`, `household_unit_weight`, `household_ingredient_resolution` | ✅ | ✅ | ✅ | ✅ | Son foyer, les quatre verbes |
| `recipe_nutrition` | ✅ | ❌ | ❌ | ❌ | Catalogue partagé, calculé à l'ingestion |
| `price_knowledge` | ✅ | ❌ | ❌ | ❌ | Vue (`security_invoker`) sur `household_price` jointe à `store` |
| `portion_event`, `duration_observation` | ✅ | ❌ | ❌ | ❌ | Journaux : écrits par trigger, jamais réécrits |

`household_price` et `household_unit_weight` sont ouverts en écriture au foyer
alors qu'ils sont **remplis par trigger** : c'est délibéré. Corriger un prix
appris de travers ou effacer une pesée fautive doit rester possible sans passer
par le rôle de service — et le trigger recalcule tout derrière.

¹ Refusé si `confidence >= 0.8`. Chaque écriture pose `edited_by_household_id` et `edited_at`.
² `id` / `user_profile_id` doit valoir `auth.uid()`. Sur `nutrition_target`, `household_id` est posé par trigger : ne pas l'envoyer.

## RPC — `POST /rest/v1/rpc/<nom>`

| Fonction | Paramètres | Retour | Appelable par |
|---|---|---|---|
| `current_household` | — | `uuid` \| `null` | authentifié |
| `create_household` | `p_name text` | `uuid` | authentifié **sans** foyer, si l'instance est ouverte |
| `llm_budget_remaining` | — | `numeric` (€) | authentifié |
| `llm_global_budget_remaining` | — | `numeric` (€) | **rôle de service uniquement** |
| `current_cycle` | — | `uuid` \| `null` | authentifié |
| `open_cycle` | `p_week_of date`, `p_servings int` | `uuid` | authentifié |
| `export_my_data` | — | `jsonb` | authentifié |
| `delete_my_account` | — | `void` | authentifié |
| `poids_unitaire` | `p_food_id uuid`, `p_unit text` | `numeric` \| `null` | authentifié |
| `llm_consomme` | `p_household uuid`, `p_kind text` | `int` | **rôle de service uniquement** |
| `tables_de_foyer` | — | `setof text` | **rôle de service uniquement** |

`poids_unitaire` rend le poids appris par le foyer s'il est actif (3 pesées, 5
sans référence), sinon la référence, sinon `null` — **jamais un chiffre
inventé** : c'est ce qui fait afficher une fourchette au lieu d'une fausse
précision (D18).

`llm_consomme` incrémente le quota en **une instruction**, donc atomiquement.
Le code lisait `calls` puis écrivait `calls + 1` : deux appels simultanés
lisaient la même valeur et un appel sur deux ne comptait pas.

`create_household` lève `déjà rattaché à un foyer` (23505) ou `création de foyer fermée` (42501).
`open_cycle` rend le cycle vivant s'il y en a un, et lève `unique_violation` si la semaine
demandée a déjà son cycle clos — on n'efface pas un bilan pour recommencer.

**Transitions d'état** : `PATCH /cycle` avec `state` lève `check_violation`
(`transition de cycle interdite : X -> Y`) pour tout ce qui n'est pas dans
`cycle_transition`. Le client ne double pas la machine à états.

## Edge Functions — `POST /functions/v1/<nom>`

| Fonction | Corps | 200 | Erreurs |
|---|---|---|---|
| `invite` | `{ email }` | `{ token, link }` | 401 non authentifié · 403 aucun foyer · 400 e-mail manquant · 409 invitation déjà en attente |
| `accept-invite` | `{ token }` | `{ household_id }` | 401 · 400 token manquant · 404 inconnue · 409 déjà utilisée ou déjà rattaché · 410 expirée |
| `inventer` | `{ envie, perimetre, proteinesMin, kcalMax, minutesMax, appareils, parts }` | `{ recette, restantes, quota }` | 401 · 403 aucun foyer · 429 quota mensuel atteint · 502 modèle injoignable ou illisible · 503 aucun modèle configuré |
| `frigo` | `{ image: "data:image/jpeg;base64,…", lieu }` | `{ articles, lisible, commentaire, par, ms, restantes, quota }` | 401 · 403 · 400 image absente ou mal formée · 413 > 6 Mo · 429 · 502 · 503 |
| `ticket` | `{ image: "data:image/jpeg;base64,…", enseigne }` | `{ enseigne, date, lignes, total_eur, somme, ecart, remisesDeduites, par, ms, restantes, quota }` | 401 · 403 · 400 · 413 · 429 · 502 · 503 |

`inventer` : **10 générations par foyer et par mois**, vérifiées *avant* l'appel.
Le prompt est construit côté serveur — le modèle reçoit des bornes chiffrées
(« au moins 30 g de protéines »), jamais un objectif nominatif.
Variables d'environnement : `LLM_API_KEY` (requise), `LLM_BASE_URL`
(défaut `https://api.openai.com/v1`), `LLM_MODEL` (défaut `gpt-4o-mini`).
Toute API compatible OpenAI convient, y compris auto-hébergée.

`frigo` et `ticket` : **30 lectures par foyer et par mois chacune**, comptées
séparément — un mois de photos de frigo ne doit pas empêcher d'enregistrer ce
qu'on a payé. Toutes deux enchaînent plusieurs **modèles Gemini** plutôt que
plusieurs fournisseurs : aucun modèle de Groq ne voit, et le quota gratuit de
Gemini est de 20 requêtes par jour **et par modèle**, si bien que trois modèles
portent le budget à 60 lectures par jour. Variables : `LLM_VISION_API_KEY`,
`LLM_VISION_BASE_URL`, `LLM_VISION_MODELS` (liste séparée par des virgules).

Ni l'une ni l'autre **n'écrit en base** : ce qu'elles rendent est une
proposition que l'écran fait valider ligne par ligne. Le quota n'est
décompté qu'**après** une réponse utile — un 503 de Gemini, et il y en a, ne
doit pas coûter une photo.

`ticket` rend `ecart` (somme des lignes moins total imprimé) et
`remisesDeduites` : quand l'écart vaut exactement les remises annoncées, elles
sont déduites, et l'écran le dit. Sinon rien n'est corrigé et l'écart
s'affiche — mieux vaut un écart visible qu'une correction inventée. Détail dans
[`prix.md`](prix.md).

`OPTIONS` répond 200 avec `Access-Control-Allow-Origin: *`. Toutes les
fonctions valident le JWT elles-mêmes.

## Conventions

| Règle | |
|---|---|
| Codes HTTP | 400 invalide · 401 non authentifié · 403 interdit · 404 absent · 409 conflit d'état · 410 expiré |
| Suppression refusée | PostgREST renvoie **200 avec 0 ligne**, pas une erreur. Vérifier le compte, jamais `error`. |
| Historisation | Un objectif qui change est un `INSERT`, jamais un `UPDATE`. |
| Secrets | Le client n'utilise que la clé `anon`. La clé `service_role` ne quitte jamais le serveur. |

## Connexion

Le lien par e-mail ne sert qu'à la **première** connexion. On y pose un mot de passe, et
ensuite c'est `signInWithPassword`. Le mail ne resservira que pour un oubli.

| Étape | Appel |
|---|---|
| Première fois, ou oubli | `auth.signInWithOtp({ email, options.emailRedirectTo })` |
| Poser le mot de passe | `auth.updateUser({ password })` puis `user_profile.password_set = true` |
| Toutes les fois d'après | `auth.signInWithPassword({ email, password })` |

`user_profile.password_set` à `false` **bloque l'entrée** dans l'application et conduit à
l'écran de choix. Sans ce drapeau, la personne repart sur un lien par e-mail à chaque
connexion — et se heurte à la limite d'envoi de Supabase.
