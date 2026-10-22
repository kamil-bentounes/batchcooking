# Grand test, parcours C — « le Budget » (22/10/2026)

Joué sur le build servi (`vite preview`, mode development, port 4173), Pixel 7, 390 × 844, `fr-FR`, `Europe/Paris`
(les pages du budget aussi à 360 px, et 320 px pour les catégories) ; les écrans qui ont changé rejoués sur le serveur de dev
(`npm run dev`, 5173) : mêmes résultats, aucun rechargement intempestif. Seul sur la base locale et le port 4173, l'horloge de la
base (`popote.maintenant`) jouée puis remise (`show popote.maintenant` → « unrecognized configuration parameter »).
120 captures prises (`.shots/budget-c/`, non versionné), une cinquantaine regardées une à une (Read), le reste lu en texte ; réseau et
console écoutés sur tout le parcours (`HTTP ≥ 400`, `console`, `pageerror`, `requestfailed`, requêtes répétées).
L'arithmétique est contrôlée par un script (`oracle.mjs`, jetable) qui recalcule depuis les tables brutes (`depense`, `depense_part`,
`saisie`, `revenu`, `cloture`) le reste, les charges, Tout / Commun / Moi de chaque membre et le compare à CHAQUE chiffre de l'écran.

## Bugs trouvés et corrigés

| Gravité | Où | Ce qu'on voyait | Cause | Correctif |
|---|---|---|---|---|
| P1 (argent) | Épargne → « Je retire » | « Je retire 100 000 € » sur 380 € versés : la poche affichait −99 620 €, la base l'avait écrit | aucun plancher ni côté base (`versement_epargne`, pas de contrôle de solde) ni côté écran | `7db1672` : jamais plus que ce que la personne a versé (`refusDuRetrait`). Le défaut de base reste, voir plus bas |
| P2 | Toute écriture du budget, réseau coupé | « TypeError: Failed to fetch » sous « Ajouter 9 € » | vingt `throw new Error(error.message)` dans `donnees/budget.ts` : la panne de `fetch` arrivait telle quelle à `Erreur` | `db49ba6` : `Erreur` passe par `enFrancais` (« Pas de réseau : … ») |
| P2 | Charges → ajouter / corriger | nom de 81 caractères : bouton actif, puis « new row for relation "charge" violates check constraint "charge_libelle_check" » | `peutPoser` / `peutCorriger` ne bornaient pas le nom (la base : 80) | `34b5227` : « Un nom de 80 caractères au plus. », bouton éteint |
| P3 | Sous une feuille ouverte | la molette sur le fond assombri faisait défiler la page de 400 px derrière | `showModal` rend le fond inerte, pas fixe | `78447bc` : `html:has(dialog.feuille[open]) { overflow: hidden }` |
| P3 | « Autre jour » hors du mois | « … et le Jeu. 15 oct.. » (deux points) | point de phrase collé à l'abréviation | `dc11813` : `finDePhrase` |
| P3 | 360 px, légende et catégories | « Vie coura… », « Abonnem… », « 17 / % » sur deux lignes | `truncate` sur le nom, pourcentage sans `nowrap` | `2934bfa` : le nom passe à la ligne, le pourcentage ne se coupe pas, marges resserrées sous 380 px |
| P3 | Page « Clôturer … » | le titre portait un cadre vert à chaque ouverture | `:focus-visible` global l'emportait sur `focus:outline-none` | `2934bfa` |
| P3 | Épargne, poste d'un projet | le bouton « + » n'avait pour nom que « + » | pas d'`aria-label` | `f1465e6` (« Ajouter ce poste ») |

Banc de non-régression : `e2e/budget-grand-test.spec.ts` (7 tests). Trois ont été vus rougir sur le code d'avant (fond qui défile, 360 px, anneau du titre) ; les quatre autres
rejouent les correctifs du réseau coupé, du nom de 80 caractères, des deux points et du retrait.

## Départ et arrivée en cours de route : rejoués par l'interface (les deux défauts de la base du parcours A)

