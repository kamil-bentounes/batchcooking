import json,re,html,sys,urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import defaultdict
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36','Accept-Language':'fr-FR,fr;q=0.9'}
MASS=r'(?:\bg\b|\bgr\b|grammes?|\bkg\b|\bmg\b)'
VOL=r'(?:\bml\b|\bcl\b|\bdl\b|\bl\b|litres?)'
SPOON=r'(?:c\.?\s*à\s*(?:soupe|café|c\b|s\b)|cuill?[eè]r?e?e?s?|càs|càc|pinc[ée]e|poign[ée]e|verre|sachet|bouquet|brins?|filet|trait)'
COUNT=r'^\s*(?:\d+[\s,./]*\d*)\s*(?:pi[eè]ce|gousses?|tranches?|feuilles?|boîtes?|pots?|œufs?|oeufs?|[a-zéèêàçî])'
NUM=r'\d'
def cls(s):
    t=s.strip()
    if not t: return 'vide'
    if re.search(r':\s*$',t) or t.lower().startswith(('pour la','pour le','pour les','garniture','assaisonnement')): return 'section'
    if re.search(MASS,t,re.I): return 'masse'
    if re.search(VOL,t,re.I): return 'volume'
    if re.search(SPOON,t,re.I): return 'cuillere/approx'
    if re.search(NUM,t): return 'compte'
    return 'AUCUNE_QUANTITE'
def walk(o):
    if isinstance(o,dict):
        t=o.get('@type')
        if t=='Recipe' or (isinstance(t,list) and 'Recipe' in t): yield o
        for v in o.values(): yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
def grab(url):
    try: raw=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=35).read().decode('utf-8','ignore')
    except Exception: return None
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',raw,re.S|re.I):
        try: data=json.loads(html.unescape(m.group(1)).strip())
        except Exception: continue
        for r in walk(data): return r
    return None
def steptexts(r):
    out=[]
    def rec(x):
        if isinstance(x,str): out.append(x)
        elif isinstance(x,dict):
            if x.get('text'): out.append(x['text'])
            elif x.get('itemListElement'): rec(x['itemListElement'])
        elif isinstance(x,list):
            for i in x: rec(i)
    rec(r.get('recipeInstructions') or []); return [s for s in out if s and s.strip()]
urls=[l.strip().split('|')[1:] for l in open('sm.out') if l.startswith('URL|')]
res=defaultdict(lambda: defaultdict(int)); meta=defaultdict(lambda: defaultdict(int))
def job(t):
    site,u=t; r=grab(u)
    if not r: return site,None
    ings=[i if isinstance(i,str) else str(i) for i in (r.get('recipeIngredient') or [])]
    steps=steptexts(r)
    txt=' '.join(steps)
    return site,dict(
      ings=[cls(i) for i in ings], nsteps=len(steps),
      temp=bool(re.search(r'\d{2,3}\s*°|th\.?\s*\d|thermostat',txt,re.I)),
      dur=bool(re.search(r'\d+\s*(?:min|heure|h\b)',txt,re.I)),
      four=bool(re.search(r'four|enfourn|pr[ée]chauff',txt,re.I)),
      yld=bool(r.get('recipeYield')), ct=bool(r.get('cookTime') or r.get('totalTime')),
      nut=bool(r.get('nutrition')), ning=len(ings))
with ThreadPoolExecutor(12) as ex:
    for site,d in ex.map(job,urls):
        meta[site]['total']+=1
        if not d: meta[site]['echec']+=1; continue
        meta[site]['ok']+=1; meta[site]['nsteps']+=d['nsteps']; meta[site]['ning']+=d['ning']
        for k in ('temp','dur','four','yld','ct','nut'):
            if d[k]: meta[site][k]+=1
        if d['nsteps']<=1: meta[site]['mono']+=1
        for c in d['ings']: res[site][c]+=1
print(f"{'SITE':<19}{'rec':>4}{'ok':>4}{'ing':>5} | {'masse':>6}{'vol':>5}{'cuil':>5}{'cpt':>5}{'RIEN':>6}{'sect':>5} | {'etapes':>7}{'mono':>5}{'°C':>4}{'duree':>6}{'four':>5}{'nutri':>6}")
print('-'*116)
T=defaultdict(int)
for s in meta:
    m=meta[s]; r=res[s]; n=sum(r.values()) or 1; ok=m['ok'] or 1
    for k in r: T[k]+=r[k]
    for k in ('temp','dur','four','nut','mono','ok'): T[k]+=m[k]
    print(f"{s:<19}{m['total']:>4}{m['ok']:>4}{n:>5} | "
          f"{100*r['masse']//n:>5}%{100*r['volume']//n:>4}%{100*r['cuillere/approx']//n:>4}%"
          f"{100*r['compte']//n:>4}%{100*r['AUCUNE_QUANTITE']//n:>5}%{100*r['section']//n:>4}% | "
          f"{m['nsteps']/ok:>7.1f}{m['mono']:>5}{100*m['temp']//ok:>3}%{100*m['dur']//ok:>5}%{100*m['four']//ok:>4}%{100*m['nut']//ok:>5}%")
N=sum(T[k] for k in ('masse','volume','cuillere/approx','compte','AUCUNE_QUANTITE','section')) or 1
print('-'*116)
print(f"{'TOTAL':<19}{'':>4}{T['ok']:>4}{N:>5} | {100*T['masse']//N:>5}%{100*T['volume']//N:>4}%"
      f"{100*T['cuillere/approx']//N:>4}%{100*T['compte']//N:>4}%{100*T['AUCUNE_QUANTITE']//N:>5}%{100*T['section']//N:>4}% | "
      f"{'':>7}{T['mono']:>5}{100*T['temp']//(T['ok'] or 1):>3}%{100*T['dur']//(T['ok'] or 1):>5}%{100*T['four']//(T['ok'] or 1):>4}%{100*T['nut']//(T['ok'] or 1):>5}%")
