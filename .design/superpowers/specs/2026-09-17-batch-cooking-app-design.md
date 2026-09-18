# Design — Application de batch cooking, diet et budget

- **Date** : 2026-09-17
- **Version** : 21 — **le cycle devient la colonne vertébrale** ; l'optimiseur gagne une horloge ; 14 écrans deviennent 8
- **Statut** : design validé, en attente du plan d'implémentation du **lot 0a-1**
- **Utilisateurs** : un foyer de 2 personnes au départ, puis d'autres foyers **sur invitation**

---

## 1. Objectif

Permettre à un foyer de :

1. constituer un catalogue de recettes saines, riches en protéines et en fibres, et gourmandes ;
2. planifier une **session de batch cooking hebdomadaire d'environ 2 h** dont les étapes sont
   ordonnées pour exploiter en parallèle les électroménagers disponibles ;
3. connaître le bilan nutritionnel de ce qui est cuisiné, **par personne**, chacun ayant ses
   propres objectifs, **avec l'incertitude affichée** (D18) ;
4. générer la liste de courses correspondante, déduction faite du frigo, et la recevoir par mail ;
5. estimer le budget courses à partir de prix réels ;
6. suivre dans le temps ce qui a été mangé et dépensé.

Le différenciateur est le point 2 : l'ordonnancement de la session sous contrainte d'équipement.

---

## 2. Décisions verrouillées

