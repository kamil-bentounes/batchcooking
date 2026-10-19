#!/usr/bin/env python3
"""Trois directions de l'écran Budget, avec les chiffres d'octobre 2026."""
import json, math, os

ROOT = os.path.dirname(os.path.abspath(__file__))
P = os.path.join(ROOT, 'project')
os.makedirs(P, exist_ok=True)

NB, TS = ' ', ' '


def eur(c):
    if c % 100 == 0:
        s = f"{c // 100:,}".replace(',', TS)
    else:
        s = f"{c / 100:,.2f}".replace(',', '§').replace('.', ',').replace('§', TS)
    return s + NB + '€'


# Les six photos CC0 de StockSnap, dans photos/ à côté de ce script ; les pages sont
# écrites dans project/, d'où le « ../ ». (Dans l'artefact Design du 01/10/2026, c'étaient
# les blobs /_blob/<id> : maison d83fcd64…, courses f04d44fb…, auto c6e64f02…,
# credits 4ce6e0af…, abonnements c71594dc…, epargne 89caf824….)
BLOB = {k: f'../photos/{k}.jpg'
        for k in ('maison', 'courses', 'auto', 'credits', 'abonnements', 'epargne')}
POS = {'courses': '72% 50%', 'maison': '50% 60%', 'credits': '58% 50%',
       'auto': '60% 70%', 'abonnements': '35% 50%', 'epargne': '80% 30%'}

REVENU = 432500
# (libellé, centimes, précision, à déclarer)
CATS = [
    dict(key='courses', nom='Courses et sorties', ouvert=True, lignes=[
        ('Courses', 80000, None, True),
        ('Restaurants', 40000, None, True),
        ('Sorties et culture', 10000, None, True)]),
    dict(key='maison', nom='Maison', ouvert=True, lignes=[
        ('Crédit immobilier — résidence', 58000, None, False),
        ('Taxe foncière', 12083, f'{eur(145000)} par an, mis de côté chaque mois', False),
        ('Charges de copropriété', 10000, f'{eur(30000)} par trimestre, mis de côté chaque mois', False),
        ('Électricité', 5000, None, False),
        ('Internet', 3700, None, False),
        ('Assurance habitation', 1070, None, False)]),
    dict(key='credits', nom='Crédits', ouvert=False, lignes=[
        ('Crédit immobilier — locatif', 53800, None, False),
        ('Crédit à la consommation', 34500, None, False),
        ('Assurance emprunteur', 1000, None, False)]),
    dict(key='auto', nom='Auto', ouvert=False, lignes=[
        ('Crédit auto ou LOA', 40000, None, False),
        ('Essence', 16000, None, True),
        ('Assurance auto', 10000, None, False),
        ('Entretien auto', 4167, f'{eur(50000)} par an, mis de côté chaque mois', False),
        ('Péage', 3000, None, True)]),
    dict(key='abonnements', nom='Abonnements', ouvert=False, lignes=[
        ('Salle de sport', 3500, None, False),
        ('Netflix', 1400, None, False),
        ('YouTube', 1300, None, False),
        ('Forfait mobile', 1000, None, False),
        ('Stockage', 300, None, False)]),
]
for c in CATS:
    c['total'] = sum(l[1] for l in c['lignes'])
    c['a_dire'] = sum(1 for l in c['lignes'] if l[3])
TOTAL = sum(c['total'] for c in CATS)
RESTE = REVENU - TOTAL
COMMUN = 161853
MOI = TOTAL - COMMUN
NLIGNES = sum(len(c['lignes']) for c in CATS)
assert TOTAL == 389820 and RESTE == 42680 and NLIGNES == 22

# Parts du revenu, arrondies pour que la somme fasse 100.
parts = [c['total'] / REVENU * 100 for c in CATS] + [RESTE / REVENU * 100]
plancher = [math.floor(p) for p in parts]
for i in sorted(range(len(parts)), key=lambda i: parts[i] - plancher[i], reverse=True)[:100 - sum(plancher)]:
    plancher[i] += 1
PCT = plancher
assert sum(PCT) == 100


def meta(c):
    if c['a_dire']:
        n = c['a_dire']
        return f"{n} montant{'s' if n > 1 else ''} à dire"
    return f"{len(c['lignes'])} lignes"


