# Le cycle

L'objet dont tout le lot 1 dépend. L'accueil ne fait rien d'autre que lire
`cycle.state` et poser **la** question du moment — il n'y a jamais qu'une
seule réponse.

## Les états

| État | Ce que l'accueil dit | Écran |
|---|---|---|
| `vide` | Rien de prévu | `/choisir` |
| `selection` | Recettes en cours de choix | `/choisir` |
| `courses` | Votre liste est prête | `/magasin` |
| `pret` | Tout est là | `/plan` |
| `en_cuisine` | Session en cours | `/cuisine` |
| `dressage` | Il reste à dresser | `/dressage` |
| `semaine` | La semaine tourne | `/semaine` |
| `cloture` | Semaine close | `/choisir` |
| `interrompue` | Session interrompue | `/cuisine` |

Les transitions sont une **table** (`cycle_transition`), pas une cascade de
`if` : la séquence est une donnée du produit. Un trigger `BEFORE UPDATE`
refuse tout le reste.

```
vide → selection → courses → pret → en_cuisine → dressage → semaine → cloture
       ↑ retour     ↑ retour                ↘ interrompue ↗
```

**Un seul cycle vivant par foyer** (`cycle_un_seul_vivant`, index partiel).
Deux cycles ouverts, c'est deux accueils possibles pour le même jour.

## Le décalage qui rend tout possible

| Jour | Geste | Pourquoi |
|---|---|---|
| Mercredi | On choisit les recettes | Sans choix, pas de liste |
| Samedi | On fait les courses | Cocher remplit l'inventaire |
| Dimanche | On cuisine, puis on **dresse** | Le dressage produit les barquettes |
| Dimanche soir | La semaine se distribue | Sans ça, personne ne sait ce qu'on mange ce soir |
| La semaine | Manger = cocher une barquette | Un geste, pas un journal alimentaire |
| Dimanche suivant | Clôture → bilan → cycle suivant | Ce qu'on a jeté change le choix du mercredi |

## Ce que produit une session

La session ne produit pas des recettes, elle produit des **barquettes** :
nommées, pesées, datées, chacune avec ses macros, son coût et sa date limite.
C'est la contrepartie du suivi automatique — on n'a rien saisi de la semaine,
donc on peut tout mesurer.

## Les portes de côté

| Porte | Quand | Effet |
|---|---|---|
| **Envie spéciale** (`/inventer`) | Rien de prévu ne fait envie | Recette générée, marquée « jamais testée », 10 par mois |
| **Interrompre** | La session s'arrête | `interrompue`, reprise sans recalcul du plan |
| **Dépannage** | Une barquette hors cycle | `portion.cycle_id` nul |

Si « Envie spéciale » s'ouvre trois fois par semaine, c'est que le choix du
mercredi se trompe — et le bilan doit le dire.
