# Doutes — budget, vivre un mois (relu contre 15b4fbf)

Une ligne par doute encore ouvert : page, phrase, ce qui n'a pas pu être confirmé. Les doutes de la première rédaction
(8b43c99) sur le repartage d'un mois ouvert, « Mise de côté » imposée aux charges non mensuelles, le revenu posé après la
clôture, le retrait d'une dépense de l'autre, l'ordre des mois et l'arrondi de la mise de côté ont été tranchés par le code
et rejoués en local ; les pages en portent le résultat.

- budget-mois-clos : un mois ROUVERT peut gagner de nouvelles lignes (une charge ajoutée depuis, sans date de confirmation) ;
  leur partage se refait comme celui d'un mois ouvert, alors que les lignes déjà confirmées ne bougent pas. Non écrit : cas rare, non rejoué.
- budget-cloture : les « soldes d'année » sont décrits par leurs phrases affichées ; la règle de choix des années
  (`annees_a_solder` : années passées, ou l'année en cours à la clôture de décembre) a été relue, mais pas le calcul
  de `solde_l_annee` : aucun chiffre n'est donné.
- budget-cloture : « Il te reste, avant les soldes d'année » (à deux, quand une année est soldée) est décrit par le code de l'écran ; la part exacte vient de la base et n'a pas été rejouée à deux.
- budget-cloture-quand / budget-ecran-du-mois : « à partir du 1er du mois suivant » et le jour du rappel (27) se comptent
  en heure de Paris (`jourDeParis`, `mois_courant`) ; rejoué en heure réelle seulement (le 23/10), pas autour de minuit ni du changement d'heure.
- budget-hub : « Commence en novembre » n'affiche que le nom du mois ; une arrivée dans plus de douze mois lirait le même texte (dit dans la page).
- Non documenté faute de lecture complète : la feuille d'une charge « Mise de côté » (formule d'ajustement, relevé) ; seule sa porte depuis l'écran du mois est décrite.
- budget-charges-debut (page d'un autre domaine, non modifiée) : « un douzième par mois » ; pour une charge trimestrielle c'est un tiers (`provision_mensuelle`).
