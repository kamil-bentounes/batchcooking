# Design — Application de batch cooking, diet et budget

- **Date** : 2026-09-17
- **Version** : 3 — statistiques jointes mesurées, architecture restaurée, isolation à trois classes
- **Statut** : design validé, en attente du plan d'implémentation du **lot 0a-1**
- **Utilisateurs** : un foyer de 2 personnes au départ, puis d'autres foyers **sur invitation**

---

## 1. Objectif

Permettre à un foyer de :

1. constituer un catalogue de recettes saines, riches en protéines et en fibres, et gourmandes ;
2. planifier une **session de batch cooking hebdomadaire d'environ 2 h** dont les étapes sont
   ordonnées pour exploiter en parallèle les électroménagers disponibles ;
3. connaître le bilan nutritionnel de ce qui est cuisiné, **par personne**, chacun ayant ses
   propres objectifs, **avec l'incertitude affichée** (D18) ;
4. générer la liste de courses correspondante, déduction faite du frigo, et la recevoir par mail ;
5. estimer le budget courses à partir de prix réels ;
6. suivre dans le temps ce qui a été mangé et dépensé.

Le différenciateur est le point 2 : l'ordonnancement de la session sous contrainte d'équipement.

---

## 2. Décisions verrouillées

| # | Décision | Alternative écartée | Motif |
|---|---|---|---|
| D1 | **Base canonique locale**, alimentée par une ingestion asynchrone | Recherche web live à chaque requête | Sans données structurées stables, les lots 1, 2 et 5 sont impossibles. Latence 10-30 s et non-déterminisme rédhibitoires. |
| D2 | **MCP = bras d'ingestion** (`search_recipes`, `fetch_recipe`, `extract_recipe`), pas chemin de requête | MCP interrogé à chaud | Ils écrivent en base. L'app lit la base : instantané, gratuit, hors ligne. |
| D3 | **Précision stricte, avec boucle d'apprentissage par pesée** | Mapping approximatif ; pesée obligatoire | Kamil a une balance. La boucle rend la friction décroissante. |
| D4 | **Cibles par personne, portions calculées** | Cible commune | Cas réel d'un couple. Presque gratuit au lot 0a, très cher à rétro-ajouter. |
| D5 | **Conflit de four : grouper si compatible, séquencer en repli, afficher le coût** | Écarter des recettes ; séquencer toujours ; tolérance culinaire | L'utilisateur arbitre en connaissance de cause. |
| D6 | **Équipement : catalogue en base, coché par foyer, surchargeable par session** | Équipement en dur | L'optimiseur le prend en entrée, jamais en constante. |
| D7 | **Multi-tenant sur invitation** | Produit public | Pas de CGU, pas de paiement, pas de modération. |
| D8 | **Prix : interface `PriceSource` + adaptateurs indépendants** | Scraping au fondement | Lidl FR n'a pas de boutique alimentaire en ligne. Les autres sont hors CGU et cassent. |
| D9 | **LLM en API** | Auto-hébergé | Bascule à ~40 000 appels/mois ; usage réel ~250. |
| D10 | **PWA** | Application native | 99 $/an + review pour un usage sur invitation. |
| D11 | **Deux budgets LLM séparés** : global pour l'ingestion mutualisée, par foyer pour vision et propositions | Plafond unique par foyer | L'ingestion profite à tous les foyers (D16) : la facturer à un seul est incohérent. |
| D12 | **Découverte par sitemaps publics**, pas par crawl | Crawl | **Mesuré** : aucun `robots.txt` ne bloque l'IA, les sitemaps exposent 112 000 recettes et existent pour être lus par des robots. |
| D13 | **Extraction mutualisée** : une recette est extraite une fois pour tous les foyers | Extraction par foyer | Sinon chaque foyer repaie l'extraction. |
| D14 | **Précédences : ordre total par défaut**, relaxations proposées par le LLM et confirmées | Parallélisme deviné | Un parallélisme faux fait rater un plat. Défaut sûr, gain opt-in. |
| D15 | **Durées estimées par LLM sous contrainte : `Σ durées = totalTime` déclaré** | Durée NULL tolérée ; estimation libre | **Mesuré** : 77,6 % des étapes n'ont pas de durée, mais **100 %** des recettes déclarent un temps total. La contrainte rend l'estimation vérifiable automatiquement. |
| D16 | **Trois classes d'isolation** (§5.0) | Binaire partagé/isolé | Le binaire interdisait la relecture, la résolution par foyer (D3) et les recettes créées par un foyer. |
| D17 | **Catalogue large, relecture paresseuse** : ~5 000 recettes ingérées, relecture humaine déclenchée **à la sélection** d'une recette | Tout relire à l'ingestion ; catalogue de 500 | Relire 5 000 recettes est impossible pour un couple ; 500 recettes tuent l'argument du filtre macro. La charge devient proportionnelle à l'usage. |
| D18 | **Macros en intervalle `[min, max]`**, filtres sur la borne défavorable | Macros ponctuelles | 16 % des lignes sont irrésolubles (§4.2). Une macro ponctuelle ferait passer pour « 35 g de protéines » un plat dont l'ingrédient protéique est la ligne sans quantité. |

