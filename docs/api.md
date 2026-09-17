# API

Base : `${VITE_SUPABASE_URL}` · Auth : `Authorization: Bearer <access_token>`.
Tout passe par PostgREST sauf les Edge Functions. Les droits sont appliqués par RLS, jamais par le client.

## Tables — verbes autorisés à un utilisateur authentifié

| Table | GET | POST | PATCH | DELETE | Portée |
|---|:-:|:-:|:-:|:-:|---|
| `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, `typical_quantity`, `appliance_catalog`, `ingestion_job`, `instance_setting` | ✅ | ❌ | ❌ | ❌ | Référentiel global, écriture réservée au rôle de service |
| `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` | ✅ | ❌ | ✅¹ | ❌ | Catalogue partagé, création réservée au worker d'ingestion |
| `household` | ✅ | ❌ | ✅ | ❌ | Son foyer. Création : `create_household`. Suppression : `delete_my_account` |
| `user_profile` | ✅ | ❌ | ✅² | ❌ | Lecture : le foyer. Écriture : soi |
| `nutrition_target` | ✅ | ✅² | ✅² | ✅² | Lecture : le foyer. Écriture : soi |
| `invitation` | ✅ | ✅ | ✅ | ✅ | Son foyer |
| `llm_usage` | ✅ | ❌ | ❌ | ❌ | Ses lignes. La ligne système (`household_id IS NULL`) reste invisible |

¹ Refusé si `confidence >= 0.8`. Chaque écriture pose `edited_by_household_id` et `edited_at`.
² `id` / `user_profile_id` doit valoir `auth.uid()`. Sur `nutrition_target`, `household_id` est posé par trigger : ne pas l'envoyer.

## RPC — `POST /rest/v1/rpc/<nom>`

| Fonction | Paramètres | Retour | Appelable par |
|---|---|---|---|
| `current_household` | — | `uuid` \| `null` | authentifié |
| `create_household` | `p_name text` | `uuid` | authentifié **sans** foyer, si l'instance est ouverte |
| `llm_budget_remaining` | — | `numeric` (€) | authentifié |
| `llm_global_budget_remaining` | — | `numeric` (€) | **rôle de service uniquement** |
| `export_my_data` | — | `jsonb` | authentifié |
| `delete_my_account` | — | `void` | authentifié |

`create_household` lève `déjà rattaché à un foyer` (23505) ou `création de foyer fermée` (42501).

## Edge Functions — `POST /functions/v1/<nom>`

| Fonction | Corps | 200 | Erreurs |
|---|---|---|---|
| `invite` | `{ email }` | `{ token, link }` | 401 non authentifié · 403 aucun foyer · 400 e-mail manquant · 409 invitation déjà en attente |
| `accept-invite` | `{ token }` | `{ household_id }` | 401 · 400 token manquant · 404 inconnue · 409 déjà utilisée ou déjà rattaché · 410 expirée |

`OPTIONS` répond 200 avec `Access-Control-Allow-Origin: *`. Les deux fonctions valident le JWT elles-mêmes.

## Conventions

| Règle | |
|---|---|
| Codes HTTP | 400 invalide · 401 non authentifié · 403 interdit · 404 absent · 409 conflit d'état · 410 expiré |
| Suppression refusée | PostgREST renvoie **200 avec 0 ligne**, pas une erreur. Vérifier le compte, jamais `error`. |
| Historisation | Un objectif qui change est un `INSERT`, jamais un `UPDATE`. |
| Secrets | Le client n'utilise que la clé `anon`. La clé `service_role` ne quitte jamais le serveur. |
