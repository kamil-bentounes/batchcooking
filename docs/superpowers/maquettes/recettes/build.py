#!/usr/bin/env python3
"""Maquettes de l'écran « Choisir » (recettes), dans le style A « Potager » du Budget."""
import base64, json, os, re

ICI = os.path.dirname(os.path.abspath(__file__))
NB = ' '

DIX = json.load(open(os.path.join(ICI, 'dix.json'), encoding='utf-8'))
FICHE = [json.loads(l) for l in open(os.path.join(ICI, 'fiche.jsonl'), encoding='utf-8')]


def propre(t):
    t = t.replace('&amp;', '&')
    t = re.sub(r'\s*:\s*la (meilleure )?recette.*$', '', t, flags=re.I)
    t = re.sub(r'\s*-\s*Cookeo$', '', t)
    t = t.replace(" a l'", " à l'")
    return t


def duree(m):
    m = round(float(m))
    if m < 60:
        return f'{m}{NB}min'
    h, r = divmod(m, 60)
    return f'{h}{NB}h' + (f'{NB}{r:02d}' if r else '')


def fourchette(v, marge):
    a, b = round(v - marge), round(v + marge)
    return f'{a}' if a == b else f'{a}–{b}'


RECETTES = []
for d in DIX:
    RECETTES.append(dict(
        i=d['ordre'], titre=propre(d['title']), actif=float(d['active_time_min']),
        total=float(d['total_time_min'] or 0), parts=d['yield_servings'], app=d['appliances'],
        prot=fourchette(float(d['prot']), float(d['pm'])), kcal=fourchette(float(d['kcal']), float(d['km'])),
        site=d['site']))
RECETTES.sort(key=lambda r: r['actif'])
RETENUE = 0  # le chili con carne, 4 parts

# ── Les pictos des appareils ──────────────────────────────────────────────
APP = {
    'four': ('Four', '<rect x="3" y="3.5" width="18" height="17" rx="3"></rect><path d="M3 8.5h18"></path><rect x="6.5" y="11.5" width="11" height="6" rx="1.5"></rect><path d="M7 6h.01"></path><path d="M10 6h.01"></path>'),
    'plaques': ('Plaques', '<rect x="2.5" y="4" width="19" height="16" rx="3"></rect><circle cx="8" cy="12" r="3"></circle><circle cx="16.5" cy="9" r="2"></circle><circle cx="16.5" cy="15.5" r="2"></circle>'),
    'micro_ondes': ('Micro-ondes', '<rect x="2.5" y="5" width="19" height="14" rx="2.5"></rect><rect x="5.5" y="8" width="9.5" height="8" rx="1.2"></rect><path d="M18.5 9h.01"></path><path d="M18.5 12.5v2.5"></path>'),
    'autocuiseur': ('Autocuiseur', '<path d="M5 11h14v6a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3Z"></path><path d="M3.5 11h17"></path><path d="M6.5 11a5.5 4 0 0 1 11 0"></path><path d="M12 4.5V7"></path><path d="M2.5 14H5"></path><path d="M19 14h2.5"></path>'),
    'blender': ('Blender', '<path d="M7 3h10l-1.6 10H8.6Z"></path><rect x="7" y="13" width="10" height="8" rx="2"></rect><circle cx="12" cy="17" r="1.2"></circle><path d="M9.5 6.5h3"></path>'),
    'batteur': ('Batteur', '<path d="M12 13v8"></path><path d="M12 13C7.5 13 6.5 3 12 3s4.5 10 0 10Z"></path><path d="M12 13c-1.8 0-2.2-10 0-10s1.8 10 0 10Z"></path>'),
    'robot_cuiseur': ('Robot cuiseur', '<path d="M6 9.5h12l-1.2 5.5H7.2Z"></path><path d="M8.5 9.5V6.5h7v3"></path><rect x="4" y="15" width="16" height="6" rx="2"></rect><circle cx="12" cy="18" r="1.2"></circle>'),
    'air_fryer': ('Air fryer', '<rect x="5" y="3" width="14" height="18" rx="4"></rect><path d="M9 7h6"></path><path d="M5 13h14"></path><path d="M10 17h4"></path>'),
}
IC = {
    'back': '<path d="M15 18l-6-6 6-6"></path>',
    'right': '<path d="M9 18l6-6-6-6"></path>',
    'info': '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path>',
    'x': '<path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>',
    'check': '<path d="M20 6 9 17l-5-5"></path>',
    'plus': '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
    'search': '<circle cx="11" cy="11" r="6.5"></circle><path d="m20 20-4.2-4.2"></path>',
    'sliders': '<path d="M4 7h10"></path><path d="M18 7h2"></path><circle cx="16" cy="7" r="2"></circle><path d="M4 17h4"></path><path d="M12 17h8"></path><circle cx="10" cy="17" r="2"></circle>',
    'clock': '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7.5V12l3 2"></path>',
    'out': '<path d="M14 4h6v6"></path><path d="M20 4 11 13"></path><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"></path>',
    'snow': '<path d="M12 3v18"></path><path d="M4.2 7.5l15.6 9"></path><path d="M19.8 7.5l-15.6 9"></path>',
}


