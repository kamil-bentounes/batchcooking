# Design — Application de batch cooking, diet et budget

- **Date** : 2026-09-17
- **Version** : 2 — intègre les mesures terrain du 2026-09-17 et la relecture du spec
- **Statut** : design validé, en attente du plan d'implémentation du lot 0a
- **Utilisateurs** : un foyer de 2 personnes au départ, puis d'autres foyers **sur invitation**

---

## 1. Objectif

Une application qui permet à un foyer de :

1. constituer un catalogue de recettes saines, riches en protéines et en fibres, et gourmandes ;
2. planifier une **session de batch cooking hebdomadaire d'environ 2 h** dont les étapes sont
   ordonnées pour exploiter en parallèle les électroménagers disponibles ;
3. connaître le bilan nutritionnel exact de ce qui est cuisiné, **par personne**, chacun ayant
   ses propres objectifs ;
4. générer la liste de courses correspondante, déduction faite de ce qu'il y a déjà au frigo,
   et la recevoir par e-mail ;
5. estimer le budget courses à partir de prix réels ;
6. suivre dans le temps ce qui a été mangé et dépensé.

**Ce n'est pas** une application de recettes de plus. Le différenciateur est le point 2 :
l'ordonnancement de la session sous contrainte d'équipement.

---

## 2. Décisions verrouillées

| # | Décision | Alternative écartée | Motif |
|---|---|---|---|
| D1 | **Base canonique locale**, alimentée par une ingestion asynchrone | Recherche web live à chaque requête | Sans ingrédients et étapes structurés et stables, les lots 1, 2 et 5 sont impossibles. Latence 10-30 s et non-déterminisme rédhibitoires. |
| D2 | **MCP = bras d'ingestion**, pas chemin de requête | MCP interrogé à chaud par l'app | Mêmes outils (`search_recipes`, `fetch_recipe`, `extract_recipe`), mais ils écrivent en base. L'app lit la base : instantané, gratuit, hors ligne. |
| D3 | **Précision nutritionnelle stricte, avec boucle d'apprentissage par pesée** | Mapping automatique approximatif ; pesée systématique obligatoire | Kamil a une balance. La boucle rend la friction décroissante au lieu de permanente. |
| D4 | **Cibles nutritionnelles par personne, portions calculées** | Cible commune au foyer | Cas réel d'un couple. Presque gratuit au lot 0, très cher à rétro-ajouter. |
| D5 | **Conflit de four : grouper si compatible, séquencer en repli, afficher le coût en minutes** | Écarter des recettes ; séquencer toujours ; tolérance culinaire | L'utilisateur arbitre en connaissance de cause. |
| D6 | **Équipement : catalogue en base, coché par foyer, surchargeable par session** | Équipement en dur | L'optimiseur prend l'équipement en entrée, jamais en constante. |
| D7 | **Multi-tenant sur invitation** — RLS dès le lot 0a, pas d'inscription ouverte | Produit public gratuit ou payant | Pas de CGU, pas de paiement, pas de modération. Isolation propre dès le départ. |
| D8 | **Prix : interface `PriceSource` + adaptateurs indépendants** | Scraping des drives au fondement du lot 5 | Lidl FR n'a pas de boutique alimentaire en ligne : rien à scraper. Les autres sont hors CGU et cassent. |
| D9 | **LLM en API, pas auto-hébergé** | GPU loué, LLM local | Bascule à ~40 000 appels/mois ; usage réel ~250. Serverless : 7× le prix à l'appel, +30-60 s de cold start. |
| D10 | **PWA, pas d'application native** | App iOS | 99 $/an + review pour un usage sur invitation. La PWA s'installe et fonctionne hors ligne. |
| D11 | **Quota LLM par foyer dès le lot 0a** | Pas de limite | Plafond mensuel en euros, configurable, avec mode dégradé. |
| **D12** | **Découverte par les sitemaps publics**, pas par crawl | Crawl de site | **Mesuré** : aucun `robots.txt` testé ne bloque l'IA, et les sitemaps exposent 112 000 recettes. Les sitemaps existent précisément pour être lus par des robots. |
| **D13** | **Référentiel partagé / données de foyer isolées** — voir §4.0 | Tout isolé par foyer ; tout global | Isoler le catalogue de recettes ferait repayer l'extraction LLM à chaque foyer. Tout globaliser exposerait les données personnelles. |
| **D14** | **Précédences d'étapes : ordre total par défaut**, relaxations proposées par le LLM et confirmées | Ordre total figé ; parallélisme deviné sans confirmation | Un parallélisme faux fait rater un plat. Le défaut sûr est séquentiel ; le gain est opt-in. |