---

## 3. Architecture et stack

```
┌─ INGESTION (asynchrone, jamais sur le chemin critique) ────────────┐
│  Découverte : sitemaps publics (D12)                               │
│  MCP "recipes" : search_recipes · fetch_recipe · extract_recipe    │
│      ↓  JSON-LD schema.org/Recipe (55/56 mesuré), sinon LLM        │
│  Extraction : appareil · température · load_type · durées (D15)    │
│  Normalisation : ingrédients → CIQUAL · cascade des poids          │
└──────────────────────── écrit dans ──────────────────┬─────────────┘
                                                        ↓
                          ╔═════════════════════════════════════════╗
                          ║  BASE CANONIQUE — Postgres (Supabase)   ║
                          ║  3 classes d'isolation (§5.0) · UE      ║
                          ╚═════════════════════════════════════════╝
                                        ↓ lit
┌─ APP — PWA installable, fonctionne hors ligne en cuisine ──────────┐
│  Optimiseur · Courses · Frigo · Envies · Prix · Suivi              │
└────────────────────────────────────────────────────────────────────┘
        ↑ LLM : vision (frigo, tickets) · extraction · propositions
```

| Couche | Choix | Justification |
|---|---|---|
| Frontend | **PWA — React + Vite + TypeScript**, service worker | Installable. Le plan de session doit s'afficher en cuisine **sans réseau** : le plan calculé et la liste chronologique sont mis en cache à l'ouverture de la session. |
| Backend | **Supabase** — Postgres, Auth, RLS, Storage, Edge Functions — **région UE** | Auth + isolation + stockage des photos en un service. RLS natif = D7 et D16 quasi gratuits. |
| Worker d'ingestion | **Node + TypeScript**, exposant les outils MCP, exécuté hors de l'app (local ou tâche planifiée), authentifié en **rôle de service** | Découplé. Peut tourner à la demande, sans dimensionner un serveur permanent. |
| Optimiseur | **TypeScript pur, exécuté côté client** | < 100 ms pour 5 recettes. Aucun aller-retour réseau, donc utilisable hors ligne. |
| LLM | **API Anthropic** — modèle rapide (vision, extraction), modèle plus capable (propositions) | §8. |
| E-mail | **Resend** (free tier : 3 000/mois) | Invitations (lot 0a-1) **et** liste de courses (lot 2). |
| Hébergement PWA | **Cloudflare Pages** | Statique, gratuit. |

---

## 4. Mesures terrain — dérisquage effectué le 2026-09-17

Tout ce qui suit est **mesuré**. Méthode : URLs tirées au sort dans les sitemaps publics,
extraction du JSON-LD, classification automatique. Scripts dans `docs/mesures/`.

### 4.1 Sources de recettes retenues

