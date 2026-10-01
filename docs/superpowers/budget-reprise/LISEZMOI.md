# Budget : où on en est (mis de côté le 01/10/2026)

## L'état

- **La spec** : `docs/superpowers/specs/2026-10-01-ecran-budget-design.md`, direction A
  « Potager ». Dernier commit : df517e9 (9e revue).
- **La boucle de revues** : 9 tours, chacun avec Codex et un agent Claude. Consigne de
  Kamil : « boucle entre correction + revue jusqu'à ce que tout converge ». Pas encore
  convergée. Au 9e tour, il restait des défauts « major », de moins en moins graves,
  surtout dans les cas à deux personnes.
  - Le 10e tour a été lancé puis arrêté, sans résultat.
  - Le 9e tour de l'agent Claude n'a pas abouti : la limite hebdomadaire était atteinte
    (remise à zéro le 6 octobre).
- **Le plan d'implémentation** n'est pas écrit.

## Pour reprendre

1. Lancer un tour : Codex et un agent Claude, en parallèle, avec `prompt-revue.txt`
   (il liste ce que chaque tour a ajouté).
   - Codex, toujours en lecture seule :
     `codex exec -s read-only -C <dépôt> -o <sortie> - < prompt-revue.txt`.
   - L'agent : « Lis ce fichier et suis la consigne », avec le md5 de la spec, en lui
     promettant que la spec ne changera pas pendant sa revue. Ne pas la modifier pendant
     qu'il tourne.
2. Vérifier chaque constat dans le code ou en prod avant de corriger. Committer en
   local, sans trailer Claude.
3. Avant chaque nouveau tour, compléter la liste « Le n-ième tour a ajouté » du prompt.
4. Recommencer jusqu'à « STATUS: Approved » des deux côtés.
5. Ensuite, `sp-writing-plans` : les lots 1 et 2 ensemble, puis le lot 3 (la clôture),
   puis le lot 4 (à deux), une fois Thauba arrivée. Enfin, l'implémentation en TDD,
   avec des revues.

Une décision de Kamil se pose en chat, une question à la fois, sur son cas concret.

## Lire la prod (lecture seule)

`q.py`, à recréer dans le scratchpad. Le jeton se lit dans
`~/PERSO/supabase_token.txt` : ne jamais l'afficher ni le copier ici.

```python
import json,sys,urllib.request
T=open('/home/kamil/PERSO/supabase_token.txt').read().strip()
sql=sys.stdin.read()
req=urllib.request.Request('https://api.supabase.com/v1/projects/mjlxfffdirlqmmjzhorg/database/query',
  data=json.dumps({'query':sql,'read_only':True}).encode(),
  headers={'Authorization':'Bearer '+T,'Content-Type':'application/json','User-Agent':'curl/8'})
try:
  r=urllib.request.urlopen(req).read().decode()
except urllib.error.HTTPError as e:
  r=e.read().decode()
try:
  for row in json.loads(r): print(json.dumps(row,ensure_ascii=False,default=str))
except Exception: print(r[:2000])
```

Codex n'y a pas accès : le DNS est coupé dans son bac à sable. Les agents Claude, si.

## Les décisions de Kamil prises pendant les revues

- **Mois suivis (D77).** Un mois est suivi s'il est clôturé, ou si un membre y a un
  revenu. L'Entretien 2026 a donc un prévu de 166,68 €.
- **Les relevés.** Un relevé se corrige, il ne se retire pas.
- **À deux.** Le premier revenu d'un membre compte dès son arrivée. La clôture attend
  que chaque membre présent ait posé son revenu.

## Ce qui attend en dehors de la spec

- **Un bug en prod, déjà là aujourd'hui.** `delete_my_account` échoue pour Kamil. Ses
  deux comptes perso violent `compte_titulaire_coherent` quand le profil part
  (`titulaire_id` passe à null). La spec le corrige au lot 1. Une migration seule
  pourrait le corriger plus tôt, mais seulement avec son accord.
- **Côté Kamil.**
  - Thauba doit rejoindre le foyer elle-même.
  - Coller `supabase/templates/invitation.html` dans le tableau de bord Supabase.
  - Une question est restée sans réponse : réserver le lien d'invitation à l'adresse
    invitée ?
