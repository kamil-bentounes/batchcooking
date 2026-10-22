# À corriger, relevé des revues (contrôleur) — lot 1

Revue de 0093–0100 (21/10) :
1. `saisie_update` (0097) : la policy ne borne que le foyer ; le client peut changer `source` (→ `banque`/`courses`), `reference_externe`, `created_at`, `id`. À geler dans `tg_saisie_garde` pour un client (pas de fuite entre foyers, mais un faux « venu de la banque »).
2. Tests manquants de `budget-saisies` : déplacer une saisie d'un mois clôturé vers une ligne ouverte (0099 : garde sur `old.fait_le`), et le dépassement du million à la modification.
3. `budget-gel` : la garde de `repartit_les_lignes` et le `where not exists cloture` de `rattrape_les_mois` ne sont éprouvés par aucun test (défense en profondeur) ; au moins comparer le compteur rendu par `rattrape_les_mois`.
4. Bornes de mois en UTC (`current_date` dans 0098/0100, `depense_mois_borne`) au lieu de `aujourdhui()` : ne joue qu'entre 0 h et 2 h à Paris à la frontière des 5 ans. Détail.
5. À vérifier : une charge posée après la clôture d'un mois n'a pas de ligne dans ce mois (voulu par le plan) — vérifier qu'un relevé annuel n'est pas sous-compté (lot 1.2x).
6. `retire_charge` invoker : réparé par 1.20 (voir contexte.md). À ne pas déployer sans 0111.
7. (1.14/1.15) La branche « membres partis » de `recale_l_annee` (`presents <= 0`) n'a aucun test ; la mutation `cible_de(..., true)` → `false` dans `solde_l_annee` ne rougit rien (équivalent ?) ; « à 0 h 30 » (mois_courant vs now()) reste vert : le banc de minuit de 1.22 doit l'exercer.

Revue de 0101–0109 (21/10) :
8. **À corriger** `0105:214` (`recale_l_annee`) : le retour silencieux `presents <= 0 and tous > 0 and delta < 0` s'applique aussi à une année NON soldée. Scénario : charge annuelle perso de Thauba, sept.+oct. portés par elle (2 × 41,67 = 83,34 €), elle part le 03/11 ; Kamil saisit 200 € le 10/11 (+116,66 € sur lui seul) ; il retire la facture → attendu −116,66 €, obtenu +116,66 € qui restent sur novembre. Correction : ajouter `and x.pose = 0` ou limiter à `x.soldee`. Même cas pour `corrige_le_releve` et `recale_la_charge`. Écrire le test d'abord.
9. `0106:27` : l'idempotence de `paie_une_facture` joue avant la vérification du foyer (un UUID de facture d'un autre foyer rend un succès silencieux). Remonter la vérification du foyer.
10. Tests d'isolation entre foyers manquants : `rouvre_le_mois`, `paie_une_facture` (charge d'un voisin), `retire_une_facture`, `corrige_le_releve`, `apercu_des_soldes`, `cloture_le_mois` avec `la_poche` d'un autre foyer.
11. `budget-arrivees` : « ne refige que les mois entre les deux dates » ne déplace `entre_le` que dans le même mois (01/01 → 15/01) ; un test qui traverse plusieurs mois.
12. `releve_annuel.reel_cents`/`ecart_cents` ne suivent pas les factures ajoutées/retirées après le solde (seuls `corrige_le_releve` et `etat_de_l_annee` sont à jour) : vérifier que le NOUVEL écran (lot 2) ne lit que `etat_de_l_annee`.
13. `0113` (`regularise_annuel` refuse) doit partir dans le MÊME déploiement que le reste (D1) : tant qu'elle est exécutable, elle écrit un relevé sans `prevu_cents`.
14. Décisions de produit à signaler à Kamil dans le compte rendu : (a) départ partiel : si un remboursement est porté à la fois par un membre parti et un membre présent, le présent reçoit tout (conforme à la lettre de la spec) ; (b) `tg_revenu_premier` : le premier revenu d'un membre remonte jusqu'à son `entre_le`, donc poser le premier revenu de Thauba en octobre rend « suivis » les mois depuis son arrivée.

## Revue de 0110–0114 (21/10) — à corriger dans 0114 (jamais en prod : on la corrige en place)
A. Arrêt manquant : une ligne `au_fil` CONFIRMÉE À 0 € (permis par `confirme_la_ligne`) ne reçoit pas de saisie d'amorce (`d.montant_cents > 0`, 0114:163) ; à la clôture (0108 étape 3) elle serait reconfirmée à son prévu : le 0 € deviendrait 800 €. → un arrêt « ligne au_fil confirmée à 0 € ».
B. Arrêt manquant : amorce d'un mois EN COURS ou FUTUR (`d.mois >= mois_courant()`, une ligne au_fil confirmée en octobre avant le déploiement recevrait une saisie datée du 31/10, dans le futur ; les tickets déclarés ensuite s'ajouteraient : 800 + 20 = 820 € au lieu de « total du mois »). → un arrêt pour toute ligne au_fil confirmée dont `mois >= mois_courant()`. (En prod le 21/10 : les 3 lignes confirmées sont de septembre.)
C. Portée globale : ni `update` ni `insert` de 0114 ne filtre sur un foyer et rien ne vérifie « 1 foyer ». → un arrêt `count(household) <> 1`. (Le nombre de membres peut varier : Thauba peut arriver avant le déploiement ; vérifier que la logique tient avec 2 membres, y compris les amorces `saisi_par null`.)
D. (détail) enveloppes dont les libellés s'emboîtent (« Sorties » / « Sorties et culture ») : la boucle voit un instantané, deux charges ; une enveloppe dont la seule charge est archivée est ressuscitée en charge active. → arrêt ou comptage, et un test.
E. (détail) une ligne `modele` à `charge_id` null ferait échouer `depense_modele_a_une_facon` et annuler toute la transaction (possible avant 0053). → arrêt explicite avec message clair.
F. Trous de test : les trois fixtures d'arrêt ne tournent qu'à la main (les faire tourner dans le banc) ; `ATTENDU` omet « Charges de copropriété » ; ajouter une variante « charge archivée + saisies + facture » ; la copie n'a ni charge archivée, ni `regle_le`, ni `cloture`, ni `facture`, ni `saisie`.
G. À signaler à Kamil (décision de produit, pas de code) : `delete_my_account` (0112) ne supprime que les saisies des lignes que le partant porte seul ; sa charge perso (ex. Pharmacie) et ses lignes des mois ouverts/futurs restent, ses `depense_part` aussi (pas de clé étrangère).
H. Front : `src/lib/donnees/budget.ts:716` appelle encore `regularise_annuel` (refuse depuis 0113) : disparaît avec 2.18/3.10 ; le lot 1 ne part JAMAIS sans le front du lot 2.

## Pour la passe d'accessibilité / le grand test (front)
- `Filtre` (Tout/Commun/Moi) : `role="radio"` sans flèches (un vrai `radiogroup` se parcourt aux flèches) : ajouter ← → ↑ ↓, avec un test.
- `Jauge` : `aria-valuenow` dépasse `aria-valuemax` quand `valeur > plafond` : borner `aria-valuenow`.
- Le segment « Reste » de la barre du récap : 2,0:1 sur l'encre (décoratif, la légende le nomme) : voir si on peut éclaircir sans trahir la maquette.
- `Feuille` : focus, Échap, `showModal` jamais vus en navigateur : à vérifier à l'e2e (2.19) puis au grand test.
- `01c9232` (2.17, `Charges.tsx`) attend `FeuilleMiseDeCote` (2.14) : à cueillir après 2.14.