| Site | Recettes au sitemap | JSON-LD | Ingr. | Étapes | Nutrition | Remarque |
|---|---|---|---|---|---|---|
| **CuisineAZ** | **30 000** | ✅ | ✅ | ✅ | 7 % | **Meilleur format** : `250 g` / `Farine de blé` déjà séparés |
| **P'tit Chef** | **65 000** | ✅ | ✅ | ✅ | 64 % | |
| **Marmiton** | **15 000** | ✅ | ✅ | ✅ | 64 % | `servingSize` en grammes |
| **Journal des Femmes** | **2 000** | ✅ | ✅ | ✅ | 100 % | Lignes de section (« Pour la pâte : ») à filtrer |
| 750g · Cuisine Actuelle · Chef Simon · Supertoinette · Ricardo | — | ✅ | ✅ | ⚠️/✅ | — | Complément. 750g : étapes parfois non découpées. |
| BBC Good Food · Budget Bytes · Skinnytaste | — | ✅ | ✅ | ✅ | ✅ | Anglais, très propres |

**Parsing : 55 recettes sur 56** (98 %). Critère de go du dérisquage n°2 : 90 %. **Atteint.**

**Bloqués en 403 depuis une IP de datacenter, non retenus** : Allrecipes, Serious Eats,
EatingWell, Simply Recipes (Dotdash Meredith), Papilles et Pupilles, Ligne & Protéines.

**Sites muscu / healthy français : 0 structuré sur 9.** Espace-Musculation, Fitadium,
Fitnessmith, Isostar, Go Recettes, Mon Coach Gourmand, Move Your Fit, Recette Protéine,
Sab'n'Pepper — uniquement du texte d'article.

> **Conséquence** : l'axe « muscu / healthy » ne se construit **pas** en ciblant des sites
> spécialisés, mais en **filtrant sur les macros recalculées** du catalogue généraliste.
> Ce filtre s'applique au catalogue réellement ingéré (~5 000 recettes, D17), pas aux 112 000
> atteignables — ce qui reste très supérieur à toute sélection éditoriale, et sans dépendance
> à un site fragile.

### 4.2 Distribution des quantités — 475 lignes, 55 recettes, 4 sites

| Forme | Part | Résolution |
|---|---|---|
| Masse (`250 g de farine`) | **24 %** | Directe |
| Volume (`15 cl de lait`) | **9 %** | Table de densité |
| Cuillère / pincée / poignée | **23 %** | Table de conversion |
| Compte (`2 gousses d'ail`) | **27 %** | Table de poids unitaires |
| **Aucune quantité** (`sel, poivre`) | **16 %** | **Irrécupérable automatiquement** → borne d'incertitude (D18) |

84 % des lignes portent une quantité. 33 % exploitables immédiatement, 50 % via les tables,
**16 % jamais**. Ces 16 % sont la justification de D18 et de `resolution_source = aucune`.

### 4.3 Étapes — statistiques jointes (55 recettes, 308 étapes)

| Grandeur | Mesuré |
|---|---|
| Étapes par recette | 5,6 · **0 recette monolithique** |
| Recettes utilisant le four | **50,9 %** |
| **Recettes au four SANS température** | **10/28 = 35,7 % des recettes au four** |
| Étapes mentionnant une durée | **22,4 %** |
| **Étapes SANS durée** | **77,6 %** |
| **Étapes avec appareil mais SANS durée** | **56,2 %** |
| **Recettes avec `totalTime`/`cookTime` en en-tête** | **100 %** |

> **Le trou des durées est le risque n°1 du projet.** `duration_min` est la colonne vertébrale
> du RCPSP : sans durée, une tâche n'est **pas ordonnançable du tout**, alors qu'une
> température manquante ne dégrade que l'arbitrage du four.
>
> **Ce qui le referme** : les 100 % de `totalTime`. D15 fait estimer les durées par le LLM
> **sous contrainte que leur somme égale le temps total déclaré par le site**, ce qui
> transforme une invention invérifiable en répartition contrainte, avec un contrôle de
> cohérence automatique (`|Σ estimé − totalTime| ≤ 10 %`, sinon `needs_review`).

### 4.4 Données de référence — vérifiées