def svg(path, size=22, sw=1.8):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true" '
            f'class="ic" style="stroke-width:{sw}">{path}</svg>')


def ic(nom, size=22, sw=1.8):
    return svg(IC[nom], size, sw)


def picto(code, size=18):
    lab, path = APP[code]
    return f'<span class="picto" title="{lab}" aria-label="{lab}" role="img">{svg(path, size, 1.7)}</span>'


# ── Les photos, une seule fois, en classes ─────────────────────────────────
css_photos = []
for n in range(10):
    b = base64.b64encode(open(os.path.join(ICI, 'img', f'{n}.jpg'), 'rb').read()).decode()
    css_photos.append(f'.ph{n}{{background-image:url(data:image/jpeg;base64,{b})}}')


# ── Les morceaux de l'écran ────────────────────────────────────────────────
def entete():
    return f'''<div class="barre"><button type="button" class="retour">{ic('back', 20, 2.2)}Popote</button><span class="avatar" aria-hidden="true">K</span></div>
<div class="sur">Dimanche 5 octobre</div>
<h1 class="h1">Choisir</h1>'''


def carte_encre():
    r = next(x for x in RECETTES if x['i'] == RETENUE)
    return f'''<section class="encre">
<div class="encre-haut"><span>Il manque</span><span class="pastille">10 repas à couvrir</span></div>
<div class="enorme">6{NB}parts</div>
<div class="encre-sous">4 déjà retenues. On fait les courses samedi.</div>
<div class="retenues"><span class="mini ph{r['i']}"></span><span class="retenue-nom">{r['titre']}</span><span class="retenue-parts">4 parts</span></div>
</section>'''


def recherche(actif=1):
    puces = ['≤ 20 min actives', '≥ 30 g de protéines', 'Se congèle', 'Avec ce que j’ai']
    p = ''.join(f'<button type="button" class="puce{" on" if k < actif else ""}" aria-pressed="{"true" if k < actif else "false"}">{t}</button>' for k, t in enumerate(puces))
    return f'''<div class="cherche"><span class="cherche-champ">{ic('search', 20, 2)}<span>Chercher une recette</span></span><button type="button" class="filtres" aria-label="Appareils et filtres">{ic('sliders', 20, 2)}</button></div>
<div class="puces">{p}</div>
<div class="compte"><h2 class="h2">Recettes</h2><span>1{NB}390, de 1 à 10</span></div>'''


def bouton(r):
    if r['i'] == RETENUE:
        return f'<span class="retenue">{ic("check", 18, 2.4)}Retenue</span>'
    return f'<button type="button" class="ajoute">{ic("plus", 18, 2.4)}Ajouter</button>'