IC = {
    'back': '<path d="M15 18l-6-6 6-6"></path>',
    'down': '<path d="M6 9l6 6 6-6"></path>',
    'up': '<path d="M18 15l-6-6-6 6"></path>',
    'right': '<path d="M9 18l6-6-6-6"></path>',
    'charges': '<path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path>',
    'declarer': '<circle cx="12" cy="12" r="9"></circle><path d="M12 8v8"></path><path d="M8 12h8"></path>',
    'revenus': '<rect x="3" y="6.5" width="18" height="13.5" rx="3"></rect><path d="M3 11h18"></path><path d="M15.5 15.5h2.5"></path><path d="M6.5 6.5 15 3.5l1.1 3"></path>',
    'epargne': '<path d="M7 20h10"></path><path d="M10 20c5.5-2.5.8-6.4 3-10"></path><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"></path><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"></path>',
    'x': '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    'trash': '<path d="M4 7h16"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"></path><path d="M9 7V4h6v3"></path>',
    'info': '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path>',
    'check': '<path d="M20 6 9 17l-5-5"></path>',
    'plus': '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    'cal': '<rect x="3.5" y="5" width="17" height="15.5" rx="3"></rect><path d="M8 3v4"></path><path d="M16 3v4"></path><path d="M3.5 10h17"></path>',
    'courses': '<path d="M5.5 8.5h13l-1.2 10.6a1.6 1.6 0 0 1-1.6 1.4H8.3a1.6 1.6 0 0 1-1.6-1.4Z"></path><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"></path>',
    'maison': '<path d="M3.5 11 12 4l8.5 7"></path><path d="M5.5 9.5V20h13V9.5"></path><path d="M10 20v-5.5h4V20"></path>',
    'credits': '<circle cx="8" cy="15.5" r="4"></circle><path d="M10.9 12.6 19 4.5"></path><path d="M16 7.5l2.2 2.2"></path><path d="M13.6 9.9l1.8 1.8"></path>',
    'auto': '<path d="M4 16v-3.6l1.9-4.3A2 2 0 0 1 7.7 7h8.6a2 2 0 0 1 1.8 1.1l1.9 4.3V16"></path><path d="M4 12.5h16"></path><path d="M10 16h4"></path><circle cx="7.8" cy="16.2" r="1.9"></circle><circle cx="16.2" cy="16.2" r="1.9"></circle>',
    'abonnements': '<rect x="3" y="4.5" width="18" height="12.5" rx="2.5"></rect><path d="M8.5 20.5h7"></path><path d="M10.5 8.3v5l4.2-2.5Z"></path>',
}


def svg(name, size=22, sw=1.8, extra=''):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true" '
            f'style="fill:none;stroke:currentColor;stroke-width:{sw};stroke-linecap:round;'
            f'stroke-linejoin:round;flex-shrink:0;{extra}">{IC[name]}</svg>')


def rgba(h, a):
    h = h.lstrip('#')
    return f"rgba({int(h[0:2], 16)},{int(h[2:4], 16)},{int(h[4:6], 16)},{a})"


def page(title, w, h, fonts, root_style, body):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="{fonts}" rel="stylesheet">
<style>
body{{margin:0}}
button{{font:inherit;color:inherit;cursor:pointer}}
</style>
</helmet>
<div style="width:{w}px;height:{h}px;box-sizing:border-box;overflow:hidden;{root_style}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
'''


ACTIONS = [('charges', 'Mes charges', False), ('declarer', 'Déclarer', True),
           ('revenus', 'Revenus', False), ('epargne', 'Épargne', False)]
TABS = [('Tout', TOTAL, True), ('Commun', COMMUN, False), ('Moi', MOI, False)]
RAPPEL = 'Le 27, on clôture le mois : tu confirmes les factures, et tu choisis quoi faire de ce qui reste.'


# ───────────────────────────── A · Potager ─────────────────────────────
def potager():
    col = {'courses': '#E8A33D', 'maison': '#2F5D45', 'credits': '#7A68C9',
           'auto': '#3B82C4', 'abonnements': '#D9694A'}
    sombre = {'courses': '#E8A33D', 'maison': '#86C29F', 'credits': '#B9ADF2',
              'auto': '#86BFEF', 'abonnements': '#F2A88D'}
    serif = "font-family:'Fraunces',Georgia,serif;font-variation-settings:'opsz' 144"
    ombre = 'box-shadow:0 1px 2px rgba(28,43,35,.06),0 8px 24px rgba(28,43,35,.07)'
    o = []
    o.append(f'''<div style="height:56px;display:flex;align-items:center;justify-content:space-between">