| Source | État | Licence |
|---|---|---|
| **CIQUAL** (ANSES) | XLS 3,6 Mo, ~3 200 aliments | **Licence Ouverte Etalab** (`fr-lo`) |
| **Open Food Facts** API v2 | 200, données complètes | **ODbL** — attribution **et partage à l'identique** |
| **Open Prices** API v1 | 200, données réelles | Open Food Facts |
| `robots.txt` des 6 sites FR retenus | **Aucun blocage IA** ; sitemaps publiés | — |

### 4.5 Ce qui reste à dérisquer, avec le comportement en cas d'échec

| # | À mesurer | Go | Si échec |
|---|---|---|---|
| R1 | Extraction LLM des attributs d'étape (appareil, température, `load_type`) sur 20 recettes | ≥ 85 % | 70-85 % : lot 1 construit, mais relecture systématique des étapes four. < 70 % : lot 1 reporté, on revoit l'approche. |
| R1b | **Durées estimées sous contrainte (D15)** sur 20 recettes : écart `|Σ − totalTime|` | ≤ 10 % sur ≥ 90 % des recettes | < 90 % : on n'ordonnance que les recettes dont les durées sont déclarées, et le catalogue utile s'effondre → **c'est le test à faire en premier**. |
| R2 | Relaxations de précédence (D14) sur 20 recettes | **0 faux positif** | ≥ 1 faux positif : relaxations désactivées, ordre total strict, parallélisme inter-recettes seulement. |
| R3 | Vision sur 5 photos réelles du frigo | ≥ 70 % identifiés, **0 hallucination** | Hallucination : la photo ne préremplit plus, elle suggère, et tout est confirmé. |
| R4 | Couverture d'Open Prices sur 30 produits courants | ≥ 40 % | < 40 % : `OpenPricesSource` reste branché mais le lot 5 démarre sur les tickets seuls. |

---

## 5. Modèle de données

### 5.0 Les trois classes d'isolation (D16) — préalable à toute policy RLS

| Classe | Tables | Règle |
|---|---|---|
| **A — Référentiel immuable** | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `appliance_catalog` | Lecture pour tout utilisateur authentifié. Écriture réservée au **rôle de service**. |
| **B — Catalogue partagé, écriture authentifiée et tracée** | `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency`, `ingestion_job` | Lecture par tous. **Écriture par tout foyer authentifié**, avec `edited_by_household_id` et `edited_at` sur chaque ligne modifiée. C'est ce qui rend possible la relecture (lot 0b) et la correction à l'usage (D17). |
| **C — Données de foyer** | `household`, `user_profile`, `nutrition_target`, `invitation`, `household_appliance`, `household_unit_weight`, **`household_ingredient_resolution`**, `weighing`, `session`, `session_recipe`, `session_portion`, `session_appliance_override`, `session_plan`, `plan_conflict`, `fridge_inventory`, `fridge_item`, `shopping_list`, `shopping_item`, `product`, `price_point`, `receipt`, `llm_usage` | RLS stricte `household_id = current_household()`. |

**Point corrigé par rapport à la v2** : la résolution des poids est **par foyer** (D3), donc elle
ne peut pas vivre dans `recipe_ingredient` qui est partagée. Deux foyers qui pèsent le même
ingrédient s'écraseraient. D'où :

- `recipe_ingredient` (classe B) porte la **résolution de référence** :
  `grams_reference`, `resolution_source ∈ { référence, llm, aucune }`
- `household_ingredient_resolution` (classe C) porte la **résolution du foyer** :
  `recipe_ingredient_id`, `household_id`, `grams`, `resolution_source ∈ { pesé, foyer }`

La cascade §7.3 lit d'abord la table C, puis retombe sur la colonne B.

**Recettes créées par un foyer** (lot 4) : `recipe.owner_household_id` NULL pour une recette
importée, non-NULL pour une recette créée ; `recipe.visibility ∈ { privée, partagée }`,
**défaut `privée`**. Une recette créée n'apparaît chez les autres foyers que si son foyer la
partage explicitement.

**Verrous juridiques, au même endroit** :
- le texte source des étapes est stocké pour la relecture ; l'application affiche la version
  structurée avec attribution et lien vers la source ; aucune exposition publique ;