def carte_grande(r):
    pictos = ''.join(picto(a) for a in r['app'])
    return f'''<article class="carte">
<div class="photo ph{r['i']}">
<button type="button" class="info" aria-label="La recette en détail">{ic('info', 22, 2)}</button>
{f'<div class="pictos">{pictos}</div>' if pictos else ''}
</div>
<div class="carte-corps">
<h3 class="titre">{r['titre']}</h3>
<div class="meta">{ic('clock', 15, 2)}<strong>{duree(r['actif'])} actives</strong> · {r['parts']} part{'s' if r['parts'] > 1 else ''}</div>
<div class="bas">
<div class="macros"><div><span class="chiffre">{r['prot']}{NB}g</span><span class="unite">protéines</span></div><div><span class="chiffre petit">{r['kcal']}</span><span class="unite">kcal la part</span></div></div>
{bouton(r)}
</div>
</div>
</article>'''


def carte_vignette(r):
    pictos = ''.join(picto(a, 15) for a in r['app'])
    plus = (f'<span class="retenue rond" aria-label="Retenue">{ic("check", 20, 2.4)}</span>' if r['i'] == RETENUE
            else f'<button type="button" class="ajoute rond" aria-label="Ajouter">{ic("plus", 20, 2.4)}</button>')
    return f'''<article class="ligne">
<span class="vignette ph{r['i']}"></span>
<div class="ligne-corps">
<h3 class="titre t2">{r['titre']}</h3>
<div class="meta2">{duree(r['actif'])} actives · {r['parts']} parts</div>
<div class="meta2"><strong class="prot">{r['prot']}{NB}g</strong> de protéines · {r['kcal']}{NB}kcal</div>
{f'<div class="pictos plats">{pictos}</div>' if pictos else ''}
</div>
<div class="ligne-actions"><button type="button" class="info nu" aria-label="La recette en détail">{ic('info', 22, 2)}</button>{plus}</div>
</article>'''


def pagination():
    pages = ''.join(f'<button type="button" class="num{" on" if n == "1" else ""}"{" aria-current=page" if n == "1" else ""}>{n}</button>' if n != '…' else '<span class="num vide">…</span>' for n in ['1', '2', '3', '…', '139'])
    return f'''<nav class="pages" aria-label="Pages de recettes">
<div class="pages-txt">Recettes 1 à 10 sur 1{NB}390</div>
<button type="button" class="suivantes">Les 10 suivantes{ic('right', 18, 2.4)}</button>
<div class="nums">{pages}</div>
</nav>'''


def fiche():
    r = next(x for x in RECETTES if x['i'] == 5)
    ings = [f['raw'] for f in FICHE if f['k'] == 'ing']
    etapes = [f for f in FICHE if f['k'] == 'step']
    typ = {1: ('passif', None), 2: ('bloquant', 'autocuiseur'), 3: ('actif', None), 4: ('actif', None),
           5: ('passif', 'plaques'), 6: ('passif', 'plaques')}
    li = ''
    for q in ings:
        m = re.match(r'^([\d,.]+\s*(?:kg|g|l|cl|ml|gousses?)?)\s+(.*)$', q)
        if m:
            qt, nom = m.group(1), m.group(2)
            qt = qt.replace('gousse', 'gousses') if qt.endswith('gousse') else qt
        else:
            qt, nom = '', q
        nom = nom.replace('boeuf', 'bœuf').replace('lardon', 'lardons').replace('carotte', 'carottes').replace('oignon', 'oignons')
        nom = nom[:1].upper() + nom[1:]
        li += f'<li><span class="qte">{qt}</span><span>{nom}</span></li>'
    et = ''
    for e in etapes:
        charge, app = typ[e['ordinal']]
        mot = {'passif': 'sans toi', 'bloquant': 'à surveiller', 'actif': 'tes gestes'}[charge]
        p = picto(app, 15) if app else ''
        et += f'''<li class="etape"><span class="no">{e['ordinal']}</span><div><p>{e['text']}</p><div class="etape-meta"><span class="duree {charge}">{duree(e['duration_min'])} · {mot}</span>{p}</div></div></li>'''
    pictos = ''.join(f'<span class="app">{picto(a, 18)}{APP[a][0]}</span>' for a in r['app'])
    return f'''<div class="voile" aria-hidden="true"></div>
<section class="feuille" role="dialog" aria-label="{r['titre']}">
<div class="feuille-photo ph{r['i']}"><span class="poignee"></span><button type="button" class="fermer" aria-label="Fermer">{ic('x', 22, 2.2)}</button></div>
<div class="feuille-corps">
<div class="sur">{r['site']}</div>
<h2 class="h1 moyen">{r['titre']}</h2>
<div class="stats">
<div><span class="chiffre">{duree(r['actif'])}</span><span class="unite">actives</span></div>
<div><span class="chiffre">{duree(r['total'])}</span><span class="unite">en tout</span></div>
<div><span class="chiffre">{r['parts']}</span><span class="unite">parts</span></div>
</div>
<div class="encre macros-fiche">
<div class="encre-haut"><span>Par part</span><span class="pastille">à 9 kcal près</span></div>
<div class="macros-ligne"><div><span class="enorme moyen">{r['prot']}{NB}g</span><span class="unite clair">de protéines</span></div><div><span class="chiffre clair">{r['kcal']}</span><span class="unite clair">kcal</span></div><div><span class="chiffre clair">5{NB}g</span><span class="unite clair">de fibres</span></div></div>
</div>
<div class="apps">{pictos}</div>
<h3 class="h3">Ingrédients <span>pour 10 parts</span></h3>
<ul class="ings">{li}</ul>
<h3 class="h3">Étapes <span>10 min de gestes, le reste cuit seul</span></h3>
<ol class="etapes">{et}</ol>
<a class="source" href="#">Voir la recette sur {r['site']}{ic('out', 16, 2)}</a>
</div>
<div class="feuille-pied"><button type="button" class="grand">Ajouter à dimanche · 10 parts</button></div>
</section>'''


