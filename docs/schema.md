# Schéma

41 tables, trois classes d'isolation. Toute policy RLS découle de la classe.

| Classe | Règle | Tables |
|---|---|---|
| **A — référentiel** | Lecture : tout authentifié. Écriture : rôle de service. | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, `typical_quantity`, `appliance_catalog`, `ingestion_job`, `instance_setting`, `non_action_pattern`, `suggested_item`, `cycle_transition` |
| **B — catalogue partagé** | Lecture : tous. `UPDATE` tracé, refusé si `confidence >= 0.8`. Ni `INSERT` ni `DELETE`. | `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` |
| **C — foyer** | RLS stricte, trois formes de prédicat. | `household`, `user_profile`, `nutrition_target`, `invitation`, `llm_usage` + les 18 tables du lot 1 (ci-dessous) |

## Les tables du lot 1

| Domaine | Tables | Ce qu'elles portent |
|---|---|---|
| Le cycle | `cycle`, `cycle_recipe` | L'état de la semaine, les recettes choisies. Voir [`cycle.md`](cycle.md) |
| Les courses | `store`, `aisle_order`, `shopping_item`, `shopping_trip`, `shopping_habit` | Une sortie par magasin, l'ordre des rayons appris du geste |
| La session | `session_task`, `session_task_recipe`, `session_task_dependency`, `session_appliance`, `duration_observation` | Le plan calculé et persisté, les durées mesurées |
| Les barquettes | `portion`, `portion_event` | L'unité de suivi, et son journal |
| La semaine | `meal_slot`, `meal_extra`, `frequent_food` | Ce qui est prévu, ce qui a été mangé en plus |
| L'inventaire | `stock_item` | Frigo, congélateur, placard |

Les quatre policies (`select`, `insert`, `update`, `delete`) sont écrites
**séparément** sur chacune. Jamais `for all` : la leçon a déjà été payée sur
`household`, où `for all` incluait `DELETE`.

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
| `current_cycle()` | Le cycle vivant du foyer, ou `NULL`. |
| `open_cycle(week, servings)` | Rend le cycle vivant s'il y en a un, refuse de rouvrir une semaine close. |
| `tg_cycle_transition` | `BEFORE UPDATE OF state` : refuse toute transition absente de `cycle_transition`, horodate `started_at` et `closed_at`. |
| `tg_derive_household` | Générique. Dérive `household_id` du parent (`TG_ARGV`) : RLS empêche d'écrire au nom d'un autre foyer, pas de s'accrocher à SON cycle. |
| `tg_portion_peremption` | Pose `expires_at` selon le lieu : frigo 4 j, congélateur 90 j, décongelée **24 h**. Sortir du congélateur *est* une décongélation. |
| `tg_portion_journal` | `AFTER` : écrit `portion_event`. Le journal n'a ni `INSERT`, ni `UPDATE`, ni `DELETE` pour personne. |
| `tg_shopping_check` | Cocher = rang + ordre des rayons appris + entrée à l'inventaire + habitude retenue. **En base**, parce que deux téléphones cochent la même liste. |
| `tg_session_task_duree` / `_mesure` | La durée réelle est mesurée entre « je prends » et « c'est fait », jamais demandée. Alimente `duration_observation`. |
| `tg_meal_slot_consomme` | Une case passée à « mangé » consomme sa barquette. |
| `tables_de_foyer()` | Introspection, rôle de service. Sert au test qui empêche `export_my_data` de prendre du retard sur le schéma. |

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

## Référentiels chargés (lot 0a-2)

| Table | Lignes | Source |
|---|---|---|
| `food` | **3 185** | CIQUAL 2020 (ANSES) — 14 nutriments retenus sur ~60, groupes et sous-groupes, état cru/cuit déduit du nom |
| `unit_conversion` | 29 | Construite à la main. Cuillères, pincées, poignées → grammes, avec surcharges par sous-groupe (huile 13,5 g la c. à soupe contre 15 g par défaut) |
| `default_duration` | **55** | Construite à la main puis **étendue par mesure** : partie de 35 verbes couvrant 86 % des étapes réelles, portée à 55 pour **98 %**. (verbe, appareil) → durée, `load_type`, `scaling` |
| `default_temperature` | 12 | Construite à la main |
| `typical_quantity` | 9 | Construite à la main. Borne haute des lignes d'ingrédients sans quantité |
| `density` | 6 | Construite à la main, rattachée à un code CIQUAL |
| `non_action_pattern` | 16 | Phrases qui ne décrivent aucun geste (« bon appétit », « astuce : »). Sans elles, le plan gagne des minutes fantômes. |
| `appliance_catalog` | 8 | Four, plaques, air fryer, micro-ondes, robot cuiseur, autocuiseur, blender, batteur |

```bash
npm run seed            # base locale
node scripts/seed.mjs --prod   # production
```

Idempotent : rejouable sans effet de bord, tout passe par des `upsert`.

**Attribution obligatoire** : ANSES-CIQUAL, Licence Ouverte Etalab.
La conversion du `.xls` d'origine est un geste ponctuel — `scripts/ciqual-to-json.py`,
à rejouer seulement si l'ANSES publie une nouvelle table.

## Un piège à ne pas réintroduire

`unique (a, b)` **ne contraint pas** les lignes où `b` est `NULL` : Postgres traite chaque
`NULL` comme distinct, donc un `upsert` répété les duplique. Constaté en production —
`default_duration` est montée à 74 lignes au lieu de 55.

La forme correcte, partout où une colonne de la clé peut être nulle :

```sql
unique nulls not distinct (a, b)   -- PostgreSQL 15+
```

Concernées : `default_duration` (`appliance_type`), `unit_conversion` (`ciqual_subgroup`),
`llm_usage` (`household_id`). Un test de non-régression le vérifie
(`tests/referentiels.test.ts`).