<button type="button" style="display:flex;align-items:center;gap:4px;min-height:44px;padding:0 6px 0 0;border:0;background:transparent;color:#2F5D45;font-size:16px;font-weight:600">{svg('back', 20, 2.2)}Popote</button>
<span aria-hidden="true" style="width:36px;height:36px;border-radius:50%;background:#2F5D45;color:#F2F4EF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600">K</span>
</div>
<div style="margin-top:4px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
<div>
<div style="font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#5D6E62">Budget</div>
<h1 style="margin:4px 0 0;{serif};font-size:46px;font-weight:600;line-height:1;letter-spacing:-.02em">Octobre</h1>
</div>
<button type="button" style="min-height:44px;padding:0 14px 0 10px;border:0;border-radius:999px;background:#E4E9E1;font-size:14px;font-weight:500;display:flex;align-items:center;gap:4px">{svg('back', 16, 2.2)}Septembre</button>
</div>
<p style="margin:10px 0 0;font-size:15px;color:#5D6E62">Il reste 30 jours.</p>''')

    acts = []
    for ic, lab, prim in ACTIONS:
        bg, fg = ('#E8A33D', '#1C2B23') if prim else ('#FBFCFA', '#2F5D45')
        acts.append(f'<button type="button" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:0;border:0;background:transparent;font-size:13px;font-weight:500;color:#1C2B23"><span style="width:58px;height:58px;border-radius:20px;background:{bg};color:{fg};display:flex;align-items:center;justify-content:center;{ombre}">{svg(ic, 24, 1.9)}</span>{lab}</button>')
    o.append(f'<div style="margin-top:20px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">{"".join(acts)}</div>')

    segs = ''.join(f'<span style="flex:{c["total"] / REVENU * 100:.2f} 1 0;background:{sombre[c["key"]]}"></span>' for c in CATS)
    segs += f'<span style="flex:{RESTE / REVENU * 100:.2f} 1 0;background:rgba(242,244,239,.16)"></span>'
    leg = []
    for c, p in zip(CATS + [None], PCT):
        nom, teinte = (c['nom'], sombre[c['key']]) if c else ('Reste', 'rgba(242,244,239,.35)')
        leg.append(f'<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#DCE2D6"><span style="width:8px;height:8px;border-radius:50%;background:{teinte};flex-shrink:0"></span><span style="flex-grow:1">{nom}</span><span style="color:#B7C6BC;font-variant-numeric:tabular-nums">{p}{NB}%</span></div>')
    o.append(f'''<section style="margin-top:22px;border-radius:28px;background:#1C2B23;color:#F2F4EF;padding:22px 20px 20px">
<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
<span style="font-size:15px;color:#B7C6BC">Il te reste</span>
<span style="font-size:13px;color:#DCE2D6;background:rgba(242,244,239,.08);border-radius:999px;padding:5px 11px">sur {eur(REVENU)} de revenus</span>
</div>
<div style="margin-top:4px;{serif};font-size:64px;font-weight:600;line-height:1.05;letter-spacing:-.035em;color:#E8A33D;font-variant-numeric:tabular-nums">{eur(RESTE)}</div>
<div style="margin-top:6px;font-size:14px;color:#B7C6BC">après {eur(TOTAL)} de charges prévues</div>
<div style="margin-top:18px;display:flex;gap:3px;height:14px;border-radius:7px;overflow:hidden">{segs}</div>
<div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 16px">{"".join(leg)}</div>
</section>''')

    o.append(f'''<button type="button" style="margin-top:12px;width:100%;display:flex;align-items:center;gap:14px;padding:14px 14px 14px 14px;border:0;border-radius:22px;background:#FBFCFA;text-align:left;{ombre}">
<img src="{BLOB['epargne']}" alt="" style="width:56px;height:56px;border-radius:16px;object-fit:cover;object-position:{POS['epargne']};flex-shrink:0">
<span style="flex-grow:1;min-width:0">
<span style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:16px;font-weight:600">Épargne d’urgence</span><span style="font-size:14px;color:#5D6E62">0{NB}%</span></span>
<span style="display:block;margin-top:2px;font-size:14px;color:#5D6E62">{eur(0)} mis de côté sur {eur(400000)}</span>
<span style="display:block;margin-top:9px;height:6px;border-radius:3px;background:#E4E9E1"></span>
</span>
<span style="color:#5D6E62;display:flex">{svg('right', 20, 2)}</span>
</button>''')

    tabs = []
    for lab, v, sel in TABS:
        st = 'background:#FBFCFA;box-shadow:0 1px 3px rgba(28,43,35,.14);font-weight:600' if sel else 'background:transparent;font-weight:500'
        tabs.append(f'<button type="button" role="tab" aria-selected="{"true" if sel else "false"}" style="min-height:48px;border:0;border-radius:12px;{st};font-size:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2">{lab}<span style="font-size:12px;font-weight:500;color:#5D6E62;font-variant-numeric:tabular-nums">{eur(v)}</span></button>')
    o.append(f'''<div style="margin-top:28px;display:flex;align-items:baseline;justify-content:space-between">
