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
    m=re.search(r'(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$',v.strip().upper())
    if not m: return None
    h,mn,sc=(int(x) if x else 0 for x in m.groups())
    t=h*60+mn+sc/60
    return t if t>0 else None
def dur_in(s):
    tot=0;f=False
    for m in re.finditer(r'(\d+)\s*(min\b|mn\b|minutes?|heures?|\bh\b)',s,re.I):
        v=int(m.group(1));u=m.group(2).lower(); tot+= v*60 if u.startswith('h') else v; f=True
    return tot if f else None
REPOS=r'repos|reposer|lever|lev[ée]e|r[ée]frig[ée]r|frigo|marin|refroidir|prendre au froid|une nuit|toute la nuit|cong[ée]l'
VERBES=(r'\b(?:m[ée]lange|ajoute|verse|coupe|[ée]mince|hache|fais|faites|cuis|cuire|enfourne|pr[ée]chauffe|remue|bats|battez|'
        r'incorpore|assaisonne|sale|poivre|arrose|nappe|d[ée]pose|dispose|r[ée]serve|[ée]goutte|rince|[ée]pluche|pele|r[âa]pe|'
        r'p[ée]tris|[ée]tale|d[ée]taille|fond|dore|revient|revenir|laisse|retire|sers|servez|montez|fouette|tamise|beurre|'
        r'saupoudre|badigeonne|parseme|d[ée]glace|flambe|mijote|bouillir|blanchi|saisi|griller?|r[ôo]ti)\w*\b')
def job(t):
    site,u=t; r=grab(u)
    if not r: return None
    S=steps(r)
    if not S: return None
    tt=iso(r.get('totalTime')); ct=iso(r.get('cookTime')); pt=iso(r.get('prepTime'))
    ds=[dur_in(s) for s in S]
    nd=sum(1 for d in ds if d)
    nv=[len(set(m.group(0)[:5].lower() for m in re.finditer(VERBES,s,re.I))) for s in S]
    return dict(site=site,n=len(S),tt=tt,ct=ct,pt=pt,nd=nd,sumd=sum(d for d in ds if d),
        repos=any(re.search(REPOS,s,re.I) for s in S),
        multi=sum(1 for v in nv if v>=2), mono=sum(1 for v in nv if v==1), zero=sum(1 for v in nv if v==0),
        app_steps=sum(1 for s in S if re.search(r'four|enfourn|po[êe]le|casserole|cocotte|micro-?ondes?|air ?fryer|robot|plaque|feu|bain-marie|grill',s,re.I)))
urls=[l.strip().split('|')[1:] for l in open('sm.out') if l.startswith('URL|')]
R=[d for d in ThreadPoolExecutor(12).map(job,urls) if d]
C=[d for d in R if d['tt'] and d['nd']>0]
print(f"\n### TEST DECISIF — {len(R)} recettes, {len(C)} avec totalTime et >=1 etape datee\n")
print("1. LA SOMME **PARTIELLE** DEPASSE-T-ELLE DEJA LE TOTAL ANNONCE ?")
print("   (une somme partielle > total prouve irrefutablement que totalTime n'est PAS la somme des etapes)")
ex=[d for d in C if d['sumd']>d['tt']]
print(f"   recettes ou Sigma(partielle) > totalTime : {len(ex)}/{len(C)} = {100*len(ex)/len(C):.0f} %")
exr=[d for d in ex if d['repos']]
print(f"      dont avec repos passif detecte        : {len(exr)}/{len(ex) or 1}")
print(f"      dont SANS repos passif                : {len(ex)-len(exr)}  <-- les cas non explicables par le repos")
print("\n2. LE RATIO SUIT-IL LA COUVERTURE ? (si Sigma_toutes ~ totalTime, ratio doit croitre avec la couverture)")
import math
xs=[d['nd']/d['n'] for d in C]; ys=[d['sumd']/d['tt'] for d in C]
mx,my=st.mean(xs),st.mean(ys)
num=sum((x-mx)*(y-my) for x,y in zip(xs,ys)); den=math.sqrt(sum((x-mx)**2 for x in xs)*sum((y-my)**2 for y in ys))
print(f"   correlation couverture / ratio : r = {num/den if den else 0:+.2f}")
for lo,hi in ((0,.25),(.25,.5),(.5,1.01)):
    g=[d for d in C if lo<=d['nd']/d['n']<hi]
    if g: print(f"   couverture {int(lo*100):>3}-{int(hi*100):>3} % : n={len(g):<3} ratio median {st.median([d['sumd']/d['tt'] for d in g]):.2f}")
print(f"\n   quartiles du ratio : {st.quantiles(ys,n=4)} · % au-dessus de 1,0 : {100*sum(1 for y in ys if y>1)/len(ys):.0f} %")
print("\n3. RATIO CONTRE cookTime SEUL (les durees declarees sont surtout des cuissons)")
C2=[d for d in C if d['ct']]
if C2: print(f"   n={len(C2)} · mediane Sigma/cookTime = {st.median([d['sumd']/d['ct'] for d in C2]):.2f} · % dans +/-25 % : {100*sum(1 for d in C2 if .75<=d['sumd']/d['ct']<=1.25)/len(C2):.0f} %")
print("\n4. CLE (verbe, appareil) DE D19 : combien d'etapes ont UN SEUL verbe ?")
tm,tn,tz=sum(d['multi'] for d in R),sum(d['mono'] for d in R),sum(d['zero'] for d in R)
T=tm+tn+tz
print(f"   un seul verbe    : {tn:>4}/{T} = {100*tn/T:5.1f} %  <-- ce que D19 suppose")
print(f"   plusieurs verbes : {tm:>4}/{T} = {100*tm/T:5.1f} %")
print(f"   aucun reconnu    : {tz:>4}/{T} = {100*tz/T:5.1f} %")
print(f"\n5. DOUBLE-COMPTAGE cookTime : {sum(d['app_steps'] for d in R)/len(R):.2f} etapes a appareil par recette, pour 1 cookTime")