- **Départ** (Thauba supprime son compte, septembre clos, octobre ouvert, 50 € déclarés par elle) : octobre repartagé, plus aucune `depense_part`
  orpheline dans les mois ouverts (Kamil à 100 %, 3 958,57 €, « Il te manque 258,57 € », l'écran = la base au centime) ; septembre clos garde
  ses parts et son total ; sa charge perso (Pharmacie) part avec elle ; sa saisie reste (`saisi_par` nul). Juste.
- **Reculer son arrivée après son premier revenu** (revenu posé le 15/10, arrivée reculée au 01/09 depuis le profil) : le revenu recule avec
  l'arrivée (`valid_from` 2026-09-01), septembre se partage au prorata (2 425,09 € / 1 553,48 €) et Kamil le clôture par l'interface. Juste.
- **Arrivée le 15/11** (invitation, lien, compte, profil : prénom, 3 100 €, arrivée 15/11) : elle porte novembre entier (parts 31 %, 1 827,11 € de reste),
  rien en octobre (« Tu n'étais pas encore dans le foyer »). Les trois restes = l'oracle.

## Ce qui a été vérifié juste (arithmétique de bout en bout)

Oracle = écran, aux centimes, à chaque étape : mois ouvert à deux (déclarations, dépassement, facture corrigée à 61,20 € et ses parts figées, avoir à 0 €,
facture annuelle +99,96 € puis retirée, revenu changé en octobre : septembre ne bouge pas), filtres Tout / Commun / Moi, clôtures (septembre par Thauba,
par Kamil avec la réponse perdue, octobre avec « garder sur le compte » puis revenir dessus puis 100 €, novembre par Camille à trois, décembre avec le
solde de l'impôt −840 € réparti selon ce que chacun a porté : Camille 45,68 / Kamil 484,86 / Thauba 309,46, somme 840,00), épargne (310 € + 1 886,02 + 100 +
1 818,21 + 2 780,57 = 6 894,80 € ; chaque « Revenir dessus » retire exactement le versement de la clôture), minuit du 31/10 au 01/11 (le mois courant bascule
à 00:00 Paris, « Dernier jour » à 23:59, `/cloture/2026-10` « trop tôt » jusqu'au 1er). Sommes des parts = montant sur toute la base, y compris 0,01 €, 0,02 €
à trois, 100,01 €, 999 999,99 €. Réseau : 10 à 18 requêtes par écran, aucune répétée plus de 3 fois (les 3 `current_household` sont ceux de `App`) ;
`apercu_des_soldes` 6 ms, `cloture_le_mois` 21 ms, `rattrape_les_mois` 33 ms sur 92 lignes. Aucun ≥ 400 inattendu, aucune erreur console.
Écrans à 360 et 390 px : aucun défilement horizontal, aucune cible sous 44 px (sept écrans).

## À arrêter : défaut de la base (migrations 0093–0115 non touchées)

- **P1 — `versement_epargne` n'a aucun plancher.** Constaté par l'écran avant le correctif : `select user_profile_id, montant_cents, motif from versement_epargne` rendait
  `Kamil, −10 000 000, retrait` pour 38 000 centimes versés par lui, et la poche affichait −99 569,50 €. La politique d'insertion ne regarde que le foyer et
  `user_profile_id = auth.uid()`, aucune contrainte ne regarde le solde : un appel REST direct passe encore. Le correctif du front (`7db1672`) ferme le geste d'écran, pas l'appel direct. Recommandation : un déclencheur sur
  `versement_epargne` qui refuse un montant négatif dont la somme par personne et par poche passerait sous 0 (la table date de 0054, hors des migrations interdites ; je n'y ai pas touché).

## À trancher par Kamil

1. **« Chacun décide pour soi » n'existe pas encore à deux (lot 4 de la spec).** La clôture n'écrit `cloture_choix` que pour celui qui clôture ; l'autre lit « Il t'est resté — »
   pour tous les mois, et ne choisit jamais où va son reste. Un test (`mois-clos.test.tsx`, « le choix d'un AUTRE membre ne devient pas le mien ») fige ce tiret. Recommandation : afficher
   son reste calculé (revenu − ses parts : 1 728,30 € pour Kamil en septembre, exact) sans « dont … mis de côté », et décider si chacun peut clôturer sa part.
2. **Après « Revenir dessus » sur un mois dont une ligne au fil est confirmée, l'écran dérive de quelques centimes** (1 272,02 € au lieu de 1 272,08 €) : la ligne est comptée à son prévu (800 €)
   avec les parts figées de 47,90 €, mises à l'échelle (×16,7). La clôture, elle, retombe juste (1 886,02 €). Laissé : à deux, « la projection de l'écran peut différer de la base » (spec § 3.5).
3. **Retirer une facture mise de côté laisse la paire +99,96 € / −99,96 €** visible dans la catégorie (« Entretien auto — facture 2026 », deux lignes). Net nul, mais deux lignes de bruit ; recommandation : les masquer quand elles s'annulent.
4. **Pas de glissé pour fermer une feuille**, alors que la poignée le suggère (le code dit : un glissé ne ferme pas). Recommandation : retirer la poignée ou l'implémenter.
5. **« Rien dépensé » est un interrupteur** (maquette : une pastille verte à coche) ; « C'est ça » sans coche. Écart de style de la maquette, pas relevé comme un choix dans `ETAT.md`.
6. **Revenu de 0,50 € par mois accepté** (« Mon net mensuel ») : aucun plancher, une faute de frappe de plus qui engage tous les mois à venir. Recommandation : le faire confirmer au-dessous de 100 €.
7. **« Mes charges » compte une charge dont le départ est en 2031** dans « … par mois pour le foyer » alors que l'écran du mois ne la compte pas (3 988,57 € contre 3 978,57 €).
8. **Une adresse comme `/budget/2026-13` ou `/cloture/abc` montre le hub** sous l'adresse fautive (elle ne se corrige pas, contrairement à `/budget/2030-05`).
9. N'importe quel membre peut « Revenir dessus » sur un mois d'avant son arrivée (Camille sur octobre) : voulu ? À dire à Kamil.

## Ce qui a été joué

Hub (chargement lent : « … » puis les chiffres, jamais de faux zéro ; « Tout est à jour » seulement quand les trois lignes ont une saisie), mois (récap, barre, jauge, filtres au clic et aux flèches, catégories
repliables à la souris et au clavier, mois précédents, retour du navigateur), feuilles (Déclarer, choix de la ligne, Facture du mois, Mise de côté : ouvrir, saisir, valider, annuler, Échap, clic sur le fond, focus d'entrée sur « Fermer » et retour sur le bouton d'origine,
Tab qui boucle, 500 px de haut), déclarations (22 saisies de montant : `12,5`, `12.50`, `12,505`, −5, 0, 10 000 000, « douze », espaces, `1e3`, chiffres arabes ; 6 dates dont 31/02, futur, mois d'avant ; double clic ; réseau coupé ; mois clos entre-temps ;
retrait), factures du mois et mise de côté (460, 600, 620, 12 000, 1 500 € ; année soldée ; charge retirée), Charges (ajout, correction, retrait avec et sans saisies, qui participe, moitié-moitié, annuelle posée après clôtures, début 2031),
Réglages (revenus, bornes), Épargne (verser, retirer, projet avec postes), clôtures complètes à deux puis à trois, revenir dessus, reclôturer, réponse perdue, deux contextes, année qui se solde, adresses à la main, arrivée, départ.

**Non joué** : « Vérifier mes charges » et la dictée (appels au modèle : aucune requête vers un tiers) ; le relevé annuel hérité (`regularise_annuel` est refusée depuis 0113, aucun écran ne le crée) ;
Firefox / Safari ; une vraie expiration de jeton ; un foyer de plusieurs années de lignes (le plus chargé joué : un an, trois membres, une centaine de lignes) ; le partage « Au prorata » avec un revenu manquant (couvert par le parcours A).

## Bancs

- `npx playwright test e2e/budget-grand-test.spec.ts` : 7/7 ; puis `budget`, `cloture`, `parcours`, `captures`, `nouveau-venu` : 23 verts, et 26 verts au second passage des trois autres. Suite complète avant les trois derniers correctifs : 140/140.
  (Trois échecs à 0 ms juste après `cloture.spec.ts` — la remise de l'horloge ferme les connexions de PostgREST ; relancés seuls : verts.)
- `npx vitest run src` : 1 352 verts. `npm run build` vert, `npm run lint` : 11 avertissements, les mêmes qu'à `dd024d6` (aucun nouveau).
- Attention : `npm run build` sans `--mode development` fait pointer `dist/` vers la production ; ne pas le lancer pendant que `vite preview` sert le banc.
- Horloge de la base : `show popote.maintenant` → « unrecognized configuration parameter ».
