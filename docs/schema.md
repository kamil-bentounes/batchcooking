# Schéma

20 tables, trois classes d'isolation. Toute policy RLS découle de la classe.

| Classe | Règle | Tables |
|---|---|---|
| **A — référentiel** | Lecture : tout authentifié. Écriture : rôle de service. | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, `typical_quantity`, `appliance_catalog`, `ingestion_job`, `instance_setting` |
| **B — catalogue partagé** | Lecture : tous. `UPDATE` tracé, refusé si `confidence >= 0.8`. Ni `INSERT` ni `DELETE`. | `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` |
| **C — foyer** | RLS stricte, trois formes de prédicat. | `household`, `user_profile`, `nutrition_target`, `invitation`, `llm_usage` |

## Les trois prédicats de la classe C

| Forme | Tables | Prédicat |
|---|---|---|
| La clé **est** le foyer | `household` | `id = current_household()` |
| Colonne directe | `user_profile`, `invitation`, `llm_usage` | `household_id = current_household()` |
| Dénormalisée | `nutrition_target` | `household_id`, rempli par trigger depuis `user_profile` |

**Portée personne, pas foyer** — sur `nutrition_target` et `user_profile` la *lecture* est au foyer
(le bilan nutritionnel en a besoin), toute *écriture* exige `= auth.uid()`. Sans cela un membre
effacerait les objectifs de l'autre.

**Aucune policy `DELETE` sur `household` ni `user_profile`** — `for all` inclut `DELETE` : un membre
pourrait supprimer son foyer (la cascade emporte profils et objectifs) ou son propre profil, ce qui
remettrait `current_household()` à `NULL` et lui permettrait de créer un second foyer. On sort par
`delete_my_account()`, pas autrement.

## Fonctions et triggers

| Objet | Rôle |
|---|---|
| `current_household()` | `SECURITY DEFINER` : contourne la RLS de `user_profile` par *ownership de table*, ce qui évite la récursion de policy. **Ne jamais poser `FORCE ROW LEVEL SECURITY` sur `user_profile`.** |
| `is_service_role()` | `current_user = 'service_role'`, plus le claim JWT en secours. |
| `tg_class_b_guard` | `BEFORE UPDATE` sur les 4 tables de classe B. Pose la traçabilité, refuse les lignes sûres. Générique via `to_jsonb(old) ? 'confidence'`. |
| `tg_nutrition_target_household` | `BEFORE INSERT` : remplit `household_id`. S'exécute avant `NOT NULL` et avant le `WITH CHECK`. |

## Budget LLM

| | Plafond | Compteur |
|---|---|---|
| Ingestion, mutualisée entre foyers | `instance_setting.llm_global_monthly_cap_eur` | `llm_usage` où `household_id IS NULL` |
| Vision et propositions | `household.llm_monthly_cap_eur` | `llm_usage` du foyer |

`unique nulls not distinct (household_id, month, kind)` → **PostgreSQL 15+ requis**.

## Mode sur invitation

`create_household()` n'est ouverte que si `instance_setting.allow_household_creation` vaut `true`
(valeur d'amorçage). **La refermer une fois les comptes créés**, sinon toute personne qui s'inscrit
peut se créer un foyer.