- **ODbL** (Open Food Facts) impose attribution **et partage à l'identique** de toute base
  dérivée. Sans effet en instance privée ; **bloquant avant toute ouverture publique**, au
  même titre que le droit d'auteur sur les étapes.

### 5.1 Foyer et personnes

| Table | Champs clés |
|---|---|
| `household` | `id`, `name`, **`llm_monthly_cap_eur`**, `created_at` |
| `user_profile` | `id` (→ `auth.users`), `household_id`, `display_name` |
| `nutrition_target` | `user_profile_id`, `kcal`, `protein_g`, `fiber_g`, `carb_g`, `fat_g`, `valid_from` |
| `invitation` | `household_id`, `email`, `token`, `expires_at`, `accepted_at` |

`nutrition_target` est historisée. **Les cibles sont macro uniquement** — les micronutriments
sont affichés (§11 q. 4) mais ne font l'objet d'aucune cible. Décision explicite.

### 5.2 Aliments, poids et conversions

| Table | Rôle |
|---|---|
| `food` | CIQUAL + Open Food Facts. `source`, `source_code`, `name`, `state` (cru \| cuit), `nutrients` jsonb /100 g |
| `food_yield_factor` | **Priorité** : si une entrée CIQUAL « cuit » existe, elle prime ; le facteur ne sert qu'à défaut. |
| `unit_weight` | Poids unitaire de référence (USDA FoodData Central) + `confidence` |
| `unit_conversion` | Cuillères, pincées, poignées → grammes, **par famille d'aliment**. Couvre les 23 % de §4.2. |
| `density` | g/ml par aliment, pour les 9 % de volumes |
| `default_temperature` | Température par défaut par type de préparation, **marquée estimée**. Répond aux 35,7 % de §4.3. |
| `household_unit_weight` | Poids unitaires appris des pesées du foyer (classe C) |
| `weighing` | §5.2.1 |

Sources de `unit_conversion`, `density` et `default_temperature` : **aucune base ouverte ne les
fournit telles quelles.** Elles sont constituées à la main (~150 lignes au total) à partir des
tables de portions USDA et de références culinaires, versionnées dans le dépôt comme des
données de seed, et corrigeables. C'est un **livrable identifié du lot 0a-2**, pas un détail.

#### 5.2.1 `weighing` et la règle d'apprentissage

```
weighing(id, household_id, recipe_ingredient_id, food_id,
         qty_observed, unit_observed,   -- « 2 poivrons »
         grams,                         -- 300
         session_id NULL,               -- le lot 0c précède le lot 1
         at)
```

1. poids unitaire dérivé = `grams / qty_observed`, si `unit_observed` est un compte ;
2. **rejet des aberrantes** hors `[0,4× ; 2,5×]` la référence `unit_weight` ;
   **si aucune référence n'existe** pour cet aliment — précisément le cas où l'apprentissage
   sert le plus — aucun filtre n'est appliqué, mais le seuil d'activation passe de 3 à
   **5 observations** ;
3. `household_unit_weight` = **médiane** des observations retenues (robuste aux fautes de frappe) ;
4. activation à partir de **3 observations** (5 dans le cas sans référence) ; en dessous, la
   référence prime et le compteur est affiché.

### 5.3 Recettes

| Table | Champs clés |
|---|---|
| `recipe` | `source_url`, `source_name`, `origin`, `owner_household_id` NULL, `visibility`, `yield_servings`, `total_time_min`, `license_note`, `edited_by_household_id`, `edited_at` |
| `recipe_ingredient` | `raw_text`, `food_id`, `qty`, `unit`, `grams_reference`, `resolution_source`, `confidence` |
| `recipe_step` | `ordinal`, `text`, **`duration_min`**, **`duration_source`** (déclarée \| estimée_contrainte), `appliance_type`, `temperature_c`, `temperature_source`, `load_type`, `confidence` |
| `recipe_step_dependency` | `before_id`, `after_id`, `origin` (defaut \| llm \| confirme) |
| `ingestion_job` | `url`, `state`, `attempts`, `error`, `content_hash` |

