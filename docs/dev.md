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
npm run test              # suite d'isolation
npm run dev               # http://localhost:5173
```

| Service local | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| E-mails (Mailpit) | http://127.0.0.1:54324 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |

Les Edge Functions nécessitent un second terminal : `npx supabase functions serve`.

## Production

| | |
|---|---|
| Projet | `mjlxfffdirlqmmjzhorg` · **West EU (Paris)** `eu-west-3` |
| URL | `https://mjlxfffdirlqmmjzhorg.supabase.co` |
| Connexion psql | `postgresql://postgres.mjlxfffdirlqmmjzhorg:<mdp>@aws-1-eu-west-3.pooler.supabase.com:5432/postgres` |
| Vérifié | 9 migrations appliquées · **RLS active sur 20/20 tables** · 2 Edge Functions, préflight CORS 200, POST sans jeton 401 |

```bash
export SUPABASE_ACCESS_TOKEN=<jeton>
npx supabase db push                          # migrations
npx supabase functions deploy invite accept-invite
npx supabase secrets set RESEND_API_KEY=<clé> APP_BASE_URL=<url>
```

⚠️ **À faire une fois vos deux comptes créés** — refermer la création de foyer, sinon
toute personne qui s'inscrit peut s'en créer un :

```sql
update public.instance_setting
set value = '{"enabled": false}'::jsonb
where key = 'allow_household_creation';
```
