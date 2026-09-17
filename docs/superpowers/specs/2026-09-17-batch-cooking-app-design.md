# Design — Application de batch cooking, diet et budget

- **Date** : 2026-09-17
- **Statut** : design validé, en attente du plan d'implémentation
- **Auteurs** : Kamil + Claude
- **Utilisateurs cibles** : un foyer de 2 personnes au départ, puis d'autres foyers sur invitation

---

## 1. Objectif

Une application qui permet à un foyer de :

1. constituer un catalogue de recettes saines, riches en protéines et en fibres, et gourmandes ;
2. planifier une **session de batch cooking hebdomadaire d'environ 2 h** dont les étapes sont
   ordonnées pour exploiter en parallèle les électroménagers disponibles ;
3. connaître le bilan nutritionnel exact (macros et micros) de ce qui est cuisiné,
   **par personne**, chacun ayant ses propres objectifs ;
4. générer la liste de courses correspondante, déduction faite de ce qu'il y a déjà au frigo,
   et la recevoir par e-mail ;
5. estimer le budget courses à partir de prix réels ;
6. suivre dans le temps ce qui a été mangé et dépensé.

**Ce n'est pas** une app de recettes de plus. Le différenciateur est le point 2 : l'ordonnancement
de la session sous contrainte d'équipement. Aucune application existante ne le fait sérieusement.

---

## 2. Décisions verrouillées

Arbitrages pris pendant le brainstorm du 2026-09-17. Les rouvrir demande une raison explicite.

| # | Décision | Alternative écartée | Motif |
|---|---|---|---|
| D1 | **Base canonique locale**, alimentée par une ingestion asynchrone | Recherche web live à chaque requête | Sans ingrédients et étapes structurés et stables, les lots 1, 2 et 5 sont impossibles. Et la latence (10-30 s) et le non-déterminisme sont rédhibitoires à l'usage. |
| D2 | **MCP = bras d'ingestion**, pas chemin de requête | MCP interrogé à chaud par l'app | Même outils (`search`, `fetch`, `extract`), mais ils écrivent en base. L'app lit la base : instantané, gratuit, hors ligne. |
| D3 | **Précision nutritionnelle stricte, avec boucle d'apprentissage par pesée** | Mapping automatique approximatif (±15-20 %) ; pesée systématique obligatoire | Kamil a une balance et veut du strict. La boucle d'apprentissage rend la friction décroissante au lieu d'être permanente. |
| D4 | **Cibles nutritionnelles par personne, portions calculées** | Cible commune au foyer | Cas réel d'un couple. Coûte presque rien au lot 0, très cher à rétro-ajouter. |
| D5 | **Conflit de température du four : grouper, séquencer en repli, afficher le coût** | Grouper en écartant des recettes ; séquencer toujours ; tolérance culinaire | L'utilisateur arbitre en connaissance de cause. C'est ce que personne ne fait. |
| D6 | **Équipement : catalogue en base, coché par foyer, surchargeable par session** | Équipement en dur | Demande explicite. L'optimiseur prend l'équipement en entrée, jamais en constante. |
| D7 | **Multi-tenant sur invitation** — RLS dès le lot 0, pas d'inscription ouverte | Produit public gratuit ou payant | Pas de CGU, pas de Stripe, pas de modération. Mais isolation propre dès le départ. |
| D8 | **Prix : interface `PriceSource` + adaptateurs indépendants** | Scraping des drives au fondement du lot 5 | Lidl FR n'a pas de boutique alimentaire en ligne : rien à scraper. Les autres sont hors CGU, anti-bot, et cassent. L'app ne doit dépendre d'aucune source. |
| D9 | **LLM en API, pas auto-hébergé** | GPU loué (24/7 ou serverless), LLM local | Bascule à ~40 000 appels/mois ; usage réel ~250. Serverless : 7× le prix à l'appel, +30-60 s de cold start. Et les petits modèles quantifiés échouent précisément sur l'extraction structurée. |
| D10 | **PWA, pas d'app iOS native** | App iPhone | 99 $/an + review App Store pour un usage sur invitation. La PWA s'installe sur l'écran d'accueil et fonctionne hors ligne. |
| D11 | **Quota LLM par foyer dès le lot 0** | Pas de limite | Demande explicite. Plafond mensuel configurable + mode dégradé. |

---

## 3. Architecture