---

## 3. Mesures terrain — dérisquage effectué le 2026-09-17

Tout ce qui suit a été **mesuré**, pas estimé. Méthode : URLs tirées au sort dans les sitemaps
publics, extraction du JSON-LD `schema.org/Recipe`, classification automatique de chaque ligne
d'ingrédient. Scripts conservés.

### 3.1 Sources de recettes retenues

| Site | Recettes au sitemap | JSON-LD | Ingrédients | Étapes | Nutrition | Remarque |
|---|---|---|---|---|---|---|
| **CuisineAZ** | **30 000** | ✅ | ✅ | ✅ | 7 % | **Meilleur format** : `250 g` / `Farine de blé` déjà séparés |
| **P'tit Chef** | **65 000** | ✅ | ✅ | ✅ | 64 % | |
| **Marmiton** | **15 000** | ✅ | ✅ | ✅ | 64 % | `servingSize` en grammes |
| **Journal des Femmes** | **2 000** | ✅ | ✅ | ✅ | 100 % | Lignes de section (« Pour la pâte : ») à filtrer |
| 750g | — | ✅ | ✅ | ⚠️ | — | Étapes parfois non découpées |
| Cuisine Actuelle · Chef Simon · Supertoinette · Ricardo Cuisine | — | ✅ | ✅ | ✅ | — | Complément |
| BBC Good Food · Budget Bytes · Skinnytaste | — | ✅ | ✅ | ✅ | ✅ | Anglais, très propres |

**Bloqués en 403 depuis une IP de datacenter** : Allrecipes, Serious Eats, EatingWell,
Simply Recipes (groupe Dotdash Meredith), Papilles et Pupilles, Ligne & Protéines.
Non retenus.

**Résultat qui oriente le design — sites muscu / healthy français : 0 structuré sur 9.**
Espace-Musculation, Fitadium, Fitnessmith, Isostar, Go Recettes, Mon Coach Gourmand,
Move Your Fit, Recette Protéine, Sab'n'Pepper : aucune donnée structurée, uniquement du
texte d'article.

> **Conséquence** : l'axe « muscu / healthy » ne se construit **pas** en ciblant des sites
> spécialisés, mais en **filtrant sur les macros recalculées** du catalogue généraliste.
> « ≥ 30 g de protéines et < 500 kcal » trié sur 112 000 recettes est strictement supérieur
> à n'importe quelle sélection éditoriale — et ne dépend d'aucun site fragile.

### 3.2 Distribution réelle des quantités — 475 lignes, 55 recettes, 4 sites

| Forme | Part | Résolution |
|---|---|---|
| Masse (`250 g de farine`) | **24 %** | Directe |
| Volume (`15 cl de lait`) | **9 %** | Table de densité (eau 1,0 · huile 0,92 · farine 0,55…) |
| Cuillère / pincée / poignée | **23 %** | Table de conversion |
| Compte (`2 gousses d'ail`) | **27 %** | Table de poids unitaires |
| **Aucune quantité** (`sel, poivre`, `romaine`) | **16 %** | **Arbitrage humain, ou exclusion du calcul** |

**84 % des lignes portent une quantité.** 33 % exploitables immédiatement, 50 % via les tables,
**16 % irrécupérables automatiquement**. Ces 16 % sont le dimensionnement réel de la file de
relecture, et la justification de `resolution_source` (§4.3).

### 3.3 Étapes

- **5,6 étapes par recette** en moyenne ; **0 recette monolithique sur 55**.
- Durée mentionnée dans le texte : **72 %**
- Four mentionné : **50 %**
- **Température mentionnée : 36 % seulement**

> **Risque identifié** : une recette sur deux qui utilise le four n'en donne pas la température.
> Il faut une **table de températures par défaut par type de préparation** (gratin 180,
> rôtissage 200, pâtisserie 180, séchage 90…), marquée comme estimée, et confirmable.
> Sans elle, l'arbitrage de four (D5) s'appuie sur du vide dans la moitié des cas.

### 3.4 Données de référence — toutes disponibles et vérifiées

