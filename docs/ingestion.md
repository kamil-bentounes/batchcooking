# Ingestion

Remplit le catalogue de recettes. **Aucun modèle** : ce qui n'est pas trouvé
reste `null`, et la recette est marquée non planifiable plutôt que complétée
au jugé.

```bash
npm run ingest -- <url> [<url>…]
npm run ingest -- --fichier urls.txt
npm run ingest -- --sitemap https://site.fr/sitemap.xml --limite 50
npm run ingest -- --prod --fichier urls.txt
```

Idempotent (clé `source_url`). Une page par seconde, en série : c'est une
bibliothèque personnelle, pas du scraping.

## La chaîne

| Étape | Module | Ce qu'elle fait |
|---|---|---|
| 1 | `worker/src/jsonld.ts` | Lit le bloc `application/ld+json` `schema.org/Recipe`. Jamais le HTML. Prend aussi la photo (`image`), en lien. |
| 2 | `worker/src/ingredient.ts` | Découpe une ligne d'ingrédient : quantité, unité, aliment, préparation |
| 3 | `worker/src/aliment.ts` | Rattache à CIQUAL (Jaccard pondéré, seuil 0,34). Refuse plutôt que de se tromper |
| 4 | `worker/src/etape.ts` | Verbe, appareil, durée, température, charge, gestes |
| 5 | `worker/src/ingere.ts` | Assemble, décide `plannable`, construit le graphe |

## Mesuré sur 25 recettes réelles

167 étapes, 200 lignes d'ingrédients.

| Grandeur | Résultat |
|---|---|
| Pages exploitables | 25 / 25 |
| Recettes planifiables | **25 / 25** |
| Étapes retenues, datées | **100 %** |
| Étapes retenues, avec verbe reconnu | **100 %** |
| Étapes avec quantité déduite | 54 % |
| Ingrédients rattachés à CIQUAL | **97 %** |
| Ingrédients convertis en grammes | 65 % |

Le verbe est à 100 % **par construction** : une phrase sans verbe ni durée n'est
pas une action et ne devient pas une étape. Le chiffre qui compte vraiment est
donc le premier — aucune étape retenue n'entre dans un plan sans durée.

## Les règles qui comptent

| Règle | Pourquoi |
|---|---|
| **Le verbe qui mobilise un appareil gagne** sur celui de tête de phrase | « Ajoutez le poulet et faites-le dorer » est une action de poêle. Retenir « ajouter » libérerait le feu dans le plan — bien pire qu'une minute mal comptée |
| À défaut, **le verbe de tête** | « Ajoutez les poivrons coupés en lanières » décrit des poivrons, elle ne demande pas de couper |
| **Poêle et casserole → `plaques`** | On coche « plaques de cuisson », pas « poêle ». Chacune occupe un feu, et il y en a quatre |
| **Un compte reste `null`** (« 2 oignons ») | `unit_weight` n'est pas rempli. Un poids inventé vaut moins qu'une fourchette assumée (D18) |
| **CIQUAL se charge par pages de 1000** | PostgREST plafonne à `db.max-rows` **sans le dire**. Un `.limit(5000)` rend 1000 lignes et zéro erreur — c'est ce qui faisait tomber le rattachement à 52 % |

## La photo, le titre, les gestes (spec du 19/10/2026, migration 0092)

| Quoi | Où | La règle |
|---|---|---|
| La photo | `jsonld.ts` (`photo()`) → `recipe.image_url` | Un **lien** vers la photo du site, jamais une copie : la première adresse utilisable de `image` (adresse, liste, `ImageObject` par `url` puis `contentUrl`, renvoi `@id` suivi dans tout le graphe de la page), résolue contre la page, passée en https, 2 048 caractères au plus. Seul le rôle de service l'écrit (trigger `recipe_photo`, voir [`schema.md`](schema.md)) |
| Le titre | `src/lib/recettes/texte.ts` (`titrePropre`) | Retire la réclame (« : la meilleure recette », « - Recette Ptitchef », « \| Recette \| Marmiton »), une parenthèse finale qui parle de recette, une marque seule en fin (« - Cookeo »), « Recette de… » en tête ; décode les entités (« &amp;amp; » compris) ; rend l'accent perdu (« a l' » → « à l' »). Rejoué jusqu'à ce que le titre ne bouge plus ; sous trois caractères, le titre d'origine reste |
| Les gestes | `etape.ts` (`gestesMin`) → `recipe_step.gesture_min` | Les minutes de chaque verbe de main que l'étape **conjugue** — ni participe (« les poivrons coupés »), ni nom (« le beurre »), ni infinitif nié ou remis à plus tard (« sans les éplucher »). Un verbe qui mobilise un appareil n'en est pas un : « mixez » ne compte pas, « versez le lait dans le blender » si. `null` quand aucun. Le temps actif compte, par étape, au moins ses gestes |
| Les macros | `src/lib/nutrition/macros.ts` (`plausible`) | Une part impossible n'a pas de macros : plus de 900 kcal/100 g, plus de 1,5 kg, moins de 20 ou plus de 2 000 kcal. Une valeur fausse servirait à filtrer, et elle est pire qu'aucune |