```
┌─ INGESTION (asynchrone, jamais sur le chemin critique) ────────────┐
│  MCP "recipes" : search_recipes · fetch_recipe · extract_recipe    │
│      ↓  JSON-LD schema.org/Recipe, sinon extraction LLM            │
│  Normalisation : ingrédients → CIQUAL · étapes → tâches ordonnançables │
│      ↓  champs à faible confiance → file de relecture              │
└──────────────────────── écrit dans ──────────────────┬─────────────┘
                                                        ↓
                          ╔═════════════════════════════════════════╗
                          ║  BASE CANONIQUE — Postgres (Supabase)   ║
                          ║  RLS par household_id · région UE       ║
                          ╚═════════════════════════════════════════╝
                                        ↓ lit
┌─ APP — PWA installable, fonctionne hors ligne en cuisine ──────────┐
│  Optimiseur de session · Courses · Frigo · Envies · Prix · Suivi   │
└────────────────────────────────────────────────────────────────────┘
        ↑ LLM appelé uniquement pour :
          • vision (photo de frigo, ticket de caisse)
          • extraction structurée à l'ingestion
          • proposition et création de recettes
```

### 3.1 Stack

| Couche | Choix | Justification |
|---|---|---|
| Frontend | PWA — React + Vite + TypeScript, service worker | Installable, hors ligne. Le plan de session doit s'afficher en cuisine sans réseau. |
| Backend | Supabase (Postgres, Auth, RLS, Storage, Edge Functions), région UE | Auth + isolation + stockage des photos en un seul service. RLS natif = D7 quasi gratuit. |
| Ingestion | Worker asynchrone (Node ou Python) exposant les outils MCP | Découplé de l'app. Peut tourner en local ou sur une Edge Function planifiée. |
| Optimiseur | TypeScript pur, exécutable côté client | < 100 ms pour 5 recettes. Pas de solveur lourd : la contrainte est l'explicabilité, pas l'optimalité. |
| LLM | API Anthropic — modèle rapide pour vision et extraction, modèle plus capable pour la création | Voir D9 et §7. |
| E-mail | Resend (free tier : 3 000 messages/mois) | Suffisant, sans serveur SMTP à maintenir. |

### 3.2 Le point non évident

Les sites de recettes ne fournissent **pas** d'étapes structurées. Ils fournissent du texte :
« Enfournez 25 min à 180 °C ». L'optimiseur exige
`{durée: 25, appareil: four, température: 180, type: passif}`.

L'**extraction structurée des étapes par LLM à l'ingestion** est donc un chantier du lot 0
de même poids que la normalisation des ingrédients. Sans elle, l'optimiseur planifie sur des
données inventées et le lot 1 n'a aucune valeur.

---

## 4. Modèle de données

Toutes les tables applicatives portent `household_id` et une policy RLS.

### 4.1 Foyer et personnes

| Table | Champs clés |
|---|---|
| `household` | `id`, `name`, `created_at` |
| `user_profile` | `id` (→ `auth.users`), `household_id`, `display_name` |
| `nutrition_target` | `user_profile_id`, `kcal`, `protein_g`, `fiber_g`, `carb_g`, `fat_g`, `valid_from` |
| `invitation` | `household_id`, `email`, `token`, `expires_at`, `accepted_at` |

`nutrition_target` est historisée (`valid_from`) : un objectif change, le passé reste juste.

### 4.2 Aliments et nutrition