| Source | État | Licence |
|---|---|---|
| **CIQUAL** (ANSES) | XLS 3,6 Mo téléchargeable | **Licence Ouverte Etalab** (`fr-lo` sur data.gouv.fr) — **question fermée** |
| **Open Food Facts** API v2 | 200, données complètes | ODbL — attribution et partage à l'identique obligatoires |
| **Open Prices** API v1 | 200, données réelles | Open Food Facts |
| TheMealDB | 200 (clé de test) | Complément marginal |
| `robots.txt` des 6 sites FR retenus | **Aucun blocage IA** ; sitemaps publiés (Marmiton : 12) | — |

### 3.5 Ce qui reste à dérisquer avant le lot 0b

| # | À mesurer | Critère de go |
|---|---|---|
| R1 | Extraction LLM des attributs d'étape (appareil, température, actif/passif) sur 20 recettes | **≥ 85 %** des étapes correctes sur les 3 attributs |
| R2 | Détection LLM des relaxations de précédence (« pendant ce temps ») — D14 | **0 faux positif** sur 20 recettes. Un faux positif fait rater un plat. |
| R3 | Vision sur 5 photos réelles du frigo | **≥ 70 %** des produits identifiés, **0 hallucination** d'un produit absent |
| R4 | Couverture d'Open Prices sur 30 produits d'une liste de courses type | **≥ 40 %** pour être utile en amorçage |

---

## 4. Modèle de données

### 4.0 Périmètre d'isolation (D13) — préalable à toute policy RLS

| Nature | Tables | Accès |
|---|---|---|
| **Référentiel partagé** | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `default_temperature`, `appliance_catalog`, `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` | Lecture pour tous les foyers authentifiés. Écriture réservée au worker d'ingestion (rôle de service). |
| **Isolé par `household_id`** | `household`, `user_profile`, `nutrition_target`, `invitation`, `household_appliance`, `household_unit_weight`, `weighing`, `session`, `session_plan`, `plan_conflict`, `session_appliance_override`, `fridge_inventory`, `fridge_item`, `shopping_list`, `shopping_item`, `price_point`, `receipt`, `llm_usage` | RLS stricte : `household_id = current_household()`. |

Conséquences assumées :
- l'extraction LLM d'une recette est payée **une fois pour tous les foyers** — c'est ce qui
  tient le budget §7 ;
- le **droit d'auteur** (§6.2) est traité par le fait que l'instance est privée sur invitation :
  le texte source est stocké pour la relecture, l'application affiche la version structurée
  avec attribution et lien vers la source, et rien n'est exposé publiquement. **À réexaminer
  intégralement avant toute ouverture publique** — ce serait un changement de nature, pas un
  paramètre.

### 4.1 Foyer et personnes

| Table | Champs clés |
|---|---|
| `household` | `id`, `name`, **`llm_monthly_cap_eur`** (D11), `created_at` |
| `user_profile` | `id` (→ `auth.users`), `household_id`, `display_name` |
| `nutrition_target` | `user_profile_id`, `kcal`, `protein_g`, `fiber_g`, `carb_g`, `fat_g`, `valid_from` |
| `invitation` | `household_id`, `email`, `token`, `expires_at`, `accepted_at` |

`nutrition_target` est historisée : un objectif change, le passé reste juste.
**Les cibles sont macro uniquement.** Les micronutriments sont *affichés* (§11 q. 5) mais ne
font l'objet d'aucune cible — décision explicite, pas un oubli.

### 4.2 Aliments, poids et conversions

| Table | Rôle |
|---|---|
| `food` | CIQUAL + Open Food Facts. `source`, `source_code`, `name`, `state` (cru \| cuit), `nutrients` jsonb /100 g |
| `food_yield_factor` | Facteur de rendement à la cuisson. **Règle de priorité** : si une entrée CIQUAL « cuit » existe pour l'aliment, elle prime ; le facteur n'est utilisé qu'à défaut. Source : coefficients CIQUAL/FAO. |
| `unit_weight` | Poids unitaire **de référence** — « 1 poivron → 150 g ». Source USDA FoodData Central, + `confidence` |
| `unit_conversion` | Cuillères, pincées, poignées, verres → grammes, **par famille d'aliment** (1 c. à soupe : huile 13,5 g, farine 8 g, sucre 12 g). Couvre les 23 % de §3.2. |
| `density` | g/ml par aliment, pour les 9 % de volumes |
| `default_temperature` | Température par défaut par type de préparation, **marquée estimée**. Répond au risque §3.3. |
| `household_unit_weight` | **Poids unitaires appris des pesées du foyer** — matérialise D3 |
| `weighing` | Voir §4.2.1 |

#### 4.2.1 `weighing` et la règle d'apprentissage