# ── Les quatre écrans ──────────────────────────────────────────────────────
ecrans = []
ecrans.append(('A · Grandes photos', 'La photo d’abord. Les pictos des appareils sont sur la photo, et (i) ouvre la fiche. Deux recettes par écran.',
               f'<div class="tel">{entete()}{carte_encre()}{recherche()}<div class="pile">{"".join(carte_grande(r) for r in RECETTES[:4])}</div><div class="suite">… et 6 autres, puis la pagination</div></div>'))
ecrans.append(('B · Vignettes', 'Plus serré : cinq recettes par écran. La photo reste là, en petit.',
               f'<div class="tel">{entete()}{carte_encre()}{recherche()}<div class="pile serre">{"".join(carte_vignette(r) for r in RECETTES[:7])}</div><div class="suite">… et 3 autres, puis la pagination</div></div>'))
ecrans.append(('La fiche (i)', 'Elle monte du bas, sans quitter la liste. Les étapes disent ce qui demande tes mains et ce qui cuit seul.',
               f'<div class="tel tel-fiche">{fiche()}</div>'))
ecrans.append(('Le bas de la liste', 'On ne fait que descendre. Les boutons sont tout en bas ; « Les 10 suivantes » remonte en haut de la liste.',
               f'<div class="tel tel-bas"><div class="pile serre">{"".join(carte_vignette(r) for r in RECETTES[7:10])}</div>{pagination()}</div>'))

