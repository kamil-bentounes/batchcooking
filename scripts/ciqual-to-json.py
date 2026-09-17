#!/usr/bin/env python3
"""Convertit la table CIQUAL (.xls, ANSES) en JSON compact pour le seed.

Opération ponctuelle : le JSON produit est versionné, ce script n'est rejoué
que si l'ANSES publie une nouvelle table.

    python3 -m venv .venv && .venv/bin/pip install xlrd
    .venv/bin/python scripts/ciqual-to-json.py ciqual.xls seed/ciqual.json

Licence CIQUAL : Licence Ouverte Etalab. Attribution : ANSES-CIQUAL.
"""
import json, re, sys, unicodedata

# Les colonnes qu'on garde, et sous quel nom. Le reste est ignoré : CIQUAL en
# fournit ~60, la moitié n'a aucun usage ici et alourdirait chaque ligne.
NUTRIMENTS = {
    'energie_kcal': r'Energie, Règlement UE.*kcal',
    'proteines_g':  r'^Protéines, N x facteur de Jones',
    'glucides_g':   r'^Glucides \(',
    'lipides_g':    r'^Lipides \(',
    'fibres_g':     r'^Fibres alimentaires',
    'sucres_g':     r'^Sucres \(',
    'ags_g':        r'^AG saturés \(',
    'sel_g':        r'^Sel chlorure de sodium',
    'calcium_mg':   r'^Calcium \(',
    'fer_mg':       r'^Fer \(',
    'magnesium_mg': r'^Magnésium \(',
    'vit_d_ug':     r'^Vitamine D \(',
    'vit_b12_ug':   r'^Vitamine B12 \(',
    'omega3_g':     r'^AG 18:3 c9,c12,c15 \(n-3\)',
}

def nombre(v):
    """CIQUAL écrit « 12,3 », « < 0,1 », « traces », « - ». Rien n'est un float."""
    if v is None: return None
    s = str(v).strip().replace('\xa0', '').replace(' ', '')
    if s in ('', '-', 'NULL'): return None
    if s.lower() in ('traces', 'traces.'): return 0.0
    s = s.lstrip('<').replace(',', '.')
    try: return float(s)
    except ValueError: return None

CUIT = re.compile(r'\b(cuit|cuite|cuits|cuites|grillé|rôti|frit|bouilli|poché|'
                  r'braisé|sauté|vapeur|au four|à la poêle)\b', re.I)

def main(src, dst):
    import xlrd
    sh = xlrd.open_workbook(src).sheet_by_index(0)
    hdr = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]

    idx = {}
    for cle, motif in NUTRIMENTS.items():
        trouve = [i for i, h in enumerate(hdr) if re.search(motif, h, re.I)]
        if not trouve:
            print(f'  ⚠️  colonne introuvable pour {cle} ({motif})', file=sys.stderr)
            continue
        idx[cle] = trouve[0]

    col = {h: i for i, h in enumerate(hdr)}
    out, ignores = [], 0
    for r in range(1, sh.nrows):
        # xlrd rend les nombres en float : 24999.0 au lieu de « 24999 ».
        brut = sh.cell_value(r, col['alim_code'])
        code = str(int(brut)) if isinstance(brut, float) else str(brut).strip()
        nom  = str(sh.cell_value(r, col['alim_nom_fr'])).strip()
        if not code or not nom:
            ignores += 1; continue
        nutriments = {k: v for k, v in
                      ((k, nombre(sh.cell_value(r, i))) for k, i in idx.items())
                      if v is not None}
        out.append({
            'code': code,
            'nom': nom,
            'groupe': str(sh.cell_value(r, col['alim_grp_nom_fr'])).strip() or None,
            'sous_groupe': str(sh.cell_value(r, col['alim_ssgrp_nom_fr'])).strip() or None,
            'etat': 'cuit' if CUIT.search(nom) else 'cru',
            'nutriments': nutriments,
        })

    # CIQUAL 2020 contient un doublon réel (code 9621, « Son de blé »).
    # On garde la première occurrence : la table cible a un index unique.
    vus, dedup, doublons = set(), [], 0
    for a in out:
        if a['code'] in vus: doublons += 1; continue
        vus.add(a['code']); dedup.append(a)
    out = dedup

    json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
    cuits = sum(1 for a in out if a['etat'] == 'cuit')
    print(f'{len(out)} aliments écrits dans {dst}  ({cuits} marqués « cuit », '
          f'{ignores} lignes vides, {doublons} doublon(s) écarté(s))')
    print(f'nutriments retenus : {", ".join(sorted(idx))}')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