Une part écartée **ne rend pas la recette non planifiable** (`plannable` ne dépend que des
étapes) : elle n'a simplement pas de macros, et le journal le dit. Le motif
`macros écartées : <kcal> kcal pour <g> g la part` s'ajoute à ceux du refus dans
`ingestion_job.error`.

Une ré-ingestion réécrit `image_url` avec ce que la page publie ce jour-là.

La recette **collée** (`importer`, voir [`api.md`](api.md)) suit les mêmes règles : ses
étapes portent `gesture_min`, et ses macros ne sont écrites que si la part est plausible.

## Rattraper les recettes déjà en base

Un trigger ne rattrape pas le passé : deux scripts, dans cet ordre. Le premier ne
retélécharge rien (tout est déjà en base), le second relit les pages des sites.

```bash
npm run recalcule -- --prod --sec      # lire le relevé : titres, 0 min, hausses, macros écartées
npm run recalcule -- --prod
npm run relis-photos -- --prod --sec --limite 20
npm run relis-photos -- --prod         # 35 à 50 min, reprend où il s'arrête
```

Sans `--prod`, les deux visent la base locale (`.env`) ; `--prod` lit `.env.production`.
Ils refusent une option inconnue, sans valeur ou illisible **avant** tout appel réseau, et
acceptent `--clé valeur` comme `--clé=valeur`.

### `scripts/recalcule.mjs`

| Option | Effet |
|---|---|
| `--prod` | Cible la production |
| `--sec` | N'écrit rien et dit tout : chaque titre qui change, les recettes à 0 min avant et après, celles dont le total passe sous le temps actif (nommées, avant et après), les dix plus fortes hausses, les macros écartées, les lignes de macros périmées |
| `--limite N` | Les N premières recettes seulement, pour regarder avant |
| `--recette <uuid>` | Une seule recette |
| `--sans-rattachement` | Saute la passe 0 |

Les passes, dans cet ordre parce qu'elles dépendent l'une de l'autre :