CSS = '''
/* Maquettes côte à côte, dans le téléphone ; le style de l’écran est celui du Budget, direction A. */
:root{
  --fond:#F2F4EF; --surface:#FBFCFA; --encre:#1C2B23; --doux:#5D6E62; --herbe:#2F5D45;
  --safran:#E8A33D; --ocre:#8F5A0D; --brume:#DCE2D6; --piste:#E4E9E1; --sable:#F6EAD2;
  --encre-doux:#B7C6BC; --encre-clair:#DCE2D6;
  --page:#E9EDE6; --page-texte:#1C2B23; --page-doux:#5D6E62; --cadre:#C9D2C4;
  --titre:'Fraunces',Georgia,serif; --texte:'Instrument Sans',system-ui,-apple-system,sans-serif;
  --ombre:0 1px 2px rgba(28,43,35,.06),0 8px 24px rgba(28,43,35,.07);
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--page:#111A15;--page-texte:#E6ECE5;--page-doux:#9FB0A5;--cadre:#2A3830;color-scheme:dark}}
:root[data-theme="dark"]{--page:#111A15;--page-texte:#E6ECE5;--page-doux:#9FB0A5;--cadre:#2A3830;color-scheme:dark}
*{box-sizing:border-box}
body{background:var(--page);color:var(--page-texte);font-family:var(--texte);margin:0;padding-block:28px 56px;padding-inline:16px}
.intro{max-width:1680px;margin:0 auto 22px}
.intro h1{font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:34px;font-weight:600;letter-spacing:-.02em;margin:0;text-wrap:balance}
.intro p{margin:6px 0 0;color:var(--page-doux);font-size:15px;max-width:64ch;line-height:1.5}
.planche{max-width:1680px;margin:0 auto;display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start}
.ecran{width:min(390px,100%);display:flex;flex-direction:column;gap:10px}
.ecran > h2{margin:0;font-size:13px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--page-doux)}
.ecran > p{margin:0;font-size:14px;line-height:1.45;color:var(--page-doux);min-height:3em}
button{font:inherit;color:inherit;cursor:pointer}
button:focus-visible,a:focus-visible{outline:2px solid var(--herbe);outline-offset:2px}
.ic{fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;display:block}

.tel{position:relative;width:100%;background:var(--fond);color:var(--encre);border-radius:34px;border:1px solid var(--cadre);padding:0 16px 22px;overflow:hidden;font-size:15px}
.barre{height:56px;display:flex;align-items:center;justify-content:space-between}
.retour{display:flex;align-items:center;gap:4px;min-height:44px;padding:0 6px 0 0;border:0;background:transparent;color:var(--herbe);font-size:16px;font-weight:600}
.avatar{width:36px;height:36px;border-radius:50%;background:var(--herbe);color:var(--fond);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600}
.sur{font-size:12px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--doux)}
.h1{margin:4px 0 0;font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:46px;font-weight:600;line-height:1;letter-spacing:-.02em;text-wrap:balance}
.h1.moyen{font-size:30px;line-height:1.08;margin-top:6px}
.h2{margin:0;font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:25px;font-weight:600;letter-spacing:-.01em}
.h3{margin:26px 0 10px;font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:21px;font-weight:600;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.h3 span{font-family:var(--texte);font-size:13px;font-weight:500;color:var(--doux)}

.encre{margin-top:20px;border-radius:28px;background:var(--encre);color:var(--fond);padding:20px 20px 18px}
.encre-haut{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:15px;color:var(--encre-doux)}
.pastille{font-size:13px;color:var(--encre-clair);background:rgba(242,244,239,.08);border-radius:999px;padding:5px 11px;white-space:nowrap}
.enorme{margin-top:2px;font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:60px;font-weight:600;line-height:1.05;letter-spacing:-.035em;color:var(--safran);font-variant-numeric:tabular-nums}
.enorme.moyen{font-size:44px;display:block}
.encre-sous{margin-top:4px;font-size:14px;color:var(--encre-doux)}
.retenues{margin-top:14px;display:flex;align-items:center;gap:10px;padding:8px;border-radius:16px;background:rgba(242,244,239,.07)}
.mini{width:38px;height:38px;border-radius:12px;background-size:cover;background-position:center;flex-shrink:0}
.retenue-nom{flex-grow:1;min-width:0;font-size:14px;color:var(--encre-clair);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.retenue-parts{font-size:13px;color:var(--encre-doux);white-space:nowrap}

.cherche{margin-top:18px;display:flex;gap:8px}
.cherche-champ{flex-grow:1;min-width:0;height:50px;border-radius:18px;background:var(--surface);box-shadow:var(--ombre);display:flex;align-items:center;gap:10px;padding:0 14px;color:var(--doux);font-size:15px}
.filtres{width:50px;height:50px;border:0;border-radius:18px;background:var(--piste);display:flex;align-items:center;justify-content:center;color:var(--herbe)}
.puces{margin-top:10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin-inline:-16px;padding-inline:16px}
.puce{flex-shrink:0;min-height:40px;padding:0 14px;border:0;border-radius:999px;background:var(--piste);font-size:13.5px;font-weight:500;white-space:nowrap}
.puce.on{background:var(--encre);color:var(--fond)}
.compte{margin-top:22px;display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.compte span{font-size:14px;color:var(--doux);font-variant-numeric:tabular-nums}

.pile{margin-top:12px;display:flex;flex-direction:column;gap:14px}
.pile.serre{gap:10px}
.suite{margin-top:16px;text-align:center;font-size:13px;color:var(--doux)}
.carte{border-radius:22px;background:var(--surface);overflow:hidden;box-shadow:var(--ombre)}
.photo{position:relative;aspect-ratio:16/10;max-width:100%;background-size:cover;background-position:center}
.info{position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(251,252,250,.92);color:var(--herbe);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(28,43,35,.18)}
.info.nu{position:static;background:transparent;box-shadow:none;width:44px;height:44px;color:var(--doux)}
.pictos{position:absolute;left:10px;bottom:10px;display:flex;gap:6px}
.picto{width:34px;height:34px;border-radius:50%;background:rgba(251,252,250,.92);color:var(--encre);display:flex;align-items:center;justify-content:center}
.pictos.plats{position:static;margin-top:6px;gap:4px}
.pictos.plats .picto{width:26px;height:26px;background:var(--piste);color:var(--herbe)}
.carte-corps{padding:13px 16px 16px}
.titre{margin:0;font-size:17px;font-weight:600;line-height:1.3;text-wrap:balance}
.titre.t2{font-size:15.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.meta{margin-top:4px;font-size:13.5px;color:var(--doux);display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.meta strong{color:var(--encre);font-weight:600}
.meta2{margin-top:3px;font-size:13px;line-height:1.4;color:var(--doux)}
.meta2 .prot{color:var(--herbe);font-weight:600;white-space:nowrap}
.bas{margin-top:12px;display:flex;align-items:flex-end;justify-content:space-between;gap:10px}
.macros{display:flex;gap:18px}
.chiffre{display:block;font-family:var(--titre);font-variation-settings:'opsz' 144;font-size:26px;font-weight:600;line-height:1.05;letter-spacing:-.02em;font-variant-numeric:tabular-nums;color:var(--herbe)}
.chiffre.petit{font-size:20px;color:var(--encre)}
.chiffre.clair{color:var(--fond);font-size:22px}
.unite{display:block;margin-top:2px;font-size:12.5px;color:var(--doux)}
.unite.clair{color:var(--encre-doux)}
.ajoute{min-height:44px;padding:0 16px 0 12px;border:0;border-radius:999px;background:var(--safran);color:var(--encre);font-size:14px;font-weight:600;display:flex;align-items:center;gap:5px;flex-shrink:0}
.retenue{min-height:44px;padding:0 14px 0 10px;border-radius:999px;background:rgba(47,93,69,.1);color:var(--herbe);font-size:14px;font-weight:600;display:flex;align-items:center;gap:5px;flex-shrink:0}
.rond{width:44px;height:44px;padding:0;justify-content:center}

.ligne{display:flex;gap:12px;padding:10px;border-radius:22px;background:var(--surface);box-shadow:var(--ombre)}
.vignette{width:88px;height:88px;border-radius:16px;background-size:cover;background-position:center;flex-shrink:0}
.ligne-corps{flex-grow:1;min-width:0;padding-top:2px}
.ligne-corps .meta{margin-top:3px;font-size:13px}
.ligne-actions{display:flex;flex-direction:column;justify-content:space-between;align-items:center;margin:-4px -2px -2px 0}

.pages{margin-top:22px;display:flex;flex-direction:column;gap:12px;align-items:stretch}
.pages-txt{text-align:center;font-size:14px;color:var(--doux);font-variant-numeric:tabular-nums}
.suivantes{min-height:54px;border:0;border-radius:18px;background:var(--safran);color:var(--encre);font-size:16px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px}
.nums{display:flex;justify-content:center;gap:6px}
.num{min-width:44px;height:44px;border:0;border-radius:999px;background:var(--piste);font-size:15px;font-weight:500;font-variant-numeric:tabular-nums;display:flex;align-items:center;justify-content:center}
.num.on{background:var(--encre);color:var(--fond)}
.num.vide{background:transparent}
.tel-bas{padding-top:18px}

.tel-fiche{padding:0;min-height:1200px;background:var(--fond)}
.voile{position:absolute;inset:0;background:rgba(28,43,35,.55)}
.feuille{position:relative;margin-top:44px;background:var(--fond);border-radius:28px 28px 0 0;overflow:hidden}
.feuille-photo{position:relative;height:230px;background-size:cover;background-position:center}
.poignee{position:absolute;top:8px;left:50%;width:40px;height:5px;margin-left:-20px;border-radius:3px;background:rgba(251,252,250,.85)}
.fermer{position:absolute;top:14px;right:14px;width:44px;height:44px;border:0;border-radius:50%;background:rgba(251,252,250,.92);color:var(--encre);display:flex;align-items:center;justify-content:center}
.feuille-corps{padding:18px 16px 18px}
.stats{margin-top:16px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.stats > div{border-radius:18px;background:var(--surface);box-shadow:var(--ombre);padding:12px}
.stats .chiffre{font-size:23px;color:var(--encre)}
.macros-fiche{margin-top:12px}
.macros-ligne{margin-top:4px;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;align-items:end}
.apps{margin-top:12px;display:flex;flex-wrap:wrap;gap:8px}
.app{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 14px 0 6px;border-radius:999px;background:var(--surface);box-shadow:var(--ombre);font-size:14px;font-weight:500}
.app .picto{background:var(--piste);color:var(--herbe)}
.ings{margin:0;padding:0 16px;list-style:none;border-radius:22px;background:var(--surface);box-shadow:var(--ombre)}
.ings li{display:grid;grid-template-columns:86px minmax(0,1fr);gap:10px;padding:11px 0;border-top:1px solid var(--piste);font-size:15px}
.ings li:first-child{border-top:0}
.qte{font-weight:600;font-variant-numeric:tabular-nums}
.etapes{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:10px}
.etape{display:flex;gap:12px;padding:14px;border-radius:22px;background:var(--surface);box-shadow:var(--ombre)}
.no{width:30px;height:30px;border-radius:50%;background:var(--encre);color:var(--fond);font-family:var(--titre);font-weight:600;font-size:15px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.etape p{margin:3px 0 0;font-size:15px;line-height:1.45}
.etape-meta{margin-top:8px;display:flex;align-items:center;gap:6px}
.etape-meta .picto{width:28px;height:28px;background:var(--piste);color:var(--herbe)}
.duree{font-size:13px;font-weight:600;border-radius:999px;padding:5px 10px;font-variant-numeric:tabular-nums}
.duree.actif{background:var(--sable);color:var(--ocre)}
.duree.bloquant{background:var(--sable);color:var(--ocre)}
.duree.passif{background:var(--piste);color:var(--doux)}
.source{margin-top:18px;display:flex;align-items:center;justify-content:center;gap:6px;min-height:44px;color:var(--herbe);font-size:14px;font-weight:600;text-decoration:none}
.feuille-pied{position:sticky;bottom:0;padding:12px 16px 18px;background:linear-gradient(to top,var(--fond) 70%,rgba(242,244,239,0))}
.grand{width:100%;min-height:56px;border:0;border-radius:18px;background:var(--safran);color:var(--encre);font-size:16px;font-weight:600}
@media (prefers-reduced-motion: reduce){*{transition:none!important}}
'''

corps = ''.join(f'<div class="ecran"><h2>{t}</h2><p>{p}</p>{h}</div>' for t, p, h in ecrans)
html = f'''<meta charset="utf-8">
<title>Popote, les recettes</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Instrument+Sans:wght@400..700&display=swap" rel="stylesheet">
<style>{CSS}{"".join(css_photos)}</style>
<header class="intro"><h1>Les recettes, refaites</h1><p>L’écran « Choisir », sur tes vraies recettes, dans le style du Budget. Deux façons de montrer la liste (A et B), la fiche (i) et le bas de la liste. Les photos sont celles des sites d’où viennent les recettes.</p></header>
<main class="planche">{corps}</main>
'''
open(os.path.join(ICI, 'recettes.html'), 'w', encoding='utf-8').write(html)
print('ok', len(html) // 1024, 'Ko')