<h2 style="margin:0;{serif};font-size:25px;font-weight:600;letter-spacing:-.01em">Par catégorie</h2>
<span style="font-size:14px;color:#5D6E62">{NLIGNES} lignes</span>
</div>
<div role="tablist" aria-label="Filtrer les charges" style="margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;background:#E4E9E1">{"".join(tabs)}</div>
<div style="margin-top:12px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:#F6EAD2;font-size:14px;line-height:1.45">
<span style="color:#8F5A0D;display:flex;margin-top:1px">{svg('cal', 18, 1.9)}</span>
<span>{RAPPEL}</span>
</div>''')

    for c in CATS:
        ouvert = c['ouvert']
        teinte_meta = 'color:#8F5A0D;font-weight:600' if c['a_dire'] else 'color:#5D6E62'
        lignes = ''
        if ouvert:
            for nom, cents, prec, var in c['lignes']:
                if var:
                    lignes += f'''<div style="border-top:1px solid #E4E9E1;padding:13px 0;display:flex;align-items:center;gap:14px">
<div style="flex-grow:1;min-width:0">
<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px"><span style="font-weight:500">{nom}</span><span style="color:#5D6E62;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(0)} sur {eur(cents)}</span></div>
<div style="margin-top:8px;height:6px;border-radius:3px;background:#ECEFE9"></div>
</div>
<button type="button" style="min-height:44px;padding:0 16px;border:0;border-radius:999px;background:#E8A33D;color:#1C2B23;font-size:14px;font-weight:600;flex-shrink:0">Déclarer</button>
</div>'''
                else:
                    sous = f'<div style="margin-top:2px;font-size:13px;color:#5D6E62">{prec}</div>' if prec else ''
                    lignes += f'''<div style="border-top:1px solid #E4E9E1;padding:13px 0;display:flex;align-items:center;justify-content:space-between;gap:12px">
<div style="min-width:0"><div style="font-size:15px;font-weight:500">{nom}</div>{sous}</div>
<span style="font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(cents)}</span>
</div>'''
            lignes = f'<div style="padding:0 16px 4px">{lignes}</div>'
        o.append(f'''<article style="margin-top:12px;border-radius:22px;background:#FBFCFA;overflow:hidden;{ombre}">
<button type="button" aria-expanded="{"true" if ouvert else "false"}" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px;border:0;background:transparent;text-align:left">
<img src="{BLOB[c['key']]}" alt="" style="width:54px;height:54px;border-radius:15px;object-fit:cover;object-position:{POS[c['key']]};flex-shrink:0">
<span style="flex-grow:1;min-width:0">
<span style="display:flex;align-items:center;gap:8px;font-size:17px;font-weight:600"><span style="width:9px;height:9px;border-radius:50%;background:{col[c['key']]};flex-shrink:0"></span>{c['nom']}</span>
<span style="display:block;margin-top:3px;font-size:13px;{teinte_meta}">{meta(c)}</span>
</span>
<span style="{serif};font-size:23px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(c['total'])}</span>
<span style="color:#5D6E62;display:flex">{svg('up' if ouvert else 'down', 20, 2)}</span>
</button>
{lignes}
</article>''')

    return page('Budget — Potager', 390, 2080,
                'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&amp;family=Instrument+Sans:wght@400..700&amp;display=swap',
                "background:#F2F4EF;color:#1C2B23;font-family:'Instrument Sans',system-ui,sans-serif;padding:0 16px 40px",
                '\n'.join(o))


# ───────────────────────────── B · Nuit ─────────────────────────────
def nuit():
    col = {'courses': '#C5F26B', 'maison': '#5FD4A4', 'credits': '#A88CFF',
           'auto': '#62B4F8', 'abonnements': '#FF8F6B'}
    disp = "font-family:'Bricolage Grotesque',sans-serif;font-variation-settings:'opsz' 96"
    carte = 'background:#141A17;border:1px solid #222B26'
    o = []
    o.append(f'''<div style="height:56px;display:flex;align-items:center;justify-content:space-between">