| Passe | Ce qu'elle refait |
|---|---|
| **T** | Les titres du catalogue **ingéré** (`titrePropre`). Un titre de foyer, quelqu'un l'a écrit |
| **0** | Le rattachement à CIQUAL, sur les lignes que l'ingestion a rattachées ou laissées (jamais une correction de foyer) |
| **1** | Les grammes des lignes au compte (« 2 oignons »), depuis les poids unitaires |
| **2** | Les macros par part ; efface celles d'une recette devenue trop incomplète ou impossible |
| **G** | `gesture_min` de chaque étape, à partir de son texte décodé. Une durée **confirmée** ou corrigée par un foyer fait foi : son `gesture_min` reste `null`, pas de plancher par-dessus |
| **3** | Les agrégats (`active_time_min`, appareils, nombre d'étapes), en réécrivant une étape par recette pour rejouer `tg_recipe_agrege` |

La passe 3 reste après la G : la G réécrit les étapes par paquets de deux cents en
parallèle, et deux étapes d'une même recette réécrites en même temps peuvent laisser un
`active_time_min` périmé. Après le recalcul, la requête de cohérence de
[`schema.md`](schema.md) doit rendre 0.

### `scripts/relis-photos.mjs`

Relit **une fois** la page de chaque recette importée sans photo (`image_url is null`, sans
foyer propriétaire, avec une `source_url`) et n'écrit que `image_url` — ni titre, ni étapes,
ni l'image elle-même. Elle ne remplace jamais une photo déjà posée.

| Option | Effet |
|---|---|
| `--prod` | Cible la production |
| `--sec` | N'écrit rien, ni en base ni dans l'état. **Les pages sont quand même demandées** : à sec ne veut pas dire hors réseau, d'où `--limite` |
| `--limite N` | Les N premières pages, après l'état et le filtre de domaine |
| `--domaine <hôte>` | Se limite à cet hôte (`www.a.fr`, `127.0.0.1:8787`) ; répétable. **Obligatoire en local** : les adresses de la base locale sont des adresses de test, les relire serait frapper chez des inconnus |
| `--tout` | Relit aussi ce que l'état dit réglé |

**Durée.** 1 426 pages à 1,1 s font 26 min d'attente pure ; avec la latence de chaque site
(0,3 à 1,5 s par page), compter **35 à 50 minutes**.

**Reprise.** `.relis-photos.etat.json` (à la racine, hors git) note les recettes réglées —
`photo`, `sans-photo`, `disparue` (404, 410), `interdite` (par `robots.txt`) — avec leur
issue et leur date, par base cible (les identifiants du local ne sont pas ceux de la prod).
Relancer les saute ; une page en refus ou en erreur n'y est pas, elle sera relue. Pour tout
relire : `--tout`, ou `rm .relis-photos.etat.json`. Un fichier illisible ou d'une autre
forme arrête le script avant tout réseau : le jeter en silence, ce serait tout relire chez
des tiers. L'ordre des pages est mélangé à chaque passage, pour qu'une page morte en tête
d'un site ne le fasse pas abandonner à chaque relance.

À la fin, un bilan par domaine : statut de `robots.txt`, pages lues, issues, pages laissées,
durée.

## Ce que le robot s'interdit

On lit le travail d'autrui, chez lui : la relecture est polie, et elle ne contourne rien.
L'ingestion et la sonde partagent l'agent et la lecture de `robots.txt` (`worker/src/sitemap.ts`) ;
`relis-photos` y ajoute les arrêts ci-dessous.

| Règle | Détail |
|---|---|
| **Agent** | `batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)`. Jamais un navigateur imité. Le jeton `batchcooking-perso` est celui qu'un `robots.txt` peut nommer |
| **Une requête par seconde et par site** | 1,1 s entre deux requêtes au même site, `robots.txt` et chaque redirection comprises. `a.fr` et `www.a.fr` n'en font qu'un |
| **`robots.txt`, RFC 9309** | Lu **une fois** par hôte. Le groupe à notre nom (les groupes à notre nom se cumulent), sinon celui de `*`. `Allow` et `Disallow`, jokers `*`, `$` final, chaîne de requête comprise ; le motif le plus long gagne, à égalité `Allow`. Échappements `%xx` normalisés (`%2F` n'est pas `/`), UTF-8. Comparé sans expression régulière : un motif hostile ne coûte pas plus qu'un autre. Un chemin interdit n'est jamais demandé |
| **`robots.txt` en 2xx** | On le suit |
| **`robots.txt` en 404 et autres 4xx** | Rien n'est interdit |
| **`robots.txt` en 401, 403, 429, 5xx ou injoignable** | Un refus, peut-être un défi, ou un site en panne : tout permettre, ce serait passer outre. Le domaine est laissé pour ce passage |
| **`Crawl-delay`** | Respecté s'il dépasse notre pause. Au-delà de 30 s, le domaine est laissé : le site n'a pas voulu qu'on le relise |
| **Aucun contournement anti-robot** | Un 429, ou un défi reconnu (en-tête `cf-mitigated`, ou un 403 ou 503 dont le début du corps dit « Just a moment », « Attention Required » ou `cf-chl`) : le site est laissé **dès la première réponse**, sans second essai, `Retry-After` ou pas |
| **Autres refus** | Trois de suite (401, 403, 503 ordinaires, page de défi sans recette) : le site est laissé pour ce passage |
| **Un site en panne** | Cinq erreurs de suite (5xx autres que 503, réseau, délai de 30 s) : idem, il n'est pas martelé |
| **Corps plafonné** | 2 Mo par page, le flux est coupé au-delà (une page coupée sans JSON-LD est `sans-recette`). Le début d'un refus (64 Kio) n'est lu que pour reconnaître un défi |
| **Redirections dans le site** | Trois au plus, seulement vers le même hôte ou le même au `www.` près, après la pause **et** le `robots.txt` de l'hôte d'arrivée. Autre site, adresse privée, autre schéma, identité dans l'adresse : la page compte pour une erreur |

Ce qu'une page laisse comme issue : `photo`, `sans-photo`, `sans-recette`, `disparue`,
`refusee`, `bloquee`, `erreur`, `interdite`. La photo n'est jamais téléchargée : le navigateur
de chacun la charge chez le site, c'est pourquoi seul le service peut en écrire l'adresse.

## Quels sites — mesuré, pas supposé

`npm run sonde` interroge un site sans rien écrire : publie-t-il du
`schema.org/Recipe` ? ses étapes sont-elles datables ? ses ingrédients se
rattachent-ils à CIQUAL ? que dit son robots.txt ?

Sondé le 18 septembre 2026, 4 pages par site, une requête par seconde.

| Site | Recettes lues | Étapes datées | Ingr. → CIQUAL | Verdict |
|---|:-:|:-:|:-:|---|
| **marmiton.org** | 4/4 | 100 % | 95 % | ✅ le plus gros catalogue |
| **cuisineaz.com** | 4/4 | 100 % | 90 % | ✅ |
| **cuisine.journaldesfemmes.fr** | 4/4 | 100 % | **100 %** | ✅ |
| **jow.fr** | 4/4 | 100 % | **100 %** | ✅ quantités très propres |
| **ptitchef.com** | 4/4 | 100 % | 90 % | ✅ |
| **cuisineactuelle.fr** | 4/4 | 100 % | 83 % | ✅ |
| **recetteproteine.fr** | 4/4 | 100 % | 91 % | ✅ **protéiné** |
| chefsimon.com | 1/4 | 100 % | 100 % | ⚠️ beaucoup de pages hors recettes |
| fitnessmith.fr | 1/4 | 100 % | 100 % | ⚠️ idem, mais **musculation** |
| 750g.com | 2/3 | 100 % | 100 % | ⚠️ publie bien, mais **aucun sitemap** : pas d'URL à ingérer |
| quitoque.fr | 2/4 | 100 % | 86 % | ⚠️ paniers, pas recettes |
| recettes.de · croquonslavie.fr · mangerbouger.fr | 0/4 | — | — | ❌ aucun `schema.org/Recipe` |
| papillesetpupilles.fr · odelices.com · atelierdeschefs.fr · natura-force.com | — | — | — | ❓ **bloquent notre robot** — non concluant, pas « ne publie rien » |

Ce que la mesure a appris et qu'aucun article ne disait :

- **750g publie bien des données structurées, mais ne déclare aucun sitemap.**
  Premier verdict de la sonde : « n'en publie pas ». Faux — elle cherchait au
  mauvais endroit. Un outil de mesure se trompe aussi, et il faut le vérifier.
- **Un site déclare dix sitemaps** (news, images, vidéos, tags…). Prendre les
  premiers, c'est sonder les vidéos et conclure qu'il n'y a pas de recettes —
  c'est ce que faisait la sonde à son premier jet, et elle donnait Marmiton
  pour inexploitable.
- **Quatre sites renvoient une page de challenge** à notre agent. On ne
  contourne pas : on les note indéterminés.
- **Le repli par la page d'accueil ne sert qu'à SONDER.** Il ramène des pages de
  catégorie dont le JSON-LD porte la recette mise en avant : bon pour répondre
  « ce site publie-t-il ? », désastreux pour ingérer — le catalogue hériterait
  d'une recette intitulée « Cuisine minceur ».

## `plannable`

Une recette n'entre au choix du mercredi que si son plan ne mentira pas :

| Condition | Seuil |
|---|---|
| Étapes exploitables | ≥ 2 |
| Étapes datées | ≥ 80 % |

Le refus est **motivé** (`ingestion_job.error`) : un rejet muet ne se corrige
pas. `state` ∈ `ready` · `needs_review` · `failed`.

## Attribution

On republie le travail d'autrui : `license_note` porte la licence déclarée, ou
à défaut la source et l'URL. Jamais vide.

## Ce qui reste au modèle

Le déterministe couvre 96 % des verbes. Le reste — étapes sans verbe reconnu,
dépendances non séquentielles, quantités par compte — est le domaine du
raffinement LLM (D20-D22), qui n'intervient **que là où le déterministe a rendu
`null`**.
