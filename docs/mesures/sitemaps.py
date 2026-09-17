import re,urllib.request,gzip,io,sys,random
UA={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36','Accept-Language':'fr-FR,fr;q=0.9'}
def fetch(u):
    d=urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=40).read()
    if d[:2]==b'\x1f\x8b': d=gzip.decompress(d)
    return d.decode('utf-8','ignore')
def locs(x): return re.findall(r'<loc>\s*([^<\s]+)\s*</loc>',x)
targets={
 'Marmiton':('https://www.marmiton.org/robots.txt', r'/recettes/recette_'),
 'CuisineAZ':('https://www.cuisineaz.com/robots.txt', r'/recettes/.+\d+\.aspx'),
 'JournalDesFemmes':('https://cuisine.journaldesfemmes.fr/robots.txt', r'/recette/\d+'),
 'PtitChef':('https://www.ptitchef.com/robots.txt', r'/recettes/'),
}
for name,(rb,pat) in targets.items():
    try:
        sm=re.findall(r'(?im)^sitemap:\s*(\S+)',fetch(rb))
        found=[]
        for s in sm[:14]:
            try: L=locs(fetch(s))
            except Exception: continue
            hit=[u for u in L if re.search(pat,u)]
            if hit: found+=hit
            elif L and L[0].endswith(('.xml','.xml.gz','.gz')):
                for sub in L[:3]:
                    try: found+=[u for u in locs(fetch(sub)) if re.search(pat,u)]
                    except Exception: pass
            if len(found)>400: break
        random.seed(7); random.shuffle(found)
        print(f'{name}|{len(sm)} sitemaps|{len(found)} urls recette trouvees')
        for u in found[:14]: print('URL|'+name+'|'+u)
    except Exception as e: print(f'{name}|ECHEC|{e}')
