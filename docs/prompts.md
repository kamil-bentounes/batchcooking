# Les prompts

Deux appels au modèle : **inventer une recette** et **lire une photo**. Tout est
construit côté serveur (`supabase/functions/`), jamais par le client — un prompt
que le client compose est un prompt que le client peut réécrire.

Deux bancs d'essai, tous deux rejouables :

```bash
npm run banc                              # génération : modèles × prompts
npm run banc-vision -- photo.jpg          # lecture de photo : prompts
```

## Ce que les sources primaires disent, et ce qu'on en a fait

| Règle | Source | Appliquée où |
|---|---|---|
| Rôle et tâche dans les premiers jetons | Google, Anthropic | `<role>` en tête des deux prompts |
| **Expliquer le POURQUOI d'une contrainte** | Anthropic, « add context to improve performance » | `<pourquoi>` : « un planificateur découpe par étape » |
| Dire quoi FAIRE, pas quoi ne pas faire | OpenAI, Anthropic | « Écris en français » et non « jamais d'anglais » |
| Balises pour séparer données et instructions | Anthropic, Google | `<placards>`, `<envie>`, `<contraintes>` |
| **Toujours mettre des exemples** | Google, « we recommend to always include few-shot examples » | un exemple ET un contre-exemple |
| Étapes numérotées quand l'ordre compte | Anthropic | `<regles>` 1 à 5 |
| Laisser les paramètres par défaut sur Gemini 3.x | Google | aucune `temperature` posée |
| **Situer avant de compter** | littérature vision, « point, label and count » | champ `ou`, obligatoire, avant `quantite` |

## Mesuré : le schéma strict

| Mode | Résultat sur 3 modèles |
|---|---|
| `json_object` | **hors schéma chez les trois** — champs manquants, énumérations inventées |
| `json_schema` + `strict` | **conforme chez les trois**, et plus rapide sur Groq (1,2 s contre 1,6 s) |

Le décodage contraint masque les jetons interdits au lieu de les produire puis
de les rattraper. Un schéma strict remplace toute validation de notre côté.

⚠️ **Avec un modèle à raisonnement, borner `max_completion_tokens` est
obligatoire.** Les jetons de réflexion se comptent dans le budget : un prompt
riche fait réfléchir davantage, le JSON se retrouve tronqué, et le schéma strict
rend alors un 400 sec — pas une réponse partielle. Constaté sur `gpt-oss-120b` :
le prompt long échouait à chaque appel, le court passait.

## Mesuré : le prompt revu (B) contre l'ancien (A)

5 essais par couple, schéma strict des deux côtés, disponibilité comptée à part.

| Modèle | A | B | Écart |
|---|:-:|:-:|:-:|
| gemini-3.5-flash-lite | 94 % | **100 %** | **+6 pts** |
| groq · qwen3.8-27b | 93 % | **100 %** | **+7 pts** |
| groq · gpt-oss-120b | 94 % | 95 % | +1 pt |

Le gain est concentré sur **un seul critère**, celui que B visait :

| « un geste par étape » | A | B |
|---|:-:|:-:|
| gemini-3.5-flash-lite | 2/5 | **5/5** |
| groq · qwen3.8-27b | 3/4 | **2/2** |

C'est le critère qui compte le plus ici : l'ordonnanceur découpe **par étape**.
« Émince les oignons puis fais-les revenir » lui donne une tâche de 12 minutes
qu'il ne peut ni paralléliser ni attribuer.

## Mesuré : la lecture de photo

Sur une vraie photo de réfrigérateur, A contre B :

| | A | B |
|---|---|---|
| Petit pot jaune en haut | ❌ « citron » | ✅ **« beurre, entamé »** |
| Yaourts | fusionnés en un seul groupe | ✅ **2 pots + pack de 4, séparés** |
| Bouteilles | 4 fusionnées (porte + couchée) | ✅ **1 couchée + 3 dans la porte** |
| Tasse verte | ignorée ✓ | ignorée ✓ |
| Temps | 16,6 s | **2,5 s** |

Le champ `ou` — situer avant de compter — est ce qui empêche de fusionner deux
groupes distincts du même produit.

Trois exigences, chacune pour une raison :

| Exigé | Pourquoi |
|---|---|
| La **quantité** en unités visibles | « 4 pots », pas « des yaourts » : sinon l'inventaire ne sert ni aux courses ni aux macros |
| La **variété** | Un yaourt aux fruits n'a pas les macros d'un nature, et c'est elle qui permet de rattacher à CIQUAL |
| La **confiance** | L'écran ne coche d'avance que ce qui dépasse 0,8 ; le reste est marqué « deviné » |

Test négatif, image blanche : `lisible: false`, **zéro article inventé**.

## Ce que le modèle ne voit jamais

| Reçoit | Ne reçoit jamais |
|---|---|
| Des bornes : « au moins 30 g de protéines » | Un prénom, un poids, un objectif nominatif |
| Des libellés : « skyr 400 g » | L'identifiant du foyer ou de la personne |
| L'envie, tronquée à 300 caractères | L'historique des repas |