| Table | Rôle |
|---|---|
| `food` | Référentiel CIQUAL + Open Food Facts. `source`, `source_code`, `name`, `state` (cru \| cuit), `nutrients` (jsonb, /100 g) |
| `food_yield_factor` | Facteur de rendement à la cuisson (la viande perd ~25 % d'eau). Sans lui : ~15 % d'erreur systématique sur les protéines. |
| `unit_weight` | Poids unitaire **de référence** — « 1 poivron → 150 g ». Source USDA/FAO, + `confidence` |
| `household_unit_weight` | **Poids unitaires appris des pesées du foyer.** C'est cette table qui matérialise D3. |
| `weighing` | Chaque pesée saisie : `session_id`, `food_id`, `grams`, `at` |

### 4.3 Recettes

| Table | Champs clés |
|---|---|
| `recipe` | `source_url`, `source_name`, `origin` (importée \| générée \| manuelle), `yield_servings`, `license_note` |
| `recipe_ingredient` | `raw_text`, `food_id`, `qty`, `unit`, `grams_resolved`, **`resolution_source`**, `confidence` |
| `recipe_step` | `ordinal`, `text`, `duration_min`, `appliance_type`, `temperature_c`, **`load_type`**, `confidence` |
| `recipe_step_dependency` | Précédences intra-recette (`before_id`, `after_id`) |
| `ingestion_job` | `url`, `state`, `attempts`, `error`, `content_hash` |

- `resolution_source` ∈ `{ pesé, foyer, référence, llm }` — c'est cette colonne qui permet
  d'afficher la provenance de **chaque nombre**. Elle rend la promesse « strict » vérifiable
  au lieu d'être déclarative.
- `load_type` ∈ `{ actif, passif, bloquant }` — voir §5.

### 4.4 Équipement

| Table | Rôle |
|---|---|
| `appliance_catalog` | Four, plaques, air fryer, micro-ondes, robot cuiseur, autocuiseur, blender… |
| `household_appliance` | Ce que le foyer possède, avec `capacity` (nb de feux, nb de paniers) |
| `session_appliance_override` | Ce qui est réellement disponible **ce dimanche-là** (D6) |

### 4.5 Session et planification

| Table | Rôle |
|---|---|
| `session` | `date`, `target_duration_min`, `cook_count`, recettes retenues, portions par personne |
| `session_plan` | Le planning calculé : tâches, ressource, `start_min`, `end_min` |
| `plan_conflict` | Conflits détectés et leur coût en minutes — c'est ce qui alimente l'arbitrage D5 |

### 4.6 Frigo, courses, prix

| Table | Rôle |
|---|---|
| `fridge_inventory` / `fridge_item` | Inventaire daté, saisi ou extrait d'une photo |
| `shopping_list` / `shopping_item` | Généré, éditable, cochable ; `source` (recette \| ajout manuel) |
| `price_point` | `food_id` ou `product_id`, `store`, `price`, `unit`, `observed_at`, `source`, `reliability` |
| `receipt` | Photo du ticket + lignes extraites — alimente `price_point` **et** le lot 6 |
| `llm_usage` | `household_id`, `month`, `calls`, `cost_eur` — quota D11 |

---

## 5. L'optimiseur de session

### 5.1 Formalisation

Un **RCPSP** (Resource-Constrained Project Scheduling Problem).

**Tâches** — les `recipe_step`, avec durée et précédences intra-recette. Chacune a un `load_type` :

| `load_type` | Occupe | Exemple |
|---|---|---|
| `actif` | les mains uniquement | « Hacher l'oignon » |
| `passif` | un appareil, **libère les mains** | « 25 min au four à 180 °C » |
| `bloquant` | les mains **et** un appareil | « Remuer le risotto » |

C'est cette distinction qui crée le parallélisme : pendant les 25 min de four, l'optimiseur
fait préparer la recette suivante. Sans elle, un « plan de batch cooking » n'est qu'une liste
d'étapes collées bout à bout — ce que produisent les applications existantes.

**Ressources**

| Ressource | Capacité | Particularité |
|---|---|---|
| `mains` | nombre de cuisiniers (2) | — |
| `four` | 1 | **Ressource à état** : une seule température à la fois. Transition ≈ 12 min de chauffe. Cohabitation tolérée à ±10 °C. |
| `feux` | 4 par défaut, paramétrable | Contrainte dure |
| `air_fryer` | 1 | Montée en température quasi immédiate → changements de température sans coût |
| `robot_cuiseur` | 1 | Cuisson longue totalement passive : libère 40 min d'un coup |

**Objectif** — minimiser le makespan sous la durée cible de la session.

### 5.2 Algorithme

*List scheduling* par chemin critique, puis recherche locale sur l'ordre.
Déterministe, < 100 ms pour 5 recettes.

**L'explicabilité prime sur l'optimalité.** En replanifiant sans une recette donnée, on obtient
son coût marginal exact. C'est ce qui permet d'afficher :

> « Ces 2 recettes ensemble = **+35 min** (four à 180 et 210 °C).
>  Remplacer la 2ᵉ par *Poulet rôti aux herbes* = **-30 min**. »

Un solveur optimal donnerait un meilleur makespan mais serait incapable de produire cette phrase.
Le compromis est assumé.

### 5.3 Sortie

- un diagramme de Gantt par ressource ;
- une liste chronologique : « T+0 préchauffe à 200 · T+2 hache les oignons · T+14 enfourne… » ;
- le bilan nutritionnel consolidé, **par personne**, portions calculées depuis `nutrition_target`.

---

## 6. Ingestion

### 6.1 Chaîne

`queued → fetching → extracting → needs_review → done | failed`

1. **fetch** — récupération de la page. JSON-LD `schema.org/Recipe` en priorité ;
   extraction LLM en repli.
2. **extract** — ingrédients et étapes structurés, avec une **confiance par champ**.
3. **normalise** — ingrédients vers `food` (CIQUAL/OFF), quantités vers grammes via la cascade §6.3.
4. **review** — **seuls les champs à faible confiance** remontent en relecture.
   Relire 200 recettes intégralement est inacceptable ; relire 200 champs douteux ne l'est pas.

Reprise après erreur, déduplication par URL canonique et `content_hash`.

### 6.2 Limites que l'on s'impose

- **Pas de crawl massif.** URLs fournies, sitemaps et flux publics uniquement.
- **Débit poli** : 1 requête / 2-3 s, `robots.txt` respecté.
- **Droit d'auteur** : une liste d'ingrédients n'est pas protégeable, **le texte des étapes l'est**.
  On stocke l'URL source, on affiche l'attribution, on ne republie pas le texte brut hors du foyer.
  Compatible avec D7 (usage privé sur invitation) ; à réexaminer avant toute ouverture publique.

### 6.3 Cascade de résolution des poids

| Priorité | Source | Statut |
|---|---|---|
| 1 | **Pesée du foyer** | Écrase tout, mémorisée définitivement |
| 2 | `household_unit_weight` | Apprise des pesées passées du même aliment |
| 3 | `unit_weight` (USDA/FAO) | Livrée avec l'application |
| 4 | Estimation LLM | **Marquée « estimé »**, et remonte en tête de la liste des choses à peser |

Les valeurs nutritionnelles par 100 g ne viennent **jamais** du LLM : CIQUAL ou Open Food Facts,
exclusivement. Le LLM n'intervient que sur les poids unitaires manquants, et sa sortie est
toujours étiquetée comme telle.

---

## 7. LLM — usage, modèles, coûts, quotas

| Usage | Modèle | Coût unitaire |
|---|---|---|
| Vision — photo de frigo | rapide (classe Haiku) | ~0,003 € |
| Vision — ticket de caisse | rapide | ~0,005 € |
| Extraction structurée d'une recette | rapide | ~0,01 € |
| Proposition / création de recettes | plus capable | ~0,05 € |

**Usage mensuel réaliste pour 2 personnes** : ~20 recettes ingérées, ~8 photos de frigo,
~8 tickets, ~20 propositions → **~1,30 €/mois**.

**Coût total de l'infrastructure**

| Poste | Coût |
|---|---|
| Supabase (free tier, région UE) | 0 € |
| Hébergement PWA (Cloudflare Pages) | 0 € |
| LLM API | < 2 €/mois |
| E-mail (Resend free) | 0 € |
| Domaine (facultatif) | 12 €/an |
| **Total** | **0-2 €/mois** |

**Pourquoi pas d'auto-hébergement** (D9) : le point de bascule est à ~40 000 appels/mois,
l'usage réel est ~250. Le GPU serverless coûte ~0,02 €/appel (7× l'API) avec 30-60 s de cold
start. Et les VLM quantifiés échouent précisément sur l'extraction JSON structurée depuis du
texte de recette français mal formé — le cœur du lot 0.

