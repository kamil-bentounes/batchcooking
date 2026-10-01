# L'écran Budget, refait — direction A « Potager »

- **Date :** 1er octobre 2026
- **Statut :** décisions prises en chat avec Kamil, le 1er octobre 2026. Ce document les
  consigne ; il n'en prend aucune.
- **Maquette :** https://claude.ai/artifact/AYFfTebjBfRTrRxFmyPZVW (rangée du haut :
  « A · Le mois », « A · Déclarer », « A · Une facture mise de côté », « A · La clôture
  du 27 »). Les montants des trois derniers écrans sont des exemples. La clôture y est
  datée du 27 : elle se fait désormais le 1er du mois suivant (D78).
- **Décisions de référence :** `docs/budget.md`, D60 à D73. Les décisions nouvelles
  prennent les numéros D74 à D80.

---

## 1 · Ce qui change

Aujourd'hui, l'écran Budget ouvre sur « À verser » (toujours 0 € pour un foyer d'une
personne), puis empile des blocs : confirmations, relevé annuel, enveloppes.
Désormais, il ouvre sur **ce qui reste du mois**, puis montre **chaque charge rangée
par catégorie**. Chaque ligne se règle d'un seul geste, selon la façon dont elle se
paie. Le mois fini, une **clôture** le solde et propose quoi faire de ce qui reste.

Kamil le juge aujourd'hui « simple sa grand-mère et ennuyant ». La direction A garde
l'identité de Popote (Fraunces, Instrument Sans, le vert herbe et le safran), mais
l'enrichit : chiffres en grand, une photo par catégorie, des cartes, une jauge par
ligne.

---

## 2 · Les décisions

### D74 — l'écran ouvre sur ce qui reste, puis les charges par catégorie

Dans l'ordre :

1. les gestes : Mes charges, Déclarer, Revenus, Épargne ;
2. ce qui reste du mois ;
3. l'épargne, avec les projets s'il y en a ;
4. les charges, par catégorie.

La catégorie appartient à la **charge**, pas au catalogue. Elle en vient par défaut, et
se change dans « Mes charges ».

Les catégories, dans cet ordre de repli quand les montants sont égaux : Vie courante,
Maison, Crédits, Auto, Abonnements, Santé, Impôts, Autre. « Courses et sorties », vu
sur la maquette, s'appelle désormais « Vie courante » : la catégorie reçoit aussi la
droguerie et le coiffeur.

### D75 — quatre façons de payer une charge

| Façon | Exemples | Le geste |
|---|---|---|
| **Fixe** | crédits, assurances, abonnements, internet | aucun : le montant compte |
| **Facture du mois** | électricité | le montant habituel compte ; on le valide ou on le corrige (au plus tard à la clôture) |
| **Au fil du mois** | courses, restos, sorties, essence, péage, droguerie, coiffeur, pharmacie | chaque dépense **s'ajoute** ; la jauge avance vers le prévu |
| **Mise de côté** | taxe foncière, copropriété, entretien auto | Popote met de côté chaque mois ; on saisit chaque facture quand elle arrive |

Une charge trimestrielle ou annuelle est toujours « mise de côté », et une charge mise
de côté est toujours trimestrielle ou annuelle. Les trois autres façons sont
mensuelles.

### D76 — au fil du mois, le plafond, c'est le prévu

L'enveloppe (D65) disparaît de l'écran comme notion séparée. Une ligne au fil du mois
a **un seul chiffre**, son prévu, et c'est lui qui borne la jauge. Le double chiffre
d'aujourd'hui — 800 € prévus pour les courses, 300 € de plafond — affichait
« dépassé de 500 € » avant le moindre achat.

Les plafonds d'enveloppe sans charge deviennent des lignes au fil du mois (Droguerie
60 €, Coiffeur 30 €, Pharmacie 20 €). Une enveloppe qui fait doublon avec une charge
existante est retirée (« Essence ou recharge », doublon d'Essence).

La saisie à la main n'est qu'une étape : une opération bancaire importée, ou un
ticket de caisse, prendra la même place plus tard (D67). Ce chantier ne la construit
pas.

### D77 — une charge mise de côté se règle facture par facture

Chaque facture saisie s'ajoute au total payé de l'année, qu'on compare au **prévu de
l'année entière**, c'est-à-dire la somme de ses provisions, celles déjà faites et
celles à venir, **sur les mois que Popote a suivis**.

- Si le total payé **dépasse** le prévu de l'année, le dépassement s'ajoute **tout de
  suite** au mois en cours.
- S'il reste en dessous, rien ne bouge avant la fin de l'année. À la clôture de
  décembre, ce qui n'a pas servi revient dans le mois, et la clôture propose de le
  mettre de côté ou de le garder (D78).

Il n'y a donc plus de « relevé annuel » à saisir : ce sont les factures qui
régularisent. L'écart se répartit toujours selon ce que chacun a porté sur l'année
(D62).

**Les mois suivis.** Un mois est suivi s'il est clôturé, ou si un membre du foyer y a
un revenu. Une provision d'un mois que Popote n'a pas suivi n'a été mise de côté nulle
part : elle ne compte pas. L'Entretien auto 2026 n'est suivi que depuis septembre. Sans
facture, décembre rend 166,68 €, et non 500,04 €. Une facture de 320 € en novembre
ajoute 153,32 € à novembre. Une facture datée d'avant septembre est refusée. Dès 2027,
les douze mois sont suivis. Kamil l'a choisi le 1er octobre 2026 : avec les douze
provisions, cette facture de 320 € aurait fait gagner 13,36 € à ses mois suivis.

### D78 — le mois fini, on le clôture

Le 27, l'app rappelle que le mois se termine. Dès le 1er du mois suivant, elle propose
de clôturer le mois qui vient de finir. On ne clôture jamais le mois en cours : ses
derniers jours ont encore des dépenses. Un mois passé non clôturé se clôture n'importe
quand.

Kamil l'a choisi le 1er octobre 2026. Clôturer le 27 fermait octobre quatre jours trop
tôt : ses courses du 30 auraient été refusées.

La clôture a trois étapes :

1. **Les factures du mois** : le montant habituel est déjà là. « C'est ça » ou
   « Modifier ».
2. **Les dépenses au fil du mois** : ce qui a été déclaré. On ajoute ce qui manque. Une
   ligne sans rien de déclaré propose « Rien dépensé ». Laissée sans réponse, elle
   garde son prévu : la clôture ne bloque jamais.
3. **Ce qui reste** : le revenu, moins ce que le mois a réellement coûté. On choisit de
   le mettre de côté, sur une poche d'épargne et avec un montant modifiable, ou de le
   garder sur le compte. C'est D65, appliqué à chaque mois.

Une fois clôturé, le mois affiche ses chiffres réels. On peut revenir dessus.

**À deux (lot 4).** Chacun décide pour soi. S'il existe un compte commun alimenté par
virements, l'excédent de chacun sur ce compte propose aussi « Baisser mon prochain
virement » (D65), et le virement du mois suivant en tient compte.

### D79 — une confirmation ne laisse pas de trace à l'écran

Valider un montant, saisir une facture ou clôturer ne laisse aucune phrase de
confirmation sur l'écran du mois. La ligne affiche le bon chiffre, c'est tout. Le
détail (la date de la facture, qui l'a saisie) se lit dans la feuille de la ligne.

Aujourd'hui, au contraire, « ✓ Relevé 2026 saisi le 24/09/2026 — il tombait juste. »
reste écrit indéfiniment.

### D80 — le foyer voit tout

Le 1er octobre 2026, Kamil revient sur la seconde moitié de D73 : « c'est un seul
foyer, c'est normal qu'elle voie tout ». Le **détail** des dépenses perso est donc
visible de tout le foyer, comme leur total. Le reste de D73 tient : une dépense perso
se suit, et ne se partage jamais. `docs/budget.md` sera mis à jour en ce sens (lot 1).

« Il te reste » ne compte que **mes** parts. Voir une ligne ne veut pas dire la
payer.

---

## 3 · Les écrans

Les jetons visuels sont au § 6. Les textes ci-dessous sont les textes exacts, au
tutoiement, comme le reste de l'app.

### 3.1 · Le mois — `/budget`

De haut en bas :

1. **Barre.** « ‹ Popote » ramène au hub. À droite, l'initiale (comme le hub).
2. **Titre.** Le surtitre « Budget », puis le nom du mois en Fraunces 46 px. À droite,
   la pastille « ‹ Septembre » ouvre le mois précédent. Sur un mois passé, la
   pastille « Novembre › » ouvre le suivant, jamais au-delà du mois courant (on n'ouvre
   jamais un mois futur : règle existante de `useMois`). Dessous : « Il reste N jours. »
   sur le mois courant.
3. **Les gestes.** Quatre boutons ronds de 58 px avec leur libellé :
   - « Mes charges » mène à `/charges` ;
   - « Déclarer », en safran, ouvre le choix d'une ligne au fil du mois, puis la feuille
     Déclarer (§ 3.2) ;
   - « Revenus » mène à `/budget-reglages` ;
   - « Épargne » mène à `/epargne`.
4. **Ce qui reste.** Une carte encre, rayon 28 :
   - « Il te reste », et la pastille « sur 4 325 € de revenus » ;
   - le chiffre en safran, Fraunces 64 px ;
   - « après 4 008,20 € de charges prévues », c'est-à-dire la somme de **mes** parts.
     Seul, c'est le total du foyer ; à deux, ce n'est plus le cas ;
   - une barre segmentée par catégorie, plus un segment « Reste », en part du revenu ;
   - une légende sur deux colonnes : la pastille de couleur, le nom, et le pourcentage.
     Les pourcentages sont arrondis au plus fort reste, pour que leur somme fasse 100.
   - Les cas : voir le § 3.1.1.
5. **À verser** (lot 4). Le bloc d'aujourd'hui (`virements()`), juste sous la carte, et
   seulement s'il y a un virement à faire. Pour un foyer d'une personne, il n'apparaît
   jamais.
6. **Épargne.** Une carte par poche : vignette photo, nom, « X € mis de côté sur Y € »
   et une jauge. Les projets n'apparaissent que s'il y en a. Un toucher mène à
   `/epargne`.
7. **« Par catégorie »**, puis « N lignes » à droite.
8. **Le filtre** Tout / Commun / Moi, chacun avec son total :
   - **Commun** : les lignes dont la charge est `commun` ;
   - **Moi** : mes lignes perso ;
   - **Tout** : les deux.
9. **Le bandeau.** Il dépend du moment :
   - sur le mois courant, avant le 27 : « Le mois fini, on le clôture : tu confirmes les
     factures, et tu choisis quoi faire de ce qui reste. » (fond sable) ;
   - sur le mois courant, à partir du 27 : « Octobre se termine. Le 1er novembre, on le
     clôture. », sans bouton ;
   - sur le mois courant, si le mois **précédent** n'est pas clôturé : « Septembre est
     fini : on le clôture ? » et le bouton « Clôturer septembre ». Ce bandeau ne concerne
     que le mois précédent, jamais les plus anciens ;
   - sur un mois passé non clôturé : le même bandeau, et le même bouton ;
   - ces deux bandeaux de clôture ne paraissent que si j'ai un revenu ce mois-là. Sans
     revenu (janvier à août 2026), un mois ne se clôture pas (§ 4.5), et rien ne le
     propose ;
   - sur un mois clôturé : aucun bandeau.

   Un seul bandeau à la fois. Celui du mois précédent non clôturé passe devant les
   autres.
10. **Les catégories**, triées par montant décroissant. Une catégorie sans ligne ne
    s'affiche pas. Chaque carte :
    - la photo de 54 px, la pastille de couleur et le nom ;
    - dessous, « N montants à dire » en ocre s'il y en a, sinon « N lignes » ;
    - le total en Fraunces 23 px, et un chevron.

    Une catégorie qui a des montants à dire est ouverte d'office ; les autres sont
    repliées. L'état ouvert ou replié se retient par appareil, en `localStorage`.

Les lignes, selon leur façon (celle de la ligne, figée à sa naissance, § 4.1) :

| Façon | Ce qu'affiche la ligne | Toucher la ligne |
|---|---|---|
| Fixe | libellé, montant | rien (on corrige dans Mes charges) |
| Facture du mois | libellé, montant (habituel, ou corrigé) | feuille Facture du mois (§ 3.3) |
| Au fil du mois | libellé, « X € sur Y € », jauge, bouton « Déclarer » | feuille Déclarer (§ 3.2) |
| Mise de côté | libellé, « 1 450 € par an, mis de côté chaque mois » (ou « 300 € par trimestre… »), provision du mois | feuille Facture mise de côté (§ 3.4) |
| Ajustement | libellé tel qu'en base (« Entretien auto — facture 2026 », « … — solde 2026 », « … — régularisation 2026 » pour l'existant), montant signé | rien |

Sur la jauge d'une ligne au fil du mois, la teinte est herbe jusqu'au prévu, ocre
au-delà. Elle n'est jamais rouge (règle existante : une dépense n'est pas une erreur).

Une ligne « à dire » est une ligne au fil du mois sans aucune saisie. Le compte
« N montants à dire » les additionne. Une facture du mois n'en fait pas partie : on la
valide à la clôture, et elle ne doit pas rester signalée tout le mois.

#### 3.1.1 · Le chiffre « Il te reste »

Le chiffre se calcule ainsi : mon revenu du mois, moins **ma part** de chaque ligne
du mois où j'en ai une. Ma part se compte selon l'état de la ligne :

- **mois clôturé** : ma part en base (`depense_part`), pour toute ligne ;
- **mois ouvert, ligne au fil du mois** : ma part de max(prévu, total déclaré), que la
  ligne soit confirmée ou non. Le chiffre ne baisse donc que si l'on dépasse son prévu,
  et ne remonte qu'à la clôture. Revenir sur un mois clôturé le rend à ce calcul ;
- **mois ouvert, autre ligne** : ma part en base.

Les cas d'affichage :