```
weighing(
  id, household_id,
  recipe_ingredient_id,      -- la cible écrasée (priorité 1 de la cascade)
  food_id,
  qty_observed, unit_observed,  -- « 2 poivrons »
  grams,                        -- 300
  session_id NULL,              -- nullable : le lot 0c existe avant le lot 1
  at
)
```

**Règle d'apprentissage** (déterministe, pas « une moyenne » vague) :

1. poids unitaire dérivé = `grams / qty_observed`, uniquement si `unit_observed` est un compte ;
2. rejet des valeurs hors de `[0,4 × ; 2,5 ×]` la valeur de référence `unit_weight` — une
   saisie aberrante ne doit pas empoisonner la table ;
3. `household_unit_weight` = **médiane** des observations retenues (robuste aux erreurs de
   frappe, contrairement à la moyenne) ;
4. la table n'est utilisée qu'à partir de **3 observations** ; en dessous, la référence prime
   mais le compteur est affiché.

**Distinction priorité 1 / priorité 2 de la cascade §6.3** : la priorité 1 est une pesée
attachée à *cette* ligne d'ingrédient (`recipe_ingredient_id`), la priorité 2 est la
généralisation apprise pour cet aliment dans ce foyer.

### 4.3 Recettes

| Table | Champs clés |
|---|---|
| `recipe` | `source_url`, `source_name`, `origin` (importée \| générée \| manuelle), `yield_servings`, `license_note` |
| `recipe_ingredient` | `raw_text`, `food_id`, `qty`, `unit`, `grams_resolved`, **`resolution_source`**, `confidence` |
| `recipe_step` | `ordinal`, `text`, `duration_min`, `appliance_type`, `temperature_c`, **`load_type`**, `confidence` |
| `recipe_step_dependency` | `before_id`, `after_id`, `origin` (defaut \| llm \| confirme) — voir D14 |
| `ingestion_job` | `url`, `state`, `attempts`, `error`, `content_hash` |

- `resolution_source` ∈ `{ pesé, foyer, référence, llm, aucune }` — `aucune` couvre les 16 %
  mesurés en §3.2, exclus du calcul nutritionnel et signalés dans l'interface.
- `load_type` ∈ `{ actif, passif, bloquant }` — voir §5.

### 4.4 Équipement

`appliance_catalog` (référentiel) · `household_appliance` (possédé, avec `capacity`) ·
`session_appliance_override` (disponible ce jour-là, D6).

### 4.5 Session, frigo, courses, prix

`session`, `session_recipe` (jonction), `session_portion` (jonction par personne),
`session_plan`, `plan_conflict` — **lot 1**.
`fridge_inventory` / `fridge_item` — **lot 3**.
`shopping_list` / `shopping_item` — **lot 2**.
`product`, `price_point`, `receipt` — **lot 5**.
`llm_usage(household_id, month, calls, cost_eur)` — **lot 0a**, plafond sur
`household.llm_monthly_cap_eur`, **exprimé en euros**, et **il s'applique aussi au worker
d'ingestion**.

---

## 5. L'optimiseur de session — lot 1

### 5.1 Formalisation

Un RCPSP. **Tâches** = les `recipe_step`, avec durée et précédences (D14).

| `load_type` | Consomme | Exemple |
|---|---|---|
| `actif` | **1 unité de `mains`** | « Hacher l'oignon » |
| `passif` | un appareil, **0 unité de `mains`** | « 25 min au four à 180 °C » |
| `bloquant` | 1 unité de `mains` **et** un appareil | « Remuer le risotto » |

C'est cette distinction qui crée le parallélisme. Sans elle, un « plan de batch cooking »
n'est qu'une liste d'étapes bout à bout.

**Ressources**

| Ressource | Capacité | Sémantique |
|---|---|---|
| `mains` | nombre de cuisiniers (2) | Classique |
| `four` | **`capacity` = nombre de plats simultanés (défaut 2)**, ET un état `température` | Deux tâches peuvent partager le four **ssi** `capacity` non dépassée **et** `|T1 − T2| ≤ 10 °C`. La température de consigne retenue est alors la plus haute. |
| `feux` | 4 par défaut, paramétrable | Classique |
| `air_fryer` | 1 | Changement de température **sans coût** (montée quasi immédiate) |
| `robot_cuiseur` | 1 | Cuisson longue `passif` |

**Préchauffage** : tâche ordonnançable sur la ressource `four`, `load_type = passif`
(elle ne consomme pas `mains`), durée 12 min par défaut, insérée automatiquement avant la
première tâche four d'un palier de température, et à chaque changement de palier.