| # | Décision | Alternative écartée | Motif |
|---|---|---|---|
| D1 | **Base canonique locale**, alimentée par une ingestion asynchrone | Recherche web live à chaque requête | Sans données structurées stables, les lots 1, 2 et 5 sont impossibles. Latence 10-30 s et non-déterminisme rédhibitoires. |
| D2 | **MCP = bras d'ingestion** (`search_recipes`, `fetch_recipe`, `extract_recipe`), pas chemin de requête | MCP interrogé à chaud | Ils écrivent en base. L'app lit la base : instantané, gratuit, hors ligne. |
| D3 | **Précision stricte, avec boucle d'apprentissage par pesée** | Mapping approximatif ; pesée obligatoire | Kamil a une balance. La boucle rend la friction décroissante. |
| D4 | **Cibles par personne, portions calculées** | Cible commune | Cas réel d'un couple. Presque gratuit au lot 0a, très cher à rétro-ajouter. |
| D5 | **Conflit de four : grouper si compatible, séquencer en repli, afficher le coût** | Écarter des recettes ; séquencer toujours ; tolérance culinaire | L'utilisateur arbitre en connaissance de cause. |
| D6 | **Équipement : catalogue en base, coché par foyer, surchargeable par session** | Équipement en dur | L'optimiseur le prend en entrée, jamais en constante. |
| D7 | **Multi-tenant sur invitation** | Produit public | Pas de CGU, pas de paiement, pas de modération. |
| D8 | **Prix : interface `PriceSource` + adaptateurs indépendants** | Scraping au fondement | Lidl FR n'a pas de boutique alimentaire en ligne. Les autres sont hors CGU et cassent. |
| D9 | **LLM en API pour tout ce qui est en ligne** ; **serveur loué exclu** | Auto-hébergement sur serveur | Le VPS le moins cher capable de faire tourner un 7B quantifié coûte 6-14 €/mois ; la facture API qu'il remplacerait est de **1,30 €/mois**. Le plancher tarifaire d'un serveur est au-dessus de toute la dépense. |
| D20 | **`ExtractionBackend` interchangeable** (§8.1) : fournisseur choisi par R1 parmi API de référence, **API à bas coût** et **modèle local quantifié**. Tranché par mesure, pas par opinion. | Choisir API ou local dans l'architecture | L'ingestion est le seul poste où le local pourrait gagner. Mais **le prix à battre est de ~4 €** (§8.3, DeepSeek V4 Flash sur du contenu public), pas de 20 € : contre 4 à 11 jours de machine et la plus faible qualité des options, le local ne rapporte plus rien. L'interface reste, pour ne pas dépendre d'un fournisseur. |
| D21 | **Routage par tâche** (§8.1) : aucun modèle quand une table suffit, modèle rapide pour l'extraction et la vision, modèle capable pour la création | Un seul modèle partout | Le plus gros levier de coût n'est pas un modèle moins cher, c'est **ne pas appeler de modèle** : le JSON-LD couvre 98 % des recettes, D19 couvre les durées. En régime permanent il reste **~56 appels par mois**. |
| D35 | **L'optimiseur FUSIONNE les actions identiques entre recettes** : même verbe + même aliment + appareil compatible → **une seule tâche, quantités additionnées**. La fusion est **affichée** (« émince 500 g d'oignons — pour le dahl et la basquaise ») et **défaisable**. | Traiter chaque recette isolément | C'est **le gain même du batch cooking**. Émincer 500 g une fois n'est pas émincer 300 puis 200 : c'est précisément ce que mesure `scaling: lineaire_plafonne` (D19). Sans fusion, l'optimiseur ne fait qu'entrelacer des recettes — il ne les cuisine pas ensemble.<br>**Bornes** : la capacité de l'appareil (une poêle ne tient pas 2 kg), la plage de ±10 °C du four (§6.1), et les actions intrinsèquement propres à un plat (une marinade). Une fusion qui dépasse la capacité est **scindée**, pas abandonnée.<br>**Affichée, toujours** : sans la mention des recettes concernées, l'utilisateur ne comprend plus pourquoi il coupe autant, et se trompe au dressage. |
| D36 | **Une part est un objet à états horodatés**, pas une ligne qui s'efface : `frigo → congélateur → frigo → mangée`, et `jetée` depuis n'importe où. Chaque transition garde **sa date et son heure**. Une part `mangée` ou `jetée` **reste en base** et reste comptée au budget. | Supprimer la ligne quand on la mange | Sans l'historique, impossible de dire combien vous jetez ni ce que ça coûte — or le gâchis est un poste de budget. Et une part jetée qu'on efface fait croire qu'elle a été mangée : le suivi mentirait. |
| D37 | **Toute part peut être supprimée à tout moment**, depuis le frigo comme depuis le congélateur, sans justification. | N'autoriser que les transitions « propres » | On oublie, on jette, on donne. Une application qui refuse de reconnaître une part disparue devient fausse en une semaine, et on cesse de s'en servir. |
| D38 | **Aliments fréquents** : un aliment consommé souvent est enregistré **une fois** avec ses macros, puis réutilisable en un geste sur un repas daté. | Ressaisir à chaque fois ; ne suivre que les barquettes | Complément indispensable de D24 : les barquettes couvrent les dîners, les aliments fréquents couvrent le reste. Sans eux, D26 (« sans le midi, le tableau de bord ment de 900 kcal ») reste un vœu. |
| D39 | **La session se termine par une RÉPARTITION de la semaine**, proposée par l'application : quel plat, quel jour, quel repas, pour qui. Filtrable par jour, par personne, par repas. | Laisser les parts dans un inventaire indifférencié | C'est le chaînon qui manquait. Une session produit 10 parts et s'arrête là : l'utilisateur doit alors décider chaque jour, de mémoire, en lisant des dates de péremption. La répartition transforme un **stock** en **plan de repas**, et c'est elle qui alimente l'accueil et le suivi. |
| D40 | **Le rangement découle du planning, jamais l'inverse.** On ne choisit pas « frigo ou congélateur » : on dit **quand** on mange la part, l'application en déduit le rangement. Déplacer un plat de jeudi à lundi le **sort** du congélateur ; le repousser l'y met. | Deux décisions séparées : quand manger, et où ranger | Deux décisions pour une seule intention, c'est deux occasions de se tromper et un état incohérent garanti — un plat prévu lundi qui dort au congélateur. En cas de refus de la proposition, l'utilisateur reprend la main complète. |
| D41 | **Un repas prévu mais non consommé est traité, pas ignoré** : l'application propose de **décaler** la part, ou de la **congeler** si elle ne tient pas jusqu'au prochain créneau. | Laisser la part expirer en silence | C'est le cas le plus fréquent de la vraie vie — on mange dehors, on n'a pas faim. Une application qui ne le prévoit pas devient fausse dès la première semaine, et c'est là qu'on cesse de s'en servir. |
| D42 | **L'application est une machine à états sur un cycle**, pas un calendrier : `repos → recettes choisies → aux courses → courses faites → en cuisine → répartition → semaine en cours`. **L'accueil est la vue de cet état et ne propose qu'UNE seule action.** | Une navigation par fonctionnalités | Choisir ses recettes un mercredi ou un samedi ne change rien : c'est l'état qui compte, pas le jour. Et une application qui oblige à choisir quoi faire en l'ouvrant n'a pas de fil conducteur — c'est le reproche qui a déclenché cette refonte. |
| D43 | **La liste de courses accepte des articles SANS aliment CIQUAL** : `shopping_item.food_id` est nullable, avec un libellé libre et un rayon. Desserts, café, produits d'entretien. | N'accepter que ce qui est rattaché à un aliment | Une liste de courses qui refuse le liquide vaisselle n'est pas la liste de courses du foyer — on en tient une deuxième à côté, et l'application ne sert plus à rien. Ces articles n'entrent simplement pas dans le calcul nutritionnel. |
| D44 | **Un magasin par défaut, et une liste par magasin** : table `store`, `shopping_list.store_id`. Changeable à tout moment. | Une liste unique | Les prix, les rayons et l'ordre de parcours diffèrent d'une enseigne à l'autre. Et on ne fait pas ses courses d'entretien là où on fait son frais. |
| D45 | **Les articles ajoutés à la main reviennent en proposition** : même mécanique que les aliments fréquents (D38), appliquée aux courses. | Repartir d'une liste vide à chaque fois | Le café, le dessert, l'essuie-tout ne viennent d'aucune recette : ils seraient ressaisis chaque semaine. C'est exactement le genre de friction répétée qui fait abandonner un outil. |
| D46 | **Aucune intégration « panier drive ». La liste s'exporte, elle ne se pousse pas.** | Construire un panier chez Carrefour ou Leclerc | **Vérifié** : aucune enseigne française n'expose d'API publique. Les intégrations existantes parsent le HTML — panier local seulement, aucune synchronisation avec le compte, catalogue national et non le magasin, et cassé à chaque refonte du site. L'export (mail, partage, copier-coller) ne tombera jamais en panne. |
| D47 | **L'optimiseur a une horloge : il replanifie PENDANT la session**, depuis « maintenant, ces tâches faites, ce four occupé jusqu'à 15 h 05 ». | Calculer le plan une fois, avant | Un Gantt calculé une seule fois est faux dès la première tâche en retard — et il y en a toujours une. Replanifier coûte **moins de 100 ms** dans le navigateur, hors ligne, gratuitement. Sans horloge, **le différenciateur du produit est un PDF** : il sert avant, jamais pendant. |
| D48 | **Les durées sont MESURÉES pendant la session, pas confirmées avant.** `session_task_state.started_at/done_at` alimente `household_duration_override` par observation. La confirmation préalable ne subsiste que pour les actions **jamais observées et sur le chemin critique**. | Faire confirmer ~28 durées avant de commencer | On demandait de **deviner**, au pire moment, une donnée que l'application allait **observer gratuitement** vingt minutes plus tard. C'est exactement ce que fait la balance pour les poids (§5.2.1) ; le temps était traité à l'envers. Supprime l'écran le plus coûteux du produit et rend le différenciateur auto-améliorant. |
| D49 | **Cocher un article au magasin crée la ligne de frigo.** `shopping_item` coché → `fridge_item`. | Deux saisies indépendantes : la liste, puis l'inventaire | Ce qu'on achète **est** ce qu'on range. On faisait saisir deux fois la même donnée, la seconde par une IA de vision payante, pour retrouver ce que l'utilisateur avait coché une heure plus tôt. La photo devient une entrée d'appoint, plus une porte. |
| D50 | **Cuisine à deux : deux téléphones synchronisés.** Le plan **attribue chaque geste par prénom**, chacun coche sur son appareil, l'état est partagé en temps réel (Supabase Realtime). | Un seul téléphone pilote | Le solveur pose `mains = 2` ; sans attribution ni partage, cette hypothèse n'est réalisée nulle part dans la cuisine et la session ne se divise pas vraiment par deux. Choix de l'utilisateur, assumé : c'est l'option exigeante. |
| D51 | **Huit écrans, pas quatorze** : Accueil · Choisir · Plan/En cuisine · Dressage · La semaine · Au magasin · Ce que j'ai · Bilan. | Un écran par fonctionnalité | Plusieurs écrans étaient des **moments déguisés en lieux** : les filtres appartiennent à l'écran des résultats, l'arbitrage du four au plan qu'il déplace, « en cuisine » est un mode du plan, « mes repas du jour » une colonne de la semaine. |
| D52 | **Un objet `cycle` porte l'état d'une semaine**, du choix des recettes à la clôture. La navigation a **quatre destinations** (Accueil, Semaine, Frigo, Bilan) ; Choisir, Au magasin, Plan et Dressage sont des **moments**, atteints depuis l'accueil. | Une navigation par fonctionnalités, sans objet d'état | Rien ne portait l'état entre le mercredi et le dimanche : c'est la cause matérielle du « pas de fil conducteur ». L'accueil est la **vue du cycle** et ne pousse qu'une action — celle de l'instant. |
| D53 | **Le DRESSAGE est une étape à part entière**, entre la dernière tâche et la semaine : on compte les parts réellement obtenues, on les pèse, on les nomme, on les affecte. | Traiter le dressage comme la dernière étape du plan | Une recette prévue pour 6 parts en donne 5. Sans ce compte réel, toute la promesse nutritionnelle (D3, D18) repose sur une théorie que rien ne confronte à la casserole. Et c'est là, et nulle part ailleurs, que les barquettes existent physiquement. |
| D54 | **La semaine se CLÔTURE et alimente la suivante** : restes, jetés, coût réel, puis la sélection suivante démarre **préchargée des restes**. | Repartir d'une feuille blanche chaque semaine | Les restes du dimanche N sont l'entrée la plus utile du dimanche N+1 : moins de recettes, moins de courses, moins de gâchis. C'est tout l'objet de D27, et la boucle n'était pas fermée. |
| D55 | **« Compléter ma liste » propose le hors-alimentaire par catégories** : Entretien, Hygiène, Épicerie, Frais du quotidien, Boissons, Maison — ~100 articles en seed, enrichis par ce que le foyer ajoute. | Laisser l'utilisateur tout taper | Une liste de courses engendrée par des recettes ne contient ni café, ni éponges, ni dentifrice. Sans ce bouton, on tient une deuxième liste ailleurs et l'application perd son objet. |
| D56 | **Chaque article porte son magasin**, hérité du magasin par défaut du foyer et modifiable. La liste se **scinde par enseigne**. | Une liste unique, un magasin global | On ne fait pas son entretien là où on fait son frais. Sans magasin par article, il faut trier de tête devant le rayon. |
| D57 | **L'inventaire du frigo se saisit à la main d'abord, la photo vient en accélérateur.** La reconnaissance par image **ne rend jamais de quantité** : elle propose des articles, l'utilisateur pose les quantités. | Faire de la photo la porte d'entrée de l'inventaire | Une photo voit un pot de skyr, pas s'il en reste trois cuillères. Une saisie manuelle avec autocomplétion sur les 3 185 aliments est gratuite, immédiate et toujours juste. Et la photo n'est plus indispensable puisque cocher au magasin remplit déjà le frigo (D49). |
| D58 | **L'ordre des rayons s'apprend de l'usage** : l'application note dans quel ordre le foyer coche et réordonne la liste dans le sens de parcours du magasin. | Un ordre de rayons figé | Aucune API ne peut donner le plan d'un magasin donné. L'observation, si — et c'est gratuit. |
| D59 | **Une sortie de courses par magasin**, terminée indépendamment. Le cycle passe à `prêt` quand **l'utilisateur le déclare**, pas quand le dernier article est coché. | Un état « aux courses » unique qui se ferme tout seul | Les enseignes ne sont pas au même endroit : Lidl le samedi, Carrefour le dimanche matin. Un état unique obligerait à tout faire d'un coup, ou laisserait le cycle bloqué parce qu'il manque un article qu'on prendra demain. |
| D31 | **La durée de session se décompose en « à cuisiner » et « d'attente »**, et l'attente est qualifiée : **au milieu** (échec d'ordonnancement) ou **en fin** (normale, on quitte la cuisine). | Afficher un makespan unique | Le temps d'attente **est la note de l'optimiseur** : un creux au milieu signifie qu'une cuisson n'a pas été couverte par une préparation. L'afficher rend la qualité du calcul visible. Et « 3 h dont 1 h passive » n'engage pas le même effort que « 3 h de travail ». |
| D32 | **La cible de durée est un repère, jamais une barrière.** Tout dépassement est annoncé avec son ampleur **et la part d'attente qu'il contient**, puis deux boutons — *Ça me va* / *Raccourcir*. **Accepter est toujours possible**, à 2 h 09 comme à 3 h. | Refuser, ou écarter des recettes d'autorité | L'utilisateur seul sait si les recettes valent l'heure supplémentaire. L'application constate, donne le fait qui permet de décider, et n'a pas d'avis. Le ton n'est jamais celui du reproche. |
| D33 | **Trois états de saisie par repas, jamais deux** : `barquette` (compté au gramme), `estimé` (compté, **marqué comme tel**), `vide` (**exclu du calcul**). Le tableau de bord affiche toujours « N jours renseignés sur M ». | Traiter l'absence de saisie comme zéro | Un jour vide n'est pas un jour à jeun. Compter les blancs comme des zéros fait mentir les moyennes **vers le bas** — le pire sens : on croit manquer de protéines alors qu'on n'a simplement rien saisi. |
| D34 | **Les repas hors barquette se saisissent par repères en un geste** (« resto ~900 kcal », « sandwich midi ~550 »), ajustables, jamais par saisie de chiffres. | Formulaire de saisie calorique | Personne ne tape des calories deux semaines de suite. **Approximatif et tenu vaut mieux que précis et abandonné** — même raisonnement que D24 sur les barquettes. |
| D28 | **Le contenu du frigo annote, il ne filtre pas.** Par défaut le catalogue entier est visible et **chaque recette affiche ce qui manque** (« il manque 2 poivrons et le saumon »). Le filtre strict reste disponible en bascule. | Filtre binaire qui cache les recettes incomplètes | Cacher une recette parce qu'il manque deux articles est une mauvaise décision prise à la place de l'utilisateur. Et la liste des manques **alimente directement la liste de courses** du lot 2. |
| D29 | **Aucune limite de recettes par session. Deux plafonds vivants, affichés pendant la sélection** : le **temps** (contre `session.target_duration_min`) et les **portions** rapportées à la péremption (D27) — « 1 h 52 / 2 h · 10 parts, dont 4 à congeler ». Signalés en dépassement, **jamais bloquants**. | « Maximum 5 recettes » | Le vrai plafond n'est pas un nombre : avec un bon parallélisme, 2 h font 4 à 5 recettes au lieu de 2 — c'est précisément ce que l'optimiseur achète. Et cuisiner 16 portions qu'on jettera n'est pas de l'optimisation. |
| D30 | **Le temps affiché est le temps ACTIF**, le temps total en second | Afficher le temps total | « 40 min » dont 18 aux fourneaux et 22 de four n'engage pas le même effort. Possible grâce à `load_type` (D19), et personne ne l'affiche. |
| D24 | **La session produit des BARQUETTES, pas des recettes.** Chaque part est nommée, porte ses macros, son coût et sa date limite. **Manger = cocher une barquette.** | Journal alimentaire saisi à la main | C'est la seule forme de suivi qui tient dans la durée : personne ne saisit ses repas pendant trois mois. Tout est déjà calculé le dimanche, il ne reste qu'un geste. Et le tableau de bord (lot 6) se remplit tout seul. |
| D25 | **Portions inégales pour des cibles inégales, sauf si l'écart est protéique** : 2 000 contre 1 700 kcal → 54/46, annoncé à la dernière étape du plan (« 5 × 340 g, 5 × 290 g »). **Mais si l'écart porte surtout sur les protéines, parts égales + complément dense** (100 g de skyr, deux œufs) | Portions égales pour tous ; deux plats distincts | Une part plus grosse donne plus de **tout**, pas plus de protéines : elle ajoute glucides et lipides dont la personne n'a pas besoin. L'application dit lequel des deux gestes s'applique, au moment du dressage. |
| D26 | **Le petit-déjeuner et le midi sont saisis, en un geste** (habitudes mémorisées) | Ne suivre que les dîners | Le batch cooking couvre les dîners. Sans les deux autres repas, le tableau de bord **ment de ~900 kcal par jour** — il vaudrait mieux ne rien afficher. |
| D27 | **Les barquettes ont une DLC** : 3-4 jours au frigo, au-delà congélation proposée | Pas de suivi de fraîcheur | L'écran le plus consulté de la semaine ne sera pas le planning mais « il reste 4 parts de dahl, à manger avant mercredi ». Évite le gâchis, donc sert aussi le budget. |
| D23 | **Stack d'interface : Tailwind v4 + shadcn/ui + Motion + TanStack Query**, sur React/Vite | SvelteKit ; Next.js ; CSS maison | Exigence explicite : une application moderne, rapide, fluide, et **modifiable simplement**. SvelteKit est plus agréable à écrire mais prive de shadcn/ui et d'une large part de l'écosystème d'animation. Next.js apporte un rendu serveur sans objet pour une PWA hors ligne adossée à Supabase. Le choix ne concerne **que l'interface** : il n'a aucun effet sur les lots 0a-1, 0a-2 et 0b. |
| D22 | **Le fournisseur est choisi par la sensibilité de la donnée, pas par le prix** (§8.2) : contenu web public → le moins cher ; **image du logement → fournisseur de confiance**, jamais le moins-disant | Fournisseur unique ; choix au prix seul | Le texte d'une recette est public. Une photo de l'intérieur d'un frigo ne l'est pas. Ce n'est pas une obligation réglementaire en usage domestique (§11 q. 1) — c'est que l'écart de prix en jeu est de 0,003 € par photo, donc qu'il n'y a rien à arbitrer. |
| D10 | **PWA** | Application native | 99 $/an + review pour un usage sur invitation. |
| D11 | **Deux budgets LLM séparés** : global pour l'ingestion mutualisée, par foyer pour vision et propositions | Plafond unique par foyer | L'ingestion profite à tous les foyers (D16) : la facturer à un seul est incohérent. |
| D12 | **Découverte par sitemaps publics**, pas par crawl | Crawl | **Mesuré** : aucun `robots.txt` ne bloque l'IA, les sitemaps exposent 112 000 recettes et existent pour être lus par des robots. |
| D13 | **Extraction mutualisée** : une recette est extraite une fois pour tous les foyers | Extraction par foyer | Sinon chaque foyer repaie l'extraction. |
| D14 | **Précédences : ordre total par défaut**, relaxations proposées par le LLM et confirmées | Parallélisme deviné | Un parallélisme faux fait rater un plat. Défaut sûr, gain opt-in. |
| D15 | **Durées pré-remplies en trois couches** : `default_duration` déterministe → raffinement LLM ancré sur `prepTime`/`cookTime` → **confirmation humaine à la sélection** (D17). **Aucune contrainte d'égalité.** | Contrainte `Σ durées = totalTime` — **testée et infirmée** ; durée NULL tolérée | **Mesuré** : 77,6 % des étapes sans durée. La contrainte de somme a été testée sur l'échantillon : ratio médian `Σ/totalTime` = **0,66**, et **8 %** seulement des recettes dans ±10 %. L'égalité est fausse. Le repli « n'ordonnancer que les recettes entièrement datées » l'est aussi : **1 recette sur 55**. |
| D19 | **`default_duration` par (verbe, `appliance_type`), appliqué aux *actions* et mis à l'échelle des quantités**. L'extraction **décompose chaque étape en actions**. | Table indexée sur l'étape ; tout confier au LLM | Hors ligne, auditable, corrigeable. **Mesuré** : 28,2 % seulement des étapes exposent un verbe unique — la clé ne peut pas être l'étape. Et sans mise à l'échelle, D4 met les ingrédients à l'échelle sans toucher aux durées. |
| D16 | **Trois classes d'isolation** (§5.0) | Binaire partagé/isolé | Le binaire interdisait la relecture, la résolution par foyer (D3) et les recettes créées par un foyer. |
| D17 | **Catalogue large, relecture paresseuse** : ~5 000 recettes ingérées, relecture humaine déclenchée **à la sélection** d'une recette | Tout relire à l'ingestion ; catalogue de 500 | Relire 5 000 recettes est impossible pour un couple ; 500 recettes tuent l'argument du filtre macro. La charge devient proportionnelle à l'usage. |
| D18 | **Macros en intervalle `[min, max]`**, filtres sur la borne défavorable | Macros ponctuelles | 16 % des lignes sont irrésolubles (§4.2). Une macro ponctuelle ferait passer pour « 35 g de protéines » un plat dont l'ingrédient protéique est la ligne sans quantité. |

---

## 3. Le cycle

**Cette section prime sur toutes les autres.** Le document a longtemps été organisé par lots de
construction — schéma, ingestion, cuisiner, courses — c'est-à-dire par dépendance technique,
exactement à l'envers de la séquence vécue. C'est la cause matérielle du « pas de fil conducteur ».

L'application n'est pas un ensemble de fonctions, ni un calendrier : c'est **une machine à états
sur une semaine**, et il n'y en a **qu'une instance courante à la fois**.

### 3.1 Les états

| État | Ce qui est vrai | Écran | Sortie |
|---|---|---|---|
| `vide` | Rien de prévu pour la semaine | Accueil | **Choisir** → `selection` |
| `selection` | Recettes retenues, portions cibles, manques calculés | Choisir | **Valider** → `courses` |
| `courses` | Une liste figée **par magasin**, budget estimé | Au magasin | **L'utilisateur déclare** → `pret` (D59) |
| `pret` | Ingrédients au frigo, plan calculé, équipement connu | Plan | **Commencer** → `en_cuisine` |
| `en_cuisine` | Horloge qui tourne, tâches cochées, **replanification continue** (D47) | En cuisine | Dernière tâche → `dressage` |
| `interrompue` | Ce qui est fait, ce qui cuit, ce qui reste | Accueil, bandeau | **Reprendre** → `en_cuisine` replanifié |
| `dressage` | Parts **réellement** obtenues, pesées, nommées, affectées (D53) | Dressage | **Valider** → `semaine` |
| `semaine` | Chaque repas a un jour, un plat, une personne (D39) | La semaine | Dimanche → `cloture` |
| `cloture` | Restes, jetés, coût réel | Accueil | **Préparer la suivante** → `selection` préchargée des restes (D54) |

**Une porte latérale, jamais le chemin principal** : `dépannage` — « qu'est-ce que je peux faire
avec ce que j'ai » — accessible depuis *Ce que j'ai*, quel que soit l'état du cycle. Elle produit
soit un plat le soir même (une ou deux parts créées directement, sans session), soit un ajout à la
`selection` en cours.

### 3.2 Ce que le cycle impose

- **L'accueil est la vue de l'état courant**, et ne pousse **qu'une seule action** (D42).
- **Choisir, Au magasin, Plan/En cuisine et Dressage ne sont pas des destinations** : ce sont des
  moments. On y entre depuis l'accueil. Les quatre destinations permanentes sont
  **Accueil · Semaine · Ce que j'ai · Bilan** (D51, D52).
- **Le jour de la semaine n'entre pas dans la machine.** Choisir ses recettes un mercredi ou un
  samedi ne change rien : c'est l'état qui compte.
- **Chaque transition produit une donnée**, jamais une ressaisie : cocher au magasin remplit le
  frigo (D49), le dressage crée les parts (D53), la répartition décide du rangement (D40).

### 3.3 Les trois tables qui portent le cycle

| Table | Rôle |
|---|---|
| `cycle(household_id, week_start, etat, session_id, shopping_list_id)` | **Porte l'état du mercredi au dimanche.** Sans elle, il n'y a littéralement rien à quoi accrocher le fil. |
| `meal_slot(cycle_id, date, meal, user_profile_id, portion_id, source, etat)` | À la fois la répartition, l'écran *La semaine*, et l'entrée du calcul frigo/congélateur. Unifie D24, D26, D33, D34 et D39, qui décrivaient jusqu'ici cinq saisies sans objet commun. |
| `session_task_state(session_id, task_id, etat, started_at, done_at, by_user_profile_id)` | Donne d'un coup l'interruption, la reprise, **la cuisine à deux** (D50) et **la mesure des durées réelles** (D48). |

Plus `session.scheduled_at` : sans date, aucune notification, aucun « fais les courses samedi »,
aucune DLC relative au plan.

---

## 3. Architecture et stack

```
┌─ INGESTION (asynchrone, jamais sur le chemin critique) ────────────┐
│  Découverte : sitemaps publics (D12)                               │
│  MCP "recipes" : search_recipes · fetch_recipe · extract_recipe    │
│      ↓  JSON-LD schema.org/Recipe (55/56 mesuré), sinon LLM        │
│  Extraction : appareil · température · load_type · durées (D15)    │
│  Normalisation : ingrédients → CIQUAL · cascade des poids          │
└──────────────────────── écrit dans ──────────────────┬─────────────┘
                                                        ↓
                          ╔═════════════════════════════════════════╗
                          ║  BASE CANONIQUE — Postgres (Supabase)   ║
                          ║  3 classes d'isolation (§5.0) · UE      ║
                          ╚═════════════════════════════════════════╝
                                        ↓ lit
┌─ APP — PWA installable, fonctionne hors ligne en cuisine ──────────┐
│  Optimiseur · Courses · Frigo · Envies · Prix · Suivi              │
└────────────────────────────────────────────────────────────────────┘
        ↑ LLM : vision (frigo, tickets) · extraction · propositions
```

| Couche | Choix | Justification |
|---|---|---|
| Frontend | **PWA — React + Vite + TypeScript** (`vite-plugin-pwa`), service worker | Installable sur l'écran d'accueil. Le plan de session doit s'afficher en cuisine **sans réseau** : le plan calculé et la liste chronologique sont mis en cache à l'ouverture de la session. |
| Style | **Tailwind CSS v4** | Une couleur, un espacement, un arrondi se changent en une classe. C'est l'exigence « modifier simplement », et c'est ce qui rend les itérations de maquette peu coûteuses. |
| Composants | **shadcn/ui** | Les composants sont **copiés dans le dépôt**, pas importés d'une dépendance : ils sont modifiables sans limite et rien n'est verrouillé par une bibliothèque tierce. |
| Animation | **Motion** + **View Transitions API** | Transitions d'écran natives et animations à 60 fps. C'est ce qui produit la sensation de fluidité, pas la vitesse du serveur. |
| Données côté client | **TanStack Query** | Cache et **mises à jour optimistes** : l'interface réagit avant la réponse réseau. C'est le principal levier de rapidité *perçue*. |
| Backend | **Supabase** — Postgres, Auth, RLS, Storage, Edge Functions — **région UE** | Auth + isolation + stockage des photos en un service. RLS natif = D7 et D16 quasi gratuits. |
| Worker d'ingestion | **Node + TypeScript**, exposant les outils MCP, exécuté hors de l'app (local ou tâche planifiée), authentifié en **rôle de service** | Découplé. Peut tourner à la demande, sans dimensionner un serveur permanent. |
| Optimiseur | **TypeScript pur, exécuté côté client** | < 100 ms pour 5 recettes. Aucun aller-retour réseau, donc utilisable hors ligne. |
| LLM | **API Anthropic** — modèle rapide (vision, extraction), modèle plus capable (propositions) | §8. |
| E-mail | **Resend** (free tier : 3 000/mois) | Invitations (lot 0a-1) **et** liste de courses (lot 2). |
| Hébergement PWA | **Cloudflare Pages** | Statique, gratuit. |

---

## 4. Mesures terrain — dérisquage effectué le 2026-09-17

Tout ce qui suit est **mesuré**. Méthode : URLs tirées au sort dans les sitemaps publics,
extraction du JSON-LD, classification automatique. Scripts dans `docs/mesures/`.

### 4.1 Sources de recettes retenues

| Site | Recettes au sitemap | JSON-LD | Ingr. | Étapes | Nutrition | Remarque |
|---|---|---|---|---|---|---|
| **CuisineAZ** | **30 000** | ✅ | ✅ | ✅ | 7 % | **Meilleur format** : `250 g` / `Farine de blé` déjà séparés |
| **P'tit Chef** | **65 000** | ✅ | ✅ | ✅ | 64 % | |
| **Marmiton** | **15 000** | ✅ | ✅ | ✅ | 64 % | `servingSize` en grammes |
| **Journal des Femmes** | **2 000** | ✅ | ✅ | ✅ | 100 % | Lignes de section (« Pour la pâte : ») à filtrer |
| 750g · Cuisine Actuelle · Chef Simon · Supertoinette · Ricardo | — | ✅ | ✅ | ⚠️/✅ | — | Complément. 750g : étapes parfois non découpées. |
| BBC Good Food · Budget Bytes · Skinnytaste | — | ✅ | ✅ | ✅ | ✅ | Anglais, très propres |

**Parsing : 55 recettes sur 56 = 98 %.** Critère que je m'étais fixé : 90 %. **Atteint.**

**Bloqués en 403 depuis une IP de datacenter, non retenus** : Allrecipes, Serious Eats,
EatingWell, Simply Recipes (Dotdash Meredith), Papilles et Pupilles, Ligne & Protéines.

**Sites muscu / healthy français : 0 structuré sur 9.** Espace-Musculation, Fitadium,
Fitnessmith, Isostar, Go Recettes, Mon Coach Gourmand, Move Your Fit, Recette Protéine,
Sab'n'Pepper — uniquement du texte d'article.

> **Conséquence** : l'axe « muscu / healthy » ne se construit **pas** en ciblant des sites
> spécialisés, mais en **filtrant sur les macros recalculées** du catalogue généraliste.
> Ce filtre s'applique au catalogue réellement ingéré (~5 000 recettes, D17), pas aux 112 000
> atteignables — ce qui reste très supérieur à toute sélection éditoriale, et sans dépendance
> à un site fragile.

### 4.2 Distribution des quantités — 475 lignes, 55 recettes, 4 sites

| Forme | Part | Résolution |
|---|---|---|
| Masse (`250 g de farine`) | **24 %** | Directe |
| Volume (`15 cl de lait`) | **9 %** | Table de densité |
| Cuillère / pincée / poignée | **23 %** | Table de conversion |
| Compte (`2 gousses d'ail`) | **27 %** | Table de poids unitaires |
| **Aucune quantité** (`sel, poivre`) | **16 %** | **Irrécupérable automatiquement** → borne d'incertitude (D18) |

84 % des lignes portent une quantité. 33 % exploitables immédiatement, 50 % via les tables,
**16 % jamais**. Ces 16 % sont la justification de D18 et de `resolution_source = aucune`.

### 4.3 Étapes — statistiques jointes (55 recettes, 308 étapes)

| Grandeur | Mesuré |
|---|---|
| Étapes par recette | 5,6 · **0 recette monolithique** |
| Recettes utilisant le four | **50,9 %** |
| **Recettes au four SANS température** | **10/28 = 35,7 % des recettes au four** |
| Étapes mentionnant une durée | **22,4 %** |
| **Étapes SANS durée** | **77,6 %** |
| **Étapes avec appareil mais SANS durée** | **63 sur 112 étapes à appareil = 56,2 %** (112 étapes à appareil sur 308) |
| **Recettes avec `totalTime`** | **100 %** |
| Recettes avec `prepTime` | **100 %** |
| Recettes avec `cookTime` | **87,3 %** |
| **Recettes où `Σ durées partielles` > `totalTime`** | **35 %** — *une somme partielle ne peut pas dépasser le tout* : **preuve irréfutable** que `totalTime` n'est pas la somme des étapes. 8 des 14 cas n'ont aucun repos passif. |
| **`Σ durées déclarées / cookTime` — médiane** | **1,00** · 56 % à ±25 % — **les durées déclarées somment au temps de cuisson** |
| Corrélation couverture / ratio (`r`) | +0,30 (faible) ; au-delà de 50 % de couverture, ratio médian **2,34** |
| **Étapes avec un seul verbe reconnaissable** | **28,2 %** (56,5 % en ont plusieurs, 15,3 % aucun) |
| Étapes à appareil par recette | **1,95**, pour **un seul** `cookTime` |
| **Recettes dont *toutes* les étapes sont datées** | **1 sur 55 = 1,8 %** |
| Recettes sans **aucune** étape datée | 27,3 % |

> **Le trou des durées est le risque n°1 du projet.** `duration_min` est la colonne vertébrale
> du RCPSP : sans durée, une tâche n'est **pas ordonnançable du tout**, alors qu'une
> température manquante ne dégrade que l'arbitrage du four.
>
> **Une première version de D15 contraignait `Σ durées = totalTime`. Elle est réfutée** :
> **35 % des recettes ont déjà une somme *partielle* supérieure à leur `totalTime`** — et une
> somme partielle ne peut pas dépasser le tout. 8 de ces 14 cas n'ont aucun repos passif, donc
> ce n'est pas l'explication. Au-delà de 50 % de couverture, le ratio médian atteint 2,34.
>
> *(Une mesure antérieure comparait `Σ durées déclarées` à `totalTime` et concluait à 0,66.
> Cette comparaison était invalide — une somme portant sur 22 % des étapes divisée par un temps
> total — et elle est remplacée par le test ci-dessus. La conclusion tenait, la preuve non.)*
>
> Pire : une contrainte d'égalité aurait rejeté **précisément les recettes parallélisables**,
> puisque `Σ durées > makespan` dès qu'une relaxation de D14 est acceptée. Sélection adverse
> sur exactement les recettes qui intéressent un optimiseur de batch cooking.
>
> **Ce que la mesure fournit à la place : deux ancres distinctes, et non une.**
> `Σ durées déclarées / cookTime` a une **médiane de 1,00** (56 % à ±25 %). C'est cohérent :
> un auteur date ses cuissons, pas ses découpes. Donc `cookTime` ancre les **actions à
> appareil** et `prepTime` les **actions actives** — les deux ne sont pas interchangeables.
>
> **Ce qui referme réellement le trou (D15 + D19)**, en trois couches :
> 1. **`default_duration` par (verbe, `appliance_type`) appliqué aux *actions***, pas aux
>    étapes : **28,2 % seulement** des étapes exposent un verbe unique, 56,5 % en ont plusieurs.
>    L'extraction doit donc **décomposer chaque étape en actions** — ce dont l'optimiseur a
>    besoin de toute façon, « Émincez l'oignon et faites-le revenir 5 min » étant une action
>    `actif` puis une action `bloquant`.
> 2. **Raffinement LLM à double ancrage** : les actions à appareil sont réparties au prorata de
>    leurs priors sur `cookTime` (**1,95 action à appareil par recette pour un seul `cookTime`**
>    — l'affecter à chacune double-compterait), les actions actives sur `prepTime`. Rejet des
>    seules aberrations **relatives à leur prior** (> 3 × `default_duration`), jamais par
>    comparaison à `totalTime` : 35 % des recettes le dépassent légitimement. `Σ` contre
>    `cookTime` sert de **contrôle a posteriori**, pas de contrainte.
> 2bis. **Mise à l'échelle par les quantités** : `default_duration.scaling` ∈
>    `{ lineaire_plafonne, constant }`. Éplucher 2 kg d'oignons n'est pas éplucher un oignon,
>    alors qu'une cuisson au four ne dépend pas du nombre de portions. Sans cela, D4 met les
>    ingrédients à l'échelle et laisse les durées inchangées — biais systématique sur les
>    actions actives, celles qui saturent la ressource `mains`.
> 3. **Confirmation humaine à la sélection** (D17, §7.5) — 5,6 étapes pré-remplies à valider
>    d'un coup d'œil, une seule fois, pour une recette qu'on va réellement cuisiner. Les
>    corrections enrichissent `default_duration`, exactement comme les pesées enrichissent
>    `household_unit_weight`.
>
> Le risque projet change de nature : de « **D15 doit marcher** » à « **les durées doivent être
> pré-remplies assez bien pour être confirmées d'un coup d'œil** ».

### 4.3.1 R1b, moitié déterministe — **mesuré**, 299 étapes réelles

| Grandeur | Mesuré |
|---|---|
| Phrases écartées parce qu'elles ne décrivent **aucun geste** (« bon appétit », « et voilà ») | 9 sur 308 — autant de **minutes fantômes** évitées |
| **Durée trouvée par `default_duration` seule, sans aucun modèle** | **98,0 %** (293/299) |
| Aucun verbe reconnu → à charge du LLM | **2,0 %** (6/299) |
| **Étapes contenant plusieurs actions** | **63,2 %** (189/299) |

> **Ce résultat déplace le risque.** Le LLM n'a plus à *inventer une durée* : la table la donne
> dans 98 % des cas. Sa tâche devient **le découpage** — « Émincez l'oignon et faites-le revenir
> 5 min » est une action `actif` puis une action `bloquant`. Découper une phrase est une tâche
> bien plus fiable pour un modèle que produire un nombre à partir de rien.
>
> Conséquence : **R1c (décomposition) devient le test critique, devant R1b.** Et la couverture
> de 98 % est obtenue avec **55 verbes** — passés de 35 après une première mesure à 86 %, en
> ajoutant précisément ce que les non-couverts contenaient. La table s'améliore par mesure, pas
> par intuition.

### 4.4 Données de référence — vérifiées

| Source | État | Licence |
|---|---|---|
| **CIQUAL** (ANSES) | XLS 3,6 Mo, ~3 200 aliments | **Licence Ouverte Etalab** (`fr-lo`) |
| **Open Food Facts** API v2 | 200, données complètes | **ODbL** — attribution **et partage à l'identique** |
| **Open Prices** API v1 | 200, données réelles | Open Food Facts |
| `robots.txt` des 6 sites FR retenus | **Aucun blocage IA** ; sitemaps publiés | — |

### 4.5 Ce qui reste à dérisquer, avec le comportement en cas d'échec

| # | À mesurer | Go | Si échec |
|---|---|---|---|
| R1 | Extraction des attributs d'action (appareil, température, `load_type`) sur 20 recettes, **trois bras : API de référence, API à bas coût (DeepSeek/GLM), modèle local quantifié** (D20/D22 — contenu public, donc aucune contrainte de juridiction) | ≥ 85 % pour la référence. L'API à bas coût est retenue si elle est **à moins de 5 points**. Le local ne l'est que s'il **égale** la référence : le prix à battre est de **4 €**, pas de 20 €. | 70-85 % : lot 1 construit, relecture systématique des étapes four. < 70 % : lot 1 reporté. Local en deçà : `ExtractionBackend` reste sur l'API, l'interface ne change pas. |
| **R1b — moitié déterministe** | **FAIT** (§4.3.1) : couverture de `default_duration` sur 299 étapes réelles | ≥ 80 % espéré | **98,0 % obtenu.** Reste la moitié qualitative ci-dessous. |
| R1b | **Qualité des durées pré-remplies (D15/D19)** sur un jeu **non biaisé** : les 69 durées déclarées portent sur des étapes longues et passives, donc les masquer testerait la population facile. Il faut **étiqueter à la main 30-50 actions non datées** (une heure sur des données déjà en main) et mesurer l'erreur **absolue ET relative**, stratifiée, séparément pour actions actives et actions à appareil. | Actions à appareil : **≤ 5 min d'erreur médiane absolue**. Actions actives : **≤ 50 % d'erreur relative médiane** — ±10 min sur une action de 3 min ferait 300 %, un seuil absolu n'a aucun sens à cette échelle. | Au-delà : `default_duration` réduite à des classes grossières (< 5 / 5-15 / 15-45 / > 45 min), confirmation à la sélection obligatoire au lieu d'optionnelle. Le Gantt perd en précision, **le projet ne s'arrête pas**. |
| **R1c** ⚑ **devenu le test critique** | **Décomposition étape → actions** sur 20 recettes : part des actions correctement isolées avec leur `load_type`. **63,2 % des étapes en contiennent plusieurs** (§4.3.1), donc c'est là que se joue le lot 1. | ≥ 90 % | < 90 % : retour à « une étape = une action » avec le `load_type` dominant ; le parallélisme intra-recette est abandonné, l'inter-recettes suffit à l'essentiel du gain. |
| R2 | Relaxations de précédence (D14) sur 20 recettes | **0 faux positif** | ≥ 1 faux positif : relaxations désactivées, ordre total strict, parallélisme inter-recettes seulement. |
| R3 | Vision sur 5 photos réelles du frigo | ≥ 70 % identifiés, **0 hallucination** | Hallucination : la photo ne préremplit plus, elle suggère, et tout est confirmé. |
| R4 | Couverture d'Open Prices sur 30 produits courants | ≥ 40 % | < 40 % : `OpenPricesSource` reste branché mais le lot 5 démarre sur les tickets seuls. |

---

## 5. Modèle de données

### 5.0 Les trois classes d'isolation (D16) — préalable à toute policy RLS

| Classe | Tables | Règle |
|---|---|---|
| **A — Référentiel immuable et infrastructure** | `food`, `food_yield_factor`, `unit_weight`, `unit_conversion`, `density`, `default_temperature`, `default_duration`, **`typical_quantity`**, `appliance_catalog`, `ingestion_job`, `instance_setting` | Lecture pour tout utilisateur authentifié. Écriture réservée au **rôle de service**. |
| **B — Catalogue partagé, écriture authentifiée et tracée** | `recipe`, `recipe_ingredient`, `recipe_step`, `recipe_step_dependency` | Lecture par tous. **Écriture par tout foyer authentifié**, limitée aux champs de confiance faible ou moyenne. **Les quatre tables portent `edited_by_household_id` et `edited_at`.** Conflit : dernier écrivain gagne, **et une session planifiée fige un instantané de ses recettes** (`session_recipe` copie les étapes retenues), pour qu'une correction d'un foyer ne modifie pas un plan déjà calculé chez un autre. |
| **C — Données de foyer** | `household`, `user_profile`, `nutrition_target`, `invitation`, `household_appliance`, `household_unit_weight`, `household_ingredient_resolution`, **`household_duration_override`**, `weighing`, `session`, `session_recipe`, `session_portion`, `session_appliance_override`, `session_plan`, `plan_conflict`, `fridge_inventory`, `fridge_item`, `shopping_list`, `shopping_item`, `product`, `price_point`, `receipt`, `llm_usage`, **`portion`**, **`portion_event`**, **`frequent_food`** | RLS stricte — **trois formes de prédicat, pas une** (§5.0.1). |

#### 5.0.1 Mécanique des policies — livrable 0a-1

« `household_id = current_household()` » n'est applicable qu'à une partie des tables.
Trois cas, tous présents dès 0a-1 :

| Cas | Tables | Prédicat |
|---|---|---|
| Colonne directe | `user_profile`, `invitation`, `household_appliance`, et toutes les tables des lots 1-6 | `household_id = current_household()` |
| **La clé *est* le foyer** | `household` | `id = current_household()` |
| **Pas de colonne** | `nutrition_target` (clé `user_profile_id`) | **On dénormalise** : ajout de `household_id` maintenu par trigger. Une colonne coûte moins qu'une jointure dans chaque policy, et supprime un risque de récursion. |

Deux mécanismes que RLS **ne peut pas** porter, et qui sont des livrables 0a-1 à part entière :

- **La restriction d'écriture de la classe B** (« champs de confiance faible ou moyenne
  seulement ») dépend de la valeur de `confidence` de la ligne : c'est un trigger
  `BEFORE UPDATE` comparant `OLD`/`NEW`, qui pose aussi `edited_by_household_id` et `edited_at`.
- **`current_household()`** doit être `SECURITY DEFINER` ou adossée à un claim JWT : si elle lit
  `user_profile`, elle-même sous RLS, elle provoque la récursion de policy classique de Postgres.

**Point corrigé par rapport à la v2** : la résolution des poids est **par foyer** (D3), donc elle
ne peut pas vivre dans `recipe_ingredient` qui est partagée. Deux foyers qui pèsent le même
ingrédient s'écraseraient. D'où :

- `recipe_ingredient` (classe B) porte la **résolution de référence** :
  `grams_reference`, `resolution_source ∈ { référence, llm, aucune }`
- `household_ingredient_resolution` (classe C) porte la **résolution du foyer** :
  `recipe_ingredient_id`, `household_id`, `grams`, `resolution_source ∈ { pesé, foyer }`

La cascade §7.3 lit d'abord la table C, puis retombe sur la colonne B.

**Recettes créées par un foyer** (lot 4) : `recipe.owner_household_id` NULL pour une recette
importée, non-NULL pour une recette créée ; `recipe.visibility ∈ { privée, partagée }`,
**défaut `privée`**. Une recette créée n'apparaît chez les autres foyers que si son foyer la
partage explicitement.

**Verrous juridiques, au même endroit** :
- le texte source des étapes est stocké pour la relecture ; l'application affiche la version
  structurée avec attribution et lien vers la source ; aucune exposition publique ;
- **ODbL** (Open Food Facts) impose attribution **et partage à l'identique** de toute base
  dérivée. Sans effet en instance privée ; **bloquant avant toute ouverture publique**, au
  même titre que le droit d'auteur sur les étapes.

### 5.1 Foyer et personnes

| Table | Champs clés |
|---|---|
| `household` | `id`, `name`, **`llm_monthly_cap_eur`**, `created_at` |
| `user_profile` | `id` (→ `auth.users`), `household_id`, `display_name` |
| `nutrition_target` | `user_profile_id`, `kcal`, `protein_g`, `fiber_g`, `carb_g`, `fat_g`, `valid_from` |
| `invitation` | `household_id`, `email`, `token`, `expires_at`, `accepted_at` |

`nutrition_target` est historisée. **Les cibles sont macro uniquement** — les micronutriments
sont affichés (§11 q. 4) mais ne font l'objet d'aucune cible. Décision explicite.

### 5.2 Aliments, poids et conversions

| Table | Rôle |
|---|---|
| `food` | CIQUAL + Open Food Facts. `source`, `source_code`, `name`, `state` (cru \| cuit), **`ciqual_group`, `ciqual_subgroup`** (fournis par CIQUAL — clé d'accrochage de `unit_conversion`, `default_temperature` et des bornes de D18), `nutrients` jsonb /100 g |
| `food_yield_factor` | **Priorité** : si une entrée CIQUAL « cuit » existe, elle prime ; le facteur ne sert qu'à défaut. |
| `unit_weight` | Poids unitaire de référence (USDA FoodData Central) + `confidence` |
| `unit_conversion` | Cuillères, pincées, poignées → grammes, **par famille d'aliment**. Couvre les 23 % de §4.2. |
| `density` | g/ml par aliment, pour les 9 % de volumes |
| `default_temperature` | Température par défaut par type de préparation, **marquée estimée**. Répond aux 35,7 % de §4.3. |
| **`default_duration`** | Classe A. **(verbe, `appliance_type`) → durée de base, `load_type`, `scaling` ∈ { lineaire_plafonne, constant }** (D19). Ossature déterministe appliquée aux **actions**. **55 verbes**, couvrant 98 % des étapes réelles (§4.3.1). |
| **`non_action_pattern`** | Classe A. Motifs des phrases qui ne décrivent **aucun geste** (« bon appétit », « à déguster chaud », « astuce : »). Elles ne reçoivent pas de durée, **elles sortent de l'ordonnancement**. Sans elles, le plan gagne des minutes fantômes et affiche des étapes vides. |
| **`household_duration_override`** | **Classe C.** Corrections de durée du foyer, par (verbe, `appliance_type`). C'est **ici** qu'écrit la confirmation de §7.5 — pas dans `default_duration`, qui est en classe A. Promotion périodique vers la table partagée par le worker quand plusieurs foyers convergent. Symétrie exacte de `household_unit_weight`. |
| **`instance_setting`** | `key` / `value` — porte **`llm_global_monthly_cap_eur`**, plafond du budget global d'ingestion (D11). |
| **`typical_quantity`** | Par `ciqual_subgroup` → quantité typique en grammes. **Fournit la borne haute de D18** pour les 16 % de lignes sans quantité. Sans elle, `macro_max` n'est pas calculable et le filtre du lot 4 n'a pas de borne défavorable. |
| **`ingestion_job`** | Classe A. `url`, `state`, `attempts`, `error`, `content_hash`. |
| `household_unit_weight` | Poids unitaires appris des pesées du foyer (classe C) |
| **`household_ingredient_resolution`** | Classe C. `recipe_ingredient_id`, `household_id`, `grams`, `resolution_source ∈ { pesé, foyer }`. Porte les priorités 1 et 2 de la cascade §7.3. |
| `weighing` | §5.2.1 |

Sources de `unit_conversion`, `density` et `default_temperature` : **aucune base ouverte ne les
fournit telles quelles.** Elles sont constituées à la main (~150 lignes au total) à partir des
tables de portions USDA et de références culinaires, versionnées dans le dépôt comme des
données de seed, et corrigeables. C'est un **livrable identifié du lot 0a-2**, pas un détail.

#### 5.2.1 `weighing` et la règle d'apprentissage

```
weighing(id, household_id, recipe_ingredient_id, food_id,
         qty_observed, unit_observed,   -- « 2 poivrons »
         grams,                         -- 300
         session_id NULL,               -- le lot 0c précède le lot 1
         at)
```

1. poids unitaire dérivé = `grams / qty_observed`, si `unit_observed` est un compte ;
2. **rejet des aberrantes** hors `[0,4× ; 2,5×]` la référence `unit_weight` ;
   **si aucune référence n'existe** pour cet aliment — précisément le cas où l'apprentissage
   sert le plus — aucun filtre n'est appliqué, mais le seuil d'activation passe de 3 à
   **5 observations** ;
3. `household_unit_weight` = **médiane** des observations retenues (robuste aux fautes de frappe) ;
4. activation à partir de **3 observations** (5 dans le cas sans référence) ; en dessous, la
   référence prime et le compteur est affiché.

### 5.3 Recettes

| Table | Champs clés |
|---|---|
| `recipe` | `source_url`, `source_name`, `origin`, `owner_household_id` NULL, `visibility`, `yield_servings`, `total_time_min`, `license_note`, `edited_by_household_id`, `edited_at` |
| `recipe_ingredient` | `raw_text`, `food_id`, `qty`, `unit`, `grams_reference`, `resolution_source`, `confidence`, `edited_by_household_id`, `edited_at` |
| `recipe_step` | `ordinal`, `text`, **`duration_min`**, **`duration_source`** (déclarée \| defaut \| llm \| **confirmée**), `appliance_type`, `temperature_c`, `temperature_source`, `load_type`, `confidence`, `edited_by_household_id`, `edited_at` |
| `recipe_step_dependency` | `before_id`, `after_id`, `origin` (defaut \| llm \| confirme), `edited_by_household_id`, `edited_at` |

`load_type` ∈ `{ actif, passif, bloquant }`. **`duration_min` n'est jamais NULL après
ingestion** (D15/D19) : la couche `default_duration` garantit une valeur pour toute étape, même
grossière. Aucune recette n'est donc « morte en base ».

**`recipe.plannable`** — **colonne maintenue par trigger** (ni vue ni calcul client : elle est filtrée massivement au lot 4) — est vraie quand chaque action a une durée de source `déclarée` ou
`confirmée`. Une recette non `plannable` **reste sélectionnable pour relecture** — c'est
précisément par là qu'elle le devient — mais l'optimiseur refuse de la planifier tant que ses
durées ne sont pas confirmées, et l'affiche comme telle. `ingestion_job` est en classe A
(infrastructure du worker), pas en B : un foyer n'a pas à écrire dans la file du worker.

### 5.4 Reste

`session`, `session_recipe`, `session_portion`, `session_plan`, `plan_conflict` — lot 1.
`shopping_list` / `shopping_item` — lot 2.
`shopping_item` porte `food_id` **nullable**, `label` libre, `rayon`, `qty`, `unit`, `origine`
(`recette` \| `manuel` \| `habituel`), `coche_par` (qui l'a mis dans le caddie). Les articles
sans `food_id` (entretien, café, dessert) n'entrent pas dans le calcul nutritionnel (D43).
`store(id, household_id, nom, enseigne, par_defaut, ordre_rayons jsonb)` — `ordre_rayons` est
**appris de l'usage** (D58). `shopping_item.store_id` : chaque article porte son magasin (D56),
hérité du défaut du foyer. `shopping_trip(cycle_id, store_id, commencee_a, terminee_a)` : une
sortie par enseigne, terminée indépendamment (D59).
`frequent_shopping_item(household_id, label, rayon, usage_count)` pour les propositions (D45). `fridge_inventory` / `fridge_item` — lot 3.

**`portion`** — créée au lot 1 (la session la produit), consommée aux lots 3 et 6 :

| Champ | Rôle |
|---|---|
| `session_id`, `recipe_id`, `household_id` | D'où elle vient |
| `user_profile_id` NULL | À qui elle est destinée quand les parts sont inégales (D25) |
| `grams`, `macros` jsonb | Calculées au dressage, en intervalle (D18) |
| `cost_eur` | Le coût de la part (lot 5) |
| **`etat`** | `frigo` \| `congelateur` \| `mangee` \| `jetee` |
| `prepared_at` | Date et heure de préparation |
| `stored_at` | Date et heure de la mise au froid **courant** |
| `expires_at` | Recalculée à chaque transition : 3-4 j au frigo, 3 mois au congélateur, 24 h après décongélation (D27) |
| `eaten_at`, `meal` | Quand, et à quel repas — `petit_dejeuner` \| `dejeuner` \| `diner` \| `collation` |

`portion_event(portion_id, de_etat, vers_etat, at)` conserve **chaque** transition : c'est
cet historique qui permet de dire combien vous jetez et ce que ça coûte (D36).

**`meal_plan`** — lot 1 (produit par la répartition, D39), classe C :
`household_id`, `date`, `meal` (`petit_dejeuner` \| `dejeuner` \| `diner` \| `collation`),
`user_profile_id`, `portion_id` NULL, `frequent_food_id` NULL,
`statut` (`prevu` \| `consomme` \| `decale` \| `annule`).

Une ligne par personne et par repas. **C'est cette table qui permet à l'accueil de répondre
à « qu'est-ce qu'on mange aujourd'hui »**. La répartition la remplit, l'écran « La semaine »
la modifie, et `portion.etat` en découle (D40) — jamais l'inverse.

**`frequent_food`** — lot 6, classe C : `household_id`, `label`, `food_id` NULL, `grams`,
`macros` jsonb, `default_meal`, `usage_count`. Enregistré une fois, réutilisable en un geste
sur un repas daté (D38). Les plus utilisés remontent en tête — c'est ce qui rend la saisie du
midi tenable (D26, D34).
`product`, `price_point`, `receipt` — lot 5.
`llm_usage(household_id **NULL**, month, calls, cost_eur, kind)` — lot 0a-1. Plafond global dans `instance_setting.llm_global_monthly_cap_eur` (classe A), plafond par foyer dans `household.llm_monthly_cap_eur` :
**`household_id` NULL = consommation système** (ingestion mutualisée, D11/D13), soumise au
budget global de l'opérateur ; non-NULL = vision et propositions, soumises à
`household.llm_monthly_cap_eur`. La RLS ne laisse un foyer lire que ses propres lignes.

---

## 6. L'optimiseur de session — lot 1

### 6.1 Formalisation

RCPSP. **Tâches** = les `recipe_step`, avec durée (D15) et précédences (D14).

| `load_type` | Consomme | Exemple |
|---|---|---|
| `actif` | **1 unité de `mains`** | « Hacher l'oignon » |
| `passif` | un appareil, **0 `mains`** | « 25 min au four à 180 °C » |
| `bloquant` | 1 `mains` **et** un appareil | « Remuer le risotto » |

**Fusion des actions (D35)** — appliquée **avant** l'ordonnancement, sur le graphe de toutes
les recettes retenues :

1. deux actions fusionnent si `verb` et `food_id` sont identiques et `appliance_type` compatible ;
2. la quantité est la somme, la durée recalculée par `scaling` — `lineaire_plafonne` pour les
   gestes actifs, `constant` pour les cuissons ;
3. si la quantité fusionnée dépasse `household_appliance.capacity`, la tâche est **scindée** en
   autant de passages que nécessaire, jamais abandonnée ;
4. les précédences des recettes d'origine sont **reportées sur la tâche fusionnée** : elle doit
   précéder tout ce que chacune précédait.

C'est cette étape, et non l'entrelacement, qui fait la différence entre « cuisiner trois recettes
à la suite » et « faire une session de batch cooking ».

**Ressources**

| Ressource | Capacité | Sémantique |
|---|---|---|
| `mains` | nombre de cuisiniers (2) | Classique |
| `four` | **`capacity` = nombre de plats simultanés (défaut 2)** + état `température` | Partage **ssi** capacité libre **et** `|T1 − T2| ≤ 10 °C`. Consigne retenue = la plus haute. **Les durées ne sont pas réajustées** : un four domestique dérive déjà de ±15 °C, 10 °C est sous le bruit. Le plan affiche la consigne réelle par plat. |
| `feux` | 4 par défaut | Classique |
| `air_fryer` | 1 | Changement de température sans coût |
| `robot_cuiseur` | 1 | Cuisson longue `passif` |

**Préchauffage** : tâche ordonnançable sur `four`, `load_type = passif`, 12 min par défaut,
insérée avant la première tâche d'un palier et à chaque changement de palier.

La tolérance de ±10 °C n'est **pas** la « tolérance culinaire » écartée en D5 : celle-ci
cuisait *tout* à une moyenne en rallongeant les durées. Ici on ne regroupe que le déjà
compatible, et le reste est séquencé.

**Décomposition de la durée** (D31) : le plan rend **trois nombres, pas un**.
`makespan` = `temps_actif` + `attente_milieu` + `attente_fin`.
`attente_milieu` est la **métrique de qualité de l'ordonnancement** — elle doit tendre vers zéro,
et chaque minute qu'elle contient est une cuisson qu'aucune préparation n'a couverte.
`attente_fin` est légitime : la dernière cuisson tourne, la cuisine est libre, on peut sortir.

**Dépassement de `target_duration_min`** (D32) : jamais d'échec, jamais de refus. Le plan est
produit, le dépassement affiché en minutes **avec la part d'attente qu'il contient** — c'est ce
qui permet de décider — et deux boutons : **accepter** ou raccourcir. Une éviction par coût
marginal décroissant n'est proposée que si l'utilisateur demande à raccourcir.

**Recette non `plannable`** : **reste sélectionnable** — c'est par la sélection que passe la
relecture (§7.5) — mais l'optimiseur ne la planifie pas tant que ses durées ne sont pas
confirmées, et l'affiche comme telle. Elle n'est jamais planifiée sur une durée non confirmée.

### 6.2 Algorithme

*List scheduling* par chemin critique, puis recherche locale sur l'ordre. Déterministe,
< 100 ms pour 5 recettes. **L'explicabilité prime sur l'optimalité** : replanifier sans une
recette donne son coût marginal exact, d'où « ces 2 recettes ensemble = +35 min ; remplacer la
2ᵉ par X = −30 min ». Un solveur optimal ferait mieux en makespan et serait incapable de
produire cette phrase.

### 6.3 Sortie

Gantt par ressource · liste chronologique · bilan nutritionnel **par personne, en intervalle**
(D18), portions calculées depuis `nutrition_target`.

---

## 7. Ingestion

### 7.1 Chaîne

`queued → fetching → extracting → resolving → ready | needs_review | failed`

1. **découverte** — sitemaps publics (D12).
2. **fetch** — JSON-LD en priorité (55/56 mesuré) ; extraction LLM en repli.
3. **extract** — attributs d'étape et relaxations de précédence, avec confiance par champ (R1, R2).
4. **durées** — `default_duration` (D19), puis raffinement LLM ancré sur `prepTime`/`cookTime`. Rejet des seules aberrations. **Aucune contrainte d'égalité** (§4.3).
5. **resolve** — cascade §7.3 ; calcul des macros **en intervalle** (D18).
6. **relecture paresseuse (D17)** — une recette entre en catalogue sans relecture humaine. La
   file n'est alimentée qu'**à la sélection** : les champs à faible confiance de *cette* recette
   sont présentés, **durées en tête** (§7.5). La charge est proportionnelle à l'usage, pas à la
   taille du catalogue.

**Politique de sélection des ~5 000 recettes (D17)** : échantillonnage uniforme dans les
sitemaps des 4 sites retenus, pondéré pour couvrir les catégories utiles (plat, dessert,
petit-déjeuner). Le potentiel protéique n'étant pas connaissable **avant** ingestion, il ne
peut pas servir de critère de sélection. À figer avant de dépenser les 50 € d'amorçage.

Reprise après erreur, déduplication par URL canonique et `content_hash`.

### 7.2 Limites que l'on s'impose

- Découverte par **sitemaps publics uniquement**, jamais de crawl exploratoire.
- **Débit poli** : 1 requête / 2-3 s, `robots.txt` respecté.
- Droit d'auteur et ODbL : voir §5.0.

### 7.3 Cascade de résolution des poids

| Priorité | Source | Table | `resolution_source` |
|---|---|---|---|
| 1 | Pesée attachée à **cette ligne** | `household_ingredient_resolution` (C) | `pesé` |
| 2 | `household_unit_weight` (≥ 3 obs., médiane) | C | `foyer` |
| 3 | `unit_weight` / `unit_conversion` / `density` | A | `référence` |
| 4 | Estimation LLM, marquée, remontée en tête des choses à peser | B | `llm` |
| — | Aucune quantité exprimée (16 % mesurés) | B | `aucune` → **élargit l'intervalle** (D18) |

#### 7.3.1 Où vivent `macro_min` et `macro_max`

Les bornes de D18 dépendent de la cascade, donc **du foyer** (priorités 1 et 2). Elles ne
peuvent donc **pas** être stockées sur `recipe` (classe B) : ce serait réintroduire d'une couche
plus haut le bug corrigé en v3. Elles sont **calculées à la volée**, côté client, depuis
`food.nutrients` et la résolution du foyer. Si le filtrage du lot 4 devient trop lent, un cache
**de classe C** (`household_recipe_macros`) sera ajouté — jamais une colonne sur `recipe`.

Les valeurs nutritionnelles /100 g ne viennent **jamais** du LLM : CIQUAL ou OFF exclusivement.
La nutrition présente dans le JSON-LD des sites n'est **pas** utilisée comme source
(couverture de 7 % à 100 % selon les sites) — au plus comme contrôle de cohérence.

### 7.4 Calcul des macros en intervalle (D18)

Pour chaque recette : `macro_min` ne compte que les lignes résolues ; `macro_max` ajoute une
borne haute plausible pour chaque ligne `aucune` (quantité typique de la famille d'aliment).
Les filtres du lot 4 s'appliquent à la **borne défavorable** : « ≥ 30 g de protéines » teste
`protein_min`, « < 500 kcal » teste `kcal_max`. Une recette dont l'ingrédient protéique est la
ligne sans quantité ne peut donc pas passer le filtre par accident.

---

### 7.5 Confirmation des durées à la sélection

À la sélection d'une recette, ses actions sont présentées avec leur durée pré-remplie et sa
source (`defaut` / `llm`). Corriger met à jour l'action **et** écrit dans
**`household_duration_override`** (classe C) — jamais dans `default_duration`, qui est en
classe A. Le worker promeut périodiquement vers la table partagée quand plusieurs foyers
convergent. Symétrie exacte de la boucle de pesée §5.2.1, classe d'isolation comprise.

**Exigence d'ergonomie, pas un détail** : à 5 recettes par session, cela fait ~28 actions à
confirmer juste avant la session du dimanche. **« Confirmer toute la recette » doit être un
seul geste**, la correction restant possible action par action. Sinon la friction tombe au
pire moment.

Une recette devient `plannable` quand toutes ses étapes sont `déclarée` ou `confirmée`.

---

## 8. LLM — usage, coûts, quotas

| Usage | Modèle | Coût unitaire | Budget |
|---|---|---|---|
| Extraction d'une recette (durées comprises) | rapide | ~0,01 € | **Global** (D11) |
| Vision — photo de frigo | rapide | ~0,003 € | Foyer |
| Vision — ticket de caisse | rapide | ~0,005 € | Foyer |
| Proposition / création de recettes | plus capable | ~0,05 € | Foyer |

**Amorçage (D17)** : 5 000 recettes ≈ **50 € une fois**, sur le budget global, mutualisé entre
tous les foyers. **Régime permanent, 2 personnes** : ~1,30 €/mois sur le budget foyer.

| Poste | Coût |
|---|---|
| Supabase (free tier, UE) | 0 € |
| Cloudflare Pages | 0 € |
| LLM — amorçage (5 000 recettes) | **~4 € une fois** (API à bas coût, contenu public) · ~20 € sur l'API de référence avec Batch + caching · **§8.3** |
| LLM — régime permanent | < 2 €/mois |
| Resend (free) | 0 € |
| Domaine (facultatif) | 12 €/an |

**Volumétrie** : 5 000 recettes → ~45 000 lignes d'ingrédients (~9/recette) **+** ~30 000 étapes (~6/recette) ≈ **75 000 lignes**. Très en deçà des
500 Mo du free tier Supabase. **Open Food Facts n'est pas chargé en dump** (~3,6 M de produits,
~10 Go, incompatible avec le free tier) : il est **interrogé à la demande et mis en cache**
dans `food` au fil des produits rencontrés. Seul CIQUAL, borné à ~3 200 aliments, est chargé
intégralement.

---

### 8.1 Routage par tâche et backends (D20, D21)

| Tâche | Backend | Justification |
|---|---|---|
| Parsing d'une recette | **Aucun modèle** — JSON-LD `schema.org/Recipe` | 98 % de succès mesuré (§4.1) |
| Durées, températures, conversions d'unités | **Tables déterministes** — `default_duration`, `default_temperature`, `unit_conversion` | D19. Hors ligne, auditable, gratuit |
| Décomposition en actions et attributs (les 2 % restants, et tous les attributs) | **`ExtractionBackend`** — le moins cher passant R1 (D22 : contenu public, aucune contrainte de juridiction) | D20, tranché par R1 |
| Vision — frigo, ticket de caisse | **API rapide, fournisseur à posture RGPD** (D22) | 0,03 €/mois d'enjeu total ; les petits VLM sont nettement moins bons sur une photo de frigo encombré. **Et ce sont des données personnelles du domicile** : le prix n'est pas le critère. |
| Création et proposition de recettes | **API capable** | Qualité déterminante, volume faible |

```ts
interface ExtractionBackend {
  readonly name: string            // 'api-fast' | 'local-<modèle>'
  extractSteps(page: RecipeText, anchors: TimeAnchors): Promise<StructuredSteps>
}
```

Même patron que `PriceSource` (§9) : l'implémentation est remplaçable sans toucher au reste.

**Leviers de coût, par ordre de rentabilité :**

| # | Levier | Effet sur les 50 € d'amorçage | Perte de qualité |
|---|---|---|---|
| 1 | Ne pas appeler de modèle (JSON-LD + tables D19) | Déjà acquis — **de loin le plus gros levier** | aucune |
| 2 | **Batch API (−50 %) + prompt caching** — le prompt d'extraction est identique sur 5 000 appels, et l'ingestion *est* un job asynchrone | **50 € → ~20 €** | **aucune** |
| 3 | Modèle local quantifié (D20) | 20 € → 0 € | **à mesurer (R1)** |

Coût réel du levier 3 sur la machine de référence (Core Ultra 7 165H, 22 threads, 31 Go,
pas de GPU CUDA, ollama présent) : 5 000 recettes × ~1 500 tokens de sortie ≈ 7,5 M tokens.
**1B ≈ 1,7 jour** (mais l'extraction JSON structurée depuis du français mal formé est
précisément ce qu'un 1B rate), **3B ≈ 4-5 jours**, **7B Q4 ≈ 11 jours** de calcul continu.
Le prix du levier 3 est donc : **20 € contre plusieurs jours de machine**, à qualité non prouvée.
D'où D20 : on le teste, on ne le suppose pas, et l'architecture n'en dépend pas.

### 8.2 Choix du fournisseur (D22)

| Donnée envoyée | Nature | Critère |
|---|---|---|
| Texte d'une page de recette | **Contenu web public** | Le moins cher qui passe R1. Aucune contrainte de juridiction. |
| Photo du frigo, photo d'un ticket de caisse | **Image de l'intérieur de votre logement** | Conditions contractuelles claires, pas d'entraînement sur les données. **Jamais le moins-disant** — le critère ici est la confiance, pas 0,003 € d'écart. |
| Poids, pesées, objectifs caloriques | **Donnée personnelle intime** — pas nécessairement « de santé » au sens de l'art. 9 (§11 q. 1) | **Ne quittent jamais la base.** Aucun appel LLM ne les transporte. Règle gratuite : aucun besoin fonctionnel ne les envoie dehors. |

### 8.3 Options d'inférence chiffrées — amorçage de 5 000 recettes

Volume : ~15 M tokens en entrée, ~7,5 M en sortie.

| Option | Coût | Délai | Remarque |
|---|---|---|---|
| **API à bas coût** — DeepSeek V4 Flash, ~$0,14 / $0,28 par M | **~4 €** — ~2 € en heures creuses | heures | Meilleur rapport prix/qualité à mesurer. **Contenu public uniquement** (D22). |
| API de référence (Anthropic Haiku) + Batch + prompt caching | ~20 € | heures | Référence de qualité, et fournisseur retenu pour la vision (D22). |
| GLM-5.2 / Kimi K2 | ~10-25 € | heures | À comparer dans R1 si besoin. |
| **OpenRouter, modèles gratuits** | **0 €** | **~5 jours** — 20 req/min, 1 000 req/jour après 10 € versés une fois (50/jour sans) | Le catalogue gratuit change sans préavis : acceptable pour un amorçage unique, **jamais comme dépendance**. |
| **Modèle local quantifié** (3B, machine de référence) | 0 € | **4-5 jours** de machine | La plus faible qualité des cinq. Le prix à battre étant de 4 €, le local ne rapporte plus rien — c'est ce qui tranche D20. |

**Attention aux confusions de nom** : Kimi K2/K3, GLM-5 et DeepSeek V4 sont des MoE de plusieurs
centaines de milliards de paramètres — ils **ne tournent pas** sur une machine de bureau. Ce qui
tourne en local, ce sont des modèles d'une autre classe (Qwen3 4B, Llama 3.2 3B, Gemma 3 4B, ou
un distill 7B). Marques identiques, capacités sans rapport.

**Et un abonnement grand public ne donne aucun accès API** : ChatGPT Plus/Pro et Claude Pro/Max
sont facturés séparément de l'API chez les deux fournisseurs. Toute application exige une clé
facturée à l'usage. À ne pas confondre avec l'usage de Claude Code en développement.

---

## 9. Prix et budget — lot 5

```ts
interface PriceSource {
  readonly name: string
  readonly reliability: 'exact' | 'community' | 'estimated'
  search(product: FoodRef): Promise<PricePoint[]>
}
```

| Adaptateur | Fiabilité | État |
|---|---|---|
| `ReceiptSource` — tickets photographiés | exact | À construire. Alimente aussi le lot 6. |
| `OpenPricesSource` | community | **API 200, données réelles.** Couverture à mesurer (R4). |
| `CarrefourDriveSource` | exact, fragile | Hors CGU, anti-bot, proxies. **Isolé** : s'il tombe, l'app continue. |
| `LidlCatalogSource` | estimated | Prospectus hebdomadaire. **Lidl FR n'a pas de boutique alimentaire en ligne.** |

---

## 10. Découpage en lots

| Lot | Contenu | Livre |
|---|---|---|
| **0a-1 · Schéma et accès** | Projet Supabase UE · schéma des classes A, B et des tables foyer de §5.1 **uniquement** (les tables des lots 1-5 arrivent avec leur lot) · `current_household()` + policies des 3 classes + rôle de service · flux d'invitation complet **via Resend** · CRUD profils et cibles historisées · compteur `llm_usage` et plafonds. **UI** : accepter une invitation, saisir ses cibles, régler le plafond. | Deux comptes, un foyer, l'isolation prouvée. |
| **0a-2 · Référentiels** | Import CIQUAL intégral, **groupes et sous-groupes compris** · accès OFF à la demande avec cache · **constitution à la main de `unit_conversion`, `density`, `default_temperature`, `default_duration` (avec `scaling`), `typical_quantity`** (~250 lignes de seed versionnées) | Le socle nutritionnel. Ne bloque que 0b et 0c. |
| **0b · Ingestion** | Précédé de **R1b, R1, R2**. Politique de sélection des 5 000 recettes figée (§7.1). Worker MCP, découverte sitemap, extraction, durées pré-remplies à double ancrage (D15/D19), normalisation, calcul en intervalle (D18), file de relecture paresseuse (D17). **UI** : écran de relecture à la sélection. | ~5 000 recettes structurées et filtrables. |
| **0c · Pesée** | Boucle d'apprentissage §5.2.1. **UI** : saisie des poids. | La promesse « strict » devient vraie. |
| **1 · La boucle complète** ⚑ | **Livrée d'un bloc**, parce qu'elle n'a aucun sens en morceaux : Choisir → Au magasin → Plan/En cuisine (avec horloge, D47) → **Dressage** (D53) → **La semaine** (D39) → clôture (D54). Plus l'accueil, vue du cycle. | **Le cycle tourne pour de vrai.** |
| ~~2 · Courses~~ | **Absorbé par le lot 1.** Une version qui permettrait de cuisiner sans avoir fait les courses n'a pas de sens. | — |
| **3 · Ce que j'ai** | Saisie manuelle avec autocomplétion **d'abord** (D57) ; le contenu se remplit surtout **en cochant au magasin** (D49). La photo (R3) vient en accélérateur, et ne rend jamais de quantité. | Plus d'achats en double. |
| **4 · Envies et propositions** | Le parcours de §10.1, en trois temps : recherche par ingrédients du frigo → filtres → **génération IA sur demande explicite uniquement**. | Le moteur de suggestion. |
| **5 · Prix** | `PriceSource` + 4 adaptateurs, estimation du panier, veille nouveautés | Budget prévisible. |
| **6 · Suivi** | Tableau de bord mensuel : calories et protéines par jour contre objectif (**deux graphiques, jamais deux axes**), budget en chiffre et jauge, coût par portion. Alimenté par les barquettes cochées (D24), complété par les repères en un geste (D34), et **honnête sur les jours non renseignés** (D33). | Le recul sur 3 mois. |

Le lot 0 **n'est pas invisible** : 0a-1, 0b et 0c livrent chacun une interface. Le back-office
est volontairement rudimentaire — le soin visuel commence au lot 1.

### 10.0 Filtres du catalogue (lot 4)

Dérivés de ce que la base contient réellement :

| Filtre | Remarque |
|---|---|
| **Temps actif**, distinct du temps total | 10 min de gestes + 40 min de four ≠ 50 min de travail. Le filtre le plus utile, et personne ne l'a. Possible grâce à `load_type` (D19). C'est aussi le temps **affiché** sur chaque carte (D30). |
| Type | plat, entrée, dessert, petit-déjeuner, soupe |
| Protéines / kcal / fibres | **Sur la borne défavorable** (D18), jamais la moyenne |
| Appareil requis | « sans four » quand le four est pris ce jour-là |
| Ingrédients du frigo | Lot 3. **Bascule, pas filtre imposé** (D28) : en mode « tout », chaque recette affiche ses manques. |
| Se congèle ou non | Décide si l'on cuisine 6 ou 12 portions (D27) |
| Coût par portion | Lot 5 |
| Jamais essayé / aimé la dernière fois | Une note d'un geste après avoir mangé suffit à rendre les propositions personnelles |
| Sans tel ingrédient | Réglé une fois pour toutes |

### 10.1 Parcours du lot 4 — l'ordre est une exigence, pas une préférence

**Le gratuit d'abord, toujours. L'IA seulement si la personne la demande.**

1. **Recherche par ingrédients** — le contenu du frigo (saisi ou photographié, lot 3) filtre le
   catalogue : « qu'est-ce qu'on peut faire avec ça ». Déterministe, instantané, gratuit.
2. **Filtres cumulables** sur les résultats — calories, protéines, fibres, autres macros
   (toujours sur la **borne défavorable**, D18), **temps de préparation**, envies (fromage,
   poisson, viande, soupe, dessert), équipement disponible.
3. **Génération IA — bouton explicite, jamais autre chose.** Proposée *à côté* des résultats du
   catalogue, y compris quand le catalogue en retourne beaucoup. **Même quand le catalogue ne
   retourne rien, on n'enchaîne pas automatiquement sur la génération** : on l'offre.

**Interdits, formellement :**
- déclencher une génération sans action explicite de la personne ;
- utiliser la génération comme repli silencieux d'une recherche vide ;
- masquer les résultats du catalogue derrière une proposition générée.

Deux raisons, et la première suffit : la personne doit savoir quand elle utilise l'IA et quand
elle ne l'utilise pas. La seconde est que c'est le seul poste de coût variable du régime
permanent (§8.1) — une génération automatique le rendrait incontrôlable.

---

## 11. Questions ouvertes — tranchées par défaut

L'utilisateur a explicitement délégué ces arbitrages. Chacun reçoit un défaut documenté et
**réglable à l'usage** : aucun n'entraîne de réécriture s'il déplaît.

| # | Question | Défaut retenu |
|---|---|---|
| 1 | **RGPD** — s'applique-t-il ? | **Non, tant que l'usage reste le foyer.** L'art. 2.2.c du RGPD exclut le traitement « dans le cadre d'une activité strictement personnelle ou domestique » : deux personnes qui suivent leurs propres repas sont hors champ. Rien à déclarer, aucune formalité.<br>**Oui, dès qu'un foyer tiers se connecte** (D7 prévoit l'ouverture sur invitation) : à ce moment on traite les données d'autrui et l'exemption tombe.<br>Dispositions prises **par anticipation, parce qu'elles coûtent peu** : hébergement UE (acquis, c'est le choix de région Supabase), export et suppression de compte au lot 0a-1 (~20 lignes de SQL, et cela sert aussi de sauvegarde), et aucun poids ni objectif transporté vers un LLM (§8.2 — bonne pratique gratuite, pas une obligation).<br>**Formulation corrigée** : « donnée de santé au sens de l'art. 9 » était excessif. Un objectif calorique n'est pas un dossier médical ; la qualification est discutable, pas établie. Elle n'a de toute façon d'objet que dans le cas ouvert. |
| 2 | **Conservation des plats** | **3-4 jours au frigo** pour un plat cuisiné, au-delà **congélation**. Dimensionne le nombre de portions par session : ~8 portions fraîches maximum pour 2 personnes. Réglable par foyer. |
| 3 | **Validation des recettes générées** (lot 4) | `visibility = privée` d'office. Le passage en `partagée` est un **acte explicite du foyer**, jamais automatique. |
| 4 | **Micronutriments affichés** | **Fer, calcium, B12, oméga-3, magnésium, vitamine D** — les six qui bougent réellement avec un régime riche en protéines. Aucune cible (§5.1), affichage seul. Les ~54 autres restent en base, disponibles sans encombrer l'interface. |
| 5 | **Veille « nouveautés protéinées »** | **Hebdomadaire**, calée sur la parution des prospectus. |

---

## 12. Hors scope (YAGNI)

- Application iOS/Android native (D10)
- Inscription ouverte, CGU, paiement, abonnement (D7)
- LLM auto-hébergé (D9)
- Partage social, communauté, notation de recettes
- Commande automatique chez un drive
- Suivi du poids corporel et de la composition corporelle
- Import depuis MyFitnessPal, Yazio et équivalents