- **Mois clôturé :** « Octobre est clôturé. Il t'est resté X € », et, s'il y en a eu,
  « dont Y € mis de côté ». Le chiffre vient de `cloture_choix.reste_cents`.
- **Négatif :** « Il te manque X € », en ocre. La barre se répartit alors sur le total des
  charges, et non plus sur le revenu.
- **Sans revenu ce mois-là :** « Ajoute ton revenu pour voir ce qu'il te reste », et le
  bouton « Revenus ». La barre et la légende ne s'affichent pas.
- **Mois vide (aucune charge) :** l'état vide actuel (« Poser les charges » ou
  « Commencer par les revenus et les comptes »).

Le revenu du mois est le `revenu` de la personne dont le `valid_from` est le plus
récent, sans dépasser le dernier jour du mois.

### 3.2 · Feuille « Déclarer » (au fil du mois)

C'est une feuille qui monte du bas (un `<dialog>` modal, à la poignée). Elle contient :

- la photo, le libellé en Fraunces 28 px, « Octobre · 800 € prévus », et une croix
  « Fermer » ;
- une carte : « X € » en Fraunces 40 px, « sur Y € », une jauge, et « Il reste Z € pour
  octobre. » (ou, au-delà du prévu, « Z € au-delà du prévu. » en ocre) ;
- « Nouvelle dépense » : un champ de montant, en grand ; puis le choix de la date,
  toujours dans le mois affiché ; puis le bouton safran « Ajouter X € ».
  - Sur le mois courant : « Aujourd'hui / Hier / Autre jour », sans « Hier » le 1er.
  - Sur un mois passé : son dernier jour par défaut, et « Autre jour ».
  - « Autre jour » ouvre un sélecteur borné au mois affiché ;
- « Déjà ce mois-ci » : chaque saisie avec sa date courte (« Sam. 3 oct. ») et son
  montant, et une corbeille pour la retirer. À deux, on y lit aussi le prénom de qui l'a
  saisie.

Le champ refuse ce que `enCentimes` refuse, zéro, et plus de 1 000 000 €, la borne
de la base. Il en va de même des montants de facture et de clôture.

Sur un mois clôturé, la feuille est en lecture seule : « Octobre est clôturé. » et le
bouton « Revenir dessus » (§ 3.5).

### 3.3 · Feuille « Facture du mois »

La feuille contient le libellé, puis « Le montant habituel : 50 € » et deux boutons :

- **« C'est ça »** valide tout de suite (`confirme_la_depense` au montant actuel) ;
- **« Modifier »** ouvre le champ, puis « Valider X € ».

Si la ligne est déjà validée, la feuille affiche le montant retenu et « Modifier ».

Sur un mois clôturé, la feuille est en lecture seule, comme au § 3.2.

### 3.4 · Feuille « Facture mise de côté »

La feuille contient :

- le libellé, et « 41,67 € mis de côté chaque mois » ;
- une carte sur deux lignes : « Prévu pour 2026 », puis « Factures payées en 2026 » avec
  leur total. Quand Popote n'a pas suivi toute l'année, la première ligne le dit :
  « Prévu pour 2026, depuis septembre : 166,68 € ». Dessous, la liste des factures (date, montant, corbeille). S'il n'y en a
  pas : « Aucune facture cette année pour l'instant. »
  - Une facture d'origine `releve` s'y lit « Relevé 2026 — total de l'année », sans
    date et sans corbeille. La copropriété y montre ainsi 1 200 €, le total annuel saisi en septembre, et
    non l'appel d'un trimestre.
  - Sur une année soldée, la carte commence par « 2026 est soldée. » ;
- « Montant de la facture » : un champ, puis « Payée : Aujourd'hui / Autre jour ». L'année
  de la facture est celle de sa date de paiement. « Autre jour » ne remonte pas avant
  le premier mois suivi (D77) ;
- un aperçu, en direct, de ce que la facture va faire. La feuille lit B, Pl, le posé,
  l'état soldé et le premier mois suivi par `etat_de_l_annee` (§ 4.5), puis applique la
  formule du § 4.4 au montant tapé ; elle ne recompte rien elle-même :
  - au-delà du prévu, pour une facture de 320 € : « 153,32 € de plus que les 166,68 €
    prévus pour 2026 : ils s'ajoutent à octobre. » ;
  - en dessous, pour une facture de 100 € : « Il restera 66,68 € de côté pour 2026. » ;
  - si l'année est déjà soldée : « 2026 est soldée : les 320 € s'ajoutent à
    octobre. » ;
- le bouton safran « Ajouter la facture ».

Une facture se saisit toujours au présent : la feuille est la même sur un mois
clôturé. Son ajustement tombe sur le mois en cours, qui n'est jamais clôturé (D78).