`load_type` ∈ `{ actif, passif, bloquant }`. **`duration_min` n'est jamais NULL après
ingestion** (D15) ; une recette dont les durées n'ont pas pu être bouclées reste en
`needs_review` et **n'est pas ordonnançable**.

### 5.4 Reste

`session`, `session_recipe`, `session_portion`, `session_plan`, `plan_conflict` — lot 1.
`shopping_list` / `shopping_item` — lot 2. `fridge_inventory` / `fridge_item` — lot 3.
`product`, `price_point`, `receipt` — lot 5.
`llm_usage(household_id **NULL**, month, calls, cost_eur, kind)` — lot 0a-1 :
**`household_id` NULL = consommation système** (ingestion mutualisée, D11/D13), soumise au
budget global de l'opérateur ; non-NULL = vision et propositions, soumises à
`household.llm_monthly_cap_eur`. La RLS ne laisse un foyer lire que ses propres lignes.

---

## 6. L'optimiseur de session — lot 1

### 6.1 Formalisation

RCPSP. **Tâches** = les `recipe_step`, avec durée (D15) et précédences (D14).

| `load_type` | Consomme | Exemple |
|---|---|---|
| `actif` | **1 unité de `mains`** | « Hacher l'oignon » |
| `passif` | un appareil, **0 `mains`** | « 25 min au four à 180 °C » |
| `bloquant` | 1 `mains` **et** un appareil | « Remuer le risotto » |

**Ressources**

| Ressource | Capacité | Sémantique |
|---|---|---|
| `mains` | nombre de cuisiniers (2) | Classique |
| `four` | **`capacity` = nombre de plats simultanés (défaut 2)** + état `température` | Partage **ssi** capacité libre **et** `|T1 − T2| ≤ 10 °C`. Consigne retenue = la plus haute. **Les durées ne sont pas réajustées** : un four domestique dérive déjà de ±15 °C, 10 °C est sous le bruit. Le plan affiche la consigne réelle par plat. |
| `feux` | 4 par défaut | Classique |
| `air_fryer` | 1 | Changement de température sans coût |
| `robot_cuiseur` | 1 | Cuisson longue `passif` |

**Préchauffage** : tâche ordonnançable sur `four`, `load_type = passif`, 12 min par défaut,
insérée avant la première tâche d'un palier et à chaque changement de palier.

La tolérance de ±10 °C n'est **pas** la « tolérance culinaire » écartée en D5 : celle-ci
cuisait *tout* à une moyenne en rallongeant les durées. Ici on ne regroupe que le déjà
compatible, et le reste est séquencé.

**Dépassement de `target_duration_min`** : jamais d'échec silencieux. Le plan est produit, le
dépassement affiché en minutes, une éviction proposée par coût marginal décroissant.

**Recette non ordonnançable** (durées non bouclées) : exclue de la sélection avec le motif
affiché, jamais planifiée avec une durée inventée.

### 6.2 Algorithme

*List scheduling* par chemin critique, puis recherche locale sur l'ordre. Déterministe,
< 100 ms pour 5 recettes. **L'explicabilité prime sur l'optimalité** : replanifier sans une
recette donne son coût marginal exact, d'où « ces 2 recettes ensemble = +35 min ; remplacer la
2ᵉ par X = −30 min ». Un solveur optimal ferait mieux en makespan et serait incapable de
produire cette phrase.

### 6.3 Sortie

Gantt par ressource · liste chronologique · bilan nutritionnel **par personne, en intervalle**
(D18), portions calculées depuis `nutrition_target`.

---

## 7. Ingestion

### 7.1 Chaîne

`queued → fetching → extracting → resolving → ready | needs_review | failed`

