#!/usr/bin/env python3
"""Direction A : la clôture du 27 (exemple de fin octobre)."""
import json, os
import feuilles  # réécrit l'écran du mois et les deux feuilles
from build import P, BLOB, POS, eur, svg, page
from feuilles import SERIF, OMBRE, FONTES

PREVU_RESTE = 42680
BOUTON_PLEIN = 'background:#2F5D45;color:#F2F4EF;border:1px solid #2F5D45;font-weight:600'
BOUTON_VIDE = 'background:transparent;color:#1C2B23;border:1px solid #DCE2D6;font-weight:500'


def etape(n, titre, texte):
    return f'''<div style="margin-top:30px;display:flex;gap:12px;align-items:flex-start">
<span aria-hidden="true" style="width:34px;height:34px;border-radius:50%;background:#1C2B23;color:#E8A33D;display:flex;align-items:center;justify-content:center;{SERIF};font-size:18px;font-weight:600;flex-shrink:0">{n}</span>
<div><h2 style="margin:2px 0 0;{SERIF};font-size:23px;font-weight:600;line-height:1.15">{titre}</h2><p style="margin:4px 0 0;font-size:15px;color:#5D6E62;line-height:1.45">{texte}</p></div>
</div>'''


def cloture():
    o = [f'''<div style="height:56px;display:flex;align-items:center">
<button type="button" style="display:flex;align-items:center;gap:4px;min-height:44px;padding:0 6px 0 0;border:0;background:transparent;color:#2F5D45;font-size:16px;font-weight:600">{svg('back', 20, 2.2)}Budget</button>
</div>
<div style="margin-top:4px;font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5D6E62">Mardi 27 octobre</div>
<h1 style="margin:4px 0 0;{SERIF};font-size:40px;font-weight:600;line-height:1.05;letter-spacing:-.02em">Clôturer octobre</h1>
<p style="margin:10px 0 0;font-size:16px;color:#5D6E62">Trois étapes, et le mois est fait.</p>''']

    # 1 · Les factures : le montant habituel est déjà là.
    o.append(etape(1, 'Les factures du mois', 'Le montant habituel est déjà là. Corrige-le seulement s’il a changé.'))
    o.append(f'''<div style="margin-top:12px;padding:14px 16px;border-radius:22px;background:#FBFCFA;{OMBRE}">
<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px"><span style="font-size:16px;font-weight:600">Électricité</span><span style="{SERIF};font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">{eur(5000)}</span></div>
<div style="margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
<button type="button" aria-pressed="true" style="min-height:44px;border-radius:14px;{BOUTON_PLEIN};font-size:15px;display:flex;align-items:center;justify-content:center;gap:6px">{svg('check', 18, 2.4)}C’est ça</button>
<button type="button" aria-pressed="false" style="min-height:44px;border-radius:14px;{BOUTON_VIDE};font-size:15px">Modifier</button>
</div>
</div>''')

    # 2 · Ce qui s'est additionné au fil du mois.
    depenses = [('Courses', 64230, 80000), ('Restaurants', 31800, 40000),
                ('Sorties et culture', None, 10000), ('Essence', 13860, 16000), ('Péage', 2450, 3000)]
    en_moins = sum(p - (d or 0) for _, d, p in depenses)
    o.append(etape(2, 'Tes dépenses du mois', 'Ce que tu as déclaré. Ajoute ce qui manque.'))
    lignes = ''
    for i, (nom, dit, prevu) in enumerate(depenses):
        filet = 'border-top:1px solid #E4E9E1;' if i else ''
        plus = f'<button type="button" aria-label="Ajouter une dépense — {nom}" style="width:44px;height:44px;border-radius:50%;border:1px solid #DCE2D6;background:transparent;color:#2F5D45;display:flex;align-items:center;justify-content:center;flex-shrink:0">{svg("plus", 18, 2.2)}</button>'
        if dit is None:
            lignes += f'''<div style="{filet}padding:12px 0;display:flex;align-items:center;gap:12px">
<div style="flex-grow:1;min-width:0">
<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px"><span style="font-weight:600">{nom}</span><span style="color:#8F5A0D;font-weight:600">Rien de déclaré</span></div>
<button type="button" aria-pressed="true" style="margin-top:8px;min-height:44px;padding:0 14px;border-radius:999px;{BOUTON_PLEIN};font-size:14px;display:inline-flex;align-items:center;gap:6px">{svg('check', 16, 2.4)}Rien dépensé</button>
</div>
{plus}
</div>'''
        else:
            lignes += f'''<div style="{filet}padding:12px 0;display:flex;align-items:center;gap:12px">
<div style="flex-grow:1;min-width:0">
<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px"><span style="font-weight:600">{nom}</span><span style="color:#5D6E62;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(dit)} sur {eur(prevu)}</span></div>
<div style="margin-top:8px;height:6px;border-radius:3px;background:#E4E9E1"><div style="width:{dit / prevu * 100:.1f}%;height:6px;border-radius:3px;background:#2F5D45"></div></div>
</div>
{plus}
</div>'''
    o.append(f'''<div style="margin-top:12px;padding:2px 16px;border-radius:22px;background:#FBFCFA;{OMBRE}">{lignes}</div>
<p style="margin:12px 0 0;font-size:15px;font-weight:600;color:#2F5D45">Tu as dépensé {eur(en_moins)} de moins que prévu.</p>''')

    # 3 · Ce qui reste, et ce qu'on en fait (D65 : une décision, pas un automatisme).
    reste = PREVU_RESTE + en_moins
    o.append(etape(3, 'Ce qui reste', 'Tu décides où va l’argent qui n’a pas servi.'))

    def radio(sel):
        interieur = '<span style="width:10px;height:10px;border-radius:50%;background:#2F5D45"></span>' if sel else ''
        bord = '#2F5D45' if sel else '#B9C4B5'
        return f'<span aria-hidden="true" style="width:22px;height:22px;border-radius:50%;border:2px solid {bord};box-sizing:border-box;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">{interieur}</span>'

    o.append(f'''<div style="margin-top:12px;padding:18px 18px 16px;border-radius:24px;background:#1C2B23;color:#F2F4EF">
<div style="font-size:15px;color:#B7C6BC">Il te reste ce mois-ci</div>
<div style="margin-top:2px;{SERIF};font-size:54px;font-weight:600;line-height:1.05;letter-spacing:-.03em;color:#E8A33D;font-variant-numeric:tabular-nums">{eur(reste)}</div>
<div style="margin-top:6px;font-size:14px;color:#B7C6BC">{eur(PREVU_RESTE)} prévus, plus {eur(en_moins)} dépensés en moins</div>
</div>
<div role="radiogroup" aria-label="Que faire de ce qui reste" style="margin-top:10px;display:flex;flex-direction:column;gap:8px">
<button type="button" role="radio" aria-checked="true" style="width:100%;text-align:left;padding:14px 14px 14px 16px;border-radius:20px;border:2px solid #2F5D45;background:#FBFCFA;display:flex;gap:12px;align-items:center">
{radio(True)}
<span style="flex-grow:1;min-width:0"><span style="display:block;font-size:16px;font-weight:600">Le mettre de côté</span><span style="display:block;margin-top:2px;font-size:14px;color:#5D6E62">Ton épargne d’urgence passe à {eur(reste)} sur {eur(400000)}.</span></span>
<img src="{BLOB['epargne']}" alt="" style="width:46px;height:46px;border-radius:13px;object-fit:cover;object-position:{POS['epargne']};flex-shrink:0">
</button>
<button type="button" role="radio" aria-checked="false" style="width:100%;text-align:left;padding:14px 16px;border-radius:20px;border:1px solid #DCE2D6;background:#FBFCFA;display:flex;gap:12px;align-items:center">
{radio(False)}
<span style="flex-grow:1;min-width:0"><span style="display:block;font-size:16px;font-weight:600">Le garder sur le compte</span><span style="display:block;margin-top:2px;font-size:14px;color:#5D6E62">Il reste disponible pour novembre.</span></span>
</button>
</div>
<label for="mis-de-cote" style="display:block;margin-top:14px;font-size:14px;color:#5D6E62">Combien mettre de côté</label>
<div style="margin-top:6px;display:flex;align-items:center;gap:8px;padding:0 16px;height:56px;box-sizing:border-box;border-radius:16px;background:#FBFCFA;border:1px solid #DCE2D6">
<input id="mis-de-cote" type="text" inputmode="decimal" value="{eur(reste)[:-2]}" style="flex-grow:1;min-width:0;border:0;background:transparent;outline:none;padding:0;{SERIF};font-size:24px;font-weight:600;color:#1C2B23">
<span aria-hidden="true" style="{SERIF};font-size:24px;font-weight:600;color:#5D6E62">€</span>
</div>
<button type="button" style="margin-top:18px;width:100%;height:56px;border:0;border-radius:18px;background:#E8A33D;color:#1C2B23;font-size:17px;font-weight:600">Clôturer octobre</button>
<p style="margin:10px 0 0;text-align:center;font-size:14px;color:#5D6E62">Tu pourras revenir dessus depuis le mois.</p>''')

    return page('Clôturer octobre', 390, 1700, FONTES,
                "background:#F2F4EF;color:#1C2B23;font-family:'Instrument Sans',system-ui,sans-serif;padding:0 16px 40px",
                '\n'.join(o)), reste, en_moins


html, reste, en_moins = cloture()
with open(os.path.join(P, 'Cloture.dc.html'), 'w', encoding='utf-8') as fh:
    fh.write(html)

with open(os.path.join(P, 'canvas.json'), encoding='utf-8') as fh:
    canvas = json.load(fh)
canvas['boards']['Cloture.dc.html'] = {'x': 1410, 'y': 0, 'w': 390, 'h': 1700,
                                       'title': 'A · La clôture du 27 (exemple)'}
canvas['order'] = ['Main.dc.html', 'Courses.dc.html', 'Entretien.dc.html', 'Cloture.dc.html',
                   'Nuit.dc.html', 'Album.dc.html']
canvas['notes']['titre']['maxW'] = 1800
with open(os.path.join(P, 'canvas.json'), 'w', encoding='utf-8') as fh:
    json.dump(canvas, fh, ensure_ascii=False, indent=1)
print('ok', reste, en_moins)
