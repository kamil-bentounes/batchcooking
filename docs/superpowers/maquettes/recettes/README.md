# Maquette des recettes — l'écran « Choisir » (01/10/2026)

Le générateur de la maquette publiée le 01/10/2026
(<https://claude.ai/artifact/HUW9FsrjkYR8AUfwYMRGjQ>) : deux listes (A · Grandes photos,
B · Vignettes), la fiche (i) et le bas de la liste, dans le style A du Budget. Retenus ce
jour-là : **la liste B** et **la fiche (i) telle quelle** ; les photos resteront un lien
vers le site.

`build.py` (écrit, puis sa retouche rejouée) lit :

- `dix.json` — les dix recettes du catalogue retenues pour la maquette (titres, temps,
  appareils, kcal et protéines avec leurs marges, fibres, site, URL de la recette) ;
- `fiche.jsonl` — ingrédients et étapes de la Joue de bœuf
  (`c65a907a-7688-4cf0-910d-cdb9bdb0ba35`), pour la fiche (i) ;
- `img/0.jpg` … `img/9.jpg` — les photos des sites, 640 × 480, **non versionnées** : elles
  ne sont pas à nous.

`dix.json` et `fiche.jsonl` sont refaits à partir des sorties de requêtes gardées dans le
transcript, sans relire la base. Une seule supposition : la fin du titre Marmiton des
blancs de poulet, coupée à l'affichage (« : la meilleure recette ») ; `propre()` la
retire de toute façon.

## Régénérer

```sh
cd docs/superpowers/maquettes/recettes
python3 photos.py   # page de la recette → JSON-LD → image ; une requête par seconde
python3 build.py    # → recettes.html (~770 Ko, photos en base64, non versionné)
```

`photos.py` ne contourne rien : un site qui refuse donne une image neutre, signalée, et
retentée au passage suivant. Il faut ImageMagick.

Captures de référence (412 px, voir l'en-tête du script) :
`node docs/superpowers/maquettes/captures.mjs` → `../captures/recettes-*.png`.