**Quota** (D11) : `llm_usage` agrégé par foyer et par mois, plafond configurable, mode dégradé
au-delà (saisie manuelle avec autocomplétion au lieu de la photo).

---

## 8. Prix et budget

Le lot 5 définit **une interface, pas une source** :

```ts
interface PriceSource {
  readonly name: string
  readonly reliability: 'exact' | 'community' | 'estimated'
  search(product: FoodRef): Promise<PricePoint[]>
}
```

Adaptateurs, indépendants et activables un par un :

| Adaptateur | Statut | Remarque |
|---|---|---|
| `ReceiptSource` | exact | Tickets photographiés. Exact, légal, et alimente le lot 6 gratuitement. |
| `OpenPricesSource` | community | Open Food Facts / Open Prices. API libre, couverture partielle. |
| `CarrefourDriveSource` | exact, fragile | Hors CGU, anti-bot, proxies. **Isolé** : s'il tombe, l'application continue. |
| `LidlCatalogSource` | estimated | Prospectus hebdomadaire. Lidl FR n'a **pas** de boutique alimentaire en ligne : c'est la seule cible possible, et c'est ce qui alimente la veille « nouveauté protéinée ». |

Aucune fonctionnalité ne dépend d'un adaptateur particulier. La disparition de l'un dégrade
la précision de l'estimation, jamais le fonctionnement.

