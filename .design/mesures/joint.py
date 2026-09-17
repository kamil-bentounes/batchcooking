import json,re,html,urllib.request
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36','Accept-Language':'fr-FR,fr;q=0.9'}
def walk(o):
    if isinstance(o,dict):
        t=o.get('@type')
        if t=='Recipe' or (isinstance(t,list) and 'Recipe' in t): yield o
        for v in o.values(): yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
def grab(u):
    try: raw=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=35).read().decode('utf-8','ignore')
    except Exception: return None
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',raw,re.S|re.I):
        try: d=json.loads(html.unescape(m.group(1)).strip())
        except Exception: continue
        for r in walk(d): return r
    return None
def steps(r):
    out=[]
    def rec(x):
        if isinstance(x,str): out.append(x)
        elif isinstance(x,dict):
            if x.get('text'): out.append(x['text'])
            elif x.get('itemListElement'): rec(x['itemListElement'])
        elif isinstance(x,list):
            for i in x: rec(i)
    rec(r.get('recipeInstructions') or []); return [s.strip() for s in out if s and s.strip()]
FOUR=r'four|enfourn|pr[ée]chauff|cuire au four'
TEMP=r'\d{2,3}\s*°|thermostat|\bth\.?\s*\d'
DUR=r'\d+\s*(?:min\b|mn\b|minutes?|heures?|\bh\b|secondes?|sec\b)'
APP=r'four|enfourn|po[êe]le|casserole|cocotte|micro-?ondes?|air ?fryer|friteuse|robot|blender|mixe|batteur|autocuiseur|cookeo|thermomix|plaque|feu|bain-marie|grill|barbecue'
C=Counter()
def job(t):
    site,u=t; r=grab(u)
    if not r: return None
    S=steps(r)
    if not S: return None
    rf=any(re.search(FOUR,s,re.I) for s in S)
    rt=any(re.search(TEMP,s,re.I) for s in S)
    ts=(r.get('totalTime') or r.get('cookTime') or '')
    return dict(site=site,n=len(S),
      rec_four=rf, rec_temp=rt, rec_four_sans_temp=(rf and not rt),
      rec_a_totaltime=bool(ts),
      st_dur=sum(1 for s in S if re.search(DUR,s,re.I)),
      st_app=sum(1 for s in S if re.search(APP,s,re.I)),
      st_four=sum(1 for s in S if re.search(FOUR,s,re.I)),
      st_four_sans_temp=sum(1 for s in S if re.search(FOUR,s,re.I) and not re.search(TEMP,s,re.I)),
      st_app_sans_dur=sum(1 for s in S if re.search(APP,s,re.I) and not re.search(DUR,s,re.I)))
urls=[l.strip().split('|')[1:] for l in open('sm.out') if l.startswith('URL|')]
R=[]
with ThreadPoolExecutor(12) as ex:
    for d in ex.map(job,urls):
        if d: R.append(d)
n=len(R); ns=sum(d['n'] for d in R)
def pr(lbl,v,tot): print(f"  {lbl:<58} {v:>5} / {tot:<5} = {100*v/tot:5.1f} %")
print(f"\n### STATISTIQUES JOINTES — {n} recettes, {ns} etapes\n")
print("RECETTES")
pr("utilisent le four",                      sum(d['rec_four'] for d in R), n)
pr("donnent une temperature quelque part",   sum(d['rec_temp'] for d in R), n)
pr(">>> AU FOUR **SANS** TEMPERATURE  <<<",  sum(d['rec_four_sans_temp'] for d in R), n)
f=sum(d['rec_four'] for d in R) or 1
pr("    ... soit, parmi les recettes au four",sum(d['rec_four_sans_temp'] for d in R), f)
pr("ont un totalTime/cookTime en en-tete",   sum(d['rec_a_totaltime'] for d in R), n)
print("\nETAPES")
pr("mentionnent une duree",                  sum(d['st_dur'] for d in R), ns)
pr(">>> SANS duree  <<<",                    ns-sum(d['st_dur'] for d in R), ns)
pr("mentionnent un appareil",                sum(d['st_app'] for d in R), ns)
a=sum(d['st_app'] for d in R) or 1
pr(">>> avec appareil MAIS SANS duree  <<<", sum(d['st_app_sans_dur'] for d in R), a)
pr("etapes four sans temperature",           sum(d['st_four_sans_temp'] for d in R), max(sum(d['st_four'] for d in R),1))
