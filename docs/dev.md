# Lancer en local

| Prérequis | Version |
|---|---|
| Node | ≥ 22 |
| Docker | daemon démarré |
| psql | ≥ 15 (facultatif, pour l'audit RLS) |

```bash
npm install
npx supabase start        # imprime les clés à mettre dans .env
cp .env.example .env      # puis renseigner VITE_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY
npm run db:reset          # applique les migrations
npm run seed              # référentiels : CIQUAL, conversions, durées
npm run ingest -- --sitemap <url> --limite 25   # quelques recettes
npm run test              # 382 tests
npm run dev               # http://localhost:5173
```

| Service local | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| E-mails (Mailpit) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Les Edge Functions nécessitent un second terminal : `npx supabase functions serve`.

`inventer` a besoin d'un modèle. Toute API compatible OpenAI convient :

```bash
# .env local, ou `supabase secrets set` en production
LLM_API_KEY=...
LLM_BASE_URL=https://api.openai.com/v1   # ou un serveur local (llama.cpp, vLLM, Ollama)
LLM_MODEL=gpt-4o-mini
```

Sans clé, l'écran « Envie spéciale » répond 503 et le dit — il ne plante pas.

## Production

| | |
|---|---|
| Projet | `mjlxfffdirlqmmjzhorg` · **West EU (Paris)** `eu-west-3` |
| URL | `https://mjlxfffdirlqmmjzhorg.supabase.co` |
| Connexion psql | `postgresql://postgres.mjlxfffdirlqmmjzhorg:<mdp>@aws-1-eu-west-3.pooler.supabase.com:5432/postgres` |
| Vérifié | 22 migrations · **RLS active sur toutes les tables** · 3 Edge Functions, préflight CORS 200, POST sans jeton 401 |

```bash
export SUPABASE_ACCESS_TOKEN=<jeton>
npx supabase db push                          # migrations
npx supabase functions deploy invite accept-invite inventer
npx supabase secrets set RESEND_API_KEY=<clé> APP_BASE_URL=<url>
npx supabase secrets set LLM_API_KEY=<clé>            # « Envie spéciale »
```

⚠️ **À faire une fois vos deux comptes créés** — refermer la création de foyer, sinon
toute personne qui s'inscrit peut s'en créer un :

```sql
update public.instance_setting
set value = '{"enabled": false}'::jsonb
where key = 'allow_household_creation';
```
