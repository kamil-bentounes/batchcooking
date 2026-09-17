import json, re, sys, urllib.request, html
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36','Accept-Language':'fr-FR,fr;q=0.9'}
def walk(o):
    if isinstance(o,dict):
        t=o.get('@type')
        if t=='Recipe' or (isinstance(t,list) and 'Recipe' in t): yield o
        for v in o.values(): yield from walk(v)
    elif isinstance(o,list):
        for v in o: yield from walk(v)
def get(url):
    try:
        raw=urllib.request.urlopen(urllib.request.Request(url,headers=UA),timeout=30).read().decode('utf-8','ignore')
    except Exception as e: return None,str(e)
    for m in re.finditer(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>',raw,re.S|re.I):
        txt=html.unescape(m.group(1)).strip()
        try: data=json.loads(txt)
        except Exception:
            try: data=json.loads(re.sub(r',\s*([}\]])',r'\1',txt))
            except Exception: continue
        for r in walk(data): return r,None
    return None,'pas de Recipe dans le ld+json'
for line in sys.stdin:
    label,url=line.strip().split('|',1)
    r,err=get(url)
    print('='*78); print(f'### {label}')
    if not r: print('  ECHEC:',err); continue
    ings=r.get('recipeIngredient') or []
    print(f'  yield={r.get("recipeYield")!r}  prep={r.get("prepTime")!r} cook={r.get("cookTime")!r} total={r.get("totalTime")!r}')
    n=r.get('nutrition')
    print(f'  nutrition={ {k:v for k,v in n.items() if k!="@type"} if isinstance(n,dict) else None}')
    print(f'  INGREDIENTS ({len(ings)}):')
    for i in ings[:9]: print('    -',i if isinstance(i,str) else i)
    ins=r.get('recipeInstructions') or []
    print(f'  ETAPES ({len(ins)}):')
    for s in ins[:5]:
        txt=s.get('text') if isinstance(s,dict) else s
        print('    *',(txt or '')[:150].replace('\n',' '))