<button type="button" style="display:flex;align-items:center;gap:4px;min-height:44px;padding:0 6px 0 0;border:0;background:transparent;color:#93A199;font-size:15px;font-weight:500">{svg('back', 20, 2.2)}Popote</button>
<span aria-hidden="true" style="width:36px;height:36px;border-radius:50%;background:#1A211D;border:1px solid #2A342F;color:#C5F26B;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600">K</span>
</div>
<div style="margin-top:4px;display:flex;align-items:center;justify-content:space-between;gap:12px">
<h1 style="margin:0;{disp};font-size:42px;font-weight:700;line-height:1.1;letter-spacing:-.035em">Octobre</h1>
<button type="button" style="min-height:44px;padding:0 14px 0 10px;border-radius:999px;{carte};color:#EEF3EF;font-size:14px;display:flex;align-items:center;gap:4px">{svg('back', 16, 2.2)}Septembre</button>
</div>
<p style="margin:4px 0 0;font-size:14px;color:#93A199">Budget · il reste 30 jours</p>''')

    acts = []
    for ic, lab, prim in ACTIONS:
        st = 'background:#C5F26B;border:1px solid #C5F26B;color:#0B0F0D' if prim else f'{carte};color:#EEF3EF'
        icol = '#0B0F0D' if prim else '#C5F26B'
        acts.append(f'<button type="button" style="height:84px;padding:0;border-radius:20px;{st};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:12.5px;font-weight:600"><span style="color:{icol};display:flex">{svg(ic, 23, 1.9)}</span>{lab}</button>')
    o.append(f'<div style="margin-top:18px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">{"".join(acts)}</div>')

    r = 98
    circ = 2 * math.pi * r
    debut, arcs = 0.0, []
    for c in CATS:
        long = c['total'] / REVENU * circ
        vis = max(long - 4, 1)
        arcs.append(f'<circle cx="118" cy="118" r="{r}" style="fill:none;stroke:{col[c["key"]]};stroke-width:22;stroke-dasharray:{vis:.2f} {circ - vis:.2f};stroke-dashoffset:{-debut:.2f}"></circle>')
        debut += long
    leg = []
    for c, p in zip(CATS + [None], PCT):
        nom, teinte = (c['nom'], col[c['key']]) if c else ('Reste', '#3A4640')
        leg.append(f'<span style="display:inline-flex;align-items:center;gap:7px;padding:6px 10px;border-radius:999px;background:#1A211D;font-size:12.5px;color:#DDE5DF"><span style="width:8px;height:8px;border-radius:2px;background:{teinte}"></span>{nom}<span style="color:#93A199;font-variant-numeric:tabular-nums">{p}{NB}%</span></span>')
    o.append(f'''<section style="margin-top:14px;border-radius:28px;{carte};padding:22px 16px 16px">
<div style="position:relative;width:236px;height:236px;margin:0 auto">
<svg width="236" height="236" viewBox="0 0 236 236" aria-hidden="true" style="display:block">
<g transform="rotate(-90 118 118)">
<circle cx="118" cy="118" r="{r}" style="fill:none;stroke:#1F2723;stroke-width:22"></circle>
{"".join(arcs)}
</g>
</svg>
<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
<span style="font-size:13px;color:#93A199">Il te reste</span>
<span style="{disp};font-size:40px;font-weight:700;line-height:1.1;letter-spacing:-.03em;font-variant-numeric:tabular-nums">{eur(RESTE)}</span>
<span style="font-size:13px;color:#93A199">sur {eur(REVENU)}</span>
</div>
</div>
<div style="margin-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
<div style="border-radius:16px;background:#1A211D;padding:11px 14px"><div style="font-size:12.5px;color:#93A199">Prévu ce mois</div><div style="margin-top:2px;{disp};font-size:21px;font-weight:600;font-variant-numeric:tabular-nums">{eur(TOTAL)}</div></div>
<div style="border-radius:16px;background:#1A211D;padding:11px 14px"><div style="font-size:12.5px;color:#93A199">Déjà déclaré</div><div style="margin-top:2px;{disp};font-size:21px;font-weight:600;font-variant-numeric:tabular-nums">{eur(0)}</div></div>
</div>
<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:6px">{"".join(leg)}</div>
</section>''')

    o.append(f'''<button type="button" style="margin-top:10px;width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px 14px 14px;border-radius:22px;{carte};text-align:left;color:#EEF3EF">
