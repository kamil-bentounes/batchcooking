# Les prompts

Deux appels au modèle : **inventer une recette** et **lire une photo du frigo**.
Tout est construit côté serveur (`supabase/functions/`), jamais par le client —
un prompt que le client compose est un prompt que le client peut réécrire.

## Ce que la mesure a tranché

| Question | Réponse, mesurée le 18/09/2026 |
|---|---|
| `json_object` suffit-il ? | **Non.** Hors schéma chez les **trois** modèles essayés : champs manquants, énumérations inventées |
| `json_schema` + `strict` ? | **Conforme chez les trois**, et **plus rapide** sur Groq (1,2 s contre 1,6 s) |
| Pourquoi plus rapide ? | Décodage contraint : le moteur **masque les jetons interdits** au lieu de les produire puis de les rattraper |

C'est la seule chose qui compte vraiment : un schéma strict remplace toute
validation côté serveur, et supprime la boucle de reprise.

```
json_object     → syntaxe JSON garantie, forme NON garantie   (~80 % conformes)
json_schema     → forme garantie par construction              (100 %)
```

## Les règles appliquées

| Règle | Pourquoi, ici |
|---|---|
| **Rôle et tâche dans les premiers jetons** | L'attention des modèles penche vers le début. Le `system` commence par « Tu es un cuisinier qui… » |
| **Données séparées par des balises** | `<placards>`, `<envie>`, `<contraintes>`. Sans elles, un libellé d'aliment malicieux se lit comme une consigne |
| **Contraintes en liste, pas en prose** | Une puce par borne chiffrée. Le modèle les tient ou dit pourquoi dans `note` |
| **Le schéma porte les descriptions** | `charge` explique « actif = les mains prises ». C'est plus court qu'un exemple et ça ne se périme pas |
| **Pas d'exemples** | Le schéma fait le travail. Un few-shot coûterait des jetons à chaque appel pour la même garantie |
| **Une consigne = une phrase** | « Une étape = UN geste, à l'impératif » a fait passer la granularité de 7 à 13 étapes sur la même recette |

## Ce que le modèle ne voit jamais

| Reçoit | Ne reçoit jamais |
|---|---|
| Des bornes : « au moins 30 g de protéines » | Un prénom, un poids, un objectif nominatif |
| Des libellés : « skyr 400 g » | L'identifiant du foyer ou de la personne |
| L'envie, tronquée à 300 caractères | L'historique des repas |

## La photo du frigo

Trois choses exigées du modèle, chacune pour une raison :

| Exigé | Pourquoi |
|---|---|
| La **quantité** en unités visibles — « 4 pots », pas « des yaourts » | Sans elle, l'inventaire ne sert ni aux courses ni aux macros |
| La **variété** — « yaourt aux fruits », pas « yaourt » | Un yaourt aux fruits n'a pas les macros d'un nature. C'est ce qui permet de rattacher à CIQUAL |
| La **confiance** entre 0 et 1 | Un paquet à moitié caché n'est pas un paquet identifié. L'écran ne coche d'avance que ce qui dépasse 0,8 |

Et une consigne qui évite l'erreur la plus coûteuse : *« un article par LIGNE de
produit, pas un par exemplaire »* — quatre pots identiques font **un** article de
quantité 4, pas quatre articles.

**Aucun modèle de Groq ne voit** (relevé du 18/09 : que du texte et de l'audio).
La vision passe donc par Gemini, et **il n'y a pas de repli** : mieux vaut « je
n'ai pas su lire » qu'un inventaire inventé.

### Mesuré

Sur une image de synthèse contenant 9 lignes de produits, **9 sur 9** reconnues,
comptées et qualifiées — y compris la distinction « yaourt aux fruits » (4 pots)
contre « yaourt nature » (3 pots), et les métadonnées lues sur les étiquettes
(« 480 g », « boîte de 6 », « brique de 1 L »).

Test négatif, une image blanche : `lisible: false`, **zéro article inventé**.

## Le repli

`LLM_FALLBACK_*` prend le relais si le principal répond une erreur, ne répond
pas en 45 s, ou rend une réponse vide. La réponse porte `par: "principal" |
"repli"` — **un repli silencieux ferait croire pendant des semaines que le
principal va bien.**
