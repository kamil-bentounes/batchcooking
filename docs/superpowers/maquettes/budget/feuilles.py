#!/usr/bin/env python3
"""Direction A : l'écran du mois, et deux feuilles — déclarer, payer une facture."""
import json, os
from build import (P, BLOB, POS, NB, eur, svg, page, potager)

SERIF = "font-family:'Fraunces',Georgia,serif;font-variation-settings:'opsz' 144"
OMBRE = 'box-shadow:0 1px 2px rgba(28,43,35,.06),0 8px 24px rgba(28,43,35,.07)'
FONTES = ('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700'
          '&amp;family=Instrument+Sans:wght@400..700&amp;display=swap')
RACINE = ("background:#7C857F;color:#1C2B23;font-family:'Instrument Sans',system-ui,sans-serif;"
          "position:relative")


def feuille(titre_page, photo, titre, sous_titre, corps):
    """Une feuille qui monte du bas, sur l'écran du mois assombri."""
    return page(titre_page, 390, 844, FONTES, RACINE, f'''<section style="position:absolute;left:0;right:0;top:64px;bottom:0;box-sizing:border-box;padding:10px 16px 24px;border-radius:28px 28px 0 0;background:#F2F4EF">
<div style="width:40px;height:5px;border-radius:3px;background:#C9D1C5;margin:0 auto"></div>
<div style="margin-top:14px;display:flex;align-items:center;gap:12px">
<img src="{BLOB[photo]}" alt="" style="width:52px;height:52px;border-radius:15px;object-fit:cover;object-position:{POS[photo]};flex-shrink:0">
<div style="flex-grow:1;min-width:0">
<h1 style="margin:0;{SERIF};font-size:28px;font-weight:600;line-height:1.1;letter-spacing:-.015em">{titre}</h1>
<div style="margin-top:2px;font-size:14px;color:#5D6E62">{sous_titre}</div>
</div>
<button type="button" aria-label="Fermer" style="width:44px;height:44px;border-radius:50%;border:0;background:#E4E9E1;display:flex;align-items:center;justify-content:center;flex-shrink:0">{svg('x', 20, 2.2)}</button>
</div>
{corps}
</section>''')


def champ_montant(ident, libelle, valeur):
    return f'''<label for="{ident}" style="display:block;font-size:14px;color:#5D6E62">{libelle}</label>
<div style="margin-top:6px;display:flex;align-items:center;gap:8px;padding:0 18px;height:64px;box-sizing:border-box;border-radius:18px;background:#FBFCFA;border:2px solid #2F5D45">
<input id="{ident}" type="text" inputmode="decimal" value="{valeur}" style="flex-grow:1;min-width:0;border:0;background:transparent;outline:none;padding:0;{SERIF};font-size:30px;font-weight:600;color:#1C2B23">
<span aria-hidden="true" style="{SERIF};font-size:30px;font-weight:600;color:#5D6E62">€</span>
</div>'''


def quand(choix, etiquette):
    boutons = ''
    for i, c in enumerate(choix):
        sel = i == 0
        st = 'background:#1C2B23;color:#F2F4EF' if sel else 'background:#E4E9E1;color:#1C2B23'
        boutons += f'<button type="button" role="radio" aria-checked="{"true" if sel else "false"}" style="min-height:44px;padding:0 16px;border:0;border-radius:999px;{st};font-size:14px;font-weight:500">{c}</button>'
    return f'<div role="radiogroup" aria-label="{etiquette}" style="margin-top:10px;display:flex;gap:8px">{boutons}</div>'


