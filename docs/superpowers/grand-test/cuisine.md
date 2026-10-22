# Grand test, parcours B — « la cuisine » (22/10/2026)

Joué sur le build servi (`vite preview`, mode development, port 4173), Pixel 7, 390 × 844, `fr-FR`,
`Europe/Paris` (écrans principaux repassés à 360 px : aucun débordement). Base locale, foyer jetable
« Kamil + Thauba » (sans cycle au départ) et 53 recettes réalistes semées (photos qui chargent, cassées
ou absentes, titre de 150 caractères, emoji, entités HTML, sans macros, sans étapes, sans parts).
98 captures prises (`.shots/cuisine/`, non versionné), réseau et console écoutés sur tout le parcours ;
une trentaine regardées une à une, les autres contrôlées par mesure (DOM, débordement, cibles, texte) et
par relecture de la base.

## Bugs trouvés et corrigés

| Gravité | Où | Ce qu'on voyait | Cause | Correctif |
|---|---|---|---|---|
| P1 | Ouverture sans réseau | « Un instant… » 20 s, puis « Il te faut une invitation » à quelqu'un qui a un foyer | `relire()` lisait le `data` nul d'un `fetch` raté comme « aucun foyer » | `de07742` : écran « Hors ligne » + « Réessayer », relecture au retour du réseau |
| P1 | Accueil cuisine sans cycle vivant (foyer neuf, semaine close, session interrompue) | « Un instant… » pendant 7,5 s avant « Rien de prévu » | `current_cycle()` rend `null` ; `ou()` lève sur `null`, TanStack rejoue 3 fois | `6a9c450` : `ouNul` (`lisLeCycle`) |
| P1 | Cuisine → « Interrompre la session » | Un toucher ferme la semaine pour de bon : plus aucun écran n'y ramène, « Choisir les recettes » ne fait rien (409 avalé) | `current_cycle()` écarte `interrompue` (0018) et `open_cycle` refuse la même semaine ; aucune reprise dans l'UI | `e004b61`, `e9e720b` : confirmation, « Reprendre la session interrompue » à l'accueil, refus lisible |
| P2 | Choisir : régler les parts d'une recette retenue | La ligne saute en bas de la liste (le doigt suivant tombe sur une autre) ; le refus (« Pas plus de 20 parts ») tombe sous six recettes, hors écran | `position` vaut 0 partout, ordre = tas Postgres, un UPDATE déplace la ligne ; message en bas de la carte | `c64e471` : tri `position, created_at, id` ; message dans la barre du bas |
| P2 | Choisir : recherche | « poulet ail » ne trouve pas « Poulet à l'ail » ; « tarte poireaux » ne trouve pas « Tarte aux poireaux » | la phrase entière cherchée comme sous-chaîne | `e154b3c` : chaque mot, dans le désordre |
| P2 | Courses | « 500 g d'agneau haché — 250 g » ; « 10 g de beurre » et « 20 g de beurre » en deux lignes | libellé = texte brut de la recette, quantité = celle mise à l'échelle ; clé de regroupement = texte brut | `5334214` : `libelleDeCourse`, regroupement par nom |
| P2 | Courses refaites après cochage | « Beurre » coché + « Beurre » à prendre (doublon) | la base refuse d'effacer une ligne cochée (0031), la régénération réinsérait tout | `5334214` : `sansLesDejaPrises` |
| P2 | Courses : « Supprimer » | Sur une ligne cochée ou payée : aucun effet, aucun message (la base répond « 0 ligne ») | trigger `shopping_item_protege` | `7d77c16` : bouton remplacé par « Décoche-le / Efface le prix pour le supprimer » |
| P2 | Courses : gestes ratés, prix payé | Cocher hors ligne : rien ; prix « -3 » : 400 muet ; « 99 999 999 999 € » accepté | aucun `onError` ; aucune borne | `7d77c16` : messages, borne 0–10 000 €, champ à 44 px |
| P3 | Courses : article ajouté à la main | « Sel » classé « Fruits et légumes » | rayon pré-sélectionné = premier de la liste | `7d77c16` : rayon déduit du libellé |
| P2 | Stock à la main | « 0,5 » impossible (bulle native, rien ajouté) ; « 0 » : `violates check constraint "stock_item_quantity_check"` ; 10^20 g accepté ; « 0,4 u » affiché « 0 u » ; libellé de 300 lettres sans espace : page large de 2 700 px | `step` par défaut, aucune validation, `Math.round`, pas de `overflow-wrap` | `73abf5d` : `lireQuantite` / `ecritQuantite`, libellé borné à 80, `overflow-wrap` |
| P2 | Plan du dimanche | Sept gestes à la minute 0 (deux cuisiniers) : libellés écrasés, illisible | position absolue = minute × échelle | `9e38d68` : `placeEtiquettes`, « dès le début / à 1 h 22 » |
| P2 | Importer (coller sa recette) | Parts « 2.5 » : « invalid input syntax for type integer » + erreur non rattrapée ; « 9999 » enregistré | champ `number` brut, `mutateAsync` sans `catch` | `0e3e86f` : `ChampParts` (1–20), message français |
| P3 | Fiche (i) sans ingrédient ni étape | Un titre suivi du vide | — | `cc52ff1` |
| P3 | Inventer | Bornes : effacer le champ remet la borne (« 2006 ») ; champs à 39 px | `\|\| min` à chaque frappe | `f0c1f47` |
| P3 | Cuisine : « Ensuite » | lignes de 23 px | — | `e004b61` |
| Banc | `e2e/amorce.ts` | chaque passage laisse 2 recettes au catalogue (44 « Dahl/Poulet » en double en local) | `efface` ne retire pas les recettes semées | `e254349` |