---

## 9. Découpage en lots

Chaque lot est livrable et utilisable seul. L'ordre suit les dépendances, pas les préférences.

| Lot | Contenu | Ce qui devient possible |
|---|---|---|
| **0 · Socle** | Auth sur invitation, foyers, RLS · CIQUAL + OFF chargés · MCP d'ingestion · normalisation des **ingrédients et des étapes** · pesée et apprentissage · profils et cibles · quota LLM | Rien de visible. Tout le reste en dépend. |
| **1 · Cuisiner** | Optimiseur, équipement par session, Gantt, arbitrage du four, bilan nutritionnel par personne | **La session du dimanche fonctionne.** |
| **2 · Courses** | Agrégation des ingrédients, édition, cases à cocher, envoi par e-mail | La liste arrive dans la boîte mail le samedi. |
| **3 · Frigo** | Autocomplétion d'aliments, puis photo + vision, soustraction à la liste de courses | Plus d'achats en double. |
| **4 · Envies** | Filtres (fromage, poisson, viande, soupe, dessert), densité protéique, contraintes caloriques | L'usage devient agréable. |
| **5 · Prix** | Interface `PriceSource` + 4 adaptateurs, estimation du panier, veille nouveautés | Le budget devient prévisible. |
| **6 · Suivi** | Consommé et dépensé, courbes, comparaison aux objectifs | Le recul sur 3 mois. |

---

## 10. Dérisquage préalable — avant la première ligne de code de l'application

Environ une journée. Chaque point produit **un chiffre, pas une opinion**.

| # | À vérifier | Décision qu'il conditionne |
|---|---|---|
| 1 | CIQUAL : téléchargement, licence exacte, nombre d'aliments utiles | Modèle `food` ; repli sur Open Food Facts seul si la licence bloque |
| 2 | JSON-LD sur **20 URLs réelles** (Marmiton, blogs muscu, desserts healthy) → **taux d'extraction** | Si 40 % au lieu de 90 %, le lot 0 change de forme (extraction LLM par défaut, coût ×3) |
| 3 | Extraction des étapes par LLM sur 5 recettes : durée, appareil, température justes ? | Faisabilité du lot 1. C'est le risque le plus lourd du projet. |
| 4 | Les 4 `PriceSource` interrogés réellement : qui répond, qui ne répond pas | Contenu du lot 5 |
| 5 | Une vraie photo du frigo passée en vision : ce qui est identifié, ce qui est raté | Ergonomie du lot 3 (photo seule vs photo + correction manuelle) |

---

## 11. Questions ouvertes

1. **Licences** — CIQUAL (Licence Ouverte Etalab ?) et Open Food Facts (ODbL : attribution
   obligatoire, partage à l'identique). À confirmer au dérisquage n°1.
2. **RGPD** — poids, objectifs caloriques et photos de l'intérieur d'un frigo relèvent
   probablement des données de santé (art. 9). Même en usage sur invitation : hébergement UE
   (acquis), export et suppression de compte à prévoir. Qualification à confirmer.
3. **Conservation des plats** — combien de jours au frigo, quoi congeler ? Impacte le nombre de
   portions qu'une session peut raisonnablement produire. Non tranché.
4. **Recettes générées par LLM** — `origin` les distingue, mais quel niveau de validation avant
   de les faire entrer dans le catalogue ?
5. **Fréquence de la veille « nouveautés protéinées »** — hebdomadaire au rythme des prospectus ?
6. **Micronutriments** — CIQUAL en fournit ~60. Lesquels afficher sans noyer l'interface ?

---

## 12. Hors scope (YAGNI)

Explicitement écartés. Les rouvrir demande une décision, pas une dérive.

- Application iOS/Android native (D10)
- Inscription ouverte, CGU, paiement, abonnement (D7)
- LLM auto-hébergé (D9)
- Partage social, communauté, notation de recettes
- Commande automatique chez un drive
- Suivi du poids corporel et de la composition corporelle
- Import depuis MyFitnessPal, Yazio et équivalents
