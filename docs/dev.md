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