<span style="width:48px;height:48px;border-radius:15px;background:{rgba('#C5F26B', .12)};color:#C5F26B;display:flex;align-items:center;justify-content:center;flex-shrink:0">{svg('epargne', 24, 1.8)}</span>
<span style="flex-grow:1;min-width:0">
<span style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span style="font-size:16px;font-weight:600">Épargne d’urgence</span><span style="font-size:13px;color:#93A199;font-variant-numeric:tabular-nums">{eur(0)} / {eur(400000)}</span></span>
<span style="display:block;margin-top:9px;height:6px;border-radius:3px;background:#222B26"></span>
</span>
<span style="color:#93A199;display:flex">{svg('right', 20, 2)}</span>
</button>''')

    tabs = []
    for lab, v, sel in TABS:
        st = 'background:#2A342F;color:#EEF3EF;font-weight:600' if sel else 'background:transparent;color:#93A199;font-weight:500'
        tabs.append(f'<button type="button" role="tab" aria-selected="{"true" if sel else "false"}" style="min-height:48px;border:0;border-radius:12px;{st};font-size:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2">{lab}<span style="font-size:12px;font-weight:500;color:#93A199;font-variant-numeric:tabular-nums">{eur(v)}</span></button>')
    o.append(f'''<div style="margin-top:28px;display:flex;align-items:baseline;justify-content:space-between">
<h2 style="margin:0;{disp};font-size:24px;font-weight:700;letter-spacing:-.02em">Par catégorie</h2>
<span style="font-size:13px;color:#93A199">{NLIGNES} lignes</span>
</div>
<div role="tablist" aria-label="Filtrer les charges" style="margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;{carte}">{"".join(tabs)}</div>
<div style="margin-top:10px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;border:1px dashed #33403A;font-size:14px;line-height:1.45;color:#DDE5DF">
<span style="color:#C5F26B;display:flex;margin-top:1px">{svg('cal', 18, 1.9)}</span>
<span>{RAPPEL}</span>
</div>''')

    for c in CATS:
        ouvert = c['ouvert']
        k = c['key']
        teinte_meta = 'color:#C5F26B;font-weight:600' if c['a_dire'] else 'color:#93A199'
        lignes = ''
        if ouvert:
            for nom, cents, prec, var in c['lignes']:
                if var:
                    lignes += f'''<div style="border-top:1px solid #222B26;padding:13px 0;display:flex;align-items:center;gap:14px">
<div style="flex-grow:1;min-width:0">
<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px"><span style="font-weight:500">{nom}</span><span style="color:#93A199;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(0)} / {eur(cents)}</span></div>
<div style="margin-top:8px;height:6px;border-radius:3px;background:#222B26"></div>
</div>
<button type="button" style="min-height:44px;padding:0 16px;border:1.5px solid #C5F26B;border-radius:999px;background:transparent;color:#C5F26B;font-size:14px;font-weight:600;flex-shrink:0">Déclarer</button>
</div>'''
                else:
                    sous = f'<div style="margin-top:2px;font-size:13px;color:#93A199">{prec}</div>' if prec else ''
                    lignes += f'''<div style="border-top:1px solid #222B26;padding:13px 0;display:flex;align-items:center;justify-content:space-between;gap:12px">
<div style="min-width:0"><div style="font-size:15px;font-weight:500">{nom}</div>{sous}</div>
<span style="font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(cents)}</span>
</div>'''
            lignes = f'<div style="padding:0 16px 4px">{lignes}</div>'
        o.append(f'''<article style="margin-top:10px;border-radius:22px;{carte};overflow:hidden">
<button type="button" aria-expanded="{"true" if ouvert else "false"}" style="width:100%;display:flex;align-items:center;gap:12px;padding:14px;border:0;background:transparent;text-align:left;color:#EEF3EF">
<span style="width:46px;height:46px;border-radius:15px;background:{rgba(col[k], .14)};color:{col[k]};display:flex;align-items:center;justify-content:center;flex-shrink:0">{svg(k, 23, 1.8)}</span>
<span style="flex-grow:1;min-width:0">
<span style="display:block;font-size:16px;font-weight:600">{c['nom']}</span>
<span style="display:block;margin-top:2px;font-size:13px;{teinte_meta}">{meta(c)}</span>
</span>
<span style="{disp};font-size:21px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(c['total'])}</span>
<span style="color:#93A199;display:flex">{svg('up' if ouvert else 'down', 20, 2)}</span>
</button>
{lignes}
</article>''')

    return page('Budget — Nuit', 390, 2130,
                'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800&amp;family=Geist:wght@300..700&amp;display=swap',
                "background:#0B0F0D;color:#EEF3EF;font-family:'Geist',system-ui,sans-serif;padding:0 16px 40px",
                '\n'.join(o))


# ───────────────────────────── C · Album ─────────────────────────────
def album():
    col = {'courses': '#F2B33D', 'maison': '#17402E', 'credits': '#5B4BC4',
           'auto': '#2A78C8', 'abonnements': '#E0512B'}
    disp = "font-family:'Archivo',sans-serif;font-stretch:125%;font-variation-settings:'wdth' 125"
    o = []
    o.append(f'''<div style="height:56px;display:flex;align-items:center;justify-content:space-between">
