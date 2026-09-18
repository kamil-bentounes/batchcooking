# R1c — étalon de découpage

Découpage fait à la main sur 10 recettes réelles du corpus, pour servir de référence
lors de la mesure d'un modèle bon marché ou local.

| Grandeur | Mesuré |
|---|---|
| Étapes brutes | 59 |
| Actions après découpage | **141** → **2,4 actions par étape** |
| Étapes contenant plusieurs actions | **66 %** |
| Actions **implicites** à créer | 4 — « préalablement coupées », « à four préchauffé » |
| Verbes hors table | 7 — sabler, foncer, laminer, écaler, émulsionner, pocher, émietter |
| Parallélisme **dit par le texte** | 2 recettes sur 10 |
| Répartition des charges | **actif 100 · passif 36 · bloquant 5** |

## Ce que ces chiffres disent

**Le découpage multiplie les tâches par 2,4.** Une session de 5 recettes ne fait pas
30 tâches mais ~70. L'ordonnanceur doit tenir ce volume — il le tient, c'est du
*list scheduling*, linéaire.

**71 % des actions sont actives.** La session est bornée par **les mains**, pas par les
appareils. Le travail de l'optimiseur n'est donc pas surtout d'arbitrer le four : c'est
de remplir les creux passifs avec du travail actif. Et à deux cuisiniers, ce mur tombe
de moitié — ce qui justifie le sélecteur « vous cuisinez à combien ? ».

**Les actions implicites sont la vraie difficulté.** « Les carottes préalablement coupées
en dés » : la découpe n'est écrite nulle part, il faut la créer. C'est plus dur que
découper une phrase, et c'est là qu'un petit modèle échouera en premier.

**5 actions bloquantes sur 141.** Rares, mais ce sont elles qui figent tout : émulsionner
en versant, remuer jusqu'à épaississement. Les rater, c'est promettre un parallélisme
qui n'existe pas.

## Contre-exemple utile à D35

R8, grand aïoli : « Faites cuire chaque légume **séparément** à la vapeur ». Quatre
cuissons du même type qui ne doivent **pas** fusionner. La fusion ne peut donc pas être
automatique sur le seul critère (verbe, aliment) : le texte peut l'interdire.
