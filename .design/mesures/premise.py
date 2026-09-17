import json,re,html,urllib.request,statistics as st
from concurrent.futures import ThreadPoolExecutor
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
def iso(v):
    if not v or not isinstance(v,str): return None
    m=re.match(r'P?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$',v.strip().upper().replace('PT','T') if v.strip().upper().startswith('PT') else v.strip().upper())
    m=re.search(r'(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$',v.strip().upper())
    if not m: return None
    h,mn,s=(int(x) if x else 0 for x in m.groups())
    t=h*60+mn+s/60
    return t if t>0 else None
DUR=r'(\d+)\s*(min\b|mn\b|minutes?|heures?|\bh\b)'
def dur_in(s):
    tot=0; found=False
    for m in re.finditer(DUR,s,re.I):
        v=int(m.group(1)); u=m.group(2).lower()
        tot += v*60 if u.startswith('h') else v
        found=True
    return tot if found else None
APP=r'four|enfourn|po[êe]le|casserole|cocotte|micro-?ondes?|air ?fryer|friteuse|robot|blender|mixe|batteur|autocuiseur|plaque|feu|bain-marie|grill'
def job(t):
    site,u=t; r=grab(u)
    if not r: return None
    S=steps(r)
    if not S: return None
    tt=iso(r.get('totalTime')); ct=iso(r.get('cookTime')); pt=iso(r.get('prepTime'))
    ds=[dur_in(s) for s in S]
    nd=sum(1 for d in ds if d)
    return dict(site=site,n=len(S),tt=tt,ct=ct,pt=pt,
        has_tt=tt is not None, has_ct=ct is not None, has_pt=pt is not None,
        nd=nd, all_dur=(nd==len(S)), sumd=sum(d for d in ds if d),
        app_steps=sum(1 for s in S if re.search(APP,s,re.I)))
urls=[l.strip().split('|')[1:] for l in open('sm.out') if l.startswith('URL|')]
R=[]
with ThreadPoolExecutor(12) as ex:
    for d in ex.map(job,urls):
        if d: R.append(d)
n=len(R)
print(f"\n### PREMISSE DE D15 — {n} recettes\n")
print("A. VENTILATION DES TEMPS D'EN-TETE (le '100 %' etait une disjonction)")
for k,l in (('has_tt','totalTime present'),('has_ct','cookTime present'),('has_pt','prepTime present')):
    v=sum(d[k] for d in R); print(f"   {l:<28} {v:>3}/{n} = {100*v/n:5.1f} %")
v=sum(1 for d in R if d['has_tt'] or d['has_ct']); print(f"   {'totalTime OU cookTime':<28} {v:>3}/{n} = {100*v/n:5.1f} %")
v=sum(1 for d in R if d['has_tt'] and d['has_pt'] and d['has_ct']); print(f"   {'les trois':<28} {v:>3}/{n} = {100*v/n:5.1f} %")
print("\nB. VIABILITE DU REPLI 'recettes dont TOUTES les durees sont declarees'")
v=sum(d['all_dur'] for d in R); print(f"   toutes les etapes datees      {v:>3}/{n} = {100*v/n:5.1f} %  <-- le repli de R1b")
v=sum(1 for d in R if d['nd']>=0.8*d['n']); print(f"   >=80 % des etapes datees      {v:>3}/{n} = {100*v/n:5.1f} %")
v=sum(1 for d in R if d['nd']==0); print(f"   AUCUNE etape datee            {v:>3}/{n} = {100*v/n:5.1f} %")
print("\nC. LA PREMISSE ELLE-MEME : somme des durees declarees vs totalTime")
cands=[d for d in R if d['has_tt'] and d['nd']>=0.8*d['n'] and d['sumd']>0]
print(f"   recettes exploitables pour ce test : {len(cands)}")
if cands:
    ratios=[d['sumd']/d['tt'] for d in cands]
    print(f"   ratio Somme/totalTime : mediane {st.median(ratios):.2f} · min {min(ratios):.2f} · max {max(ratios):.2f}")
    ok=sum(1 for r in ratios if 0.9<=r<=1.1)
    print(f"   dans la tolerance +/-10 % : {ok}/{len(ratios)} = {100*ok/len(ratios):.0f} %")
    for d in cands[:8]:
        print(f"     {d['site']:<18} etapes {d['nd']}/{d['n']:<3} somme {d['sumd']:>5.0f} min   totalTime {d['tt']:>5.0f} min   ratio {d['sumd']/d['tt']:.2f}")
cands2=[d for d in R if d['has_tt'] and d['nd']>0 and d['sumd']>0]
if cands2:
    r2=[d['sumd']/d['tt'] for d in cands2]
    print(f"\n   (echantillon large, >=1 etape datee : n={len(r2)}, mediane {st.median(r2):.2f}, "
          f"dans +/-10 % : {100*sum(1 for r in r2 if 0.9<=r<=1.1)/len(r2):.0f} %)")
print("\nD. DENOMINATEUR de la ligne '56,2 %'")
print(f"   etapes a appareil : {sum(d['app_steps'] for d in R)} sur {sum(d['n'] for d in R)} etapes")