Retirer une facture demande une confirmation. **Un relevé ne se retire pas, il se
corrige** : sa ligne propose « Corriger le montant », et l'aperçu dit l'effet (« 10 € de
plus que le relevé : ils s'ajoutent à octobre. »). L'année reste soldée, avec son prévu
figé. Retirer le relevé de taxe foncière la rouvrait sur les seuls mois suivis
(483,32 €) : le ressaisir ajoutait 966,68 € à octobre, et 800 € pour la copropriété.
Kamil l'a choisi le 1er octobre 2026.

**Une charge retirée garde sa feuille** jusqu'au 31 décembre de l'année qui suit son
retrait : la facture d'une maison vendue arrive souvent après, parfois l'année
suivante (la régularisation de copropriété votée en avril). « Retirer » emporte ses lignes des
mois ouverts, et la feuille ne s'ouvrirait plus depuis le mois. Mes charges la montre
donc sous « Retirées, encore à régler » (§ 3.7), et la feuille s'ouvre de là. Le code
d'aujourd'hui garde ce chemin pour la même raison (`Budget.tsx:263`).

### 3.5 · La clôture — `/cloture/AAAA-MM`

Une page pleine : « ‹ Budget », le surtitre (la date du jour), « Clôturer octobre », puis
« Trois étapes, et le mois est fait. » Chaque étape a une pastille numérotée.

1. **« Les factures du mois »** — « Le montant habituel est déjà là. Corrige-le
   seulement s'il a changé. » Une carte par facture du mois **non validée**, avec
   « C'est ça » et « Modifier ». S'il n'y a plus rien à valider, l'étape tient en une
   ligne : « Tout est validé. »
2. **« Tes dépenses du mois »** — « Ce que tu as déclaré. Ajoute ce qui manque. » Une
   ligne par ligne au fil du mois :
   - « X € sur Y € », avec sa jauge, et un bouton « + » qui ouvre la feuille Déclarer ;
   - sans saisie : « Rien de déclaré » en ocre, et le bouton bascule « Rien dépensé ».
     Non basculé, la ligne garde son prévu. Une ligne déjà confirmée à 0 € (une
     reclôture après « Rien dépensé ») arrive basculée.

   Sous la liste : « Tu as dépensé X € de moins que prévu. » ou « … de plus que
   prévu. »
3. **« Ce qui reste »** — « Tu décides où va l'argent qui n'a pas servi. »
   - Une carte encre : « Il te reste ce mois-ci », le chiffre, puis « X € prévus, plus
     Y € dépensés en moins ». X est ce qui resterait si chaque ligne au fil du mois
     coûtait son prévu. Y est l'écart net de l'étape 2, prévu moins réel (« … moins Y €
     dépensés en plus » s'il est négatif). X + Y fait le chiffre.
   - Deux choix :
     - « Le mettre de côté » : par défaut, la poche « urgence » s'il y en a une, sinon la
       première. Un sélecteur apparaît s'il y a plusieurs poches. Dessous, « Ton épargne
       d'urgence passe à X € sur Y €. » ;
     - « Le garder sur le compte » : « Il reste disponible pour novembre. » Ce choix
       envoie `mis_de_cote_cents` = 0. Sans aucune poche, « Le mettre de côté » est
       grisé, et la clôture envoie 0 : elle ne bloque jamais.
   - « Combien mettre de côté » : par défaut, tout ce qui reste ; à zéro si ce qui reste
     est négatif, et le choix « Le mettre de côté » est alors grisé. « Tout ce qui
     reste » part tel quel (`mis_de_cote_cents` à null) : la base met de côté son propre
     `reste_cents`, au centime.
   - Quand la clôture solde une année (en décembre, ou à la première clôture d'une année
     dont la précédente est encore ouverte), une ligne de plus avant le chiffre pour
     chaque charge mise de côté : « Entretien auto : 166,68 € non dépensés en 2026
     reviennent. », ou « … : 83,34 € de plus que prévu en 2026. ». Ces montants viennent
     de `apercu_des_soldes(le_mois)` (§ 4.5). Ils comptent dans X : X + Y fait toujours
     le chiffre.
4. Le bouton safran « Clôturer octobre », puis « Tu pourras revenir dessus depuis le
   mois. »

Une fois le mois clôturé, retour à `/budget` sur ce mois. Si une année n'a pas pu être
soldée (§ 4.5), une ligne le dit sous le chiffre du mois : « Entretien auto : 2026 n'a
pas pu être soldée. Elle le sera à la prochaine clôture. »

Sur un mois clôturé, la page dit « Octobre est clôturé le 01/11. », le chiffre resté,
et le bouton « Revenir dessus » (`rouvre_le_mois`, après confirmation : « Revenir sur
octobre ? Les X € mis de côté seront retirés de l'épargne. »).

La page refuse le mois en cours : « On clôture octobre une fois fini, à partir du
1er novembre. » et un retour.

### 3.6 · La carte Budget du hub

Elle remplace « 0 € à verser » et « Courses : dépassé de 500 € ». Elle affiche :

- « Il te reste 317 € », en grand, en euros ronds (comme aujourd'hui), puis « en
  octobre » ;
- une seconde ligne, selon le cas :
  - si le mois précédent n'est pas clôturé et que j'y ai un revenu : « Septembre est à
    clôturer » ;
  - sinon, s'il y en a : « 3 montants à dire » ;
  - sinon : « Tout est à jour ».

Les états sans charge et sans revenu restent ceux d'aujourd'hui (« Rien de posé »).

### 3.7 · Mes charges — `/charges`

Chaque charge gagne deux choix, dans sa fiche :

- **« Catégorie »** : les huit catégories ;
- **« Comment elle se paie »** : Fixe / Une facture chaque mois / Plusieurs dépenses dans
  le mois / Mise de côté.
  - Les trois premiers choix fixent la périodicité à mensuel.
  - « Mise de côté » demande « tous les trois mois » ou « une fois par an ».
  - C'est ce choix qui remplace la périodicité seule et la case « variable ».
  - Une charge mise de côté qui a déjà des factures, ou une ligne confirmée, réglée ou
    dans un mois clôturé (un mois rouvert reste tout confirmé), ne devient pas
    mensuelle. Les trois premiers choix sont alors grisés, avec « Pour la
    payer chaque mois, retire-la et ajoute la nouvelle. Ses factures et ses années
    soldées restent ; une année encore ouverte se soldera à la clôture de décembre. »
    (§ 4.5).

À l'ajout depuis le catalogue, la catégorie vient de la section, et la façon vient de
la nature de l'article : un article avec plafond est au fil du mois, Électricité et
Gaz sont des factures du mois, une périodicité non mensuelle est mise de côté, le
reste est fixe. Une charge saisie à la main demande sa catégorie (« Autre » par
défaut).

**« Retirées, encore à régler ».** Sous la liste, les charges mises de côté retirées :
le nom, « 2026 reste à régler » (ou « Retirée en 2026 » si tout est soldé), et « Ajouter une
facture », qui ouvre la feuille du § 3.4. Elles disparaissent le 31 décembre de
l'année qui suit leur retrait. Une facture de l'année suivante s'ajoute en entier : rien
n'y a été mis de côté.
Rien d'autre ne s'y fait.

Tout ce qui touchait aux enveloppes disparaît de l'écran : le rattachement d'une
charge à une enveloppe, et la création d'enveloppes.

### 3.8 · Revenus et comptes — `/budget-reglages`

La section des enveloppes disparaît. Le reste ne change pas.

---

## 4 · Le modèle

### 4.1 · `charge` : deux colonnes, et la façon de chaque ligne

```sql
alter table public.charge
  add column mode text not null default 'fixe'
    check (mode in ('fixe', 'facture', 'au_fil', 'mis_de_cote')),
  add column categorie text not null default 'autre'
    check (categorie in ('vie_courante', 'maison', 'credits', 'auto',
                         'abonnements', 'sante', 'impots', 'autre')),
  add constraint charge_mode_periodicite
    check ((mode = 'mis_de_cote') = (periodicite <> 'mensuel'));

alter table public.depense
  add column facon text
    check (facon in ('fixe', 'facture', 'au_fil', 'mis_de_cote'));  -- null : un ajustement
```

**Chaque ligne fige sa façon à sa naissance**, comme son `montant_prevu_cents`. La
clôture, la garde des saisies, `confirme_la_depense` et l'écran lisent la façon de la
**ligne**, jamais celle de la charge. Sans cela, une ligne confirmée d'un mois ouvert
changerait de règle avec sa charge : des Courses de septembre à 820 € déclarés, passées
en fixe le 2 octobre, se clôtureraient à 800 €, et 20 € disparaîtraient.
`corrige_la_charge` refait les lignes non confirmées, qui prennent la façon nouvelle.

Tout ce qui fait naître une ligne `modele` (`ouvre_le_mois`, `ouvre_la_charge`,
`rattrape_les_mois`, `solde_l_annee`, `corrige_la_charge`) y écrit `facon` =
`charge.mode`. Une contrainte l'exige, posée après l'étape 2 du § 5 :
`check (source <> 'modele' or facon is not null)`. Sans elle, une ligne née sans façon
passerait pour un ajustement et sauterait les étapes 2 et 3 de la clôture. Le client ne
change jamais `facon` lui-même (trigger, § 4.5) : une ligne fixe passée en mise de côté
compterait dans le prévu de l'année.

- `variable` et `enveloppe_id` restent en base. Plus aucun code nouveau ne les lit.
  L'ancien paquet que le service worker sert au premier chargement après un
  déploiement doit continuer de tourner.
- **La nature d'une ligne qui naît** (`ouvre_le_mois`, `ouvre_la_charge`) vaut
  `estimee` si `mode <> 'fixe'`, et `connue` sinon. La règle d'aujourd'hui (variable,
  ou non mensuelle, ou rattachée à une enveloppe) reste vraie pour toutes les données
  migrées : la migration la traduit ligne pour ligne.
- `useAjouteCharge` écrit `mode` et `categorie`.
- **Changer de façon** passe par `corrige_la_charge`, comme changer de périodicité
  aujourd'hui (§ 4.5). Elle gagne un argument `nouveau_mode text default null`, et elle
  est **remplacée** (drop, puis create), pas surchargée : l'ancien paquet l'appelle avec
  ses cinq arguments nommés, et PostgREST refuserait de choisir entre deux versions.
  Quand `nouveau_mode` est donné, une façon qui ne va pas avec la périodicité est
  refusée en français. Sans lui, c'est l'ancien paquet, et le trigger la déduit.
- **Changer de catégorie** est un simple `update` de la charge, sous la policy
  `charge_update`, comme `useRattacheCharge` : rien d'autre ne bouge.
- **Un trigger `before insert or update` normalise**, pour que l'ancien paquet ne casse
  rien :
  - une périodicité non mensuelle force `mis_de_cote` ;
  - une charge mensuelle marquée `mis_de_cote` retombe sur `au_fil` si elle a une
    enveloppe, sur `facture` si elle est `variable`, et sur `fixe` sinon ;
  - une charge mensuelle `fixe` qui porte une enveloppe devient `au_fil`, et `facture`
    si elle est `variable`. La règle joue toujours à l'insertion. À la modification,
    elle ne joue que si `variable` ou `enveloppe_id` changent sans que `mode` change.
    Seul l'ancien paquet écrit encore ces deux colonnes : son « Électricité, variable,
    50 € » devient ainsi une facture du mois ;
  - à l'insertion, une catégorie `autre` avec un `catalogue_id` prend la catégorie de
    la section de l'article.

  La contrainte `charge_mode_periodicite` se vérifie après le trigger. Quand
  `corrige_la_charge` reçoit `nouveau_mode`, elle remet `variable` à faux et
  `enveloppe_id` à null. Sans cela, un rattachement d'enveloppe fait plus tard par
  l'ancien paquet recalculerait la façon à partir d'un `variable` périmé.

  Avant de normaliser, le trigger refuse au client (`current_user = 'authenticated'`)
  de changer lui-même une colonne d'argent : `montant_cents`, `periodicite`, `mode`,
  `variable`, `cle`, `debut`, `fin` ou `commun`. La policy `charge_update` ouvre toutes
  les colonnes, et ces changements doivent passer par `corrige_la_charge`, qui refait
  les lignes et rattache les saisies. Un `update` direct du montant laissait la ligne
  d'octobre à 800 € sous une charge à 850 €. Le client garde l'`update` direct de
  `libelle`, `categorie`, `compte_id` et `enveloppe_id` : c'est ce qu'écrit
  `useRattacheCharge`, qui ne garde dans le nouveau paquet que `compte_id`.

  `archive_le` ne change, pour le client, que comme le fait `retire_charge` (invoker) :
  posé, et seulement si la charge n'a plus de ligne que « Retirer » aurait supprimée
  (une ligne `modele` non confirmée, non réglée, d'un mois non clôturé, hors années
  soldées). Archiver en direct une charge à 580 € laissait sa ligne du mois ; la
  recréer comptait les deux. Le remettre à null est refusé au client.
  Il regarde ce que le client envoie, avant la normalisation : une enveloppe que
  l'ancien paquet rattache change encore la façon par la règle ci-dessus.

### 4.2 · `saisie` : les dépenses au fil du mois

```sql
create table public.saisie (
  id                uuid primary key,          -- fourni par l'appareil : idempotence
  household_id      uuid not null references public.household(id) on delete cascade,
  depense_id        uuid not null references public.depense(id) on delete cascade,
  fait_le           date not null,
  montant_cents     integer not null
                    check (montant_cents > 0 and montant_cents <= 100000000),
  source            text not null default 'manuel'
                    check (source in ('manuel', 'banque', 'courses')),
  reference_externe text,
  saisi_par         uuid references public.user_profile(id) on delete set null,
  created_at        timestamptz not null default now(),
  constraint saisie_reference_unique unique (household_id, reference_externe)
);
create index saisie_depense_idx on public.saisie (depense_id);
```

- **RLS.** On lit, insère, modifie et supprime dans son foyer
  (`household_id = current_household()`). À l'insertion, `saisi_par = auth.uid()`.
- **Rattachée à la ligne du mois**, et non à la charge : quand « Retirer » (0088)
  supprime les lignes non confirmées, leurs saisies partent avec elles. Celles d'un
  mois clôturé restent avec leur ligne confirmée.
- **Idempotente.** L'`id` vient de l'appareil (`crypto.randomUUID()`), un par saisie
  voulue : la feuille le crée à la frappe du montant, le garde pour ses renvois, et en
  prend un neuf après un succès. Créé à l'ouverture de la feuille, il faisait d'un
  second montant (50 €, puis 30 €) un renvoi du premier : 23505, et 30 € perdus. Même
  règle pour les factures. Un second envoi
  du même `id`, après une coupure réseau ou un double toucher, est un succès sans
  effet : le front traite le code `23505` sur la clé primaire comme réussi. À
  l'insertion, `tg_saisie_garde` regarde d'abord si l'`id` existe, et lève alors
  elle-même `23505`, avant toute autre règle. Sinon, un renvoi arrivé après la clôture
  serait refusé (« mois clôturé ») ; l'utilisateur la ressaisirait après « Revenir
  dessus », et 50 € compteraient deux fois.
- **`tg_meme_foyer`**, comme ailleurs, en `before insert or update` seulement. Elle rend
  `new`, qui vaut NULL sur un DELETE : posée aussi sur DELETE, elle annulerait en
  silence toute suppression.
- **Une garde à part, `tg_saisie_garde`** (`before insert or update or delete`) :
  - à l'insertion et à la modification, la ligne est à `source = 'modele'` et sa façon
    est `au_fil` (celle de la ligne, § 4.1), `fait_le` tombe dans le mois de la ligne,
    et ce mois n'est pas clôturé (pas de `cloture` pour le foyer et ce mois) ;
  - la somme des saisies de la ligne, celle-ci comprise, ne dépasse pas 1 000 000 € :
    `confirme_la_ligne` la refuserait, et toute la clôture avec (deux fautes de frappe
    de 999 999 € sur les Courses) ;
  - à la modification, l'ancien mois ne l'est pas non plus. À la suppression, le mois de
    l'ancienne saisie (`date_trunc('month', old.fait_le)`) ne l'est pas, et la garde
    rend `old` ;
  - le verrou du foyer est déjà pris, par un trigger d'instruction (§ 4.5) : une saisie
    qui arrive pendant une clôture attend sa fin, puis la voit ;
  - elle laisse passer deux écritures menées par une clé étrangère, et elles seules :
    - une suppression dont la ligne ou le foyer n'est plus visible, c'est-à-dire la
      cascade depuis `depense` ou `household` ;
    - une modification qui ne fait que mettre `saisi_par` à null, et seulement si
      l'ancien auteur n'existe plus : son compte vient d'être supprimé. Un membre ne
      peut pas effacer ainsi l'auteur des saisies de l'autre.

    Elle teste ces deux cas en premier. Sans eux, `delete_my_account` échouerait sur un
    mois clôturé (le piège déjà noté en 0053), et « Retirer » échouerait en pleine
    cascade, la ligne étant déjà partie. `pg_trigger_depth()` ne suffit pas : une
    écriture faite par le trigger d'une autre table, comme demain les tickets de D67,
    arrive elle aussi à la profondeur 2.

  Chaque refus porte une phrase en français, que l'écran affiche telle quelle.
- **Pour l'argent, la base ne lit les saisies qu'à la clôture.** En cours de mois, la
  ligne `depense` garde son prévu, et l'écran calcule. Ailleurs, elle ne les lit que
  pour les garder : le refus de « Retirer », la correction qui les rattache, le refige
  qui épargne leur ligne, l'idempotence.

### 4.3 · `facture` : les factures des charges mises de côté

```sql
create table public.facture (
  id            uuid primary key,              -- fourni par l'appareil : idempotence
  household_id  uuid not null references public.household(id) on delete cascade,
  charge_id     uuid not null references public.charge(id) on delete restrict,
  annee         integer not null check (annee between 2000 and 2100),
  paye_le       date not null,
  montant_cents integer not null check (montant_cents between 0 and 100000000),
  origine       text not null default 'saisie' check (origine in ('saisie', 'releve')),
  saisi_par     uuid references public.user_profile(id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint facture_annee_du_paiement
    check (origine = 'releve' or extract(year from paye_le)::integer = annee)
);
create index facture_charge_annee_idx on public.facture (charge_id, annee);
```

- **RLS.** Lecture dans son foyer. Aucune écriture directe : seules
  `paie_une_facture`, `retire_une_facture` et `corrige_le_releve` écrivent.
- **`charge_id` en `restrict`**, comme pour `depense` (0053) : une charge qui a des
  factures ne se supprime pas. « Retirer » l'archive, et la clôture solde ses années
  ouvertes. En cascade, retirer l'entretien après une facture de 320 € effaçait la
  facture, et ses 320 € ne comptaient plus nulle part.
- **Le départ du dernier membre.** `delete_my_account` (0008) est le seul chemin qui
  supprime un foyer. Avant le foyer, il supprime ses factures : sinon la cascade
  `household → charge` pourrait buter sur le `restrict` d'une facture pas encore
  partie, car l'ordre des cascades n'est pas garanti.
- **Les comptes perso de qui part.** Avant le profil, `delete_my_account` supprime les
  comptes `perso` dont il est titulaire (les `compte_id` des charges et des lignes
  passent à null). Aujourd'hui, la suppression du profil met `titulaire_id` à null
  (`on delete set null`), ce que `compte_titulaire_coherent` (0051) refuse pour un
  compte perso : en prod, Kamil a deux comptes perso, et son effacement échoue
  déjà.
- **`releve_annuel` change de sens.** Il ne porte plus le montant saisi, il marque
  **l'année soldée**. `reel_cents` vaut le total des factures au moment du solde, et
  `ecart_cents` l'écart avec le prévu à ce moment-là. Il gagne `prevu_cents`, ce prévu
  **figé** au moment du solde : une année soldée ne bouge plus que de ses nouvelles
  factures, et l'aperçu « les 320 € s'ajoutent » dit vrai. Sans lui, le prévu se relisait
  sur les lignes vivantes, qu'un retrait ou une ligne marquée sans provision faisait
  changer. Les gardes existantes
  (`ouvre_le_mois`, `ouvre_la_charge`, `rattrape_les_mois`, `provisions_a_venir` : une
  année soldée ne gagne plus de mois) restent telles quelles.
- **Plus aucune écriture directe sur `releve_annuel`.** On supprime ses policies
  d'insertion, de modification et de suppression (0078). Aujourd'hui, un client peut
  geler ou dégeler une année sans passer par le solde. Seules deux fonctions y
  écrivent : `solde_l_annee`, qui l'insère, et `corrige_le_releve`, qui met à jour son
  `reel_cents` et son `ecart_cents`, jamais son `prevu_cents`. Rien ne le supprime, hors
  cascade. `corrige_la_charge` n'y touche plus.
- **L'invariant.** Pour toute charge mise de côté et toute année, le total payé `B`
  est la somme des `facture.montant_cents`. Aucune autre source.

### 4.4 · Les ajustements : une seule fonction recale

Une **ligne d'ajustement** est une `depense` à `source = 'manuel'` et
`regularise_annee = annee`, posée sur un mois. L'existant s'écrit ainsi, comme les
lignes de `regularise_annuel`.

On supprime l'index unique `depense_regularisation_unique` : une charge-année peut
désormais avoir plusieurs ajustements. Le contrôle d'unicité passe dans la fonction
qui recale, sous verrou.

`recale_l_annee(la_charge uuid, annee integer, mois_cible date default null)` est
interne (§ 4.5, « Les fonctions internes »). Elle s'appelle sous le verrou du foyer, et
ne verrouille rien d'autre. Elle calcule :

```
B       = Σ facture.montant_cents                    (charge, année)
soldee  = exists releve_annuel                       (charge, année)
L       = les lignes `modele` de la charge, de façon `mis_de_cote`, qui ont au
          moins une part, dans les mois suivis de l'année (D77)
Pl      = soldee ? releve_annuel.prevu_cents
                 : Σ L.montant_cents + provisions_a_venir(...), mois suivis seulement
cible   = soldee ? B − Pl : greatest(0, B − Pl)
pose    = Σ montant des lignes d'ajustement          (charge, année)
delta   = cible − pose
```

Si `delta ≠ 0`, elle pose une ligne d'ajustement de `delta` :

- sur `mois_cible` quand il est donné : c'est le mois que `cloture_le_mois` est en train
  de clôturer. Une clôture de décembre faite en janvier solde donc l'année **en
  décembre**, et le `reste_cents` de décembre la compte ;
- sinon, sur le **mois en cours** (heure de Paris), qui n'est jamais clôturé (D78).

Pl se lit directement sur `depense`, et non par `provisions_de` : celle-ci ne filtre ni
la façon ni le mois. Une ligne sans part n'est entrée dans le reste de personne : elle
n'a été mise de côté par personne, et n'a rien à rendre. Une ligne fixe d'avant un passage en mise de côté est de l'argent déjà payé :
l'assurance à 100 € par mois, clôturée en septembre et en octobre puis passée à
1 200 € par an, ferait sinon rendre 200 € déjà versés à l'assureur.

Les parts se répartissent selon ce que chacun a porté sur les lignes L (Σ de ses
`depense_part`), avec l'algorithme et les gardes de `regularise_annuel`. Les gardes ne jouent que si
`delta ≠ 0` : sans rien à répartir, il n'y a rien à refuser.

- Un mélange de signes reste refusé.
- Sans provision à suivre (rien de porté, ou plus personne au foyer pour l'avoir
  porté), la ligne se répartit comme une ligne de la charge. Elle va à ses participants
  présents au foyer ce mois-là, au poids de `parts_du_foyer(mois, foyer, cle)` : c'est
  la pesée de `repartit_les_lignes`, appliquée à la ligne d'ajustement elle-même, car
  cette fonction ne traite que les lignes `modele`. Sans participant présent, elle va à
  tous les membres présents. Un ajustement n'est jamais posé sans part.
- C'est le cas d'une charge retirée : « Retirer » emporte ses provisions non confirmées
  et garde ses factures. Refuser ferait échouer son solde à chaque clôture.

Le libellé vaut :

- `left(libellé, 55) || ' — facture ' || annee` quand l'année est ouverte ;
- `… — solde ' || annee` quand elle est soldée.

**Contrôle sur les données de prod** (la migration du § 5 range les deux relevés en
factures ; celui de l'Entretien a été annulé) :

| Charge 2026 | B | Pl | soldée | cible | posé | delta |
|---|---|---|---|---|---|---|
| Taxe foncière | 1 450,00 | 1 449,96 | oui | +0,04 | +0,04 | 0 |
| Copropriété | 1 200,00 | 1 200,00 | oui | 0 | 0 | 0 |
| Entretien auto, en octobre | 0,00 | 166,68 | non | 0 | 0 | 0 |
| … facture de 320 € en novembre | 320,00 | 166,68 | non | +153,32 | 0 | **+153,32** |
| … puis clôture de décembre | 320,00 | 166,68 | oui | +153,32 | +153,32 | 0 |
| … ou, sans facture, clôture de décembre | 0,00 | 166,68 | oui | −166,68 | 0 | **−166,68** |
| … ou facture de 600 € en novembre | 600,00 | 166,68 | non | +433,32 | 0 | **+433,32** |

Les 166,68 € sont les quatre provisions de septembre à décembre (4 × 41,67 €) : le
revenu de Kamil part du 01/09/2026. Les huit lignes de janvier à août restent, sans
compter dans Pl. La taxe foncière et la copropriété gardent le prévu figé de leur
relevé.

### 4.5 · Les fonctions

Toutes sont `security definer`, `set search_path = public, pg_temp`, et ne prennent
**jamais** le foyer en argument : il vient de `current_household()`, comme pour
`ouvre_la_charge`. Chacune est accordée à `authenticated` sauf mention contraire. Les
erreurs sont en français.

« Aujourd'hui » et « le mois en cours », en base, se calculent en heure de Paris, sur
`public.maintenant()` (`clock_timestamp()`, réglable dans les tests, § 8), **après** la
prise du verrou du foyer.

- En heure de Paris : la base est en UTC, et entre minuit et 2 h une facture payée
  « aujourd'hui » serait refusée comme datée du lendemain.
- Sur `clock_timestamp()`, après le verrou : `now()` est l'heure du début de la
  transaction. Une facture commencée le 31/10 à 23 h 59, qui obtient le verrou après la
  clôture d'octobre lancée à minuit, poserait sinon son ajustement sur octobre, déjà
  fermé.

**Les fonctions internes** (`confirme_la_ligne`, `recale_l_annee`, `solde_l_annee`,
`cible_de`) sont
fermées par `revoke execute … from public, anon, authenticated`, comme en 0061 et 0064.
Sur Supabase, les droits par défaut accordent toute nouvelle fonction à `anon` et à
`authenticated`, et `revoke … from public` ne les leur retire pas : `retire_charge`
porte encore `anon` en prod. Sans cela, un appel direct à `solde_l_annee` solderait 2026
en octobre, sans verrou ni clôture. Chacune revérifie aussi le foyer.

**Les fonctions de trigger qui regardent `current_user`** (le gel d'un mois clôturé, le
versement de clôture, le changement direct de façon, le trigger de `charge` qui refuse
les colonnes d'argent et `archive_le`, et le verrou d'instruction) sont
`security invoker`. En `security definer`, `current_user` vaudrait leur propriétaire,
et elles ne refuseraient jamais rien.

**Le verrou du foyer.** C'est un `pg_advisory_xact_lock` sur (« budget », foyer). Le
prennent en tête :

- `cloture_le_mois`, `rouvre_le_mois`, `paie_une_facture`, `retire_une_facture`,
  `corrige_le_releve`,
  `corrige_la_charge` et `retire_charge` ;
- `confirme_la_depense`, `ouvre_le_mois`, `ouvre_la_charge` et `rattrape_les_mois` ;
- les deux refiges des parts : `refige_pour`, que lancent les triggers de `revenu` et de
  `regle_partage` (0065), et `refige_le_mois` ;
- `delete_my_account`, qui écrit désormais dans `cloture_choix` et `facture` : sans
  le verrou, un départ pendant un « Revenir dessus » s'interbloquait ;
- toute écriture du client sur `saisie`, `depense`, `depense_part`, `charge`,
  `charge_participant`, `revenu`, `regle_partage` et `user_profile` (`entre_le`,
  `Profil.tsx:77`), par un trigger
  `before insert or update or delete for each statement`, `security invoker`. Il prend
  le verrou du foyer de l'appelant (`current_household()`) quand `current_user =
  'authenticated'` : une écriture directe, ou faite par un trigger invoker, comme
  demain celui des tickets (D67), qui doit attendre la clôture comme les autres. Sous le
  propriétaire, il ne fait rien : une fonction `security definer` tient déjà le verrou,
  et une action de clé étrangère qui l'attendrait en tenant sa ligne parente
  s'interbloquerait. Supprimer un compte met ainsi à null le `compte_id` de ses lignes
  sans attendre personne. Pour `revenu` et `regle_partage`, `refige_pour` venait trop
  tard : il prend le verrou dans un trigger `after`, la ligne déjà écrite. Un revenu
  posé pendant le départ de son compte tenait sa ligne et attendait le verrou, que
  `delete_my_account` tenait en attendant de supprimer cette ligne. Le nouveau paquet
  pose revenu et règle par un `upsert` sur leur unicité (`user_profile_id, valid_from`
  et `household_id, valid_from`), en une instruction : le `delete` puis `insert` de
  `usePoseRevenu` et `usePoseRegle` (`budget.ts:462`, `budget.ts:680`) en faisait
  deux transactions ;
- l'arrivée d'un membre, `tg_membre_rejoint_les_communes` (0079), sur
  `new.household_id`.

**La clé** est le foyer que l'appelant a résolu : `le_foyer` pour le service dans
`ouvre_le_mois` et `ouvre_la_charge`, `new.household_id` dans un trigger, son argument
`foyer` dans `refige_pour`. `current_household()` ne sert seul que sous `authenticated`,
dans le trigger d'instruction : sous la clé de service
(l'invitation acceptée passe par elle), il vaut NULL, et `pg_advisory_xact_lock(…, NULL)`
ne verrouille rien, en silence.

Chacun le prend **avant sa première écriture**. Une écriture faite avant pose des verrous
de ligne : l'insertion dans `charge_participant` tient KEY SHARE sur la charge, puis
`tg_membre_rejoint_les_communes` attendait le verrou dans `ouvre_le_mois`, pendant que
`retire_charge` tenait le verrou et attendait de supprimer cette charge.

Il sérialise, dans un foyer, tout ce qui touche à une clôture. Une saisie, une facture,
une validation, un revenu ou une ligne qui naît pendant une clôture attend sa fin, puis
la voit.

Ce verrou est le seul. Aucune fonction ne verrouille en plus la ligne de charge
(`for update`). Deux interblocages ont été reproduits sur une base jetable, le 01/10 :

- `tg_membre_rejoint_les_communes` tient KEY SHARE sur la charge avant d'ouvrir le mois
  (0079), et un `for update` en face l'attendait ;
- une saisie verrouillée par sa propre suppression attendait le verrou du foyer dans un
  trigger de ligne, pendant qu'une correction tenait ce verrou et cascadait sur elle.

D'où le trigger d'instruction : il passe avant que la ligne visée soit verrouillée.

- **`paie_une_facture(la_facture uuid, la_charge uuid, montant_cents integer, paye_le date) → uuid`**
  - `la_facture` vient de l'appareil. Si elle existe déjà, la fonction la rend sans
    rien faire d'autre : c'est l'idempotence.
  - Elle exige une charge mise de côté du foyer, un montant > 0, et une date entre le
    1er janvier de l'année précédente et aujourd'hui.
  - Le mois de `paye_le` doit être suivi (D77), ou être le mois en cours. Sinon :
    « Popote ne suivait pas encore mars 2026 : cette facture n'y compte pas. » Une
    facture d'un mois non suivi n'a pas de provision en face : elle s'ajouterait en
    entier au mois en cours, pour une dépense payée avant Popote.
  - Elle insère la facture (`annee` = année de `paye_le`), puis appelle
    `recale_l_annee` sans mois cible.
- **`retire_une_facture(la_facture uuid) → void`**
  - Elle supprime la facture, puis appelle `recale_l_annee`. Le contre-ajustement tombe
    sur le mois en cours : on ne réécrit pas un mois passé.
  - Elle refuse une facture d'origine `releve` : « Un relevé se corrige, il ne se retire
    pas. » (§ 3.4).
- **`corrige_le_releve(la_facture uuid, montant_cents integer) → void`** — verrou pris,
  foyer revérifié. Pour une facture d'origine `releve` seulement, avec un montant entre
  0 et 1 000 000 €. Elle change le montant de la facture, puis remet au relevé
  `reel_cents` = Σ des factures de l'année et `ecart_cents` = `reel_cents −
  prevu_cents` (`prevu_cents` ne bouge pas), et appelle `recale_l_annee`
  sans mois cible. Taxe foncière 1 450 € corrigée à 1 460 € : cible +10,04, posé +0,04,
  +10 € sur le mois en cours.
- **`solde_l_annee(la_charge uuid, annee integer, mois_cible date) → void`** — interne.
  - Si l'année est déjà soldée, elle ne fait rien.
  - Sinon, elle matérialise les mois suivis de l'année, avec la boucle et les bornes de
    `regularise_annuel`. Un mois clôturé n'y gagne pas de ligne (voir plus bas).
  - Elle insère `releve_annuel` (`reel_cents` = B, `prevu_cents` = Pl,
    `ecart_cents` = B − Pl), puis appelle `recale_l_annee(la_charge, annee, mois_cible)`.
  - Une année sans mois suivi n'a pas de cas à part. B y vaut toujours Σ factures, et
    Pl y vaut 0. Ses factures ne peuvent dater que du mois en cours, et chacune a déjà
    posé son montant : le solde n'y pose rien.
- **`cloture_le_mois(le_mois date, factures jsonb, rien uuid[], mis_de_cote_cents integer, la_poche uuid) → jsonb`**
  - Les arguments :
    - `factures` : `[{ "depense": uuid, "montant_cents": int }]`, les montants
      **modifiés** à la clôture ;
    - `rien` : les charges au fil du mois basculées sur « Rien dépensé ».
  - **Les gardes**, sous le verrou du foyer, pris en premier :
    - un foyer ;
    - un mois strictement antérieur au mois courant (heure de Paris) ;
    - le mois n'est pas déjà clôturé ;
    - l'appelant a un revenu ce mois-là : « Ajoute ton revenu d'août pour clôturer
      août. » Sans revenu, `reste_cents` serait NULL, et la clôture échouerait sur une
      erreur brute. Cela garde aussi les mois d'avant Popote hors de toute clôture.
  - **D'abord, le mois est mis à jour** : `ouvre_le_mois(le_mois)` y fait naître les
    lignes qui manquent, et `repartit_les_lignes` leur donne leurs parts. Le verrou,
    déjà tenu, se reprend sans attendre. Sans cela, octobre clôturé juste après la
    migration, sans avoir ouvert `/budget`, gardait 22 lignes et 3 898,20 € au lieu de
    25 lignes et 4 008,20 € : 110 € de reste en trop, et des lignes qui ne pouvaient
    plus naître. Elle ne refait **pas** les parts des lignes existantes
    (`refige_le_mois`) : un mois passé ne se repartage pas (0065, `budget.ts:871`). À
    deux, Thauba partie le 03/11, refiger octobre le 05/11 mettait les 1 678,53 € de
    communes sur Kamil seul (839,26 € de reste en moins) et effaçait les lignes
    perso de Thauba.
  - **Quatre étapes, dans cet ordre**, une fois les gardes passées.
  - **1. Les années à solder.** Pour chaque charge du foyer, archivée ou non, qui a dans
    l'année des lignes de façon `mis_de_cote` ou des factures, on solde toute année
    ouverte strictement antérieure à l'année du mois, ainsi que l'année du mois si c'est
    décembre. On regarde la façon des lignes, pas le mode de la charge : une charge
    repassée en mensuelle garde ses provisions de l'année. Chaque solde passe `le_mois`
    comme mois cible.

    **Un mois est suivi** s'il est clôturé, ou si un membre du foyer y a un revenu, au
    sens de la garde plus bas (le revenu du mois du § 3.1.1). Un mois peut donc être
    suivi sans être clôturé. Ne compter que les mois clôturés soldait 2026 à 0 si l'on
    clôturait janvier 2027 avant décembre 2026 : l'Entretien ne rendait jamais ses
    166,68 €. Ici, 2026 se solde pour de bon, et ce qu'elle rend tombe en janvier 2027.

    Les factures n'entrent pas dans ce critère : une facture d'avant Popote ferait
    suivre un mois que personne n'a suivi. Le revenu de Kamil part du 01/09/2026 :
    septembre 2026 est son premier mois suivi.

    Poser un revenu peut rendre suivis des mois qui ne l'étaient pas : le premier
    revenu d'un foyer. Le trigger de `revenu`, après `refige_pour` et sous le même
    verrou, appelle donc `recale_l_annee` sans mois cible sur chaque année ouverte des
    charges du foyer qui y ont des factures. Un nouveau foyer paie 320 € d'entretien
    le 10/03/2027, sans revenu : Pl vaut 0, +320 € sur mars. Le revenu posé le 15/03
    (effet au 01/03) fait passer Pl à 416,70 € : −320 € sur mars, et mars ne compte plus
    une facture que ses provisions couvrent. Changer un revenu déjà là, ou celui de
    Thauba en novembre, ne change aucun mois suivi : rien ne se pose.

    Une année sans mois suivi se solde donc à 0, sans ligne : Pl n'y compte rien. Une
    assurance de 240 € par an, posée en 2026 avec un départ en janvier 2025, ne rend rien
    pour 2025, ni pour les mois de 2026 d'avant septembre.

    Chaque solde tourne dans son propre bloc (`begin … exception`). Si une garde le
    refuse, l'année reste ouverte, la clôture continue, et la charge entre dans la liste
    `non_soldees` du résultat, avec la raison. La clôture suivante réessaie : D78 veut
    qu'une clôture ne bloque jamais.
  - **2. Les factures du mois.** Pour chaque ligne `modele` du mois dont la façon est
    `facture`, et qui a des parts :
    - si `factures` lui donne un montant : `confirme_la_ligne` à ce montant, que la
      ligne soit confirmée ou non ;
    - sinon, si elle n'est pas confirmée : `confirme_la_ligne` à son montant actuel ;
    - sinon, on n'y touche pas : une ligne validée par sa feuille garde son montant.
  - **3. Les lignes au fil du mois.** Pour chaque ligne `modele` du mois dont la façon
    est `au_fil`, et qui a des parts :
    - s'il y a des saisies : `confirme_la_ligne(ligne, Σ saisies)` ;
    - sinon, si la charge est dans `rien` : `confirme_la_ligne(ligne, 0)` ;
    - sinon : `confirme_la_ligne(ligne, prévu)`.

    Le résultat ne dépend que de ce que montre l'écran, les saisies et les bascules,
    jamais d'une confirmation antérieure : une reclôture refait le même calcul. Les
    lignes de septembre, confirmées avant la refonte, gardent leur montant grâce à la
    saisie d'amorce que leur pose la migration (§ 5).
  - **4. Le gel.** En dernier, chaque ligne du mois encore sans `confirme_le` le reçoit,
    sans changer ni son montant ni sa nature : les fixes, les mises de côté, les
    ajustements (ceux que l'étape 1 vient de poser compris), et les lignes sans part. Un
    mois clôturé n'a plus que des lignes confirmées. Ni `corrige_la_charge`, ni
    « Retirer », ni la policy `depense_delete` ne peuvent alors y toucher : tous trois
    épargnent déjà le confirmé.

    Une ligne sans aucune part, quelle que soit sa façon, n'est jamais recalculée :
    `confirme_la_ligne` la refuserait (0064), et une ligne anormale ne doit pas empêcher
    toute la clôture. Elle ne reçoit que ce gel.
  - **L'enregistrement.**
    - Elle insère `cloture`, puis `cloture_choix` pour l'appelant, avec `reste_cents`
      calculé **en base** : le revenu du mois (§ 3.1.1) moins la somme de ses
      `depense_part` du mois, ajustements compris.
    - `mis_de_cote_cents` à null veut dire « tout ce qui reste » : il vaut alors
      `greatest(reste_cents, 0)`. Sinon, il est ramené à `greatest(reste_cents, 0)` s'il
      le dépasse : à deux, la projection de l'écran peut différer d'un centime de la base.
    - S'il est > 0, elle exige `la_poche` dans le foyer.
    - S'il vaut alors 0, il n'y a pas de versement : la contrainte `montant_cents <> 0`
      (0054) ferait échouer toute la clôture. Sinon, elle insère `versement_epargne`
      (motif `balayage`, `fait_le` = aujourd'hui) et en garde l'id dans
      `cloture_choix`, avec le montant retenu.
  - Elle rend `{ "cloture": uuid, "non_soldees": [{ "charge": uuid, "libelle": text,
    "annee": int, "raison": text }] }`.
- **`apercu_des_soldes(le_mois date) → jsonb`** — lecture seule. Pour chaque charge
  mise de côté dont la clôture de ce mois solderait une année (étape 1), elle rend
  `{ "charge", "libelle", "annee", "cents" }` : le `delta` que poserait le solde, sans
  rien écrire. Elle calcule B, Pl, la cible et le posé par la même fonction que
  `recale_l_annee` : `cible_de(la_charge, annee, comme_soldee boolean)`, `sql stable`,
  interne. `comme_soldee` applique la formule d'une année soldée (`B − Pl`, sans
  plancher) à une année encore ouverte : c'est ce que fera le solde. Les provisions à
  venir des mois que le solde matérialiserait y comptent.
- **`etat_de_l_annee(la_charge uuid, annee integer) → jsonb`** — lecture seule,
  accordée à `authenticated`, foyer revérifié. Elle rend `{ b, pl, pose, soldee,
  premier_mois_suivi }`, par `cible_de`. La feuille « Facture mise de côté », la liste
  « Retirées, encore à régler » et la borne de « Autre jour » la lisent. `useProvisionsDe`
  disparaît : elle comptait les douze mois et ignorait `prevu_cents`.
- **`recale_la_charge(la_charge uuid) → void`** — `security definer`, accordée à
  `authenticated`, verrou pris, foyer revérifié. Elle appelle `recale_l_annee` sans
  mois cible sur chaque année ouverte de la charge. Elle est accordée parce que
  `retire_charge`, qui l'appelle, est `security invoker` : fermée, elle ferait échouer
  tout « Retirer » sur un refus de droit. Recaler est idempotent : l'exposer n'ouvre
  pas la porte que fermer `solde_l_annee` a fermée. Aucun écran ne l'appelle : l'aperçu de la clôture vient de
  `apercu_des_soldes`, qui n'écrit rien, alors que `recale_la_charge` écrit sur le mois
  en cours.
- **`rouvre_le_mois(le_mois date) → void`**
  - Elle supprime les versements liés aux choix de cette clôture, puis la clôture (les
    choix partent en cascade). Le versement d'un membre parti reste : l'argent est dans
    la poche, et personne ne pourrait plus le refaire.
  - Les lignes restent confirmées. Une nouvelle clôture refait le même calcul que la
    première (voir plus haut).
- **`confirme_la_ligne(la_ligne uuid, montant_cents integer)`** — interne. C'est le corps
  d'aujourd'hui de `confirme_la_depense` : les parts reposées avec les anciens points de
  base, la nature à `connue`, `confirme_le`. Elle refuse en plus une ligne d'un mois
  clôturé, et un montant négatif ou au-delà de 1 000 000 € : le corps actuel accepte le
  signe (0072), et une facture d'électricité à −50 € grossirait le reste de 100 €.
  Seuls les ajustements, que la base pose elle-même, sont signés. `cloture_le_mois` l'appelle avant d'insérer la clôture, donc ce refus ne la
  gêne pas.
- **`confirme_la_depense(la_depense uuid, reel_cents integer)`** garde sa signature. Elle
  prend le verrou du foyer, puis appelle `confirme_la_ligne`. Elle n'accepte qu'une
  ligne `modele` de façon `facture` ou `fixe`. Confirmer l'Entretien d'octobre à 320 €
  faisait passer Pl à 445,01 €, et un ajustement confirmé à 0 € effaçait ses 60 €.
  Pour une ligne au fil du mois, elle dit : « Cette dépense se déclare désormais au fil du mois. Recharge la page. »
  Seul l'ancien paquet l'appellerait ainsi, et sa confirmation, sans saisie, serait
  défaite à la clôture : 780 € confirmés le 30, puis 800 € retenus. La feuille
  « Facture du mois » l'appelle, elle, pour une facture.
- **Un mois clôturé est gelé.** « Revenir dessus » seul le rouvre.
  - Il ne gagne plus de ligne : `ouvre_le_mois`, `ouvre_la_charge` et
    `rattrape_les_mois` le sautent, et `provisions_a_venir` ne le compte pas, comme pour
    une année soldée. Sans cela, deux crochets feraient naître des lignes dans un mois
    dont le reste est déjà mis de côté : `useMois`, qui rattrape puis ouvre tout mois
    passé qu'on regarde, et `useAjouteCharge`, qui ouvre les mois écoulés depuis le
    début d'une charge.
  - `repartit_les_lignes` et les refiges n'y touchent pas : ils s'arrêtent avant, sur un
    mois clôturé. `repartit_les_lignes` ne regarde pas `confirme_le` (0064), et donnerait
    des parts à une ligne qui n'en avait pas : le mois ne vaudrait plus son
    `reste_cents`.
  - Un trigger sur `depense` et `depense_part` refuse toute écriture directe du client
    (`current_user = 'authenticated'`) sur une ligne d'un mois clôturé. Les policies
    `depense_update` et `depense_part_update` ouvrent toutes les colonnes : un client
    pourrait remettre `confirme_le` à null, puis supprimer la ligne et ses saisies. Les
    fonctions `security definer`, qui tournent sous leur propriétaire, passent. Le même
    trigger refuse au client, dans tout mois, de changer `depense.facon`, ou d'en poser
    une à l'insertion : une ligne fixe passée en mise de côté compterait dans Pl (§ 4.4).
- **La date de départ d'une charge** ne remonte pas avant le 1er janvier de l'année
  précédente, comme une facture. Le trigger de `charge` refuse au-delà, à l'insertion ou
  quand `debut` change, et le champ « Depuis » de Mes charges porte ce minimum. Une
  charge plus ancienne qui ne change pas de date de départ reste modifiable.
- **`corrige_la_charge` laisse les factures décider.**
  - Elle ne supprime plus ni les lignes d'ajustement ni les relevés. Seules les lignes
    `modele` non confirmées se refont, comme aujourd'hui, hors années soldées et hors
    mois clôturés. Une année soldée garde ses lignes telles quelles, libellé compris.
  - Les saisies d'une ligne qu'elle refait la suivent. Elle les met de côté avec toutes
    leurs colonnes (mêmes `id`, `saisi_par` et `created_at` compris : la policy qui
    pose `saisi_par = auth.uid()` ne joue pas sous le propriétaire), refait la ligne,
    puis les rattache à la ligne renée du même mois.
    Renommer Courses, ou passer son prévu de 800 € à 850 €, garde ainsi les 430 € déjà
    déclarés en octobre. Si ce mois ne renaît pas (la date de départ avance au-delà),
    ou si la charge n'est plus au fil du mois, elle refuse : « Des dépenses sont
    déclarées en octobre sur cette charge. Retire-les d'abord. »
  - Le refige des parts (0083) supprime les lignes orphelines, celles dont la charge n'a
    plus de participant arrivé. Il épargne désormais une ligne qui a des saisies.
  - Une charge mise de côté est recalée ensuite : `recale_l_annee` sur chaque année
    ouverte qui a des lignes ou des factures. Passer l'entretien de 500 € à 600 €
    déplace le prévu de l'année, et un dépassement déjà posé se corrige par un
    contre-ajustement.
  - Elle refuse de rendre mensuelle une charge mise de côté qui a des factures, ou une
    ligne `mis_de_cote` qu'elle ne referait pas (confirmée, réglée, ou dans un mois
    clôturé) : « Pour la payer chaque mois, retire-la et ajoute la nouvelle. » Un mois
    rouvert reste tout confirmé : ne regarder que les mois clôturés laissait passer
    l'Entretien d'octobre rouvert, et ses 41,67 € ne revenaient jamais. « Retirer » l'archive : ses factures et ses années soldées restent, et
    la clôture solde ses années ouvertes, archivée ou non. Sans histoire, c'est une simple correction : les
    lignes se refont.
- **`retire_charge(p_charge uuid, avec_les_saisies boolean default false)`** remplace
  l'actuelle (drop, puis create : l'ancien paquet l'appelle avec un seul argument).
  - Elle reste `security invoker`, comme aujourd'hui : la policy `depense_delete` y
    garde le confirmé. Elle prend le verrou du foyer.
  - **Elle épargne les lignes des années soldées**, avec la garde de `refige_pour` (pas
    de `releve_annuel` pour l'année de la ligne). Une année soldée ne bouge plus. Sans
    cela, retirer la copropriété effaçait ses 12 lignes de 2026 : la facture-relevé de
    1 200 € restait, l'année aussi, et plus rien ne recomptait ces 1 200 €. La taxe
    foncière perdait de même 1 450 €.
  - **Elle ne supprime que des lignes `modele`** : un ajustement reste toujours. Celui
    d'une année soldée tombe souvent sur un mois de l'année suivante, que la garde par
    année de la ligne ne protège pas : une facture complémentaire 2026 de 60 €, posée
    sur janvier 2027, partait avec un retrait du 20 janvier, et rien ne la reposait.
  - Ce que le retrait change à une année ouverte (moins de provisions pour les mêmes
    factures) se pose tout de suite, comme D77 le veut : en dernier, `retire_charge`
    appelle `recale_la_charge`. Entretien : septembre et octobre clôturés, facture de
    320 € le 10/11 (+153,32 € sur novembre), retrait le 15/11. Novembre et décembre
    perdent leur provision, Pl tombe à 83,34 €, et novembre reçoit +83,34 € de plus. En
    tout : 83,34 + 153,32 + 83,34 = 320 €. Attendre décembre faisait balayer 83,34 € de
    trop vers l'épargne à la clôture de novembre.
  - Une charge qui a des saisies sur une ligne qu'elle va supprimer (non confirmée, non
    réglée, dans un mois ouvert) n'est retirée que si l'appel le dit. Sinon, elle refuse
    avec le total : « Courses a 430 € de dépenses déclarées en octobre. » L'écran demande
    alors « Retirer Courses et ses 430 € déclarés ? », puis rappelle avec
    `avec_les_saisies`. Les saisies d'une ligne qui reste (les 800 € d'amorce de
    septembre, déjà confirmés) n'entrent pas dans ce total.
  - Une saisie, c'est de l'argent dont on a dit qu'il était sorti : 0088 garde une ligne
    pour cette raison, et une saisie ne part pas sans qu'on l'ait vue. Celles d'un mois
    clôturé restent toujours, avec leur ligne confirmée.
- **`regularise_annuel` ne fait plus que refuser**, pour une seule livraison. Elle
  garde sa signature, car l'ancien paquet que sert le service worker au premier
  chargement peut encore l'appeler (« Le relevé est arrivé ? »). Elle répond : « Le
  relevé annuel se saisit désormais facture par facture. Recharge la page. » Une
  migration du lot 3 la supprime.

  Refaire l'effet d'hier aurait refait l'erreur du 25/09 : un relevé à 0 € saisi en
  octobre solde tout de suite l'année, rend 500,04 € à octobre, et décembre ne rend
  plus rien. D77 veut l'inverse.

### 4.6 · `cloture` et `cloture_choix`

```sql
create table public.cloture (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  mois         date not null check (mois = date_trunc('month', mois)::date),
  cloture_le   timestamptz not null default now(),
  cloture_par  uuid references public.user_profile(id) on delete set null,
  constraint cloture_une_par_mois unique (household_id, mois)
);

create table public.cloture_choix (
  cloture_id        uuid not null references public.cloture(id) on delete cascade,
  household_id      uuid not null references public.household(id) on delete cascade,
  user_profile_id   uuid not null,        -- sans clé étrangère : un fait comptable
  reste_cents       integer,              -- null : la personne est partie (RGPD)
  mis_de_cote_cents integer not null default 0 check (mis_de_cote_cents >= 0),
  poche_id          uuid references public.poche_epargne(id) on delete set null,
  versement_id      uuid references public.versement_epargne(id) on delete set null,
  baisse_cents      integer not null default 0 check (baisse_cents >= 0),  -- lot 4
  primary key (cloture_id, user_profile_id)
);
```

On les lit dans son foyer. On n'y écrit que par les fonctions.

**Un versement de clôture ne se touche qu'en revenant sur le mois.** Les policies de
`versement_epargne` (0065) laissent chacun modifier ou supprimer ses versements. Un
trigger refuse au client (`current_user = 'authenticated'`) de modifier ou supprimer un
versement qu'un `cloture_choix` désigne : « Ce versement vient de la clôture d'octobre.
Reviens sur octobre pour le changer. » Sans lui, octobre afficherait 316,80 € mis de
côté pendant que l'épargne n'en aurait plus qu'1 €. `rouvre_le_mois`, qui tourne sous
son propriétaire, passe. La cascade d'une poche supprimée passe aussi : elle tourne
sous le propriétaire de la table, pas sous `authenticated`.

Supprimer toute une poche reste permis, et emporte ses versements, ceux des clôtures
compris (`poche_id` en cascade, 0054) : c'est vider la poche, un geste explicite.
`versement_id` passe alors à null. Le mois garde « dont 316,80 € mis de côté », qui dit
ce qui fut décidé ce jour-là, et « Revenir dessus » n'a plus de versement à retirer.
Aucun écran ne supprime une poche aujourd'hui ; ce chantier n'en ajoute pas.

`cloture_choix.user_profile_id` n'a pas de clé étrangère, comme
`versement_epargne.user_profile_id` (0054) : un choix de clôture est un fait comptable,
qui survit au départ de la personne. Sans clé étrangère, `rouvre_le_mois` reconnaît
encore le choix d'un membre parti, et épargne son versement : l'argent est dans la
poche, et personne ne pourrait plus le reverser.

Mais son revenu, lui, part avec le compte (`revenu` en cascade), et `reste_cents` plus la
somme de ses parts le redonnerait. `reste_cents` est donc nullable, et
`delete_my_account` le met à null sur les choix de la personne qui part. Elle garde
`versement_id` : c'est par lui que `rouvre_le_mois` épargne ce versement.

Le montant mis de côté reste, lui, dans `cloture_choix` comme dans le versement : la
poche le contient. Quand on a tout mis de côté, il redit ce qui restait. Il ne dit rien
de plus que les versements d'aujourd'hui, qui survivent déjà au départ (0054), et il
n'est plus rattaché qu'à un identifiant sans compte.

`saisie`, `facture`, `cloture` et `cloture_choix` portent toutes `household_id`.
`export_my_data` les rend, et `rgpd.test.ts` les retrouve par `tables_de_foyer()`. Sans
cette colonne, `cloture_choix` échapperait au test, et donc à l'export.

---

## 5 · La migration des données de prod

État vérifié le 1er octobre 2026 (lecture seule) :

- **Le foyer.** Un seul membre, un compte actif (« Kamil CA », perso), et un revenu de
  4 325 €.
- **Octobre.** 22 lignes, pour 3 898,20 €.
- **Les enveloppes.** Courses (plafond 300 €, rattachée à la charge Courses à 800 €),
  Restaurants 400 € et Sorties et culture 100 €, toutes deux rattachées. Sans charge :
  Droguerie et hygiène 60 €, Coiffeur et soins 30 €, Pharmacie 20 €, Essence ou
  recharge 160 €.
- **Les relevés 2026.** Taxe foncière 1 450 € (écart +0,04, posé sur septembre) et
  Copropriété 1 200 € (écart 0), saisis par Kamil le 25/09. Celui de l'Entretien Auto a
  été annulé le 01/10 (voir plus bas).
- **Les lignes confirmées.** Trois, toutes en septembre et à leur prévu : Courses
  800 €, Restaurants 400 € et Sorties et culture 100 €.

La migration, dans une seule transaction :

1. **Le schéma.**
   - On crée les colonnes, les tables, les fonctions et les triggers du § 4, sauf la
     contrainte `charge_mode_periodicite`. Elle est posée à la fin de l'étape 2 : avant,
     les trois charges annuelles vaudraient encore `fixe`, et l'`alter` échouerait.
   - On supprime l'index `depense_regularisation_unique` et les policies d'écriture de
     `releve_annuel`.
   - `regularise_annuel` ne fait plus que refuser (§ 4.5).
2. **`mode`.**
   - `mis_de_cote` si `periodicite <> 'mensuel'` ;
   - sinon `au_fil` si `enveloppe_id` est renseigné ;
   - sinon `facture` si `variable` ;
   - sinon `fixe`.

   Puis deux règles par mots-clés :
   - `au_fil` pour les charges mensuelles fixes dont le libellé commence par essence,
     carburant, péage(s), parking ou stationnement (ici Essence et Péage) ;
   - `facture` pour les charges mensuelles fixes issues des articles « Électricité » ou
     « Gaz » du catalogue (ici Électricité).

   Enfin, chaque ligne `modele` existante reçoit `depense.facon` = le `mode` de sa
   charge, tous mois confondus. Les ajustements gardent `facon` à null. C'est juste
   pour une ligne ni réglée ni confirmée : `corrige_la_charge` (0067) refait toujours
   ces lignes-là avec la charge. Une ligne réglée ou confirmée garde la façon de sa
   naissance, que rien n'a gardée : l'assurance à 100 € par mois confirmée en
   septembre, passée ensuite à 1 200 € par an, recevrait `mis_de_cote`, et décembre
   rendrait 100 € déjà payés. La migration **s'arrête donc** si une ligne `modele`
   réglée ou confirmée appartient à une charge non mensuelle. En prod, le 01/10 : 0
   ligne sur 36 (les 3 lignes confirmées sont mensuelles).
3. **`categorie`.** Elle suit la section du catalogue :

   | Section | Catégorie |
   |---|---|
   | Logement | maison |
   | Vie courante | vie_courante |
   | Auto | auto |
   | Crédits | credits |
   | Abonnements | abonnements |
   | Santé | sante |
   | Impôts | impots |

   Une exception : l'article « Crédit immobilier — résidence » va en `maison`.

   Sans article du catalogue, une charge reçoit `auto` si son libellé contient auto,
   voiture, essence, carburant, péage, parking, stationnement, garage ou LOA. Sinon,
   elle reçoit `autre`. Ici, Crédit auto ou LOA, Entretien Auto, Essence et Péage
   passent en `auto`.
4. **Les enveloppes sans charge deviennent des charges**, sauf quand une charge active
   du foyer a un libellé contenu dans celui de l'enveloppe, ou l'inverse, sans tenir
   compte de la casse. Ici, Essence ⊂ Essence ou recharge.
   - Chaque nouvelle charge prend :
     - le libellé de l'enveloppe, et `montant_cents` = son plafond ;
     - `mode = 'au_fil'`, `periodicite = 'mensuel'`, `debut` = 1er octobre 2026 ;
     - la catégorie de l'article du catalogue de même nom, et `commun = (portee =
       'commun')` : le catalogue n'a pas de colonne `commun`. Sans article : `vie_courante`,
       commun ;
     - `compte_id` : le compte des autres charges du foyer, s'il n'y en a qu'un (ici
       « Kamil CA »), sinon aucun. Sans compte, `virements()` afficherait « 110 € à
       répartir » à un foyer d'une personne ;
     - `catalogue_id` sur cet article ;
     - pour participants, tous les membres si elle est commune, sinon le titulaire du
       seul compte perso (sinon tous).
   - Les enveloppes ne sont pas supprimées. La charge Courses garde 800 € : son plafond
     de 300 € ne se lit plus nulle part.
   - Les lignes d'octobre de ces charges naissent à la prochaine ouverture du mois.
     `ouvre_le_mois` est idempotente et ajoute les lignes manquantes. La migration n'en
     écrit pas : elle tourne sans `auth.uid()`, et `ouvre_la_charge` n'y ouvre rien.
5. **La nature des lignes mensuelles non confirmées et non réglées**, d'octobre et
   après, suit le nouveau `mode` : `estimee` pour une facture du mois ou une ligne au fil
   du mois, `connue` pour une ligne fixe. Ici, Électricité, Essence et Péage passent en
   `estimee`. On ne touche ni aux mois passés, ni aux lignes mises de côté.
6. **Chaque `releve_annuel` devient une `facture`** (`origine = 'releve'`,
   `montant_cents = reel_cents`, `paye_le = saisi_le::date`, même année). Le relevé
   reste, pour marquer l'année soldée.
   - Il reçoit `prevu_cents = reel_cents − ecart_cents`, le prévu qu'il avait mesuré :
     1 449,96 € pour la taxe foncière, 1 200 € pour la copropriété.
   - La migration s'arrête (exception) sur un relevé à 0 € sans `saisi_par` : c'est la
     trace que 0078 a posée pour les régularisations d'avant, qui ne dit pas ce qui a été
     payé. Un relevé positif sans `saisi_par` est celui d'un membre parti (RGPD) : il
     devient une facture sans `saisi_par`. Elle s'arrête aussi sur un `reel_cents`
     négatif, qu'une facture refuse.
   - En prod, les deux relevés restants passent : Kamil les a saisis.
7. **Les saisies d'amorce.** Pour chaque ligne `modele` confirmée d'une charge `au_fil`,
   dans un mois non clôturé, et d'un montant non nul, la migration pose une saisie de
   ce montant. Elle est datée du dernier jour du mois, sans `saisi_par`. Ici : Courses
   800 €, Restaurants 400 € et Sorties et culture 100 €, au 30 septembre. Sans elles, la
   clôture de septembre dirait « Rien de déclaré », et un ticket oublié de 20 €
   remplacerait les 800 € confirmés.

**Résultat attendu en octobre, après la première ouverture du mois** (celle que
déclenche `useMois` à l'écran, et que le test de migration joue explicitement) :

- 25 lignes pour 4 008,20 € ;
- il reste 316,80 € ;
- Commun : 1 678,53 €, Moi : 2 329,67 €.

Septembre est inchangé (3 898,24 €). Un test de migration, joué sur une copie de ces
données dans la base locale, vérifie ces chiffres.

**Annulé le 01/10/2026, avec l'accord de Kamil :** l'Entretien Auto 2026 avait été
« relevé » à 0 €, et septembre lui avait rendu 500,04 €. Il pensait répondre pour
**septembre** : il ne savait pas que la saisie soldait **toute l'année**. Le relevé, sa
ligne de septembre et sa part ont été supprimés en prod, et les douze lignes 2026 ont
retrouvé la nature `estimee` de leur naissance. Septembre est passé de 3 398,20 € à
3 898,24 € (23 lignes). L'année 2026 de l'Entretien est donc ouverte : elle se soldera à
la clôture de décembre (D77). Il ne reste que deux relevés, Taxe foncière et copro.

---

## 6 · Le front

### 6.1 · Les jetons visuels (direction A)

Ceux de `src/index.css` restent : fond, surface, encre, doux, herbe, safran, ocre,
brume, groseille. On en ajoute deux :

- `--color-piste: #E4E9E1` : le fond des jauges et des filtres ;
- `--color-sable: #F6EAD2` : le fond du bandeau.

**Les couleurs de catégorie.** La première vaut sur fond clair, la seconde dans la
carte encre.

| Catégorie | Sur fond clair | Dans la carte encre |
|---|---|---|
| vie_courante | #E8A33D | #E8A33D |
| maison | #2F5D45 | #86C29F |
| credits | #7A68C9 | #B9ADF2 |
| auto | #3B82C4 | #86BFEF |
| abonnements | #D9694A | #F2A88D |
| sante | #B5527A | #E59BB8 |
| impots | #8B7355 | #C9B48F |
| autre | #7D8A93 | #B4BEC5 |

La couleur n'est jamais seule : la légende et les cartes portent le nom.

**Les formes.**

- **Rayons :** 28 pour la carte encre, 22 pour les cartes, 18 pour les champs et le
  grand bouton, 999 pour les pastilles.
- **Ombre des cartes :** `0 1px 2px rgba(28,43,35,.06), 0 8px 24px rgba(28,43,35,.07)`.
- **Polices :**
  - Fraunces (`opsz` 144) pour les chiffres et les titres ;
  - Instrument Sans pour le texte ;
  - les chiffres en `tabular-nums`.
- **Cibles tactiles :** 44 px au moins.

**Les photos.** Elles vivent dans `public/budget/<categorie>.jpg` et
`public/budget/epargne.jpg` : photos CC0 de StockSnap, 800 px de large, entre 40 et
130 Ko. On en choisit trois de plus pour sante, impots et autre. Leurs sources vont dans
`public/budget/SOURCES.md`. Le service worker les précache.

### 6.2 · Les fichiers

- **`src/lib/budget/mois.ts`** (nouveau, **pur**, testé à l'unité) — les calculs de
  l'écran :
  - `facon(ligne)`, qui lit `depense.facon` (la façon de la charge ne sert qu'à Mes
    charges), et le montant compté de chaque ligne pour moi (§ 3.1.1) ;
  - le regroupement par catégorie, le filtre, les pourcentages au plus fort reste ;
  - le reste, et les montants à dire ;
  - le revenu du mois ;
  - les dates courtes françaises (« Sam. 3 oct. »).

  Aucun appel réseau.
- **`src/lib/donnees/budget.ts`** :
  - `Charge` gagne `mode` et `categorie`, et `useCharges` les lit ; `useMois` lit
    `facon` dans son `select` (`budget.ts:111`) ;
  - les crochets nouveaux : `useSaisies(mois)`, `useAjouteSaisie`, `useRetireSaisie`,
    `useFactures(chargeId, annee)`, `usePaieFacture`, `useRetireFacture`,
    `useCloture(mois)`, `useClotureLeMois`, `useRouvreLeMois`, `useApercuDesSoldes(mois)`,
    `useCorrigeLeReleve` ;
  - on retire `useRegulariseAnnuel`, `useEnveloppes`, `usePoseEnveloppe`,
    `useEnveloppesPosees`, `useSuggestionsEnveloppe`, `useRangeEnveloppe` et
    `useProvisionsDe` ; `useRattacheCharge` ne garde que `compte_id`, que `virements()`
    lira au lot 4 ;
  - `useEtatDeLAnnee(chargeId, annee)` ; « Retirer » n'a rien à recaler lui-même,
    `retire_charge` le fait ;
  - `useRevenus` rend tout l'historique, et `mois.ts` prend le revenu en vigueur à la
    fin du mois affiché, comme la base. Ne garder que le dernier faisait afficher
    décembre « sur 4 500 € » si le revenu changeait en janvier ;
  - chaque mutation invalide `budget-mois`, `saisies`, `factures`, `cloture`,
    `etat-de-l-annee` et `apercu-des-soldes` : sinon la feuille restée ouverte après une
    facture de 320 € annonçait « Il restera 66,68 € de côté » pour 100 €, quand la base
    pose +100 €. Le
    nouvel écran ne lit plus `excedent_du_mois` : la fonction reste pour l'ancien
    paquet, et le lot 4 dira s'il la garde.
- **`src/ui/budget/`** (nouveau) : `Recap`, `Gestes`, `CarteEpargne`, `Filtre`,
  `Bandeau`, `Categorie`, `Ligne`, `Feuille` (le `<dialog>` commun),
  `FeuilleDeclarer`, `FeuilleFactureMois`, `FeuilleMiseDeCote`, `Jauge`.
- **`src/pages/Budget.tsx`** est réécrit avec ces composants. Les commentaires d'histoire
  qui valent encore (le mois futur jamais ouvert, la porte des charges toujours
  visible, la règle du revenu manquant) suivent leur code.
- **`src/pages/Cloture.tsx`** est nouveau. Dans **`src/App.tsx`**, la route
  `/^\/cloture\/(\d{4})-(\d{2})$/` arrive avant le `switch`, comme `/invite/`.
- **`src/pages/Hub.tsx`** : la carte Budget (§ 3.6).
- **`src/pages/Charges.tsx`** : les deux choix du § 3.7, et le retrait des enveloppes.
- **`src/pages/BudgetReglages.tsx`** : le retrait de la section enveloppes.
- **`src/lib/base.types.ts`** est régénéré.

---

## 7 · Les cas limites

| Cas | Comportement |
|---|---|
| Saisie sur un mois clôturé | refusée par la base ; la feuille propose « Revenir dessus » |
| Une dépense le dernier jour du mois | le mois en cours ne se clôture jamais : elle passe, et compte dans son mois |
| Facture datée de l'année précédente déjà soldée | elle s'ajoute entièrement au mois en cours (`cible = B − Pl`) |
| La charge mise de côté change de montant en cours d'année | `corrige_la_charge` recale tout de suite ses années ouvertes : un dépassement déjà posé se corrige par un contre-ajustement |
| Deux factures saisies en même temps | sérialisées par le verrou du foyer ; le second recalage voit le premier |
| Clôture deux fois | refusée (contrainte unique, puis verrou consultatif) |
| Ce qui reste est négatif | « Il te manque X € » ; mettre de côté est grisé ; la clôture passe quand même |
| Montant à mettre de côté ramené à 0 par la base | aucun versement, `mis_de_cote_cents = 0` ; la clôture passe |
| Ligne au fil du mois sans saisie et sans réponse | elle garde son prévu |
| Ligne de septembre confirmée avant la refonte | la migration lui pose une saisie de son montant : la clôture la retrouve, et un ticket oublié s'y ajoute |
| Reclôture après « Revenir dessus » | même calcul que la première fois : une saisie retirée rend le prévu, une bascule défaite aussi |
| Charge retirée (« Retirer », 0088) avec des saisies dans un mois ouvert | l'écran demande d'abord « Retirer Courses et ses 430 € déclarés ? » ; oui : les saisies partent avec les lignes non confirmées (cascade, que la garde laisse passer) ; un mois clôturé garde toujours sa ligne confirmée et ses saisies, et la charge s'archive |
| Charge au fil du mois renommée, ou dont le prévu change, avec des saisies | les saisies suivent la ligne refaite : 430 € déclarés restent 430 € |
| Mois d'avant Popote (aucun revenu, pas clôturé) | ses provisions ne comptent pas dans le prévu : l'Entretien 2026 compte 166,68 €, de septembre à décembre ; une année sans mois suivi se solde à 0 sans rien rendre ; une facture d'un mois non suivi est refusée (« Popote ne suivait pas encore mars 2026 ») |
| Clôturer janvier 2027 avant décembre 2026 | 2026 se solde pour de bon, et ce qu'elle rend tombe en janvier ; décembre, clôturé ensuite, ne le rend pas une seconde fois |
| Charge mensuelle passée en mise de côté en cours d'année | ses lignes fixes, déjà payées, ne comptent pas dans le prévu (`facon = 'mis_de_cote'` seulement) |
| Déclarer le 1er du mois, ou sur un mois passé | les dates proposées tombent toujours dans le mois affiché |
| Compte ou foyer supprimé, avec des saisies dans un mois clôturé | la cascade et la mise à null de `saisi_par` passent : la garde ne juge pas ce que mène une clé étrangère |
| Double toucher sur « Ajouter », ou nouvel envoi après une coupure | même `id` fourni par l'appareil : aucun doublon, ni de saisie ni de facture |
| Saisie, facture ou validation pendant une clôture du foyer | elle attend la fin de la clôture (verrou du foyer), puis la voit : une saisie sur le mois clôturé est refusée ; l'ajustement d'une facture tombe sur le mois en cours |
| Correction d'une charge (`corrige_la_charge`) après une clôture | les mois clôturés n'ont que des lignes confirmées : elle ne les refait pas, et n'y fait naître aucune ligne |
| Nouvelle charge, ou date de départ reculée, sur un mois clôturé | aucune ligne n'y naît, et le mois garde ses chiffres ; « Revenir dessus », puis reclôturer, l'y fait entrer |
| Une charge mise de côté devient mensuelle | refusé si elle a des factures, ou une ligne confirmée, réglée ou dans un mois clôturé (rouvert compris) : on la retire (ses factures et ses années soldées restent, une année ouverte se solde à la clôture) et on ajoute la nouvelle |
| Une garde refuse le solde d'une année à la clôture | l'année reste ouverte, la clôture passe, la page le dit ; la clôture suivante réessaie |
| Le relevé de copropriété, 1 200 € pour toute l'année | il s'affiche « Relevé 2026 — total de l'année », et la carte dit « 2026 est soldée. » : un appel du trimestre saisi ensuite s'ajouterait en entier, et l'aperçu le dit avant |
| Corriger un relevé (taxe foncière 1 450 € → 1 460 €) | l'année reste soldée, son prévu figé ne bouge pas : +10 € sur le mois en cours ; « Retirer » n'est pas proposé, et la base le refuse |
| Mois de janvier à août 2026 (provisions rattrapées, pas de revenu) | pas de bandeau, et pas de clôture (« Ajoute ton revenu d'août pour clôturer août ») ; ouverts à la main, ils affichent « Ajoute ton revenu… » |
| Revenu posé après la clôture | `reste_cents` reste celui du jour de la clôture ; rouvrir puis reclôturer le recalcule |
| L'ancien paquet (service worker) au premier chargement | lecture : fonctionne ; « Le relevé est arrivé ? » : refusé (« Recharge la page ») ; une charge créée par l'ancien « Mes charges » reçoit sa façon et sa catégorie par trigger (§ 4.1) ; confirmer une ligne au fil du mois est refusé (« Recharge la page ») ; « Marquer ce mois comme réglé » sur un mois clôturé est refusé par le gel, avec la même phrase ; le chargement suivant sert le nouveau paquet |
| Charge retirée qui a des factures | archivée, jamais supprimée (`restrict`) ; les lignes de ses années soldées et tous ses ajustements restent (la copro garde ses 1 200 € de 2026) ; dans une année ouverte, ses provisions non confirmées partent, et le recalage pose la différence tout de suite (Entretien : 83,34 + 153,32 + 83,34 = 320 €) |
| La facture d'une charge déjà retirée | Mes charges, « Retirées, encore à régler », ouvre sa feuille jusqu'au 31 décembre de l'année qui suit le retrait ; une facture de l'année suivante s'ajoute en entier |
| Clôturer un mois juste après la migration, sans avoir ouvert `/budget` | la clôture ouvre d'abord le mois, sans refaire les parts des lignes existantes : octobre a ses 25 lignes |
| Renvoi d'une saisie déjà enregistrée, arrivé après la clôture | `23505` avant le refus « mois clôturé » : succès sans effet |
| Charge passée d'une façon à une autre avec une ligne déjà confirmée dans un mois ouvert | la ligne garde sa façon (`depense.facon`) : la clôture la traite comme elle est née |
| Facture qui attend le verrou pendant que minuit passe | le mois cible se calcule après le verrou, sur `clock_timestamp()` : l'ajustement tombe sur le mois qui vient de commencer |
| Un membre supprime son compte après une clôture | son choix de clôture reste ; « Revenir dessus » garde son versement, l'argent restant dans la poche, et son choix disparaît avec la clôture |

---

## 8 · Les tests

Les habitudes du dépôt s'appliquent :

- les tests de base tournent contre Supabase local (`tests/*.test.ts`), et l'e2e sous
  Playwright (`e2e/*.spec.ts`) ;
- chaque garde importante passe une **mutation** : on réintroduit le défaut et on
  vérifie que le test passe au rouge ;
- les revues adverses tournent sans demander, jusqu'à ce qu'elles convergent.

### À l'unité (`mois.test.ts`)

- le montant compté au fil du mois : max(prévu, déclaré) ;
- à deux : « Il te reste » ne compte que mes parts, alors que « Tout » montre aussi les
  lignes perso de l'autre ;
- la somme des pourcentages fait 100 ;
- le tri des catégories, et l'ordre de repli quand les montants sont égaux ;
- le reste négatif, et le revenu absent ;
- le compte des montants à dire ;
- le récap de la clôture : X + Y fait le chiffre, avec un dépassement et une économie
  dans le même mois ;
- un mois rouvert revient au calcul d'un mois ouvert ;
- les dates courtes.

### En base

- **`saisie`** :
  - isolation entre foyers voisins ;
  - refus sur une ligne dont la façon n'est pas `au_fil`, y compris quand sa charge,
    elle, l'est devenue ;
  - refus sans ligne du mois ;
  - refus sur un mois clôturé, à l'insertion, à la modification et à la suppression ;
  - une suppression ordinaire passe vraiment : la saisie disparaît ;
  - `saisi_par` forcé ;
  - un second envoi du même `id` ne crée rien, même après la clôture du mois ;
  - `corrige_la_charge` rattache les saisies de l'autre membre avec leur auteur et leur
    `created_at` ;
  - « Retirer » supprime les saisies des mois non clôturés, et garde les autres, y
    compris sur une charge au fil du mois sans aucune ligne confirmée ;
  - `delete_my_account`, et le départ du dernier membre du foyer, passent avec des
    saisies dans un mois clôturé, avec une facture, et avec un compte perso (actif et
    archivé, comme en prod) ;
  - une saisie lancée pendant une clôture du même mois attend, puis est refusée, y
    compris quand c'est le trigger d'une autre table qui l'écrit ;
  - un montant négatif ou nul est refusé ;
  - mettre `saisi_par` à null est refusé tant que son compte existe.
- **`paie_une_facture` et `retire_une_facture`** :
  - sous le prévu : aucune ligne ;
  - au-dessus : la ligne de dépassement ;
  - une seconde facture : le seul delta ;
  - les lignes du tableau du § 4.4, sur les données de prod reproduites ;
  - le retrait pose un contre-ajustement ;
  - deux appels parallèles donnent le bon total, et une seule ligne par delta ;
  - le retrait d'une facture d'origine `releve` est refusé ; `corrige_le_releve` à
    1 460 € pose +10 € et laisse `prevu_cents` à 1 449,96 € ;
  - un second appel avec le même `la_facture` ne crée rien ;
  - une facture payée pendant la clôture du mois précédent : son ajustement attend, puis
    tombe sur le mois en cours ;
  - `regularise_annuel` refuse tout, avec « Recharge la page », et n'écrit rien ;
  - une charge qui a des factures ne se supprime pas : « Retirer » l'archive. Entretien,
    septembre et octobre clôturés, facture de 320 € le 10/11, retrait le 15/11 : le
    retrait pose +83,34 € sur novembre tout de suite, la clôture de décembre ne pose
    rien, et l'année compte 320 € en tout ;
  - ouvrir l'écran de clôture ne pose aucun ajustement (ni recalage ni solde) ; il
    ouvre le mois comme `/budget`, et montre les 25 lignes que la clôture confirmera ;
  - à deux, un membre parti le 03/11 : clôturer octobre le 05/11 garde les parts
    d'octobre (839,27 € de communes pour Kamil, et non 1 678,53 €) ;
  - le premier revenu d'un foyer recale l'année : 320 € payés le 10/03 sans revenu,
    puis le revenu du 15/03 pose −320 € sur mars ; changer ce revenu ne pose rien ;
  - « Fixe » est refusé pour l'Entretien d'octobre clôturé puis rouvert ;
  - « Retirer » le 20/01/2027 garde l'ajustement « — solde 2026 » de 60 € posé sur
    janvier 2027 ;
  - Pl ne compte que les lignes `mis_de_cote` des mois suivis : l'assurance à 100 € par
    mois, clôturée en septembre et en octobre puis passée à 1 200 € par an, a un Pl de
    200 € ; une ligne sans part n'y compte pas.
- **`confirme_la_depense`** : elle refuse une ligne au fil du mois, et valide toujours
  une facture du mois. Un montant négatif ou au-delà de 1 000 000 € est refusé, par la
  feuille comme à la clôture.
- **Le trigger de `charge`** : l'ancien paquet qui crée une charge mensuelle variable
  obtient `facture`, avec une enveloppe `au_fil` ; `corrige_la_charge` qui passe des
  Courses en fixe les y laisse.
- **`solde_l_annee`** : rendu du non-dépensé, idempotence, matérialisation des mois, et
  aucun mois clôturé matérialisé.
- **`corrige_la_charge`** :
  - renommer une charge mise de côté ne touche ni ses factures, ni ses ajustements, ni
    son relevé ;
  - changer son montant recale l'année ouverte, et laisse une année soldée telle
    quelle ;
  - la rendre mensuelle est refusé avec des factures, et accepté sans histoire ;
  - l'ancien paquet l'appelle encore avec cinq arguments ;
  - reculer la date de départ ne fait naître aucune ligne dans un mois clôturé.
- **Un mois clôturé ne gagne pas de ligne** : ni par `ouvre_le_mois`, ni par
  `ouvre_la_charge`, ni par `rattrape_les_mois`, ni par l'ajout rétroactif d'une charge ;
  et `provisions_a_venir` ne le compte pas.
- **`cloture_le_mois`** :
  - facture validée telle quelle, ou modifiée, y compris une ligne déjà validée par sa
    feuille ;
  - Σ saisies ; « Rien dépensé » à 0 ; sans réponse, le prévu ;
  - reclôture : une saisie retirée rend le prévu, une bascule défaite aussi ;
  - décembre solde l'année, **dans** décembre, même clôturé en janvier ; une année
    antérieure ouverte est soldée dans le mois clôturé ; une charge archivée aussi ;
  - une garde de solde qui refuse : l'année reste ouverte, la clôture passe, et
    `non_soldees` la nomme ;
  - après clôture, toutes les lignes du mois sont confirmées, y compris l'ajustement
    que le solde de décembre vient de poser ;
  - une facture du mois sans part, comme une ligne au fil du mois sans part, ne fait
    pas échouer la clôture ;
  - versement `balayage` créé ;
  - montant > reste ramené au reste ; ramené à 0, aucun versement, et la clôture passe ;
  - refus du mois en cours, même le dernier jour ;
  - refus d'une seconde clôture ;
  - `reste_cents` exact au centime.
- **`rouvre_le_mois`** : le versement disparaît, les lignes restent confirmées, et la
  saisie redevient possible ; après le départ d'un membre, son versement reste dans la
  poche, et son choix disparaît.
  Avant, le client ne peut ni modifier ni supprimer ce versement ; supprimer sa poche
  l'emporte quand même, et `versement_id` passe à null.
- **Une ligne sans part** reçoit `confirme_le` à la clôture, et ne se supprime plus.
- **Les saisies face aux corrections** :
  - renommer une charge au fil du mois, ou changer son prévu : Σ saisies inchangée au
    centime ;
  - avancer sa date de départ au-delà d'un mois qui a des saisies, ou la passer en fixe :
    refusé ;
  - `retire_charge` sans `avec_les_saisies` refuse avec le total, et retire avec ;
  - le refige épargne une ligne orpheline qui a des saisies.
- **Le gel d'un mois clôturé** : une écriture directe du client sur `depense` ou
  `depense_part` est refusée ; `repartit_les_lignes` et les refiges n'y touchent pas ;
  une saisie écrite par le trigger d'une autre table ne passe pas la garde.
- **Les interblocages** : trois cas passent sans `deadlock detected`. Les deux premiers
  ont été reproduits le 01/10 :
  - un membre qui rejoint le foyer pendant une facture ;
  - une saisie supprimée pendant une correction qui cascade sur elle ;
  - un membre qui rejoint le foyer pendant le retrait d'une charge commune.
- **Les ajustements** : sans provision à suivre, un ajustement a toujours des parts.
- **Les années sans mois suivi** : soldées à 0, sans ligne ; une date de départ
  avant le 1er janvier de l'année précédente est refusée, à l'insertion comme à la
  correction.
- **Les dates** : une facture payée « aujourd'hui » à 0 h 30, heure de Paris, passe.
- **Retirer une charge mise de côté** : sur les données de prod reproduites, retirer la
  copropriété laisse 1 200 € en 2026, et la taxe foncière 1 450 € ; le refus de
  `retire_charge` ne compte que les saisies qui partiraient, pas l'amorce confirmée de
  septembre.
- **Les mois suivis** : une facture d'un mois non suivi est refusée, sauf le mois en
  cours ; l'Entretien 2026 a un Pl de 166,68 €, et les cinq lignes du tableau du § 4.4
  donnent leurs chiffres ; une année marquée soldée à 0 ne rend rien au recalage suivant
  (`prevu_cents` figé) ; une année soldée ne bouge plus que de ses nouvelles factures ;
  un mois sans revenu ne se clôture pas, avec une phrase en français ; clôturer janvier
  2027 avant décembre 2026 solde 2026 pour de bon (l'Entretien sans facture rend
  166,68 € en janvier 2027), et clôturer décembre 2026 ensuite ne le rend pas une
  seconde fois.
- **`apercu_des_soldes`** : il rend ce que la clôture pose ensuite, au centime, en
  décembre et en janvier quand l'année d'avant est ouverte ; « tout ce qui reste »
  (`mis_de_cote_cents` à null) met de côté exactement `reste_cents`.
- **La façon de la ligne** : changer la façon d'une charge ne change pas la clôture
  d'une ligne déjà confirmée d'un mois ouvert (Courses à 820 € déclarés, Électricité
  validée à 62 €) ; un `update` direct d'une colonne d'argent par le client (`mode`,
  `periodicite`, `montant_cents`…) est refusé, et celui de `enveloppe_id` par l'ancien
  paquet passe ; changer `depense.facon` en direct est refusé ; toute ligne `modele` naît
  avec sa façon.
- **Les interblocages, encore** : un compte supprimé pendant un « Revenir dessus » ne
  s'interbloque pas.
- **Les droits** : ni `anon` ni `authenticated` n'appellent `confirme_la_ligne`, `cible_de`,
  `recale_l_annee` ou `solde_l_annee` ; `retire_charge`, invoker, appelle bien
  `recale_la_charge` sous `authenticated` ; chaque garde qui regarde `current_user` refuse
  bien un appel direct du client, dont un `update charge set montant_cents` direct ;
- **Le verrou** : l'arrivée d'un membre par la clé de service verrouille bien son foyer ;
  un compte supprimé pendant une ouverture du mois ne s'interbloque pas ; une facture qui
  obtient le verrou après minuit, le 1er, pose son ajustement sur le nouveau mois.
- **RGPD** : `delete_my_account` met à null le `reste_cents` des choix de la personne
  qui part.
- **RGPD** : `export_my_data` rend `saisie`, `facture`, `cloture` et `cloture_choix`, et
  `rgpd.test.ts` les voit par leur `household_id`.
- **La migration** : les § 5.1 à 5.7 sur une copie des données de prod, et les chiffres
  attendus du § 5 ; les saisies d'amorce de septembre ; l'arrêt sur un relevé à 0 € sans
  `saisi_par`, le passage d'un relevé de 1 450 € sans `saisi_par` (une facture sans
  auteur), l'arrêt sur un `reel_cents` négatif ; le compte et la portée des trois
  nouvelles charges.
- **La clôture qui ouvre le mois** : clôturer octobre juste après la migration donne 25
  lignes et 316,80 € de reste ; un participant retiré juste avant n'a plus de part.
- **`archive_le`** : l'archiver en direct, avec une ligne que « Retirer » aurait
  supprimée, est refusé ; `retire_charge` passe.
- **`etat_de_l_annee`** : pour l'Entretien 2026, Pl = 166,68 € et le premier mois suivi
  est septembre ; l'aperçu d'une facture de 320 € annonce les +153,32 € que la base pose.
- **Les années soldées des anciens tests.** Les 31 appels à `regularise_annuel` de
  `tests/charges.test.ts`, qui servaient à fabriquer des années soldées, passent par une
  clôture de décembre, ou par un `insert` administrateur dans `releve_annuel` avec
  `prevu_cents`. Les gardes « une année soldée ne gagne plus de mois » gardent leur banc.
- **L'heure des tests.** Les fonctions lisent l'heure par `public.maintenant()`, qui rend
  `clock_timestamp()`, ou le réglage `popote.maintenant` s'il est posé. Seule une
  connexion directe peut le poser : les tests de base, et l'e2e de la clôture par
  `alter database … set popote.maintenant` sur la base locale, retiré après le banc.
  Ce réglage ne vaut que pour les connexions qui s'ouvrent après lui : le banc ferme
  donc celles de PostgREST (`pg_terminate_backend`), qui les rouvre, après chaque
  changement d'heure. `page.clock` seul ne change que l'heure du navigateur.

### E2E

- **L'écran du mois.** Il s'affiche avec un foyer d'amorce : récap, catégories triées,
  filtre, et aucun « À verser ».
- **Les gestes.**
  - Déclarer : deux montants s'additionnent, la jauge et le reste suivent.
  - Facture du mois : « C'est ça », et aucune trace sur l'écran du mois (D79).
  - Facture mise de côté : l'aperçu, puis la ligne d'ajustement dans le mois.
- **La clôture.**
  - On joue un 1er novembre, et un 27 octobre pour le rappel : `page.clock` pour le
    navigateur, `popote.maintenant` pour la base.
  - Le parcours complet : les trois étapes, l'épargne augmente, et le mois s'affiche
    clôturé.
  - On revient dessus : l'épargne revient à son niveau.
  - Le bandeau du mois précédent non clôturé.
- **Le hub et le partage.**
  - La carte Budget du hub, dans ses trois états.
  - D80 : un second membre voit toutes les lignes, mais son « Il te reste » ne compte
    que ses parts.
- Les captures (`e2e/captures.spec.ts`) gagnent le mois, les trois feuilles et la
  clôture, à 390 px.

---

## 9 · Les lots

Chaque lot se livre seul, tests verts et déployé, sauf les lots 1 et 2, qui partent
ensemble : sans le lot 2, rien à l'écran ne saurait déclarer une dépense ni payer une
facture, et les nouvelles lignes (Droguerie, Coiffeur, Pharmacie) ne serviraient à
rien. L'ancien paquet du premier chargement reçoit « Recharge la page » quand il
appelle ce qui n'existe plus.

1. **Le modèle.**
   - Les colonnes, les tables, les fonctions, les triggers et les policies.
   - La migration des données du § 5.
   - Les tests de base.
2. **L'écran du mois.**
   - Le § 3.1, les feuilles des § 3.2 à 3.4, la carte du hub, Mes charges, Revenus et
     comptes.
   - Les photos.
   - `mois.ts`, et les tests à l'unité et e2e.
3. **La clôture.**
   - Le § 3.5, les bandeaux, et le solde de décembre.
   - Les tests.
4. **À deux**, quand Thauba aura rejoint le foyer :
   - « À verser » dans le nouvel écran ;
   - le choix de chacun à la clôture, avec « Baisser mon prochain virement », que
     `virements()` du mois suivant déduit ;
   - « Moi » en parts.

   Ce lot aura sa propre spec. Deux points l'attendent : « Revenir dessus » ne refait
   pas les parts d'un mois, car le gel a tout confirmé et les refiges épargnent le
   confirmé (un revenu saisi après la clôture laisse le mois figé à son partage) ; et le
   choix de clôture d'un membre parti disparaît quand on rouvre le mois, son versement
   restant dans la poche.

## 10 · Hors champ

- l'agrégation bancaire et les tickets de caisse transformés en saisies (D67) ;
- une notification, le 27 ou le 1er ;
- la suppression des tables et colonnes d'enveloppe ;
- le doublon « Mensualité de prêt » / « Crédit immobilier — résidence » du catalogue ;
- la refonte de l'écran des recettes, qui est le chantier suivant ;
- les avoirs : une régularisation EDF créditrice de 50 €, un dégrèvement de taxe
  foncière. Aucun montant négatif ne se saisit ; on saisit 0, et le mois compte 50 € de
  trop, jamais de trop peu.
