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
| 1 | `worker/src/jsonld.ts` | Lit le bloc `application/ld+json` `schema.org/Recipe`. Jamais le HTML. |
| 2 | `worker/src/ingredient.ts` | Découpe une ligne d'ingrédient : quantité, unité, aliment, préparation |
| 3 | `worker/src/aliment.ts` | Rattache à CIQUAL (Jaccard pondéré, seuil 0,34). Refuse plutôt que de se tromper |
| 4 | `worker/src/etape.ts` | Verbe, appareil, durée, température, charge |
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