La tolérance de ±10 °C n'est **pas** la « tolérance culinaire » écartée en D5 : cette dernière
consistait à cuire *tout* à une température moyenne en rallongeant les durées. Ici on ne
regroupe que ce qui est déjà compatible, et le reste est séquencé.

**Dépassement de `session.target_duration_min`** : jamais d'échec silencieux. Le plan est
produit, le dépassement est affiché en minutes, et une éviction est proposée par ordre de
coût marginal décroissant. L'utilisateur tranche.

### 5.2 Algorithme

*List scheduling* par chemin critique, puis recherche locale sur l'ordre.
Déterministe, < 100 ms pour 5 recettes.

**L'explicabilité prime sur l'optimalité.** En replanifiant sans une recette donnée, on obtient
son coût marginal exact, d'où :

> « Ces 2 recettes ensemble = **+35 min** (four à 180 et 210 °C).
>  Remplacer la 2ᵉ par *Poulet rôti aux herbes* = **−30 min**. »

Un solveur optimal donnerait un meilleur makespan et serait incapable de produire cette phrase.
Compromis assumé.

### 5.3 Sortie

Gantt par ressource · liste chronologique (« T+0 préchauffe à 200 · T+2 hache les oignons… ») ·
bilan nutritionnel **par personne**, portions calculées depuis `nutrition_target`.

---

## 6. Ingestion

### 6.1 Chaîne

`queued → fetching → extracting → needs_review → done | failed`

1. **découverte** — sitemaps publics (D12).
2. **fetch** — JSON-LD `schema.org/Recipe` en priorité (98 % de succès mesuré) ;
   extraction LLM en repli.
3. **extract** — attributs d'étape (appareil, température, `load_type`) et relaxations de
   précédence, avec **confiance par champ**. C'est le risque R1/R2 de §3.5.
4. **normalise** — cascade §6.3.
5. **review** — **seuls les champs à faible confiance** remontent. Volume attendu : les 16 %
   d'ingrédients sans quantité, plus les températures manquantes (64 % des recettes au four).

Reprise après erreur, déduplication par URL canonique et `content_hash`.

### 6.2 Limites que l'on s'impose

- **Découverte par sitemaps publics uniquement**, jamais de crawl exploratoire.
- **Débit poli** : 1 requête / 2-3 s, `robots.txt` respecté (mesuré : aucun ne bloque l'IA).
- **Droit d'auteur** : une liste d'ingrédients n'est pas protégeable, **le texte des étapes
  l'est**. Instance privée sur invitation, affichage de la version structurée avec attribution
  et lien source, aucune exposition publique. Voir §4.0.
- **Attribution ODbL** obligatoire pour Open Food Facts.

### 6.3 Cascade de résolution des poids

| Priorité | Source | `resolution_source` |
|---|---|---|
| 1 | Pesée attachée à **cette ligne d'ingrédient** | `pesé` |
| 2 | `household_unit_weight` (≥ 3 pesées, médiane) | `foyer` |
| 3 | `unit_weight` / `unit_conversion` / `density` | `référence` |
| 4 | Estimation LLM, **marquée**, remontée en tête des choses à peser | `llm` |
| — | Aucune quantité exprimée (16 % mesurés) | `aucune` — exclu du calcul, signalé |

Les valeurs nutritionnelles par 100 g ne viennent **jamais** du LLM : CIQUAL ou Open Food Facts
exclusivement. Les valeurs de nutrition présentes dans le JSON-LD des sites ne sont **pas**
utilisées comme source (incohérentes : 7 % à 100 % de couverture selon les sites) — au plus
comme contrôle de cohérence.

---

## 7. LLM — usage, coûts, quotas

| Usage | Modèle | Coût unitaire |
|---|---|---|
| Vision — photo de frigo | rapide (classe Haiku) | ~0,003 € |
| Vision — ticket de caisse | rapide | ~0,005 € |
| Extraction structurée d'une recette | rapide | ~0,01 € |
| Proposition / création de recettes | plus capable | ~0,05 € |

**Amorçage** : 500 recettes ingérées ≈ **5 € une fois**, mutualisé entre tous les foyers (D13).
**Régime permanent, 2 personnes** : ~1,30 €/mois.

| Poste | Coût |
|---|---|
| Supabase (free tier, région UE) | 0 € |
| Hébergement PWA (Cloudflare Pages) | 0 € |
| LLM API | < 2 €/mois |
| E-mail (Resend free, 3 000/mois) | 0 € |
| Domaine (facultatif) | 12 €/an |
| **Total** | **0-2 €/mois** |

**Quota (D11)** : plafond en euros sur `household.llm_monthly_cap_eur`, compteur `llm_usage`,
applicable **aussi au worker d'ingestion**, mode dégradé au-delà (saisie manuelle avec
autocomplétion au lieu de la photo).