1. **découverte** — sitemaps publics (D12).
2. **fetch** — JSON-LD en priorité (55/56 mesuré) ; extraction LLM en repli.
3. **extract** — attributs d'étape et relaxations de précédence, avec confiance par champ (R1, R2).
4. **durées** — estimation contrainte (D15) ; contrôle `|Σ − totalTime| ≤ 10 %`, sinon `needs_review`.
5. **resolve** — cascade §7.3 ; calcul des macros **en intervalle** (D18).
6. **relecture paresseuse (D17)** — une recette entre en catalogue sans relecture humaine. La
   file de relecture n'est alimentée qu'**à la sélection** d'une recette pour une session :
   à ce moment, les champs à faible confiance de *cette* recette sont présentés. La charge est
   donc proportionnelle à l'usage, pas à la taille du catalogue.

Reprise après erreur, déduplication par URL canonique et `content_hash`.

### 7.2 Limites que l'on s'impose

- Découverte par **sitemaps publics uniquement**, jamais de crawl exploratoire.
- **Débit poli** : 1 requête / 2-3 s, `robots.txt` respecté.
- Droit d'auteur et ODbL : voir §5.0.

### 7.3 Cascade de résolution des poids

| Priorité | Source | Table | `resolution_source` |
|---|---|---|---|
| 1 | Pesée attachée à **cette ligne** | `household_ingredient_resolution` (C) | `pesé` |
| 2 | `household_unit_weight` (≥ 3 obs., médiane) | C | `foyer` |
| 3 | `unit_weight` / `unit_conversion` / `density` | A | `référence` |
| 4 | Estimation LLM, marquée, remontée en tête des choses à peser | B | `llm` |
| — | Aucune quantité exprimée (16 % mesurés) | B | `aucune` → **élargit l'intervalle** (D18) |

Les valeurs nutritionnelles /100 g ne viennent **jamais** du LLM : CIQUAL ou OFF exclusivement.
La nutrition présente dans le JSON-LD des sites n'est **pas** utilisée comme source
(couverture de 7 % à 100 % selon les sites) — au plus comme contrôle de cohérence.

### 7.4 Calcul des macros en intervalle (D18)

Pour chaque recette : `macro_min` ne compte que les lignes résolues ; `macro_max` ajoute une
borne haute plausible pour chaque ligne `aucune` (quantité typique de la famille d'aliment).
Les filtres du lot 4 s'appliquent à la **borne défavorable** : « ≥ 30 g de protéines » teste
`protein_min`, « < 500 kcal » teste `kcal_max`. Une recette dont l'ingrédient protéique est la
ligne sans quantité ne peut donc pas passer le filtre par accident.

---

## 8. LLM — usage, coûts, quotas

| Usage | Modèle | Coût unitaire | Budget |
|---|---|---|---|
| Extraction d'une recette (durées comprises) | rapide | ~0,01 € | **Global** (D11) |
| Vision — photo de frigo | rapide | ~0,003 € | Foyer |
| Vision — ticket de caisse | rapide | ~0,005 € | Foyer |
| Proposition / création de recettes | plus capable | ~0,05 € | Foyer |

**Amorçage (D17)** : 5 000 recettes ≈ **50 € une fois**, sur le budget global, mutualisé entre
tous les foyers. **Régime permanent, 2 personnes** : ~1,30 €/mois sur le budget foyer.

| Poste | Coût |
|---|---|
| Supabase (free tier, UE) | 0 € |
| Cloudflare Pages | 0 € |
| LLM — amorçage | 50 € une fois |
| LLM — régime permanent | < 2 €/mois |
| Resend (free) | 0 € |
| Domaine (facultatif) | 12 €/an |

**Volumétrie** : 5 000 recettes × ~9 ingrédients × ~6 étapes ≈ 75 000 lignes. Très en deçà des
500 Mo du free tier Supabase. **Open Food Facts n'est pas chargé en dump** (~3,6 M de produits,
~10 Go, incompatible avec le free tier) : il est **interrogé à la demande et mis en cache**
dans `food` au fil des produits rencontrés. Seul CIQUAL, borné à ~3 200 aliments, est chargé
intégralement.

---

## 9. Prix et budget — lot 5

```ts
interface PriceSource {
  readonly name: string
  readonly reliability: 'exact' | 'community' | 'estimated'
  search(product: FoodRef): Promise<PricePoint[]>
}
```

