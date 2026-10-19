# Les recettes, refaites — l'écran « Choisir »

- **Date :** 19 octobre 2026
- **Statut :** décisions prises en chat avec Kamil, le 1er octobre puis le 19 octobre
  2026 (« les 5 points tels quels »). Ce document les consigne. Ce que les décisions ne
  disaient pas a été tranché ici, et le § 9 le liste en entier.
- **Maquette :** le générateur `docs/superpowers/maquettes/recettes/build.py` (publié le
  01/10/2026 : <https://claude.ai/artifact/HUW9FsrjkYR8AUfwYMRGjQ>), et ses captures
  `docs/superpowers/maquettes/captures/recettes-liste-b.png`, `recettes-fiche.png`,
  `recettes-bas-de-liste.png` — non versionnées, parce qu'elles portent les photos des
  sites (`node docs/superpowers/maquettes/captures.mjs` les refait). Les noms qui suivent (`carte_vignette`, `fiche()`,
  `pagination()`, `propre()`, `fourchette()`, `APP`, `IC`) sont ceux de ce fichier.
- **Migration :** 0092. 0089 à 0091 sont prises, le Budget commence à 0093.
- **Plan :** `docs/superpowers/plans/2026-10-19-recettes.md`.

---

## 1 · Ce qui change

Aujourd'hui, « Choisir » affiche au plus quatre-vingts lignes de texte, triées par temps
actif. Les appareils s'y lisent en mots (« four · plaques »), il n'y a ni photo ni
détail, et « Avec ce qu'on a » ne cherche que parmi ces quatre-vingts. Kamil le trouve
« simple sa grand-mère et ennuyant ».

Désormais :

- chaque recette a sa **photo**, en petit, à gauche — celle du site d'où elle vient ;
- la liste se lit **par dix**, on ne fait que descendre, et les boutons de page sont
  tout en bas ;
- une icône **(i)** ouvre la fiche : la recette en détail, ses étapes, ses macros ;
- **huit pictos** remplacent les noms des appareils ;
- les **titres** perdent leur réclame (« : la meilleure recette ») ;
- le **temps actif** cesse de mentir : 73 recettes affichaient « 0 min actives » et
  passaient en tête du tri.

Le style est celui de la direction A du Budget : chiffres en grand, cartes, photos.

---

## 2 · Les décisions

Numérotées R1 à R7 pour ne pas croiser les D du Budget.

### R1 — la liste B, par dizaine, sur tout le catalogue

La liste « B · Vignettes » de la maquette : une photo carrée de 88 px à gauche, à peu
près cinq recettes par écran de téléphone.

**Toute la liste légère est chargée d'un coup** (≈ 1 390 recettes planifiables) : titre,
adresse de la photo, temps, parts, appareils, « se congèle », macros par part. On
filtre et on trie dans le navigateur, sans requête à chaque lettre tapée. On affiche
**dix recettes par page**. Les boutons de page sont tout en bas : « Les 10 suivantes »
et les numéros. Changer de page ramène en haut de la liste.

Les **manques** (ce qu'il manque au placard) ne se chargent que pour les dix recettes
affichées. La **photo** aussi : l'adresse voyage avec la liste légère, mais l'image ne
se télécharge que pour les recettes affichées.

### R2 — la fiche (i), chargée à l'ouverture

La fiche de la maquette, **telle quelle** (`fiche()`, capture `recettes-fiche.png`). Elle
monte du bas, sans quitter la liste. Ingrédients et étapes se chargent à l'ouverture,
en une requête ; le reste (photo, temps, macros) est déjà là.

### R3 — la photo est un lien vers celle du site

Rien n'est copié chez nous. L'adresse vient du JSON-LD `schema.org/Recipe`, champ
`image` : les huit sites la donnent (24 pages sondées sur 24, le 01/10/2026). Elle va
dans une colonne `recipe.image_url`. Quand elle manque ou ne charge plus, une **image
neutre** prend sa place.

Les 1 426 pages déjà ingérées sont **relues une fois** pour remplir `image_url` :
≈ 25 minutes, une requête par seconde, l'agent
`batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)`,
aucun défi anti-robot contourné. Kamil l'a accordée pour la prod le 19/10.

### R4 — huit pictos à la place des mots

`four`, `plaques`, `air_fryer`, `micro_ondes`, `autocuiseur`, `blender`, `batteur`,
`robot_cuiseur` : les tracés de `APP` dans la maquette. Le mot devient l'étiquette du
dessin (lecteur d'écran, survol).

### R5 — les titres nettoyés

Une fonction pure, `titrePropre`, reprend `propre()` de la maquette et l'étend aux
équivalents. Elle sert à l'ingestion (pour les pages à venir) et au recalcul (pour les
1 426 déjà en base). Le titre est corrigé **en base** : il s'affiche aussi au magasin,
au plan, sur les barquettes.

### R6 — une étape avec des gestes compte au moins ses gestes

La cause du « 0 min » : dans une étape, le verbe qui mobilise un appareil l'emporte.
« Dans un mixeur, versez le lait, la banane et les flocons. Mixez. » devient « mixer »,
passif ; si toutes les étapes sont ainsi, la recette ne demande « rien ». La règle
voulue : **une étape compte au moins les gestes qu'elle demande** (verser, mélanger,
ajouter…). Ensuite on recalcule le catalogue (`scripts/recalcule.mjs`).

### R7 — le temps total incohérent et les calories aberrantes

Deux défauts vus dans les données le 01/10/2026, et ce qu'on en fait :

- **un temps total plus court que le temps actif** (« Hachis parmentier » : 19 min
  actives, 10 min en tout ; « Poulet mariné à l'indienne » : 28 et 25). Le total vient du
  site, l'actif de nos étapes : l'un des deux a tort, et on ne peut pas finir avant
  d'avoir fini ses gestes. La donnée **ne change pas** ; la fiche, seule à montrer le
  total, affiche celui du site s'il est au moins égal au temps actif, et sinon la somme
  de nos étapes (§ 3.6) ;
- **des calories aberrantes** : une part ne peut pas dépasser 900 kcal pour 100 g, ni
  peser plus de 1,5 kg, ni valoir moins de 20 ou plus de 2 000 kcal. Hors de ces bornes,
  c'est le nombre de parts ou un poids qui est faux. Les macros de la recette sont alors
  **retirées**, comme quand trop d'ingrédients manquent : une valeur fausse est pire
  qu'aucune, parce qu'elle sert à filtrer (D18). La recette reste au catalogue,
  « macros inconnues ».

---

## 3 · L'écran

Les textes ci-dessous sont les textes exacts. Les mesures sont celles de la maquette.

### 3.1 · L'en-tête

1. La sortie des passages du cycle, inchangée : « ← Accueil » (comme Magasin et Plan).
   La maquette montre l'en-tête du Budget (« ← Popote » et l'avatar) : Choisir est un
   passage du cycle, il garde la sortie des passages.
2. Le surtitre : le jour où l'on cuisine, en capitales espacées — « DIMANCHE 25
   OCTOBRE ». C'est la veille du lundi que couvre le cycle (`cycle.week_of`).
3. Le titre « Choisir », Fraunces 46 px, optique 144.

### 3.2 · La carte encre : ce qu'il reste à couvrir

Carte encre, rayon 28 (`carte_encre()`).

| Cas | En haut à gauche | Le grand chiffre (safran, 60 px) | Dessous |
|---|---|---|---|
| Il manque des parts | « Il manque » | « 6 parts » | « 4 déjà retenues. On fait les courses samedi. » — ou « Rien de retenu pour l'instant. On fait les courses samedi. » |
| Juste ce qu'il faut | « C'est couvert » | « 10 parts » | « Il ne reste qu'à faire la liste. » |
| Au-delà | « Au-delà du prévu » | « +2 parts » | « 12 parts retenues pour 10 prévues. » |

En haut à droite, une pastille « 10 repas à couvrir ». C'est un bouton : il ouvre, dans
la carte, le champ « Parts visées cette semaine » (le réglage qui était au-dessus de la
liste). Dessous, les recettes retenues : vignette de 38 px, titre, le champ « Parts de
<titre> », « parts », et « Retirer ». Une recette d'ami devenue illisible garde sa ligne
d'aujourd'hui : « Recette devenue inaccessible — Son foyer ne la partage plus. Elle
n'apporte plus rien aux courses. »

La barre du bas ne change pas : le compteur « 4 / 10 parts » et « Faire la liste »,
toujours sous les yeux (les bancs de fumée le vérifient).

### 3.3 · Chercher et filtrer

- Le champ « Chercher une recette » (surface, rayon 18, 50 px), et à sa droite le bouton
  carré « Appareils et filtres » (piste, picto de réglages). Il ouvre et referme le
  panneau ; quand des filtres sont posés, il porte leur nombre dans une pastille safran.
- La recherche porte sur le titre, **sans les accents** : « pates » trouve « Pâtes ».
- Quatre puces, raccourcis du panneau, qui défilent à l'horizontale : « ≤ 20 min
  actives », « ≥ 30 g de protéines », « Se congèle », « Avec ce que j'ai ». Une puce
  allumée est encre ; une puce éteinte, piste.
- Le panneau, sous les puces :
  - « Temps les mains prises » : ≤ 10, ≤ 20, ≤ 30, ≤ 45 min, « Peu importe », et la
    phrase d'aujourd'hui (« Le temps de gestes, pas le temps total… ») ;
  - « Protéines au moins » (g) et « Calories au plus » (kcal), et la phrase de la borne
    défavorable ;
  - « Avec seulement » : les huit pictos, chacun avec son nom, à cocher ;
  - « Jamais essayée ».
- Sous les filtres : « Recettes » (Fraunces 25) et, à droite, « 1 390, de 1 à 10 ».
  « Tout effacer » apparaît quand un filtre est posé ; il garde la recherche.

Les filtres gardent leurs règles : la borne défavorable (D18), un appareil non coché
n'apparaît dans aucune étape, une recette sans macros n'est écartée que si l'on filtre
sur les macros. Deux règles nouvelles :

- une recette dont le temps actif reste **inconnu** (0 min après R6, § 9) est écartée
  par le filtre de temps : on ne promet pas « ≤ 20 min » sur ce qu'on n'a pas compté ;
- « Avec ce que j'ai » cherche dans **tout** le catalogue (la base répond, § 4.3). Une
  recette dont aucun ingrédient n'est reconnu n'est pas « faisable » : on ne sait pas.
  Placard vide dans l'appli : « Tes placards sont vides dans l'app : ce filtre ne rendra
  rien. » ; des articles, mais aucun reconnu comme un aliment : « Rien dans tes placards
  n'est reconnu comme un aliment : ce filtre ne rendra rien. »

### 3.4 · Une recette de la liste

`carte_vignette` : carte surface, rayon 22, ombre des cartes, 10 px de marge intérieure.

- À gauche, la photo, 88 × 88, rayon 16. Sans photo, ou si elle ne charge plus : l'image
  neutre — fond piste, la marmite de Popote au centre.
- Au milieu :
  - le titre, 15,5 px semi-gras, deux lignes au plus ;
  - « 12 min actives · 4 parts », et « · se congèle » quand c'est le cas. Temps inconnu :
    « Gestes non comptés » ;
  - « **28–34 g** de protéines · 480–560 kcal » : la fourchette des protéines en herbe et
    en gras, celle des calories en doux. Sous 90 % d'ingrédients reconnus, on ajoute en
    ocre « · 72 % des ingrédients connus ». Sans macros : « Macros inconnues » ;
  - « Ajoutée par Kamil », ou en ocre « Partagée par Thauba » ;
  - en ocre, « il manque 400 g de lentilles corail » ou « il manque 3 ingrédients »,
    seulement si le foyer a un placard renseigné ;
  - les pictos des appareils, 26 px, sur pastille piste.
- À droite, en colonne : le bouton (i) en haut (« <titre>, la recette en détail ») ; en
  bas, le rond safran « + » (« Ajouter <titre> »), ou la coche herbe d'une recette déjà
  retenue (« Retenue »).

Les parts ajoutées suivent la règle d'aujourd'hui : ce qui manque, borné par le
rendement de la recette, 2 à défaut, 1 au moins.

L'ordre : le temps actif croissant, les temps inconnus à la fin, puis le titre.

### 3.5 · Le bas de la liste

`pagination()`, seulement au-delà de dix résultats :

- « Recettes 11 à 20 sur 1 390 » ;
- le grand bouton safran « Les 10 suivantes › » — « Les 4 suivantes » quand il en
  reste quatre ; absent sur la dernière page ;
- les numéros, ronds de 44 px : le premier, le dernier, la page et ses voisines, des
  « … » entre (« 1 2 3 … 139 », « 1 … 49 50 51 … 139 »). La page affichée est encre.

Changer de page fait défiler jusqu'au titre « Recettes » et y pose le focus. La page
revient à 1 quand un filtre ou la recherche change. Ajouter une recette ne change pas
de page.

Puis, comme aujourd'hui : « Rien ne va ? Invente-moi une recette » et « J'ai ma propre
recette à coller ».

### 3.6 · La fiche (i)

`fiche()`, capture `recettes-fiche.png`. Un `<dialog>` qui monte du bas, à 44 px du haut,
rayon 28 en haut. Il se ferme par la croix, par Échap, ou en touchant le voile.

1. **La photo**, 230 px de haut, la poignée, la croix « Fermer ».
2. **Le site** en surtitre (« CUISINE.JOURNALDESFEMMES.FR ») ; pour une recette de foyer,
   « Ajoutée par Kamil ».
3. **Le titre**, Fraunces 30.
4. **Trois tuiles** : « 10 min / actives », « 2 h / en tout », « 10 / parts ». Le total
   suit R7 : celui du site s'il est au moins égal au temps actif, sinon la somme des
   durées de nos étapes (chaque étape comptée au moins pour ses gestes) — c'est déjà ce
   qu'une recette collée appelle « en tout ». Temps actif inconnu : « — ».
5. **La carte encre « Par part »**, avec la pastille de précision : « à 9 kcal près » ;
   « Tout est pesé » quand il n'y a pas de marge ; « 72 % des ingrédients connus » sous
   90 %. Dedans : « 50 g » en safran 44 px, « de protéines » ; « 497–515 », « kcal » ;
   « 5 g », « de fibres ». Sans macros : « Macros inconnues : trop d'ingrédients non
   reconnus. »
6. **Les appareils**, en pastilles : le picto et son nom.
7. **« Ingrédients »**, et « pour 10 parts » à droite. Une carte, une ligne par
   ingrédient : la quantité en gras dans une colonne de 86 px (« 2 kg », « 3 gousses »,
   « 1 c. à soupe »), le nom à côté, avec une majuscule. Une ligne sans quantité n'a que
   le nom.
8. **« Étapes »**, et à droite « 10 min de gestes, le reste cuit seul » (sans « le reste
   cuit seul » quand aucune étape n'est passive). Une carte par étape : le numéro dans
   une pastille encre, le texte, et des pilules :
   - étape active : « 3 min · tes gestes » (sable, ocre) ;
   - étape bloquante : « 6 min · à surveiller » (sable, ocre) ;
   - étape passive : « 1 h · sans toi » (piste, doux) — précédée de « 1 min · tes
     gestes » quand elle en demande (R6) ;
   - le picto de l'appareil, s'il y en a un.
9. **« Voir la recette sur cuisine.journaldesfemmes.fr »**, lien vers la page (nouvel
   onglet, sans référent).
10. **Le pied, collé en bas** : « Ajouter à dimanche · 10 parts » (safran, 56 px), ou
    « Retenue pour dimanche · 4 parts » quand elle l'est déjà. La fiche reste ouverte
    après l'ajout.

Le texte des étapes et des ingrédients passe par le décodeur d'entités (§ 5.2) : les
recettes déjà en base peuvent en porter.

### 3.7 · Les pictos

Les huit tracés de `APP` et les icônes de `IC` (info, croix, coche, plus, loupe,
réglages, chevron, sortie), au trait de 1,7 à 2,4 px, en `currentColor`. Un picto a
`role="img"` et son nom en étiquette.

### 3.8 · Chargement, vide, erreur

- Pendant le premier chargement de la liste : « Un instant… » à la place de la liste ;
  la carte encre et la recherche sont déjà là.
- Aucun résultat : « Rien ne correspond » et « Desserre un filtre, ou invente une
  recette depuis l'accueil. » ; catalogue vide : « Le catalogue se remplit par
  l'ingestion. »
- Erreur de chargement : le message, en groseille, sous les filtres.
- Fiche : « Un instant… » à la place des ingrédients et des étapes ; une recette devenue
  illisible entre-temps : « Cette recette n'est plus accessible. »

### 3.9 · Les jetons visuels

Ceux de la direction A. `src/index.css` gagne `--color-piste: #E4E9E1`,
`--color-sable: #F6EAD2` et `--shadow-carte` (`0 1px 2px rgba(28,43,35,.06), 0 8px 24px
rgba(28,43,35,.07)`), s'ils n'y sont pas déjà (le Budget les pose aussi), une classe
`.titre-fort` (Fraunces, optique 144, graisse 600) et l'animation `monte` de la fiche.
Rayons : 28 la carte encre et la fiche, 22 les cartes, 18 les champs et les grands
boutons, ronds pour les pastilles. Cibles tactiles de 44 px au moins.

---

## 4 · Les données

### 4.1 · Migration 0092

1. **`recipe.image_url text`**, `null` ou une adresse `https://` de 2 048 caractères au
   plus.
2. **Le trigger `recipe_photo`** (`before insert or update of image_url`) : hors rôle de
   service, poser ou changer la photo est refusé. Chaque foyer charge la photo de chaque
   recette qu'il voit : une adresse posée par un compte — sur le catalogue, que tous
   peuvent corriger (classe B), ou sur une recette « publique » — ferait charger à tous
   une image de son choix, et lui dirait qui regarde. Le test passe par
   `is_service_role()`, qui survit à `security definer`.
3. **`recipe_step.gesture_min numeric`** (≥ 0), les minutes de gestes que l'étape
   conjugue (§ 5.3). `null` = non mesuré.
4. **`tg_recipe_agrege`** compte, par étape : active ou bloquante, le plus grand de sa
   durée et de ses gestes ; passive, ses gestes. Avec `gesture_min` nul, le calcul est
   celui d'avant : une recette ne bouge qu'une fois ses gestes posés — par l'ingestion,
   l'import ou le recalcul. Une étape dont la durée a été confirmée à la main n'en
   reçoit pas.
5. **`recettes_faisables()`** (`setof uuid`, `security invoker`, `stable`) : les recettes
   planifiables dont tous les ingrédients reconnus sont au placard du foyer, et qui en
   ont au moins un. Exécutable par `authenticated` seulement.

### 4.2 · La liste légère

Une requête paginée par mille (PostgREST plafonne en silence) :

```
recipe: id, title, image_url, yield_servings, total_time_min, active_time_min,
        appliances, freezable, owner_household_id, created_by,
        recipe_nutrition(kcal, protein_g, kcal_margin, protein_g_margin, fiber_g, coverage)
où title non nul et plannable, ordre id
```

Puis, comme aujourd'hui, `current_household` et `prenoms_visibles` pour la provenance
quand des recettes de foyer sont là. Clé `['catalogue-leger']`, fraîche dix minutes.
Quelques centaines de Ko bruts, de l'ordre de 100 Ko compressés (estimé) — une fois
par visite.

`useTailleCatalogue` disparaît : la taille, c'est la longueur de la liste.

### 4.3 · Ce qui se charge à la demande

- **Les manques** : `recipe_ingredient (recipe_id, food_id, raw_text)` pour les dix
  identifiants affichés, comparés aux `food_id` du placard (`useStock`). Seulement si le
  placard en a. Une ligne non rattachée ne manque pas : on ne sait pas.
- **« Avec ce que j'ai »** : `rpc('recettes_faisables')`, quand la puce est allumée et
  que le placard a des aliments reconnus. La clé porte la liste des aliments : le placard
  change, la réponse aussi.
- **« Jamais essayée »** : les `recipe_id` de `cycle_recipe`, quand la puce est allumée.
- **La fiche** : une requête sur `recipe` avec `recipe_ingredient(ordinal, raw_text)`,
  `recipe_step(ordinal, text, duration_min, load_type, appliance_type, gesture_min)` et
  `recipe_nutrition(...)`, triés par `ordinal`. Clé `['fiche', id]`.

### 4.4 · Les recettes retenues

`useRecettesDuCycle` lit aussi `image_url`, pour les vignettes de la carte encre.

`useChoisitRecette` et `useRetireRecette` invalidaient **toutes** les requêtes : à chaque
« + », on rechargerait 1 390 recettes. Elles invalident désormais tout sauf
`catalogue-leger` et `fiche`, que retenir une recette ne change pas. Les autres
invalidations globales (import, changement d'état du cycle) restent : un import ajoute
bel et bien une recette.

---

## 5 · L'ingestion

### 5.1 · La photo (`worker/src/jsonld.ts`)

`photo(image, page)` rend la première adresse utilisable, celle que le site met en
avant. `image` s'écrit de quatre façons : une adresse, une liste d'adresses, un
`ImageObject` (`url`, puis `contentUrl`), une liste d'`ImageObject`. Un objet qui ne
porte qu'un `@id` est un renvoi : on cherche dans le graphe de la page le nœud complet
qui porte cet `@id` — pas le premier objet venu, car un graphe Yoast y renvoie depuis
l'`Article` avant de décrire l'image. Un `@id` introuvable n'est retenu que s'il finit
comme une image (`.jpg`, `.png`, `.webp`…) — sinon c'est l'ancre d'une page
(`…/#primaryimage`). L'adresse est décodée de ses entités, résolue contre
l'adresse de la page, passée de `http:` à `https:` (le site est servi en https, le
navigateur le ferait de toute façon), refusée si elle n'est pas en https ou dépasse
2 048 caractères. `RecetteBrute` gagne `image`, l'ingestion écrit `image_url`.

On ne choisit pas la plus petite des variantes : on ne connaît pas leurs poids sans les
télécharger. `loading="lazy"` et dix recettes par page bornent ce qui part sur le
téléphone.

### 5.2 · Le titre et les entités (`src/lib/recettes/texte.ts`)

Pur, partagé par le worker (qui importe déjà `src/lib/nutrition/macros.ts`), le recalcul
et l'écran.

- **`decodeEntites`** : `&amp;`, `&quot;`, `&#039;`, `&eacute;`, numériques et
  hexadécimales, deux passes (`&amp;amp;` existe). Appliquée au titre, et à l'ingestion
  aux ingrédients et aux étapes des nouvelles pages ; la fiche l'applique à l'affichage
  pour les anciennes.
- **`titrePropre`**, dans l'ordre :
  1. décoder les entités, réduire les espaces ;
  2. retirer une fin introduite par « : », « | », « – », « — », « , » ou « - » (tiret
     entouré d'espaces, pour garder « Saint-Jacques ») qui contient le mot « recette » —
     « : la meilleure recette », « - Recette Ptitchef », « , la vraie recette
     italienne » ;
  3. retirer une parenthèse finale qui contient « recette » ;
  4. retirer une fin faite d'une seule marque d'appareil ou de site (« - Cookeo »,
     « - Thermomix ») ;
  5. retirer « Recette de / du / des / d' / : » en tête ;
  6. rendre l'accent perdu : « a l' » et « a la » entre deux mots deviennent « à l' »,
     « à la » ;
  7. retirer les points et espaces de fin, mettre une majuscule.

  Un titre qui ne ressemble à aucun motif passe tel quel ; un nettoyage qui ne laisse
  pas trois caractères rend le titre d'origine. La fonction est idempotente. Les dix
  titres réels de la maquette sortent tous propres (`dix.json`).

### 5.3 · Les gestes d'une étape (`worker/src/etape.ts`)

`gestesMin(texte, referentiel)` additionne les minutes de référence de chaque **verbe de
main** que l'étape **conjugue** :

- verbe de main : une ligne de `default_duration` sans appareil et qui n'est pas passive
  (verser, mélanger, ajouter, couper, remuer…), alias compris ; chaque verbe compte une
  fois ;
- conjugué : l'infinitif et l'impératif en « vous » partout (« verser », « versez ») ;
  l'impératif en « tu » (« verse », « garnis ») seulement en tête de proposition ou après
  « et », « puis », « ensuite », « enfin », « alors », « ou » ; le gérondif seulement
  après « en » (« en remuant »). Le participe passé jamais, ni un infinitif nié ou remis
  à plus tard (« sans les éplucher », « avant de démouler » : le démoulage a son étape).

Ces trois familles viennent de la mesure (§ 11) : la forme en « tu » est aussi celle d'un
nom (« le beurre », « du mélange », « de poivre »), le participe décrit un ingrédient
(« les poivrons coupés », « l'eau salée »), et un participe présent sans « en » est un
adjectif (« un couteau bien tranchant »). « émincé » se plie comme l'impératif « émince » :
seul l'accent du texte d'origine les sépare, et c'est lui qu'on lit.

La durée suit la règle de l'étape : la mise à l'échelle par les grammes écrits pour un
verbe `lineaire_plafonne`. `analyserEtape` rend `gestesMin` pour toute action,
`preparer` l'écrit dans `gesture_min`. La fonction `importer` (recette collée) le rend
aussi, et l'écran d'import l'écrit ; quand la personne corrige la durée d'une étape,
l'étape perd son plancher (`gesture_min` nul) : sa durée fait foi.

### 5.4 · Les macros plausibles (`src/lib/nutrition/macros.ts`)

`plausible({ grams, kcal })` : 20 ≤ kcal ≤ 2 000, grammes ≤ 1 500, et au plus 900 kcal
pour 100 g. Appliquée à l'ingestion (`preparer`), à l'import (`macros()` de
`src/lib/donnees/importer.ts`) et au recalcul. Hors bornes, pas de ligne
`recipe_nutrition`, et le journal d'ingestion dit pourquoi.

Les bornes visent les erreurs, pas les petites parts : une truffe protéinée de 20 g
garde ses macros. Le recalcul à sec (§ 7) liste les recettes écartées avant toute
écriture.

---

## 6 · La relecture des pages (`scripts/relis-photos.mjs`)

Une fois, pour les recettes déjà ingérées. Ensuite, l'ingestion écrit la photo d'elle-même.

- **Ce qu'elle relit :** les recettes du catalogue (`origin = 'importee'`, sans foyer)
  qui ont une adresse et pas encore de photo. Relancer reprend où l'on s'est arrêté.
- **Comment :** domaine par domaine, les pages dans un ordre neuf à chaque passage — sinon
  trois pages mortes en tête d'un site le feraient abandonner à chaque relance.
  `robots.txt` est lu une fois par domaine : un chemin
  interdit n'est pas lu, un `Crawl-delay` plus long que le nôtre est suivi. Une page par
  seconde au plus (1 100 ms), en série, l'agent de l'ingestion, la redirection suivie,
  30 s de délai.
- **Ce qu'elle écrit :** `image_url`, et seulement si elle est encore vide. Rien d'autre :
  ni le titre, ni les étapes.
- **Ce qu'elle ne fait pas :** contourner. Une page refusée (401, 403, 429, 503) ou une
  page sans recette (un défi anti-robot répond souvent 200) compte un refus ; trois refus
  de suite, et le domaine est laissé pour cette fois. Une page disparue (404, 410) est
  comptée, et la recette garde son image neutre.
- **Le bilan,** par domaine : lues, photos trouvées, sans photo, sans recette, refusées,
  disparues, interdites, abandonnées, et la durée.
- **Les drapeaux :** `--prod`, `--sec` (rien n'est écrit), `--limite N`,
  `--domaine <hôte>` (répétable). En local, `--domaine` est **obligatoire** : les
  adresses de la base locale sont celles des tests (`exemple.fr`, `x`), et on ne va pas
  frapper chez des inconnus.

Durée en prod : ≈ 1 426 × 1,1 s, soit ≈ 26 minutes, plus huit `robots.txt`.

---

## 7 · Le recalcul du catalogue (`scripts/recalcule.mjs`)

Le script garde ses quatre passes (rattachement, grammes, macros, agrégats). Trois choses
changent :

1. **Passe T, les titres** — avant les autres. `titrePropre` sur les titres du catalogue
   ingéré (`origin = 'importee'`, sans foyer). Les titres de foyer, que quelqu'un a
   écrits, ne sont pas touchés.
2. **Passe G, les gestes** — avant les agrégats. Le référentiel est relu en base
   (`default_duration`, `verbe_alias`, `non_action_pattern`), puis `gestesMin` sur le
   texte de chaque étape, recettes de foyer comprises : une recette collée doit avoir la
   même forme qu'une recette ingérée. Une étape dont la durée a été confirmée par quelqu'un
   (`duration_source = 'confirmee'`) ou corrigée par un foyer
   (`edited_by_household_id`) n'a pas de plancher. Seules les étapes qui changent sont
   écrites ; le trigger recalcule leur recette.
3. **La passe 2 (macros)** écarte aussi les macros invraisemblables (§ 5.4).

À sec (`--sec`), le script **écrit le détail** : chaque titre avant → après, et ceux qui
portent encore « recette » ou un séparateur ; les recettes à 0 min avant et après, celles
qui restent à 0, les dix plus fortes hausses ; les recettes dont le total est sous le
temps actif, avant et après ; les macros écartées, avec leurs kcal, grammes et parts. Ce
relevé se lit **avant** d'écrire, et ses chiffres vont dans `docs/ingestion.md`.

---

## 8 · Cas limites

| Cas | Ce qui se passe |
|---|---|
| Plus de 1 000 recettes | La liste se lit par pages de mille, triées par `id` |
| Recette sans photo, photo disparue, photo refusée au « hotlink » | Image neutre. `referrerPolicy="no-referrer"` : le site ne voit pas d'où l'on vient, ce qui passe aussi la plupart des refus. Une adresse en échec n'est plus redemandée jusqu'au rechargement |
| Photo en `http:` dans la page | Passée en `https:` ; si l'hôte ne le sert pas, image neutre |
| Titre très long | Deux lignes dans la liste, entier dans la fiche |
| Titre que le nettoyage viderait | Titre d'origine |
| Recette à 0 min après R6 | « Gestes non comptés », en fin de tri, écartée par le filtre de temps |
| Total déclaré absent ou sous le temps actif | La fiche montre la somme des étapes |
| Macros invraisemblables | Retirées ; « Macros inconnues » ; écartée des filtres de macros |
| Moins de 90 % des ingrédients reconnus | « · 72 % des ingrédients connus », en ocre |
| Recette d'ami, partage retiré pendant qu'on regarde | Elle sort de la liste au prochain chargement ; fiche ouverte : « Cette recette n'est plus accessible. » |
| Moins de onze résultats | Pas de boutons de page |
| Page courante au-delà de la fin (la liste a rétréci) | Ramenée à la dernière page |
| Filtre ou recherche modifiés | Page 1 |
| Ajouter depuis la liste ou la fiche | La page ne bouge pas ; la ligne passe à « Retenue » |
| « Avec ce que j'ai », placard vide | Liste vide, et la phrase du placard vide |
| « Avec ce que j'ai », recette sans ingrédient reconnu | Pas faisable |
| Un foyer tente de poser `image_url` | Refusé par le trigger, à l'insertion comme à la correction |
| Site qui renvoie un défi à la relecture | Compté « sans recette » ; trois de suite et le domaine est laissé |
| Page de recette disparue | Comptée ; la recette reste, sans photo |
| Relecture interrompue | La relancer : elle ne relit que les recettes encore sans photo |
| Durée d'étape corrigée à l'import | L'étape perd son plancher de gestes |
| Bouton « retour » du téléphone, fiche ouverte | Il quitte l'écran, comme aujourd'hui (§ 10) |

---

## 9 · Tranché ici

Ce que les décisions ne disaient pas, et ce qui a été choisi :

1. **R6 vaut pour toutes les étapes**, pas seulement les passives : « Épluchez et
   émincez les oignons » compte éplucher et émincer (7 min) et non plus le seul verbe de
   tête (4 min). Sur les trois recettes réelles des fixtures, le temps actif passe de
   19 à 33, 6 à 9 et 7 à 14 minutes : il était sous-estimé. La plupart des recettes du
   catalogue vont monter, pas seulement les 73.
2. **Les gestes se reconnaissent à leur forme** (§ 5.3), sur le référentiel existant.
   « Mettez », « placez », « délayez » ne sont pas au référentiel et ne comptent pas :
   les y ajouter changerait aussi le verbe retenu des étapes, donc le plan.
3. **Une durée confirmée par quelqu'un n'a pas de plancher.**
4. **0 min après R6 se lit « inconnu »** : « Gestes non comptés », en fin de tri, hors du
   filtre de temps. Aucune recette ne se fait sans les mains.
5. **Le total incohérent ne se corrige pas en base** : la fiche choisit (R7).
6. **Les bornes des macros** : 20 à 2 000 kcal la part, 1,5 kg au plus, 900 kcal pour
   100 g au plus.
7. **L'adresse de la photo voyage avec la liste légère** ; l'image ne se télécharge que
   pour les recettes affichées. Une requête de plus à chaque page retarderait les photos
   pour quelques dizaines de Ko gagnés une fois.
8. **Seul le rôle de service écrit `image_url`**, en https.
9. **« Avec ce que j'ai » interroge la base** sur tout le catalogue ; une recette sans
   ingrédient reconnu n'est pas faisable.
10. **Les manques s'affichent sans la puce**, dès que le placard a des aliments reconnus
    (D28 : « en mode tout, chaque recette affiche ses manques »). Aujourd'hui, ils ne
    s'affichaient jamais.
11. **L'en-tête garde « ← Accueil »**, sans avatar.
12. **Les puces sont des raccourcis du panneau** ; le temps passe à 10, 20, 30, 45 min
    pour que « ≤ 20 min actives » soit l'une des valeurs du panneau.
13. **La carte encre porte les recettes retenues** avec leurs parts et « Retirer », et
    la pastille ouvre les parts visées : la maquette n'en montre que la lecture, l'écran
    doit garder ces gestes.
14. **Une étape passive avec gestes a deux pilules** dans la fiche.
15. **La recherche ignore les accents.**
16. **La relecture suit `robots.txt`**, s'arrête après trois refus par domaine, reprend
    où elle s'est arrêtée, et exige `--domaine` en local.
17. **Le recalcul ne réécrit que les titres du catalogue ingéré.**
18. **Les entités** se décodent à l'ingestion (nouvelles pages) et à l'affichage de la
    fiche (anciennes) ; les étapes et ingrédients en base ne sont pas réécrits.

---

## 10 · Ce que ce chantier ne fait pas

- **Les étapes sans verbe mais avec un appareil écrit** (« Au four 30 minutes à
  180 °C. ») comptent toujours leur durée comme du travail actif : le défaut inverse du
  « 0 min ». Le recalcul à sec en donne le nombre ; la décision viendra avec.
- **La fusion et le plan** ne lisent pas `gesture_min` : l'ordonnanceur garde ses
  durées et ses charges.
- **Le bouton « retour » du téléphone** ne ferme pas la fiche.
- **Choisir la plus petite variante d'une photo.**
- **Les écarts connus des deux heuristiques**, que le relevé à sec montrera : un nom
  après « et » à la forme d'un « tu » compte comme un geste (« sel et poivre » : ½ min) ;
  « Bats les œufs » (le « tu » de battre) n'est pas lu ; « Recette de grand-mère : la
  blanquette » devient « Grand-mère : la blanquette », et « Gratin de courgettes, recette
  légère au chèvre » perd « au chèvre ». Chaque cas vu au relevé devient un test, puis une
  règle.
- **Le hors-ligne** : la liste n'est gardée qu'en mémoire.

---

## 11 · Les tests

TDD : chaque règle a son test rouge avant son code.

**Purs (Vitest)**

- `worker/test/jsonld.test.ts` — `photo()` : adresse, liste, `ImageObject`, liste
  d'objets, `@id` résolu dans `@graph` (même quand un autre nœud y renvoie d'abord), ancre
  `#primaryimage` refusée, adresse relative,
  `http:` → `https:`, `data:` refusé, `&amp;` décodé, absente ; `extraire()` rend `image`.
- `src/lib/recettes/texte.test.ts` — les cas du § 5.2, l'idempotence, le titre jamais
  vidé ; `decodeEntites`. Les dix titres de `dix.json` dans `worker/test/titres.test.ts` :
  le test lit un fichier, et `src/` se compile sans les types de Node.
- `worker/test/etape.test.ts` — `gestesMin` : « Dans un mixeur, versez… Mixez. » → 1 ;
  les poivrons coupés → ajouter seul ; « Épluchez et émincez » → 7 ; préchauffage,
  repos, eau salée → `null` ; « le beurre », « de poivre », « du mélange » ne comptent
  pas ; « le poulet, émincé finement » ne compte qu'ajouter ; « Coupe… et ajoute-les »
  → 4 ; « en remuant » → 1 ; « un couteau bien tranchant » ne compte pas ; « sans les
  éplucher », « avant de démouler » ne comptent pas ; mise à l'échelle par les grammes ;
  chaque verbe une fois.
- `worker/test/ingere.test.ts` — `gesture_min`, `image_url`, titre nettoyé, macros
  invraisemblables retirées avec leur motif.
- `src/lib/nutrition/macros.test.ts` — `plausible()` sur chaque borne.
- `src/lib/recettes/temps.test.ts` — `minutesDeMains`, `tempsActif`, `actifConnu`,
  `enTout` (site cohérent, site incohérent, site absent).
- `src/lib/recettes/pages.test.ts` — nombre de pages, tranche, numéros (« 1 2 3 … 139 »,
  « 1 … 49 50 51 … 139 », « 1 … 137 138 139 », petits totaux), bornes de la page.
- `src/lib/recettes/fiche.test.ts` — la quantité et le nom d'un ingrédient, la pastille
  de précision.
- `src/lib/donnees/catalogue.test.ts` — `retient` (texte sans accents, temps inconnu,
  appareils, congelable, faisables, plus les cas d'aujourd'hui), `trie`, `manquesDe`,
  `partsAProposer`.
- `worker/test/relecture.test.ts` — l'issue d'une page selon son statut, l'abandon après
  trois refus.

**Base locale (Vitest, `tests/recettes.test.ts`)**

- la photo : le rôle de service l'écrit ; `http:` et `javascript:` refusés ; un foyer ne
  la pose ni sur le catalogue ni à la création de sa recette, et corrige toujours un
  titre ;
- les gestes : passive → ses gestes ; active → le plus grand ; sans gestes, le calcul
  d'avant (le banc de `tests/catalogue.test.ts` reste vert) ; **la base et
  `tempsActif()` disent la même chose** ; `gesture_min` négatif refusé ;
- `recettes_faisables()` : tout au placard → rendue ; un aliment manquant → non ; aucun
  ingrédient reconnu → non ; le placard d'un autre foyer ne compte pas ; anonyme refusé.

**Navigateur (Playwright)**

- `e2e/fumee.spec.ts` garde ses trois attentes sur Choisir (l'écran s'ouvre, la barre du
  bas reste, « 8 min » s'affiche) et gagne : la liste par dix (douze recettes semées,
  « Les 2 suivantes », page 2) ; la fiche (i) d'une recette semée pour elle (étapes,
  pilules « 8 min · tes gestes » et « 25 min · sans toi », ingrédients, « 32–36 g ») ;
  l'image neutre d'une photo qui ne charge pas ; une photo qui charge, sans référent.
- `e2e/cycle.spec.ts` suit les nouveaux noms (« Chercher une recette », « Appareils et
  filtres », sans `if (count)`) et capture la fiche et le bas de la liste.

**Par mutation** — un test qui survit à la remise du défaut ne prouve rien. On remet,
une à une : le gagnant « verbe d'appareil » sans plancher (le test du mixeur doit
tomber) ; le participe accepté (les poivrons) ; la forme en « tu » acceptée partout
(le beurre) ; le contrôle de l'accent retiré (« émincé ») ; `greatest` remplacé par la
durée seule (le banc de la base) ; le trigger
de la photo retiré (le test du foyer) ; la borne de 900 kcal retirée ; le tri qui met
les 0 min en tête.

**Rendu** — les captures de `cycle.spec.ts` comparées à l'œil aux trois captures de la
maquette.

---

## 12 · Le déploiement

Dans cet ordre, après tests verts (décision du 19/10 : Claude déploie, puis dit ce qui
est parti) :

1. `npx supabase db push` (0092), après `npx supabase migration list` : seule 0092 doit
   attendre, le Budget pousse les siennes lui-même ;
2. `npx supabase functions deploy importer` ;
3. `npm run recalcule -- --prod --sec`, lu, puis `npm run recalcule -- --prod` ;
4. `npm run deploy` (le site) ;
5. `npm run relis-photos -- --prod --sec --limite 20`, lu, puis
   `npm run relis-photos -- --prod` (≈ 26 min) ;
6. les comptes en lecture seule : photos posées, recettes à 0 min, macros écartées.

Le site nouveau lit `image_url` : il ne part qu'après la migration. L'ancien site, lui,
ne voit pas la différence. Les étapes 1 à 6 demandent le jeton de gestion Supabase
(`~/PERSO/supabase_token.txt`) et, pour les scripts, la clé de service de la prod, qui
n'est pas dans `.env.production` ; si le jeton a expiré, Kamil en recrée un.
