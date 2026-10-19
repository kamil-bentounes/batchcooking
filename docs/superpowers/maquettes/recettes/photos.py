#!/usr/bin/env python3
"""Retélécharge les dix photos de la maquette dans img/0.jpg … img/9.jpg (640 × 480).

Ces photos sont celles des sites d'où viennent les recettes : elles ne sont pas à nous,
img/ est donc ignoré par git. On refait ce qu'a fait la session du 01/10/2026 : la page
de la recette, son JSON-LD `Recipe`, le champ `image`, puis l'image elle-même.

- Une requête par seconde, avec l'agent de Popote, comme l'import du catalogue.
- Aucun contournement : une page refusée (403, 429, 503…), un défi anti-robot ou une
  page sans image dans son JSON-LD donnent une image neutre, et le script le dit.
- Une photo déjà là n'est pas redemandée (--tout pour tout reprendre). Une image neutre,
  marquée par img/N.neutre, est retentée au passage suivant.

Il faut ImageMagick (`convert`).
"""
import json, os, re, subprocess, sys, time, urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ICI, 'img')
UA = 'batchcooking-perso/1.0 (usage domestique ; contact via github.com/kamil-bentounes)'
NEUTRE = '#DCE2D6'  # la « brume » du style A


def recette(o):
    if isinstance(o, list):
        for x in o:
            r = recette(x)
            if r:
                return r
    elif isinstance(o, dict):
        t = o.get('@type')
        if t == 'Recipe' or (isinstance(t, list) and 'Recipe' in t):
            return o
        if '@graph' in o:
            return recette(o['@graph'])
    return None


def image(i):
    if isinstance(i, str):
        return i
    if isinstance(i, list) and i:
        return image(i[0])
    if isinstance(i, dict):
        return i.get('url') or i.get('contentUrl')
    return None


def demande(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'fr-FR,fr;q=0.9'})
    try:
        return urllib.request.urlopen(req, timeout=20).read()
    finally:
        time.sleep(1)  # une requête par seconde, réussie ou non


def photo_de(page_url):
    html = demande(page_url).decode('utf-8', 'replace')
    r = None
    for bloc in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            r = recette(json.loads(bloc))
        except ValueError:
            continue
        if r:
            break
    u = image(r.get('image')) if r else None
    if not u:
        raise ValueError('pas d’image dans le JSON-LD de la page (défi anti-robot ?)')
    return u


def convertit(source, cible):
    subprocess.run(['convert', source + '[0]', '-resize', '640x640^', '-gravity', 'center',
                    '-extent', '640x480', '-strip', '-quality', '72', cible], check=True,
                   capture_output=True)


def main():
    tout = '--tout' in sys.argv[1:]
    os.makedirs(IMG, exist_ok=True)
    dix = json.load(open(os.path.join(ICI, 'dix.json'), encoding='utf-8'))
    neutres = []
    for d in dix:
        n = d['ordre']
        jpg, marque, src = (os.path.join(IMG, f'{n}{ext}') for ext in ('.jpg', '.neutre', '.src'))
        if not tout and os.path.exists(jpg) and not os.path.exists(marque):
            print(n, 'déjà là')
            continue
        try:
            u = photo_de(d['source_url'])
            with open(src, 'wb') as fh:
                fh.write(demande(u))
            convertit(src, jpg)
            os.remove(src)
            if os.path.exists(marque):
                os.remove(marque)
            print(n, 'ok', os.path.getsize(jpg) // 1024, 'Ko', u)
        except Exception as e:  # noqa: BLE001 — on note et on passe, sans insister
            subprocess.run(['convert', '-size', '640x480', f'xc:{NEUTRE}', '-strip', '-quality', '72', jpg],
                           check=True)
            open(marque, 'w').write(f"{d['source_url']}\n{e}\n")
            if os.path.exists(src):
                os.remove(src)
            neutres.append(n)
            print(n, 'IMAGE NEUTRE —', d['site'], '—', e)
    if neutres:
        print('Images neutres :', ', '.join(map(str, neutres)), '— relancer plus tard pour les reprendre.')


if __name__ == '__main__':
    main()