| Adaptateur | Fiabilité | État |
|---|---|---|
| `ReceiptSource` — tickets photographiés | exact | À construire. Alimente aussi le lot 6. |
| `OpenPricesSource` | community | **API 200, données réelles.** Couverture à mesurer (R4). |
| `CarrefourDriveSource` | exact, fragile | Hors CGU, anti-bot, proxies. **Isolé** : s'il tombe, l'app continue. |
| `LidlCatalogSource` | estimated | Prospectus hebdomadaire. **Lidl FR n'a pas de boutique alimentaire en ligne.** |

---

## 10. Découpage en lots

| Lot | Contenu | Livre |
|---|---|---|
| **0a-1 · Schéma et accès** | Projet Supabase UE · schéma des classes A, B et des tables foyer de §5.1 **uniquement** (les tables des lots 1-5 arrivent avec leur lot) · `current_household()` + policies des 3 classes + rôle de service · flux d'invitation complet **via Resend** · CRUD profils et cibles historisées · compteur `llm_usage` et plafonds. **UI** : accepter une invitation, saisir ses cibles, régler le plafond. | Deux comptes, un foyer, l'isolation prouvée. |
| **0a-2 · Référentiels** | Import CIQUAL intégral · accès OFF à la demande avec cache · **constitution à la main de `unit_conversion`, `density`, `default_temperature`** (~150 lignes de seed versionnées) | Le socle nutritionnel. Ne bloque que 0b et 0c. |
| **0b · Ingestion** | Précédé de **R1b, R1, R2**. Worker MCP, découverte sitemap, extraction, durées contraintes (D15), normalisation, calcul en intervalle (D18), file de relecture paresseuse (D17). **UI** : écran de relecture à la sélection. | ~5 000 recettes structurées et filtrables. |
| **0c · Pesée** | Boucle d'apprentissage §5.2.1. **UI** : saisie des poids. | La promesse « strict » devient vraie. |
| **1 · Cuisiner** | Optimiseur, équipement par session, Gantt, arbitrage du four, bilan par personne | **La session du dimanche fonctionne.** |
| **2 · Courses** | Agrégation, édition, envoi par e-mail | La liste arrive le samedi. |
| **3 · Frigo** | Autocomplétion, puis photo + vision (R3), soustraction à la liste | Plus d'achats en double. |
| **4 · Envies et propositions** | Filtres sur bornes défavorables (D18), densité protéique · proposition et création de recettes par LLM (`origin = générée`, `visibility = privée` par défaut) | Le moteur de suggestion. |
| **5 · Prix** | `PriceSource` + 4 adaptateurs, estimation du panier, veille nouveautés | Budget prévisible. |
| **6 · Suivi** | Consommé et dépensé, courbes, comparaison aux cibles | Le recul sur 3 mois. |

Le lot 0 **n'est pas invisible** : 0a-1, 0b et 0c livrent chacun une interface. Le back-office
est volontairement rudimentaire — le soin visuel commence au lot 1.

---

## 11. Questions ouvertes

1. **RGPD** — poids, objectifs caloriques et photos de frigo relèvent probablement des données
   de santé (art. 9). Hébergement UE acquis ; export et suppression de compte à prévoir.
   Qualification à confirmer.
2. **Conservation des plats** — combien de jours au frigo, quoi congeler ? Dimensionne le
   nombre de portions par session. Non tranché.
3. **Validation des recettes générées** (lot 4) — quel niveau avant passage en `visibility = partagée` ?
4. **Micronutriments** — CIQUAL en fournit ~60. Lesquels afficher sans noyer l'interface ?
   (Aucune cible : §5.1.)
5. **Veille « nouveautés protéinées »** — fréquence calée sur les prospectus hebdomadaires ?

---

## 12. Hors scope (YAGNI)

- Application iOS/Android native (D10)
- Inscription ouverte, CGU, paiement, abonnement (D7)
- LLM auto-hébergé (D9)
- Partage social, communauté, notation de recettes
- Commande automatique chez un drive
- Suivi du poids corporel et de la composition corporelle
- Import depuis MyFitnessPal, Yazio et équivalents
