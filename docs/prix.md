# Les prix

## Pourquoi le ticket de caisse

Il n'existe **aucune API de prix** pour un particulier. Les enseignes n'en
publient pas, les drives ne s'interrogent pas sans compte marchand, et les bases
communautaires (OpenFoodFacts et consorts) portent des codes-barres, pas des
prix — et quand elles en portent, ils sont vieux et d'une autre enseigne.

Le ticket de caisse, lui, est :

- **exact** — c'est ce qu'on a payé, pas une estimation ;
- **daté et localisé** — le même yaourt ne vaut pas le même prix chez deux
  enseignes, et c'est précisément l'écart qui intéresse ;
- **déjà là** — il sort du sac avec les courses.

C'est la meilleure source qu'on puisse avoir, et la seule qui donne *nos* prix.

## La boucle

```
photo du ticket → le modèle lit les lignes → l'app les rapproche de la liste
   → la base apprend le prix de chaque produit CHEZ CHAQUE ENSEIGNE
      → la liste suivante s'estime toute seule
```

Chaque flèche est faillible, et chacune a sa garantie.

### 1 · La lecture (`supabase/functions/ticket`)

Schéma strict (`json_schema`, `strict: true`), chaîne de modèles Gemini avec
repli — le quota gratuit est de 20 requêtes par jour **et par modèle**, donc
trois modèles portent le budget à 60 tickets par jour. Quota produit : 30 par
foyer et par mois, **séparé** de celui de la photo du frigo. Un mois d'inventaire
ne doit pas empêcher d'enregistrer ce qu'on a payé.

Trois consignes portent le prompt, parce que ce sont les trois façons de se
tromper sur un ticket :

1. **le libellé TEL QU'IMPRIMÉ.** « PDT CHARLOTTE 2.5KG » n'est pas « pommes de
   terre ». Le développer perdrait ce qui permet de reconnaître le produit au
   ticket suivant ;
2. **les remises.** Une ligne « REMISE −0,50 » suit le produit qu'elle concerne :
   la compter comme un achat apprendrait un prix négatif, l'ignorer un prix trop
   haut ;
3. **ce qui n'est pas un achat** — sous-totaux, fidélité, rendu monnaie.

### Ce que ça donne, mesuré

Banc d'essai du 18 septembre 2026 (`npm run banc-ticket`), huit lectures d'un
même ticket de 8 articles portant une remise :

| | `gemini-3.5-flash-lite` | `gemini-flash-lite-latest` |
|---|---|---|
| Articles retrouvés | **8/8**, quatre fois sur quatre | **8/8**, quatre fois sur quatre |
| Lignes inventées ou bruit | **0** | **0** |
| Total imprimé lu juste | **4/4** | **4/4** |
| Montants exacts | 7 à 8 sur 8 | 6 à 8 sur 8 |
| Temps | 2,4 à 3,1 s | 2,2 à 2,4 s |

`gemini-3.6-flash` répond 503 « high demand » — d'où sa place en dernier repli.

Aucun sous-total, aucun point de fidélité, aucun rendu monnaie n'a jamais été
pris pour un achat. Le seul défaut récurrent : le modèle **repère** la remise et
la pose sur la bonne ligne, mais ne la soustrait du montant qu'une fois sur deux.

### La réconciliation des remises (`ticket/lignes.ts`)

Insister dans le prompt aurait déstabilisé ce qui marche. Le cas se **vérifie**
par l'arithmétique :

> si la somme des lignes dépasse le total imprimé d'exactement la somme des
> remises annoncées, alors les remises ont été listées sans être déduites.

On les déduit alors, et l'écran le dit (« remises déduites »). La règle échoue
**fermée** : si l'égalité ne tombe pas au centime, on ne touche à rien et
l'écart s'affiche. Un écart visible vaut mieux qu'une correction inventée — un
prix corrigé de travers s'apprend et se propage à toutes les estimations.

### 2 · Le rapprochement (`src/lib/prix.ts`)

Une caisse écrit « PDT CHARLOTTE 2.5KG » là où la liste dit « pomme de terre ».
Le score suit trois partis pris :

- **la couverture du libellé de la LISTE mène** — un ticket ajoute du bruit
  d'emballage, la liste dit ce qu'on voulait ;
- **la couverture du TICKET départage** en second, pour préférer la ligne la
  plus spécifique quand deux se disputent le même article ;
- **rien ne s'écrit sous le seuil** : au-dessus de 0,72 c'est coché d'avance,
  entre 0,40 et 0,72 c'est proposé et décoché, en dessous la ligne reste libre.

Un piège est traité nommément et testé : « POMMES GOLDEN » ne doit pas prendre
« pomme de terre ». L'affectation est gloutonne sur les paires triées, donc
**déterministe** : deux téléphones lisant le même ticket rapprochent pareil (D50).

Mesuré de bout en bout sur le ticket du banc, contre une liste de sept articles :
**7/7 rattachés juste, tous au-dessus du seuil**, et « SACS POUB 30L » laissé
libre — il n'était pas sur la liste, et son prix s'apprend quand même.

### 3 · L'apprentissage (migration `0024`)

Un trigger, pas du code client : deux téléphones enregistrent la même sortie, et
un invariant du produit ne peut pas dépendre de celui qui a appuyé (D50).

- Le prix est **ramené au kilo ou au litre** quand la quantité est connue —
  « 2,30 € » ne veut rien dire sans savoir si c'est pour 200 g ou pour un kilo.
- Il se **moyenne** sur les observations, pour qu'une promotion isolée
  n'emporte pas tout ; `last_price_eur` reste à côté, parce que « tu l'as payé
  2,30 € la dernière fois » se vérifie, là où une moyenne ne se vérifie pas.
- La clé est `(foyer, enseigne, libellé)` **insensible à la casse** : deux
  lignes feraient deux moyennes, et l'estimation prendrait la moins observée.
- `shopping_item.paid_price_eur` se remplit au passage : c'est lui que le bilan
  lit.

### 4 · L'estimation

`estimation()` préfère le prix appris **chez cette enseigne** ; à défaut elle
prend celui d'ailleurs, mais le dit. Elle ramène un prix au kilo à la quantité
achetée, et **se tait** quand elle ne sait pas — un article jamais acheté n'a
pas de prix estimé, et l'écran l'affiche sans prix plutôt qu'avec une moyenne
nationale inventée.

La liste générée depuis les recettes porte donc ses prix estimés dès le premier
affichage, sans rien demander.

## Ce qui n'est pas fait

- Le rapprochement ne lit pas les codes-barres : un ticket n'en imprime pas.
- Les prix ne vieillissent pas encore. La vue `price_knowledge` existe pour que
  ce soit une correction d'une ligne le jour où un relevé de six mois gênera.
