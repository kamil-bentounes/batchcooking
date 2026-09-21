# Schéma

44 tables, trois classes d'isolation. Toute policy RLS découle de la classe.

| Classe | Règle | Tables |
|---|---|---|
| **A — référentiel** | Lecture : tout authentifié. Écriture : rôle de service. | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, `typical_quantity`, `appliance_catalog`, `ingestion_job`, `instance_setting`, `non_action_pattern`, `suggested_item`, `cycle_transition` |
| **B — catalogue partagé** | Lecture : tous. `UPDATE` tracé, refusé si `confidence >= 0.8`, et **seulement sur ce que personne ne possède** (`owner_household_id is null`) ou sur ce qui est à soi — 0036/0038. Ni `INSERT` ni `DELETE`. | `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency`, `recipe_nutrition` |

`portion` porte `source` (`session` · `manuel` · `achete`, migration 0046) : une
barquette peut naître sans session de cuisine — un plat tout prêt acheté dehors
est un REPAS, il se mange depuis la semaine et pèse dans les calories du jour.
Sa provenance est gelée par `tg_portion_source`, sans quoi le bilan mélangerait
ce qu'on a cuisiné et ce qu'on a acheté. `stock_item` porte désormais
`frozen_at` comme `portion`.

La péremption (D29) reste de quatre jours au frigo et trois mois au
congélateur, mais elle ne s'applique plus que faute de mieux : une date donnée à
l'insertion — celle imprimée sur un emballage — est respectée (0047). Elle était
écrasée en silence.

`recipe_nutrition` fait exception à la traçabilité : elle n'a ni
`edited_by_household_id` ni garde de classe B, donc une correction des macros du
catalogue mutualisé y reste anonyme (0039).

Une recette peut désormais APPARTENIR à un foyer (`owner_household_id`, 0034) :
collée, inventée ou importée. Elle n'est alors plus de la classe B mais de la C,
et sa colonne `visibility` (`privee` / `partagee` / `publique`, 0035) décide qui
la lit. C'est une colonne de DROITS : seul le foyer propriétaire y touche, et
`created_by` non plus ne se réécrit pas.

`recipe_step` porte `verb` et `quantity_g` (migration 0019) : la fusion des
gestes entre recettes (D35) compare des verbes, pas des phrases, et la mesure
des durées (D48) s'agrège par verbe — une étape n'est jamais refaite, un verbe
l'est toutes les semaines. Remplis par l'ingestion, voir [`ingestion.md`](ingestion.md).
| **C — foyer** | RLS stricte, trois formes de prédicat. | `household`, `user_profile`, `nutrition_target`, `invitation`, `llm_usage`, `foyer_ami`, `session_convive` + les 18 tables du lot 1 et les 6 des lots 0c et 5 (ci-dessous) |

Deux tables ouvrent une brèche *nommée* dans la classe C, et une seule à la fois :

- `foyer_ami` (0035) — l'amitié entre deux foyers, symétrique et explicite. Elle
  ouvre la LECTURE des recettes `partagee` de l'autre, et rien d'autre.
- `session_convive` (0037, resserrée par 0038) — un foyer ami convié à une
  session de cuisine. Il lit le plan et prend des gestes tant que trois choses
  tiennent ENSEMBLE : il a accepté, le cycle est vivant (`pret`, `en_cuisine`,
  `dressage`) et l'amitié tient encore. Un trigger gèle tout le reste : il
  cuisine, il ne réécrit pas.

`session_task` est publiée en temps réel (`supabase_realtime`, 0037). La RLS
s'applique au flux — sauf aux événements DELETE, que Supabase ne filtre pas ;
leur charge ne porte que l'identifiant.

## Les tables du lot 1

| Domaine | Tables | Ce qu'elles portent |
|---|---|---|
| Le cycle | `cycle`, `cycle_recipe` | L'état de la semaine, les recettes choisies. Voir [`cycle.md`](cycle.md) |
| Les courses | `store`, `aisle_order`, `shopping_item`, `shopping_trip`, `shopping_habit` | Une sortie par magasin, l'ordre des rayons appris du geste |
| La session | `session_task`, `session_task_recipe`, `session_task_dependency`, `session_appliance`, `duration_observation` | Le plan calculé et persisté, les durées mesurées |
| Les barquettes | `portion`, `portion_event` | L'unité de suivi, et son journal |
| La semaine | `meal_slot`, `meal_extra`, `frequent_food` | Ce qui est prévu, ce qui a été mangé en plus |
| L'inventaire | `stock_item` | Frigo, congélateur, placard |