<button type="button" style="display:flex;align-items:center;gap:4px;min-height:44px;padding:0 6px 0 0;border:0;background:transparent;color:#111111;font-size:15px;font-weight:600">{svg('back', 20, 2.2)}Popote</button>
<span aria-hidden="true" style="width:36px;height:36px;border-radius:50%;background:#111111;color:#FFFFFF;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600">K</span>
</div>
<div style="margin-top:4px;display:flex;align-items:flex-end;justify-content:space-between;gap:12px">
<div>
<div style="font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:#5E5E59">Budget</div>
<h1 style="margin:4px 0 0;{disp};font-size:38px;font-weight:800;line-height:1.05;letter-spacing:-.02em">Octobre</h1>
</div>
<button type="button" style="min-height:44px;padding:0 14px 0 10px;border:1px solid #DADAD4;border-radius:999px;background:#FFFFFF;font-size:14px;font-weight:500;display:flex;align-items:center;gap:4px">{svg('back', 16, 2.2)}Septembre</button>
</div>
<p style="margin:10px 0 0;font-size:15px;color:#5E5E59">Il reste 30 jours.</p>''')

    acts = []
    for ic, lab, prim in ACTIONS:
        st = 'background:#111111;color:#FFFFFF;border:1px solid #111111' if prim else 'background:#FFFFFF;color:#111111;border:1px solid #DADAD4'
        acts.append(f'<button type="button" style="min-height:50px;padding:0 14px;border-radius:16px;{st};display:flex;align-items:center;gap:10px;font-size:15px;font-weight:600;text-align:left">{svg(ic, 21, 1.9)}{lab}</button>')
    o.append(f'<div style="margin-top:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">{"".join(acts)}</div>')

    segs = ''.join(f'<span style="flex:{c["total"] / REVENU * 100:.2f} 1 0;background:{col[c["key"]]}"></span>' for c in CATS)
    segs += f'<span style="flex:{RESTE / REVENU * 100:.2f} 1 0;background:#ECECE7"></span>'
    leg = []
    for c, p in zip(CATS + [None], PCT):
        nom, teinte = (c['nom'], col[c['key']]) if c else ('Reste', '#D4D4CD')
        leg.append(f'<span style="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:#2B2B28"><span style="width:8px;height:8px;border-radius:50%;background:{teinte}"></span>{nom} <span style="color:#5E5E59;font-variant-numeric:tabular-nums">{p}{NB}%</span></span>')
    o.append(f'''<section style="margin-top:28px">
<div style="font-size:15px;color:#5E5E59">Il te reste ce mois-ci</div>
<div style="margin-top:6px;{disp};font-size:56px;font-weight:800;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums">{eur(RESTE)}</div>
<div style="margin-top:10px;font-size:15px;color:#5E5E59">sur {eur(REVENU)} de revenus · {eur(TOTAL)} prévus</div>
<div style="margin-top:18px;display:flex;gap:3px;height:12px;border-radius:6px;overflow:hidden">{segs}</div>
<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px 14px">{"".join(leg)}</div>
</section>''')

    o.append(f'''<button type="button" style="margin-top:22px;width:100%;height:132px;position:relative;display:block;padding:0;border:0;border-radius:24px;overflow:hidden;text-align:left;color:#FFFFFF;background:#DDE8D6">
