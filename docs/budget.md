# Le budget du foyer

Popote gérait ce qu'on mange. Elle gère maintenant aussi ce que ça coûte, et
plus largement ce que le foyer dépense. Les deux moitiés partagent la même
table `household`, les mêmes personnes, et surtout le même ticket de caisse :
les courses sont déjà la plus grosse dépense commune, et elles sont déjà
chiffrées à l'euro dans `receipt_line`. C'est la raison pour laquelle ça n'est
pas une seconde application.

Ce document fixe le parcours et les décisions **avant** le schéma. Les décisions
portent des numéros qui continuent ceux du reste du produit (le dernier posé
était D59).

---

## 1 · Le principe

Deux personnes de revenus différents partagent un toit. Trois questions, et
elles sont indépendantes :

1. **Qui participe** à une dépense ? (les deux, une seule, personne)
2. **Selon quelle clé** ? (moitié-moitié, au prorata des revenus, un pourcentage
   fixe, ou 100 % pour quelqu'un)
3. **Qui l'a réellement payée** ? (quel compte a été débité)

L'écart entre ce qui est **dû** (1 et 2) et ce qui est **payé** (3) est le solde.
C'est tout le moteur. Une charge qui ne porterait qu'un seul de ces trois
attributs ne saurait rien produire d'utile.

### D60 — la clé se fige à la dépense, elle ne se recalcule jamais

Une dépense copie son pourcentage au moment où elle est créée, et ne le relit
plus. Sinon une augmentation de salaire en juin réécrirait rétroactivement tous
les partages de mars.

**Conséquence :** la part de chacun est une ligne de `depense_part`, en
CENTIMES ENTIERS, posée au moment où la dépense naît. La règle du foyer et
`parts_du_foyer` ne servent qu'à la *remplir* ; une fois posée, elle ne dépend
plus de rien. Un pourcentage stocké aurait rendu 10,25 € en deux parts de 5,13
qui font 10,26.

### D61 — une charge annuelle s'engendre mensuellement, on ne proratise jamais

La taxe foncière de 1 450 € n'est pas « une dépense en octobre » : c'est
**120,83 € tous les mois**, de janvier à décembre. Quelqu'un qui entre dans le
foyer en octobre se retrouve sur les lignes d'octobre à décembre et sur aucune
autre.

**Pourquoi :** le prorata temporis d'une arrivée en cours d'année est la règle
qu'on écrit mal. Engendrer au mois la fait disparaître : il n'y a plus de date à
comparer, seulement une appartenance mois par mois.

### D62 — une provision se régularise, et la régularisation respecte l'histoire

Un montant annuel ou variable est d'abord une **estimation** (`estimee`), puis
un **relevé** (`connue`). Quand le vrai chiffre arrive, l'app émet une ligne
d'ajustement égale à `réel − Σ provisions`.

Cette ligne se répartit **mois par mois avec la clé en vigueur chacun de ces
mois**, puis se somme. Un rattrapage de septembre ne doit pas faire payer à
quelqu'un des mois où il n'habitait pas là. C'est D60 appliqué à rebours.

L'estimation de l'année suivante part du dernier montant connu **+ 3 %** (les
valeurs locatives sont réindexées chaque année, plus le taux voté par la
commune), et reste corrigeable à la main.

### D63 — le salaire est visible dans le foyer

Les deux membres voient les deux revenus. Le foyer est l'unité de confiance du
produit ; y introduire un secret par personne compliquerait la RLS pour un
bénéfice nul entre deux personnes qui partagent un compte.

**Ce qui protège, c'est l'entrée :** on ne rejoint pas un foyer sans qu'un de
ses membres l'ait décidé. Voir le parcours d'invitation, §4.

### D64 — l'épargne commune se suit en cumul par personne

Une dépense est consommée ; une épargne persiste. Si l'un verse 61 % et l'autre
39 % pendant trois ans, le pot se rend dans ces proportions, pas en deux.

**Aggravant :** un livret bancaire joint est juridiquement présumé
**moitié-moitié**. Sans le registre des versements, c'est la présomption qui
gagne. Trois colonnes aujourd'hui ; irrattrapable plus tard, l'historique
n'existant plus.

### D65 — le plafond se remet à zéro, l'argent non

Une enveloppe (restaurant, culture) est un **plafond de dépense**, pas un
mouvement d'argent. Le plafond se remet à zéro chaque mois — sinon on « épargne »
pour un mois à 800 € et il ne contraint plus rien.

L'argent non dépensé, lui, reste physiquement sur le compte commun. En fin de
mois l'app le constate et **demande** : baisser le prochain virement, ou verser
à l'épargne. Une décision, pas une automatisation — les premiers mois serviront
surtout à découvrir que les plafonds sont faux.

### D66 — un plafond ne sert qu'affiché au moment de décider

Un plafond qu'on découvre en fin de mois est une décoration. Celui des courses
s'affiche **pendant la construction de la liste**, là où le geste est encore
réversible. Popote est à peu près seule à pouvoir le faire, puisqu'elle connaît
la liste avant les courses.

### D67 — le ticket prime sur la banque

Pour l'alimentaire, `receipt_line` est une meilleure source que le relevé
bancaire : la banque dit « CARREFOUR 87,43 € », le ticket dit vingt-quatre
lignes, des rayons et des prix au kilo. L'agrégateur bancaire, quand il
arrivera, servira pour tout le reste et comme contrôle de cohérence.

**Conséquence dès maintenant :** chaque dépense porte `source`
(`manuel` | `banque` | `courses`) et `reference_externe` nullable, pour que
l'import ultérieur *rapproche* au lieu de dupliquer. Deux colonnes aujourd'hui,
aucun dédoublonnage plus tard.

### D68 — le reste à vivre s'affiche

Après tous les partages, l'app montre ce qui reste à chacun. Pas pour arbitrer :
pour que le déséquilibre reste un choix visible au lieu de devenir un impensé.

### D72 — un projet est une enveloppe qui porte une échéance

Un voyage, un meuble, une réparation prévue : on lui donne un montant cible,
une date, ses postes (hôtel, transport, nourriture…) et sa clé — au prorata ou
moitié-moitié, indépendamment de la règle du foyer.

Deux façons de le financer, et **aucune machinerie nouvelle pour l'étalement** :
D61 la donne déjà. « Étaler jusqu'en décembre 2026 » engendre une provision
mensuelle de maintenant à décembre ; « payer en une fois » engendre une seule
ligne à la date. C'est la même règle que la taxe foncière, avec une fin.

Un projet atteint peut être réglé depuis l'épargne voyages plutôt que depuis le
compte commun : le registre (D64) enregistre alors un retrait au prorata des
versements, pas moitié-moitié.

### D73 — les dépenses personnelles se suivent, ne se partagent jamais, et leur détail reste privé

Sans elles, le reste à vivre de D68 est une fiction : un crédit personnel de
400 € ne se voit nulle part et l'app annonce un confort qui n'existe pas.

D'où la règle en deux temps : **le total** d'une personne est visible dans le
foyer, parce que c'est lui qui donne le reste à vivre ; **le détail** ne l'est
que pour elle, sauf à le partager explicitement. Un salaire est une donnée du
foyer (D63), la liste de ce qu'on achète n'en est pas une.

Elles ne se saisissent **pas** à l'onboarding (D70) : demander à quelqu'un
d'énumérer ses crédits pour finir son inscription, c'est la meilleure façon de
ne jamais le voir revenir. Elles vivent dans un écran « Mes dépenses »,
remplissable à tout moment, avec un rappel discret tant qu'il est vide.


---

## 2 · Le partage retenu pour ce foyer

Une mensualité de prêt a deux moitiés. Les intérêts sont le prix du toit ; le
capital enrichit le propriétaire. Faire participer l'autre au capital, c'est lui
faire acheter un patrimoine qui ne sera pas le sien.

**Décision du foyer :** Kamil porte seul l'intégralité de la mensualité (580 €),
capital *et* intérêts. Tout le reste du logement est commun, au prorata des
revenus nets après impôt.

L'investissement locatif — prêt, taxe foncière, charges non récupérables, PNO,
comptable — reste **entièrement personnel**, et ses loyers aussi. Il n'est pas
déduit du revenu avant le calcul du prorata : c'est un choix de patrimoine, pas
une charge subie, et l'en déduire ferait financer l'investissement par l'autre.

### Les chiffres au 22 septembre 2026

| | €/mois | Source |
|---|---|---|
| Copropriété | 100,00 | 300 € le trimestre |
| Taxe foncière | 120,83 | 1 450 €/an, connue |
| Assurance habitation | 10,70 | relevé |
| Énergie | 50,00 | **variable**, à la consommation |
| Internet | 37,00 | relevé |
| **Sous-total — le toit** | **318,53** | ce que coûte le logement, hors mensualité |
| Courses | 800,00 | plafond de départ |
| Restaurant | 400,00 | enveloppe |
| Culture | 100,00 | enveloppe |
| **Total commun** | **1 618,53** | |

Revenus nets mensuels après impôt : **3 700 €** (Kamil, estimé sur 70 k brut)
et **2 400 €** (Thauba, provisoire — elle le saisira elle-même à l'onboarding).
Prorata : **61 / 39**.

| | Kamil (61 %) | Thauba (39 %) |
|---|---|---|
| Charges communes | 987 € | 631 € |
| Épargne | 183 € | 117 € |
| **À verser** | **1 170 €** | **748 €** |
| Reste à vivre | 1 950 € | 1 652 € |

Le reste à vivre de Kamil s'entend après sa mensualité de 580 €, et hors
locatif.

**Épargne :** 250 €/mois vers l'urgence, 50 € vers les voyages, au prorata. La
cible d'urgence est de **quatre mois de ce qui est nécessaire** — le toit plus
les courses, soit 1 119 € — donc **4 500 €**, atteints en dix-huit mois.
Restaurant et culture sont exclus de la cible : ce sont précisément les postes
qu'on coupe quand l'urgence arrive.

**La voiture n'est pas commune.** Chacun paie la sienne — assurance, carburant,
entretien. Ce qui déborde ponctuellement (un long trajet fait ensemble) entre
comme dépense exceptionnelle, pas comme charge récurrente.

**Ce qui manque encore au catalogue commun** : mutuelles et forfaits mobiles
(personnels l'un comme l'autre), abonnements, droguerie et hygiène, santé non
remboursée, vêtements, et le poste que tout le monde oublie — cadeaux,
anniversaires et Noël, 40 à 80 €/mois une fois lissés.

**Cas particulier déjà tranché :** le second conducteur sur l'assurance auto.
La prime de base serait payée de toute façon ; seul le **delta** facturé par
l'assureur est en jeu. Il entre comme une charge à `participants = {Thauba}`,
clé 100 %, `payé depuis = compte Kamil`. Aucun concept nouveau — ce qui est bon
signe pour le schéma.

---

## 3 · Les comptes et les virements

Un `compte` par vrai compte bancaire : le principal de chacun, le commun, celui
du locatif. Chaque charge porte le compte qui la paie.

La sortie mensuelle n'est donc pas un solde abstrait mais **des virements à
faire** : « Thauba → compte commun : 748 € ». C'est ce qui rend l'outil
utilisable, et c'est aussi la maille sur laquelle l'agrégateur bancaire viendra
se brancher — un agrégat par compte.

Le compte commun garde un **matelas** — de l'ordre d'un mois de charges
communes. C'est au-dessus de lui que se pose la question de D65.

---

## 4 · Le parcours d'invitation

Le SMTP applicatif est en place (Gmail, 30 mails/heure), donc :

1. Kamil saisit l'adresse de Thauba dans les réglages.
2. La fonction `invite`, qui tourne déjà en rôle de service, appelle
   `auth.admin.inviteUserByEmail()` avec `data.invite_par` et un `redirectTo`
   qui porte le jeton du foyer. Le gabarit du mail est versionné dans
   `supabase/templates/invitation.html` et se colle dans le tableau de bord.
3. Thauba clique. Elle **arrive authentifiée** : plus d'inscription séparée,
   donc plus de jeton à faire survivre à un aller-retour par mail.
4. Elle choisit son mot de passe, puis complète son profil.

Si l'adresse a déjà un compte, l'appel échoue et on retombe sur le lien simple
d'aujourd'hui.

### D69 — on ne détecte pas si un compte existe

Supabase refuse exprès de répondre à « cette adresse existe-t-elle ? » : c'est
de l'énumération de comptes. Et la question ne se pose pas, puisque
l'invitation est émise **pour une adresse précise**. L'écran affiche cette
adresse, verrouillée, et propose un lien discret « j'ai déjà un compte ».

### D70 — on bloque par fonctionnalité, jamais l'app entière

Un profil incomplet ne ferme pas Popote. Chaque section exige ce dont elle a
besoin : cuisiner ne demande rien, le budget exige les deux revenus — et là
c'est légitime, le prorata est incalculable sans. Un mur global à l'écran quatre
de l'onboarding produirait surtout des gens qui n'entrent jamais.

### D71 — la date d'entrée dans le foyer se confirme, elle ne se devine pas

Elle est proposée à la date d'acceptation de l'invitation, et **confirmée
explicitement** à l'onboarding, avec sa raison écrite : *« La date à partir de
laquelle tu habites le foyer. C'est elle qui décide des mois que tu partages —
vérifie-la. »* Modifiable ensuite dans les réglages. C'est elle, et rien
d'autre, qui décide de l'application de D61.

---

## 5 · Ce qui reste à écrire

Le socle est posé (migrations 0049 à 0051) : `compte`, `revenu`,
`regle_partage`, `catalogue_charge`, `user_profile.entre_le` et
`parts_du_foyer`. Voir `docs/schema.md`. Restent les charges, les dépenses
engendrées, les enveloppes, l'épargne et les projets — que ce qui est tranché
ci-dessus contraint déjà sur quatre points :

- les pourcentages sont **copiés** sur la dépense (D60) ;
- une charge récurrente est un **modèle** qui engendre des lignes mensuelles,
  et ce sont les lignes qui portent le partage (D61) ;
- `source` et `reference_externe` existent dès la première migration (D67) ;
- l'épargne est un **registre de versements**, pas un solde (D64).

Et le reste du produit impose sa propre règle, apprise à ses dépens : tout
invariant de la forme « ça ne change pas » s'écrit en trigger `before`, jamais
en policy — une policy ne voit jamais l'ancienne et la nouvelle ligne ensemble.
