# Maquette du Budget — direction A « Potager » (01/10/2026)

Les générateurs de l'artefact Design « Budget Popote »
(<https://claude.ai/artifact/AYFfTebjBfRTrRxFmyPZVW>), retrouvés dans le transcript de la
session du 01/10/2026 et rejoués dans l'ordre : `build.py` (puis ses deux retouches),
`feuilles.py` (puis sa retouche), `cloture.py`. Rejoués tels quels, ils redonnent à l'octet
près les six planches publiées.

## Régénérer

```sh
cd docs/superpowers/maquettes/budget
python3 cloture.py   # importe feuilles.py, qui importe build.py
```

- `build.py` n'écrit plus rien depuis sa première retouche : c'est la bibliothèque (les
  chiffres d'octobre, les icônes, `page()`, `potager()`, `nuit()`, `album()`).
- `feuilles.py` écrit `project/Main.dc.html` (A · Le mois), `Courses.dc.html` et
  `Entretien.dc.html`, et relit `project/canvas.json`.
- `cloture.py` relance `feuilles.py`, écrit `Cloture.dc.html` et l'ajoute au canevas.
- `Nuit.dc.html` et `Album.dc.html` (directions B et C, écartées) viennent de la première
  version de `build.py`, avant ses retouches. Aucun script ne les réécrit : ils sont
  versionnés tels quels. `nuit()` et `album()` d'aujourd'hui ne les redonneraient pas à
  l'identique (rappel du 27, montants à dire).

Seul écart avec l'original : les images pointent vers `photos/` (`../photos/<clé>.jpg`
depuis `project/`) au lieu des blobs `/_blob/<id>` de l'artefact.

## Voir, capturer

Ouvrir `project/*.dc.html` dans un navigateur. Seul manque `support.js`, fourni par le
type Design de claude.ai, sans effet sur le rendu. Les polices viennent de Google Fonts.

Captures de référence (412 px, voir l'en-tête du script) :
`node docs/superpowers/maquettes/captures.mjs` → `../captures/budget-*.png`.

## Les photos

Six photos CC0 de StockSnap, réduites à 800 px de large : `maison` BI0P6D3WL9,
`courses` CUPJ7AU7JD, `auto` SBXLNOL5WP, `credits` Z1TKDI29FZ, `abonnements` DLITZEAVJJ,
`epargne` ZLEVSWFWZC. Le CDN refuse `curl` sans agent de navigateur ni référent :

```sh
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36"
mkdir -p /tmp/stocksnap
for p in maison:BI0P6D3WL9 courses:CUPJ7AU7JD auto:SBXLNOL5WP credits:Z1TKDI29FZ \
         abonnements:DLITZEAVJJ epargne:ZLEVSWFWZC; do
  curl -s -A "$UA" -e https://stocksnap.io/ -o "/tmp/stocksnap/${p#*:}.jpg" \
    "https://cdn.stocksnap.io/img-thumbs/960w/${p#*:}.jpg"
  convert "/tmp/stocksnap/${p#*:}.jpg" -resize 800x -strip -quality 80 -interlace JPEG "photos/${p%%:*}.jpg"
  sleep 1
done
```