## Les tables des lots 0c, 4, 5 et 6

| Domaine | Tables | Ce qu'elles portent |
|---|---|---|
| Les filtres (lot 4, classe B) | `recipe_nutrition` | Macros **par part**, avec leur marge et leur couverture (D18). `recipe` gagne `active_time_min`, `appliances`, `step_count`, `freezable` — matérialisés par `tg_recipe_agrege` |
| Les prix (lot 5) | `receipt`, `receipt_line`, `household_price` | Le ticket lu, ses lignes, et le prix appris par produit **et par enseigne**. Voir [`prix.md`](prix.md) |
| La pesée (lot 0c) | `weighing`, `household_unit_weight`, `household_ingredient_resolution` | L'observation brute, la médiane retenue, et la correction de rattachement propre au foyer (§5.2.1) |
| Le budget (lot 6) | — | `household.food_budget_eur`, **nullable** : ne pas s'en fixer est un choix. Voir [`suivi.md`](suivi.md) |

`price_knowledge` est une **vue** (`security_invoker`) sur `household_price`
jointe à `store` : elle existe pour que « ignorer les relevés trop vieux » soit
un jour la correction d'une seule ligne.

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
| `tables_de_foyer()` | Introspection, rôle de service. Ne liste que des `BASE TABLE` — sinon la vue `price_knowledge` réclamerait un export en plus de la table qu'elle lit. Sert au test qui empêche `export_my_data` de prendre du retard sur le schéma. |
| `tg_recipe_agrege` | `AFTER INSERT/UPDATE/DELETE` sur `recipe_step` : recalcule temps actif, appareils et nombre d'étapes. **Un trigger ne rattrape pas le passé** — `scripts/recalcule.mjs` existe pour cela. |
| `tg_receipt_line_apprend` | `AFTER INSERT` sur `receipt_line` : apprend le prix (ramené au kilo ou au litre, **médiane mobile**) et reporte `paid_price_eur`. ⚠️ `SECURITY DEFINER`, donc il **vérifie lui-même** le foyer de l'article et du magasin — la RLS ne le protège pas. |
| `tg_pesee_apprend` | `AFTER INSERT/UPDATE/DELETE` sur `weighing` : rejette les aberrantes hors `[0,4× ; 2,5×]` la référence, retient la **médiane**, active à 3 observations (5 sans référence). Repart des observations à chaque fois — une médiane incrémentale serait fausse dès la première suppression. |
| `poids_unitaire(food, unit)` | Le poids appris s'il est actif, sinon la référence, sinon `NULL`. Jamais un chiffre inventé (D18). |
| `llm_consomme(foyer, kind)` | Incrément **atomique** du quota. Le code lisait puis écrivait : un appel simultané sur deux ne comptait pas. Rôle de service seulement. |

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

## Ce qui existe sans être branché

Relevé honnêtement plutôt que laissé à découvrir. Ces objets sont créés, testés
et documentés, mais **aucun écran ne les lit** :

| Objet | Ce qui manque |
|---|---|
| `household_ingredient_resolution` | La correction d'un rattachement PAR LE FOYER (D3, D16). La table, la RLS et les tests existent ; l'écran qui permettrait de corriger « crème » quand il tombe sur la crème dessert n'est pas écrit. |
| `duration_observation` → `default_duration` | La boucle D48 est à moitié fermée : la durée réelle est bien MESURÉE et consignée à chaque session, mais rien ne la réagrège vers `default_duration`. Les durées par défaut restent donc celles du seed. |
| `poids_unitaire()` | La règle « poids appris s'il est actif, sinon la référence » est appliquée côté client dans `courses.ts`. La fonction SQL dit la même chose et n'a pas d'appelant. |

> Les deux premières lignes sont des fonctionnalités promises par la conception.
> La troisième est une duplication à résorber le jour où la règle bougera.