---

## 8. Prix et budget — lot 5

```ts
interface PriceSource {
  readonly name: string
  readonly reliability: 'exact' | 'community' | 'estimated'
  search(product: FoodRef): Promise<PricePoint[]>
}
```

| Adaptateur | Fiabilité | État mesuré |
|---|---|---|
| `ReceiptSource` — tickets photographiés | exact | À construire. Alimente aussi le lot 6. |
| `OpenPricesSource` | community | **API 200, données réelles.** Couverture à mesurer (R4). |
| `CarrefourDriveSource` | exact, fragile | Hors CGU, anti-bot, proxies. **Isolé** : s'il tombe, l'app continue. |
| `LidlCatalogSource` | estimated | Prospectus hebdomadaire. **Lidl FR n'a pas de boutique alimentaire en ligne** : seule cible possible. |

Aucune fonctionnalité ne dépend d'un adaptateur particulier.

---

## 9. Découpage en lots

| Lot | Contenu | Livre |
|---|---|---|
| **0a · Schéma et accès** | Schéma complet, auth sur invitation, RLS (§4.0), chargement CIQUAL + OFF + tables de conversion, profils et cibles, quota LLM. **UI minimale** : accepter une invitation, saisir ses cibles, régler le plafond. | Deux comptes, un foyer, un référentiel nutritionnel chargé. |
| **0b · Ingestion** | Worker MCP, découverte sitemap, extraction, normalisation, file de relecture. **UI** : écran de relecture des champs incertains. Précédé de R1 et R2. | Un catalogue de recettes structurées et vérifiées. |
| **0c · Pesée** | Boucle d'apprentissage §4.2.1. **UI** : saisie des poids. | La promesse « strict » devient vraie. |
| **1 · Cuisiner** | Optimiseur, équipement par session, Gantt, arbitrage du four, bilan par personne | **La session du dimanche fonctionne.** |
| **2 · Courses** | Agrégation, édition, envoi par e-mail | La liste arrive le samedi. |
| **3 · Frigo** | Autocomplétion, puis photo + vision (R3), soustraction à la liste | Plus d'achats en double. |
| **4 · Envies et propositions** | Filtres et densité protéique · **proposition et création de recettes par LLM** (`recipe.origin = générée`) | Le moteur de suggestion. |
| **5 · Prix** | `PriceSource` + 4 adaptateurs, estimation du panier, veille nouveautés | Budget prévisible. |
| **6 · Suivi** | Consommé et dépensé, courbes, comparaison aux cibles | Le recul sur 3 mois. |

Le lot 0 **n'est pas invisible** : 0a, 0b et 0c livrent chacun une interface minimale
(invitation, relecture, pesée). Le back-office est volontairement rudimentaire — les maquettes
soignées commencent au lot 1.

---

## 10. Questions ouvertes

1. ~~Licence CIQUAL~~ — **fermée** : Licence Ouverte Etalab (§3.4).
2. **RGPD** — poids, objectifs caloriques et photos de l'intérieur d'un frigo relèvent
   probablement des données de santé (art. 9). Hébergement UE acquis ; export et suppression
   de compte à prévoir. Qualification à confirmer.
3. **Conservation des plats** — combien de jours au frigo, quoi congeler ? Dimensionne le
   nombre de portions qu'une session peut produire. Non tranché.
4. **Validation des recettes générées par LLM** (lot 4) — quel niveau avant entrée au catalogue ?
5. **Micronutriments** — CIQUAL en fournit ~60. Lesquels afficher sans noyer l'interface ?
   (Aucune cible : §4.1.)
6. **Veille « nouveautés protéinées »** — fréquence calée sur les prospectus hebdomadaires ?

---

## 11. Hors scope (YAGNI)

- Application iOS/Android native (D10)
- Inscription ouverte, CGU, paiement, abonnement (D7)
- LLM auto-hébergé (D9)
- Partage social, communauté, notation de recettes
- Commande automatique chez un drive
- Suivi du poids corporel et de la composition corporelle
- Import depuis MyFitnessPal, Yazio et équivalents