Banc de non-régression : `e2e/cuisine.spec.ts` (8 tests, tous rouges sur le code d'avant, verts après).

## À arrêter : défauts de la base (migrations 0093–0115 non touchées)

Aucun dans la plage 0093–0115. Hors plage, contournés côté écran, à décider :
1. **0013/0018 — une session interrompue est invisible** (`current_cycle()` l'écarte) et la semaine ne se rouvre pas
   (`open_cycle` : « la semaine … a déjà son cycle, clos »). Recommandé : que `current_cycle()` rende aussi `interrompue`,
   ou que `open_cycle` la remplace ; en attendant, « Reprendre » passe par un `select` sur `state = 'interrompue'`.
2. **0031 — `shopping_item_protege` répond par « 0 ligne »** : le client ne peut pas distinguer. Recommandé : lever une exception.
3. **0021/0028 — cocher remplit toujours le stock**, y compris le non-alimentaire (« Papier toilette » est rangé au frigo)
   et sans fusion avec l'existant (« oignon 3 u » à côté de « Oignon, cru 183 g »).
4. `cycle_recipe.position` n'est jamais renseignée (tout à 0).

## À trancher par Kamil

- Le rang de page et les filtres ne sont pas dans l'adresse : recharger remet la page 1 ; il n'existe pas de `/recette/<id>`
  (toute adresse inconnue ouvre le hub). Recommandé : `?page=` seulement si les liens profonds servent.
- Libellés CIQUAL sur la liste de courses (« Poulet, cuisse, viande, rôti/cuit au four », « Tomate, crue ») : recommandé,
  nom court (avant la première virgule). Rayons : lentilles en « Fruits et légumes », œufs en « Boucherie ».
- La carte encre grossit de 150 px par recette retenue : à six, le catalogue sort de l'écran. Recommandé : la replier au-delà de trois.
- Plan : la frise n'aligne plus les gestes sur les repères de temps quand ils se serrent. Recommandé, à terme : une liste chronologique.
- Cuisine : l'écran ne montre que le verbe (« Émincer »), ni le texte de l'étape ni les quantités.
- Stock : on ne peut ni modifier une ligne ni lui donner une péremption ; actions des barquettes sans message d'échec.
- « oeuf » trouve « bœuf » (sous-chaîne) ; « Équipement du jour » arrive avec les huit appareils cochés.
- Les recettes publiques laissées par `tests/catalogue-partage.test.ts` (« SECRET DU FOYER A … ») apparaissent dans le catalogue local.

## Ce qui a été joué

Liste (10 par page, page 2, 3, dernière, rechargement, retour arrière), recherche (accents, majuscules, un caractère, 300 lettres, `%`, `<b>`,
emoji, aucun résultat), filtres, vignettes (photo, photo cassée, titre long, « Macros inconnues », « % des ingrédients connus »), fiche
(i) sur huit recettes (lien `rel="noopener noreferrer"`, photo `no-referrer`, étapes, temps actif / en tout, entités HTML), ajout, double clic,
parts (0, −3, 2,5, 999, abc), retrait ; courses (génération, cochage, rechargement, décochage, ajout à la main, prix, suppression, régénération,
hors ligne) ; stock ; plan ; cuisine à deux téléphones (prendre, finir, temps réel, minuteurs, passifs, interruption, reprise) ; dressage (double
clic), semaine, bilan ; importer, inventer, photo et ticket (réponse du modèle local, message humain) ; peser ; isolation (recette collée privée,
vue de Thauba, invisible d'un autre foyer) ; réseau : catalogue lu par pas de 1 000 (24 ko pour 65 recettes) ; hors ligne (service worker : la
coque est servie, le nouveau bundle prend la place de l'ancien dès le rechargement).

Non joué : la dictée (pas de micro) ; l'import par URL (il n'existe plus : l'écran colle du texte) ; le réseau vers un site tiers (aucune
requête) ; Firefox, Safari ; l'effet d'un bundle publié pendant qu'un onglet reste ouvert (seul le rechargement a été rejoué).

## Bancs

- `npx playwright test` (build development + `vite preview`, 4173) : 135/135 (127 d'avant + 8 de `e2e/cuisine.spec.ts`), dont `recettes.spec.ts` 10/10.
- `npx vitest run src` : 1 343/1 343. `npx tsc -b` et `npm run build -- --mode development` : verts. `npm run lint` : aucune nouvelle alerte
  (11 avertissements, tous dans des fichiers non touchés).
- Horloge de la base : `show popote.maintenant` → « unrecognized configuration parameter ». Foyer jetable supprimé.
