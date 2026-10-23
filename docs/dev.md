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
| Vérifié en prod | 12 migrations (lot 0a) · RLS active · 2 Edge Functions, préflight CORS 200, POST sans jeton 401 |
| **Reste à pousser** | migrations 0013 à 0022 (lot 1 + ingestion) · fonction `inventer` |

```bash
export SUPABASE_ACCESS_TOKEN=<jeton>
npx supabase db push                          # migrations
npx supabase functions deploy invite accept-invite inventer
npm run deploy:aide                           # « Demande à Popote » : refuse de partir si une page du manuel est périmée
npx supabase secrets set RESEND_API_KEY=<clé> APP_BASE_URL=<url>
npx supabase secrets set LLM_API_KEY=<clé>            # « Envie spéciale »
```

L'ordre pour l'aide intégrée : `db push` (la migration 0118 d'abord : la fonction écrit dans `llm_usage`),
`npm run deploy:aide`, puis `npm run deploy` (le site). `npm run deploy` ne garde que le front : la fonction `aide`
embarque `manuel.generated.ts`, d'où `deploy:aide`, qui lance `manuel:verifie` avant de la publier.

La création de foyer **se referme d'elle-même** dès que le premier foyer existe
(migration 0070) : la personne suivante entre par un lien d'invitation, et
quiconque s'inscrirait sans lien lit « Il te faut une invitation ». Pour la
rouvrir exceptionnellement :

```sql
update public.instance_setting
set value = '{"enabled": true}'::jsonb
where key = 'allow_household_creation';
```

## Les tests de fumée en navigateur

```bash
npm run e2e          # Playwright, Chromium, format téléphone
```

Ils existent pour une raison vérifiée : **525 tests passaient pendant que trois
écrans n'avaient jamais été rendus une seule fois**. `tsc` dit qu'un composant
compile ; il ne dit pas qu'il s'affiche, ni qu'un `Number(null)` au premier
rendu ne fait pas une page blanche.

Ils ne comparent **pas** des pixels : une référence d'image casserait à chaque
changement d'espacement et finirait ignorée, ce qui est pire que pas de test.
Ils vérifient qu'un écran s'ouvre, qu'il montre ce qu'il promet, et qu'aucune
erreur n'est tombée dans la console. Les captures atterrissent dans `.shots/`
pour être **regardées**, ce qu'aucune assertion ne remplace.

> ⚠️ Le serveur de test construit avec `--mode development`. Sans ce drapeau,
> `vite build` prend le mode « production », donc `.env.production`, donc la
> **base de production** — et le test se connecterait à une base où son foyer
> n'existe pas.

## L'instance est FERMÉE

`instance_setting.allow_household_creation` vaut `{"enabled": false}` en
production depuis le 21 septembre 2026. Quelqu'un qui créerait un compte n'irait
donc nulle part : `create_household()` lui répondra « création de foyer fermée ».

C'était une étape manuelle décrite ici et jamais faite — l'instance a été
ouverte pendant tout le développement, et n'importe qui pouvait s'y créer un
foyer, avec le budget LLM qui va avec.

**Rejoindre un foyer ne passe pas par là** : `accept-invite` écrit `user_profile`
directement, avec l'identifiant du foyer porté par l'invitation. Le verrou
n'empêche donc personne d'accepter une invitation.

Pour rouvrir, le temps d'ajouter un foyer :

```sql
update instance_setting set value = '{"enabled": true}'::jsonb
where key = 'allow_household_creation';
```

> ⚠️ `signInWithOtp` continue de créer une ligne dans `auth.users` pour
> n'importe quelle adresse — c'est ce dont l'invitation a besoin. Le verrou
> arrête la suite, pas la création du compte.