<img src="{BLOB['epargne']}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:{POS['epargne']}">
<span style="position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:rgba(14,14,14,.62);backdrop-filter:blur(14px)">
<span style="flex-grow:1;min-width:0"><span style="display:block;font-size:15px;font-weight:600">Épargne d’urgence</span><span style="display:block;margin-top:1px;font-size:13px;color:#E6E6E1">{eur(0)} mis de côté sur {eur(400000)}</span></span>
<span style="display:flex">{svg('right', 20, 2)}</span>
</span>
</button>''')

    tabs = []
    for lab, v, sel in TABS:
        st = 'background:#111111;color:#FFFFFF;font-weight:600' if sel else 'background:transparent;color:#111111;font-weight:500'
        sous = '#D8D8D2' if sel else '#5E5E59'
        tabs.append(f'<button type="button" role="tab" aria-selected="{"true" if sel else "false"}" style="min-height:48px;border:0;border-radius:12px;{st};font-size:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.2">{lab}<span style="font-size:12px;font-weight:500;color:{sous};font-variant-numeric:tabular-nums">{eur(v)}</span></button>')
    o.append(f'''<div style="margin-top:30px;display:flex;align-items:baseline;justify-content:space-between">
<h2 style="margin:0;{disp};font-size:23px;font-weight:800;letter-spacing:-.01em">Par catégorie</h2>
<span style="font-size:14px;color:#5E5E59">{NLIGNES} lignes</span>
</div>
<div role="tablist" aria-label="Filtrer les charges" style="margin-top:12px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:16px;background:#F1F1EC">{"".join(tabs)}</div>
<div style="margin-top:12px;display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:16px;background:#FFF4DA;font-size:14px;line-height:1.45;color:#111111">
<span style="color:#8A5A00;display:flex;margin-top:1px">{svg('cal', 18, 1.9)}</span>
<span>{RAPPEL}</span>
</div>''')

    for c in CATS:
        ouvert = c['ouvert']
        k = c['key']
        lignes = ''
        if ouvert:
            for nom, cents, prec, var in c['lignes']:
                if var:
                    lignes += f'''<div style="border-top:1px solid #ECECE7;padding:13px 0;display:flex;align-items:center;gap:14px">
<div style="flex-grow:1;min-width:0">
<div style="display:flex;justify-content:space-between;gap:8px;font-size:15px"><span style="font-weight:600">{nom}</span><span style="color:#5E5E59;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(0)} sur {eur(cents)}</span></div>
<div style="margin-top:8px;height:6px;border-radius:3px;background:#EFEFEA"></div>
</div>
<button type="button" style="min-height:44px;padding:0 16px;border:0;border-radius:999px;background:#111111;color:#FFFFFF;font-size:14px;font-weight:600;flex-shrink:0">Déclarer</button>
</div>'''
                else:
                    sous = f'<div style="margin-top:2px;font-size:13px;color:#5E5E59">{prec}</div>' if prec else ''
                    lignes += f'''<div style="border-top:1px solid #ECECE7;padding:13px 0;display:flex;align-items:center;justify-content:space-between;gap:12px">
<div style="min-width:0"><div style="font-size:15px;font-weight:500">{nom}</div>{sous}</div>
<span style="font-size:15px;font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap">{eur(cents)}</span>
</div>'''
            lignes = f'<div style="padding:2px 16px 4px">{lignes}</div>'
        o.append(f'''<article style="margin-top:14px;border-radius:24px;overflow:hidden;background:#FFFFFF;border:1px solid #E6E6E0">
<button type="button" aria-expanded="{"true" if ouvert else "false"}" style="position:relative;display:block;width:100%;height:156px;padding:0;border:0;text-align:left;color:#FFFFFF;background:#CFCFC8">
<img src="{BLOB[k]}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:{POS[k]}">
<span style="position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.94);color:#111111;font-size:13px;font-weight:700"><span style="width:8px;height:8px;border-radius:50%;background:{col[k]}"></span>{c['nom']}</span>
<span style="position:absolute;left:0;right:0;bottom:0;display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;background:rgba(12,12,12,.58);backdrop-filter:blur(14px)">
<span style="flex-grow:1;min-width:0"><span style="display:block;{disp};font-size:26px;font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums">{eur(c['total'])}</span><span style="display:block;font-size:13px;color:{'#FFD27A' if c['a_dire'] else '#E6E6E1'};font-weight:{600 if c['a_dire'] else 400}">{meta(c)}</span></span>
<span style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.94);color:#111111;display:flex;align-items:center;justify-content:center;flex-shrink:0">{svg('up' if ouvert else 'down', 20, 2.2)}</span>
</span>
</button>
{lignes}
</article>''')

    return page('Budget — Album', 390, 2480,
                'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&amp;display=swap',
                "background:#FFFFFF;color:#111111;font-family:'Archivo',system-ui,sans-serif;padding:0 16px 40px",
                '\n'.join(o))