def courses():
    entrees = [('Sam. 10 oct.', 4790), ('Mer. 7 oct.', 11850), ('Sam. 3 oct.', 6240)]
    deja = sum(c for _, c in entrees)
    prevu = 80000
    lignes = ''
    for i, (jour, cents) in enumerate(entrees):
        filet = 'border-top:1px solid #E4E9E1;' if i else ''
        lignes += f'''<div style="{filet}display:flex;align-items:center;gap:10px;min-height:52px">
<span style="flex-grow:1;font-size:15px">{jour}</span>
<span style="font-size:15px;font-weight:500;font-variant-numeric:tabular-nums">{eur(cents)}</span>
<button type="button" aria-label="Retirer {eur(cents)} du {jour}" style="width:44px;height:44px;margin-right:-10px;border:0;background:transparent;color:#5D6E62;display:flex;align-items:center;justify-content:center">{svg('trash', 18, 1.8)}</button>
</div>'''
    corps = f'''<div style="margin-top:16px;padding:16px;border-radius:22px;background:#FBFCFA;{OMBRE}">
<div style="display:flex;align-items:baseline;gap:8px"><span style="{SERIF};font-size:40px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums">{eur(deja)}</span><span style="font-size:15px;color:#5D6E62">sur {eur(prevu)}</span></div>
<div style="margin-top:10px;height:8px;border-radius:4px;background:#E4E9E1"><div style="width:{deja / prevu * 100:.1f}%;height:8px;border-radius:4px;background:#2F5D45"></div></div>
<div style="margin-top:8px;font-size:14px;color:#5D6E62">Il reste {eur(prevu - deja)} pour octobre.</div>
</div>
<div style="margin-top:18px">
{champ_montant('montant', 'Nouvelle dépense', '54,20')}
{quand(['Aujourd’hui', 'Hier', 'Autre jour'], 'Quand')}
<button type="button" style="margin-top:14px;width:100%;height:56px;border:0;border-radius:18px;background:#E8A33D;color:#1C2B23;font-size:17px;font-weight:600">Ajouter {eur(5420)}</button>
</div>
<h2 style="margin:22px 0 0;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#5D6E62">Déjà ce mois-ci</h2>
<div style="margin-top:8px;padding:0 14px;border-radius:18px;background:#FBFCFA;{OMBRE}">{lignes}</div>'''
    return feuille('Déclarer des courses', 'courses', 'Courses',
                   f'Octobre · {eur(prevu)} prévus', corps)


def entretien():
    an, facture = 50000, 62000
    corps = f'''<div style="margin-top:16px;padding:6px 16px;border-radius:22px;background:#FBFCFA;{OMBRE}">
<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;min-height:46px;align-items:center"><span style="font-size:15px">Prévu pour 2026</span><span style="font-size:15px;font-weight:600;font-variant-numeric:tabular-nums">{eur(an)}</span></div>
<div style="border-top:1px solid #E4E9E1;display:flex;justify-content:space-between;gap:10px;min-height:46px;align-items:center"><span style="font-size:15px">Factures payées en 2026</span><span style="font-size:15px;font-weight:600;font-variant-numeric:tabular-nums">{eur(0)}</span></div>
</div>
<div style="margin-top:18px">
{champ_montant('facture', 'Montant de la facture', '620,00')}
<div style="margin-top:14px;font-size:14px;color:#5D6E62">Payée</div>
{quand(['Aujourd’hui', 'Autre jour'], 'Payée')}
<div style="margin-top:14px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:#F6EAD2;font-size:15px;line-height:1.45">
<span style="color:#8F5A0D;display:flex;margin-top:2px">{svg('info', 18, 2)}</span>
<span>{eur(facture - an)} de plus que les {eur(an)} prévus pour l’année : ils s’ajoutent à octobre.</span>
</div>
<button type="button" style="margin-top:14px;width:100%;height:56px;border:0;border-radius:18px;background:#E8A33D;color:#1C2B23;font-size:17px;font-weight:600">Ajouter la facture</button>
</div>'''
    return feuille('Payer une facture', 'auto', 'Entretien auto',
                   f'{eur(4167)} mis de côté chaque mois', corps)


ECRITS = [('Main.dc.html', potager), ('Courses.dc.html', courses), ('Entretien.dc.html', entretien)]
for fichier, f in ECRITS:
    with open(os.path.join(P, fichier), 'w', encoding='utf-8') as fh:
        fh.write(f())

with open(os.path.join(P, 'canvas.json'), encoding='utf-8') as fh:
    canvas = json.load(fh)
canvas['boards'] = {
    'Main.dc.html': {'x': 0, 'y': 0, 'w': 390, 'h': 2080, 'title': 'A · Le mois'},
    'Courses.dc.html': {'x': 470, 'y': 0, 'w': 390, 'h': 844,
                        'title': 'A · Déclarer — courses, mi-octobre (exemple)'},
    'Entretien.dc.html': {'x': 940, 'y': 0, 'w': 390, 'h': 844,
                          'title': 'A · Une facture mise de côté (exemple)'},
    'Nuit.dc.html': {'x': 0, 'y': 2620, 'w': 390, 'h': 2130, 'title': 'B · Nuit'},
    'Album.dc.html': {'x': 470, 'y': 2620, 'w': 390, 'h': 2480, 'title': 'C · Album'},
}
canvas['order'] = ['Main.dc.html', 'Courses.dc.html', 'Entretien.dc.html',
                   'Nuit.dc.html', 'Album.dc.html']
canvas['notes'] = {
    'titre': {'x': 0, 'y': -300, 'text': 'Budget — direction A', 'kind': 'title1', 'maxW': 1330},
    'ecartees': {'x': 0, 'y': 2320, 'text': 'Écartées', 'kind': 'title1', 'maxW': 860},
}
with open(os.path.join(P, 'canvas.json'), 'w', encoding='utf-8') as fh:
    json.dump(canvas, fh, ensure_ascii=False, indent=1)
print('ok')
