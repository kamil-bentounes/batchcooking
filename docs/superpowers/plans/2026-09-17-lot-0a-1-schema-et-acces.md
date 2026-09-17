# Lot 0a-1 — Schéma et accès — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un projet Supabase en région UE dont l'isolation multi-foyers est **prouvée par des tests**, avec le schéma des trois classes, le flux d'invitation par e-mail, les profils et cibles nutritionnelles, et le compteur de budget LLM.

**Architecture:** Postgres (Supabase) porte trois classes d'isolation — A référentiel en lecture seule, B catalogue partagé en écriture tracée, C données de foyer sous RLS stricte. `current_household()` en `SECURITY DEFINER` évite la récursion de policy. Un trigger `BEFORE UPDATE` porte ce que RLS ne sait pas exprimer. Le front est une PWA React minimale : trois écrans, rien de plus.

**Tech Stack:** Supabase CLI · PostgreSQL 15 · React 18 + Vite + TypeScript · Vitest · `@supabase/supabase-js` · Resend (Edge Function Deno)

**Spec de référence :** `docs/superpowers/specs/2026-09-17-batch-cooking-app-design.md` (v8) — §5.0, §5.0.1, §5.1, §5.2, §5.3, §10.

**Hors périmètre, explicitement :** peuplement des référentiels (lot 0a-2), ingestion (0b), pesée (0c), optimiseur (lot 1) et tout le reste. Les tables de classe A sont **créées vides** : leur remplissage est le lot 0a-2.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `supabase/migrations/0001_class_a.sql` | DDL classe A — référentiel et infrastructure, 11 tables |
| `supabase/migrations/0002_class_b.sql` | DDL classe B — catalogue partagé, 4 tables + colonnes de traçabilité |
| `supabase/migrations/0003_class_c.sql` | DDL classe C — foyer, 5 tables, dont `nutrition_target.household_id` dénormalisé |
| `supabase/migrations/0004_current_household.sql` | `current_household()` en `SECURITY DEFINER` |
| `supabase/migrations/0005_policies.sql` | Les trois formes de policies RLS (§5.0.1) |
| `supabase/migrations/0006_triggers.sql` | Garde d'écriture classe B · dénormalisation `household_id` · `updated_at` |
| `supabase/migrations/0007_llm_budget.sql` | `llm_usage`, les deux plafonds, `llm_budget_remaining()` |
| `supabase/functions/invite/index.ts` | Crée une invitation et l'envoie via Resend |
| `supabase/functions/accept-invite/index.ts` | Consomme un token et rattache l'utilisateur au foyer |
| `tests/helpers/db.ts` | Deux foyers, deux utilisateurs, clients authentifiés — socle de tous les tests |
| `tests/isolation.test.ts` | **Le livrable central** : l'isolation est prouvée ou elle ne l'est pas |
| `tests/class-b-guard.test.ts` | Écriture tracée et champs à confiance élevée protégés |
| `tests/invitation.test.ts` | Cycle complet création → envoi → acceptation → expiration |
| `tests/llm-budget.test.ts` | Les deux plafonds, et la ligne système |
| `src/lib/supabase.ts` | Client unique, typé |
| `src/pages/AcceptInvite.tsx` · `Targets.tsx` · `Settings.tsx` | Les trois écrans |

**Un fichier de migration = une responsabilité.** Ne pas fusionner : chaque migration doit pouvoir être relue seule, et c'est sur elles que porte l'audit d'isolation.

---

### Task 1 : Échafaudage du projet

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `.env.example`, `.gitignore`
- Create: `supabase/config.toml` (généré)

- [ ] **Step 1 : Initialiser le projet Node et Vite**

```bash
cd /home/kamil/PERSO/smart-receipe-scheduler
npm create vite@latest . -- --template react-ts
npm install
npm install @supabase/supabase-js
npm install -D vitest dotenv
```

- [ ] **Step 2 : Initialiser Supabase en local**

```bash
npx supabase init
npx supabase start
```

Attendu : une sortie listant `API URL`, `anon key`, `service_role key`. **Les noter**, ils servent aux tests.

- [ ] **Step 3 : Écrire `.env.example` et `.gitignore`**

```bash
cat > .env.example <<'EOF'
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
APP_BASE_URL=http://localhost:5173
EOF
printf '%s\n' 'node_modules/' 'dist/' '.env' '.env.local' '.DS_Store' 'supabase/.temp/' > .gitignore
cp .env.example .env
```

Renseigner `.env` avec les clés de l'étape 2. **`.env` ne doit jamais être commité.**

- [ ] **Step 4 : Déclarer les scripts de test dans `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "db:reset": "supabase db reset"
  }
}
```

- [ ] **Step 5 : Vérifier que tout démarre**

```bash
npm run test -- --passWithNoTests && npx supabase status
```
Attendu : Vitest sort en 0, `supabase status` liste les services `RUNNING`.

- [ ] **Step 6 : Commit**

```bash
git add -A && git commit -m "chore(0a-1): échafaudage Vite + Supabase local"
```

---

### Task 2 : Socle de test — deux foyers, deux utilisateurs

Ce fichier conditionne tous les tests suivants. Il est écrit **avant** la première migration, parce que c'est lui qui définit ce que « isolation prouvée » veut dire.

**Files:**
- Create: `tests/helpers/db.ts`

- [ ] **Step 1 : Écrire le helper**

```typescript
// tests/helpers/db.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import 'dotenv/config'

const URL = process.env.VITE_SUPABASE_URL!
const ANON = process.env.VITE_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

/** Client qui contourne RLS. À n'utiliser que pour préparer les données. */
export const admin = () =>
  createClient(URL, SERVICE, { auth: { persistSession: false } })

export type Actor = { client: SupabaseClient; userId: string; householdId: string }

/** Crée un foyer, un utilisateur confirmé, et le client authentifié correspondant. */
export async function makeActor(name: string): Promise<Actor> {
  const a = admin()
  const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}@test.local`
  const password = 'test-password-12345'

  const { data: u, error: ue } = await a.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (ue) throw ue

  const { data: h, error: he } = await a
    .from('household').insert({ name: `foyer-${name}` }).select().single()
  if (he) throw he

  const { error: pe } = await a
    .from('user_profile').insert({ id: u.user.id, household_id: h.id, display_name: name })
  if (pe) throw pe

  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: se } = await client.auth.signInWithPassword({ email, password })
  if (se) throw se

  return { client, userId: u.user.id, householdId: h.id }
}

/** Client authentifié mais SANS profil : sert à vérifier qu'il ne voit rien. */
export async function makeOrphan(): Promise<SupabaseClient> {
  const a = admin()
  const email = `orphan-${Date.now()}@test.local`
  const password = 'test-password-12345'
  const { error } = await a.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = createClient(URL, ANON, { auth: { persistSession: false } })
  await client.auth.signInWithPassword({ email, password })
  return client
}
```

- [ ] **Step 2 : Commit**

```bash
git add tests/helpers/db.ts && git commit -m "test(0a-1): socle de test deux foyers"
```

---

### Task 3 : Classe A — référentiel et infrastructure

Onze tables, **créées vides**. Leur peuplement est le lot 0a-2. Règle d'accès : lecture pour tout utilisateur authentifié, **écriture réservée au rôle de service**.

**Files:**
- Create: `supabase/migrations/0001_class_a.sql`
- Test: `tests/isolation.test.ts` (premier bloc)

- [ ] **Step 1 : Écrire le test qui échoue**

```typescript
// tests/isolation.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { makeActor, admin, type Actor } from './helpers/db'

let alice: Actor, bob: Actor
beforeAll(async () => { alice = await makeActor('alice'); bob = await makeActor('bob') })

describe('classe A — référentiel', () => {
  const TABLES_A = [
    'food', 'food_yield_factor', 'unit_weight', 'unit_conversion', 'density',
    'default_temperature', 'default_duration', 'typical_quantity',
    'appliance_catalog', 'ingestion_job', 'instance_setting',
  ]

  it('est lisible par tout utilisateur authentifié', async () => {
    for (const t of TABLES_A) {
      const { error } = await alice.client.from(t).select('*').limit(1)
      expect(error, `lecture de ${t}`).toBeNull()
    }
  })

  it("n'est PAS inscriptible par un utilisateur authentifié", async () => {
    const { error } = await alice.client
      .from('appliance_catalog').insert({ code: 'pirate', label: 'Pirate' })
    expect(error, "l'insertion aurait dû être refusée").not.toBeNull()
  })

  it('est inscriptible par le rôle de service', async () => {
    const { error } = await admin()
      .from('appliance_catalog').insert({ code: `four-${Date.now()}`, label: 'Four' })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2 : Lancer le test et vérifier qu'il échoue**

```bash
npm run test -- tests/isolation.test.ts
```
Attendu : ÉCHEC — `relation "public.food" does not exist`.

- [ ] **Step 3 : Écrire la migration**

```sql
-- supabase/migrations/0001_class_a.sql
-- Classe A : référentiel immuable et infrastructure (spec §5.0).
-- Lecture pour tout authentifié, écriture réservée au rôle de service.
-- Ces tables sont créées VIDES : leur peuplement est le lot 0a-2.

create extension if not exists "pgcrypto";

create table public.food (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('ciqual','off')),
  source_code   text not null,
  name          text not null,
  state         text not null default 'cru' check (state in ('cru','cuit')),
  ciqual_group     text,
  ciqual_subgroup  text,
  nutrients     jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  unique (source, source_code)
);
create index on public.food (ciqual_subgroup);
create index on public.food using gin (to_tsvector('french', name));

create table public.food_yield_factor (
  food_id uuid primary key references public.food(id) on delete cascade,
  factor  numeric not null check (factor > 0)
);

create table public.unit_weight (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid references public.food(id) on delete cascade,
  label      text not null,
  grams      numeric not null check (grams > 0),
  confidence numeric not null default 0.5 check (confidence between 0 and 1),
  source     text not null default 'usda'
);
create index on public.unit_weight (food_id);

create table public.unit_conversion (
  id              uuid primary key default gen_random_uuid(),
  unit_label      text not null,
  ciqual_subgroup text,
  grams           numeric not null check (grams > 0),
  unique (unit_label, ciqual_subgroup)
);

create table public.density (
  food_id       uuid primary key references public.food(id) on delete cascade,
  grams_per_ml  numeric not null check (grams_per_ml > 0)
);

create table public.default_temperature (
  id              uuid primary key default gen_random_uuid(),
  preparation     text not null unique,
  temperature_c   int not null check (temperature_c between 30 and 300)
);

-- D19 : la clé est (verbe, appareil) et s'applique aux ACTIONS, pas aux étapes.
create table public.default_duration (
  id             uuid primary key default gen_random_uuid(),
  verb           text not null,
  appliance_type text,
  base_minutes   numeric not null check (base_minutes > 0),
  load_type      text not null check (load_type in ('actif','passif','bloquant')),
  scaling        text not null default 'constant'
                 check (scaling in ('lineaire_plafonne','constant')),
  unique (verb, appliance_type)
);

-- D18 : borne haute des lignes d'ingrédients sans quantité (16 % mesurés).
create table public.typical_quantity (
  ciqual_subgroup text primary key,
  grams           numeric not null check (grams > 0)
);

create table public.appliance_catalog (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,
  label    text not null,
  default_capacity int not null default 1 check (default_capacity >= 1)
);

create table public.ingestion_job (
  id           uuid primary key default gen_random_uuid(),
  url          text not null unique,
  state        text not null default 'queued'
               check (state in ('queued','fetching','extracting','resolving','ready','needs_review','failed')),
  attempts     int not null default 0,
  error        text,
  content_hash text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.ingestion_job (state);

create table public.instance_setting (
  key   text primary key,
  value jsonb not null
);
```

- [ ] **Step 4 : Appliquer et relancer**

```bash
npm run db:reset && npm run test -- tests/isolation.test.ts
```
Attendu : les tests de lecture ÉCHOUENT encore (RLS pas encore posée, donc tout est refusé ou tout passe selon le défaut). Les policies arrivent en Task 6 — c'est normal et voulu : **une migration, une responsabilité**.

- [ ] **Step 5 : Commit**

```bash
git add supabase/migrations/0001_class_a.sql tests/isolation.test.ts
git commit -m "feat(0a-1): schéma classe A, référentiel et infrastructure"
```

---

### Task 4 : Classe B — catalogue partagé

Quatre tables, **créées vides** (l'ingestion est le lot 0b). Toutes portent `edited_by_household_id` et `edited_at` : c'est la correction de la relecture n°3.

**Files:**
- Create: `supabase/migrations/0002_class_b.sql`

- [ ] **Step 1 : Écrire le test qui échoue**

Ajouter à `tests/isolation.test.ts` :

```typescript
describe('classe B — catalogue partagé', () => {
  const TABLES_B = ['recipe', 'recipe_ingredient', 'recipe_step', 'recipe_step_dependency']

  it('porte les colonnes de traçabilité sur les quatre tables', async () => {
    for (const t of TABLES_B) {
      const { error } = await alice.client
        .from(t).select('edited_by_household_id, edited_at').limit(1)
      expect(error, `traçabilité manquante sur ${t}`).toBeNull()
    }
  })

  it('est lisible par les deux foyers', async () => {
    const a = admin()
    const { data: r } = await a.from('recipe')
      .insert({ source_url: `https://x/${Date.now()}`, source_name: 'test', yield_servings: 4 })
      .select().single()
    for (const who of [alice, bob]) {
      const { data, error } = await who.client.from('recipe').select('id').eq('id', r!.id)
      expect(error).toBeNull()
      expect(data, 'le catalogue est partagé').toHaveLength(1)
    }
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

```bash
npm run test -- tests/isolation.test.ts
```
Attendu : ÉCHEC — `relation "public.recipe" does not exist`.

- [ ] **Step 3 : Écrire la migration**

```sql
-- supabase/migrations/0002_class_b.sql
-- Classe B : catalogue partagé, écriture authentifiée et tracée (spec §5.0).
-- Créées vides : l'ingestion est le lot 0b.

create table public.recipe (
  id                  uuid primary key default gen_random_uuid(),
  source_url          text unique,
  source_name         text,
  origin              text not null default 'importee'
                      check (origin in ('importee','generee','manuelle')),
  owner_household_id  uuid,          -- NULL = importée ; non-NULL = créée par un foyer
  visibility          text not null default 'privee'
                      check (visibility in ('privee','partagee')),
  title               text,
  yield_servings      int check (yield_servings > 0),
  total_time_min      numeric,
  prep_time_min       numeric,
  cook_time_min       numeric,
  license_note        text,
  plannable           boolean not null default false,  -- maintenue par trigger (Task 7)
  edited_by_household_id uuid,
  edited_at           timestamptz,
  created_at          timestamptz not null default now()
);
create index on public.recipe (plannable);
create index on public.recipe (owner_household_id);

create table public.recipe_ingredient (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipe(id) on delete cascade,
  ordinal           int not null,
  raw_text          text not null,
  food_id           uuid references public.food(id),
  qty               numeric,
  unit              text,
  grams_reference   numeric,
  -- résolution de RÉFÉRENCE seulement. La résolution par foyer vit en classe C
  -- (household_ingredient_resolution, lot 0c) — correction de la relecture n°2.
  resolution_source text check (resolution_source in ('reference','llm','aucune')),
  confidence        numeric check (confidence between 0 and 1),
  edited_by_household_id uuid,
  edited_at         timestamptz,
  unique (recipe_id, ordinal)
);
create index on public.recipe_ingredient (recipe_id);

create table public.recipe_step (
  id                uuid primary key default gen_random_uuid(),
  recipe_id         uuid not null references public.recipe(id) on delete cascade,
  ordinal           int not null,
  text              text not null,
  duration_min      numeric,
  duration_source   text check (duration_source in ('declaree','defaut','llm','confirmee')),
  appliance_type    text,
  temperature_c     int,
  temperature_source text check (temperature_source in ('declaree','defaut','llm','confirmee')),
  load_type         text check (load_type in ('actif','passif','bloquant')),
  confidence        numeric check (confidence between 0 and 1),
  edited_by_household_id uuid,
  edited_at         timestamptz,
  unique (recipe_id, ordinal)
);
create index on public.recipe_step (recipe_id);

create table public.recipe_step_dependency (
  before_id uuid not null references public.recipe_step(id) on delete cascade,
  after_id  uuid not null references public.recipe_step(id) on delete cascade,
  origin    text not null default 'defaut' check (origin in ('defaut','llm','confirme')),
  edited_by_household_id uuid,
  edited_at timestamptz,
  primary key (before_id, after_id),
  check (before_id <> after_id)
);
```

- [ ] **Step 4 : Appliquer et commiter**

```bash
npm run db:reset
git add supabase/migrations/0002_class_b.sql tests/isolation.test.ts
git commit -m "feat(0a-1): schéma classe B, catalogue partagé et tracé"
```

---

### Task 5 : Classe C — données de foyer

Cinq tables. Point délicat : **`nutrition_target` n'a pas de `household_id` naturel** (sa clé est `user_profile_id`). Le spec §5.0.1 tranche : **on dénormalise**, la colonne est maintenue par trigger. Une colonne coûte moins qu'une jointure dans chaque policy, et supprime un risque de récursion.

**Files:**
- Create: `supabase/migrations/0003_class_c.sql`

- [ ] **Step 1 : Écrire le test qui échoue**

```typescript
describe('classe C — données de foyer', () => {
  it('un foyer ne voit jamais les cibles d\'un autre', async () => {
    await admin().from('nutrition_target').insert({
      user_profile_id: bob.userId, household_id: bob.householdId,
      kcal: 2400, protein_g: 180, fiber_g: 30, carb_g: 250, fat_g: 70,
    })
    const { data } = await alice.client.from('nutrition_target').select('*')
    expect(data ?? [], 'fuite entre foyers').toHaveLength(0)
  })

  it('un foyer ne voit que son propre household', async () => {
    const { data } = await alice.client.from('household').select('id')
    expect(data?.map(h => h.id)).toEqual([alice.householdId])
  })

  it('les cibles sont historisées, pas écrasées', async () => {
    const a = admin()
    for (const kcal of [2000, 2100]) {
      await a.from('nutrition_target').insert({
        user_profile_id: alice.userId, household_id: alice.householdId,
        kcal, protein_g: 150, fiber_g: 30, carb_g: 200, fat_g: 60,
      })
    }
    const { data } = await alice.client
      .from('nutrition_target').select('kcal').eq('user_profile_id', alice.userId)
    expect(data!.length, 'une cible qui change ne doit pas effacer le passé')
      .toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

```bash
npm run test -- tests/isolation.test.ts
```
Attendu : ÉCHEC — `relation "public.nutrition_target" does not exist`.

- [ ] **Step 3 : Écrire la migration**

```sql
-- supabase/migrations/0003_class_c.sql
-- Classe C : données de foyer, RLS stricte (spec §5.0, §5.0.1).

create table public.household (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  llm_monthly_cap_eur   numeric not null default 5 check (llm_monthly_cap_eur >= 0),
  created_at            timestamptz not null default now()
);

create table public.user_profile (
  id           uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.household(id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now()
);
create index on public.user_profile (household_id);

-- household_id est DÉNORMALISÉ (§5.0.1) : maintenu par trigger depuis user_profile.
create table public.nutrition_target (
  id              uuid primary key default gen_random_uuid(),
  user_profile_id uuid not null references public.user_profile(id) on delete cascade,
  household_id    uuid not null references public.household(id) on delete cascade,
  kcal       numeric not null check (kcal > 0),
  protein_g  numeric not null check (protein_g >= 0),
  fiber_g    numeric not null check (fiber_g >= 0),
  carb_g     numeric not null check (carb_g >= 0),
  fat_g      numeric not null check (fat_g >= 0),
  valid_from timestamptz not null default now()
);
create index on public.nutrition_target (household_id);
create index on public.nutrition_target (user_profile_id, valid_from desc);

create table public.invitation (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household(id) on delete cascade,
  email        text not null,
  token        uuid not null unique default gen_random_uuid(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz,
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index on public.invitation (household_id);
create unique index invitation_pending_unique
  on public.invitation (household_id, lower(email)) where accepted_at is null;
```

- [ ] **Step 4 : Appliquer et commiter**

```bash
npm run db:reset
git add supabase/migrations/0003_class_c.sql tests/isolation.test.ts
git commit -m "feat(0a-1): schéma classe C, données de foyer"
```

---

### Task 6 : `current_household()` et les trois formes de policies

**Le cœur du lot.** `SECURITY DEFINER` est obligatoire : si la fonction lit `user_profile`, elle-même sous RLS, elle provoque la récursion de policy classique de Postgres.

**Files:**
- Create: `supabase/migrations/0004_current_household.sql`, `supabase/migrations/0005_policies.sql`

- [ ] **Step 1 : Ajouter le test de non-récursion et d'orphelin**

```typescript
import { makeOrphan } from './helpers/db'

describe('current_household()', () => {
  it('ne provoque pas de récursion de policy', async () => {
    const { data, error } = await alice.client.rpc('current_household')
    expect(error, 'récursion probable si erreur 42P17').toBeNull()
    expect(data).toBe(alice.householdId)
  })

  it('un authentifié SANS profil ne voit aucune donnée de foyer', async () => {
    const orphan = await makeOrphan()
    for (const t of ['household', 'user_profile', 'nutrition_target', 'invitation']) {
      const { data } = await orphan.from(t).select('*')
      expect(data ?? [], `${t} visible par un orphelin`).toHaveLength(0)
    }
  })
})
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

```bash
npm run test -- tests/isolation.test.ts
```
Attendu : ÉCHEC — `function public.current_household does not exist`.

- [ ] **Step 3 : Écrire `0004_current_household.sql`**

```sql
-- supabase/migrations/0004_current_household.sql
-- SECURITY DEFINER : contourne la RLS de user_profile et évite la récursion (§5.0.1).
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.user_profile where id = auth.uid()
$$;

revoke execute on function public.current_household() from public;
grant   execute on function public.current_household() to authenticated;
```

- [ ] **Step 4 : Écrire `0005_policies.sql`**

```sql
-- supabase/migrations/0005_policies.sql
-- Les TROIS formes de prédicat de §5.0.1.

-- ── Classe A : lecture pour tout authentifié, aucune policy d'écriture.
-- Le rôle de service contourne RLS, donc lui seul écrit.
do $$
declare t text;
begin
  foreach t in array array[
    'food','food_yield_factor','unit_weight','unit_conversion','density',
    'default_temperature','default_duration','typical_quantity',
    'appliance_catalog','ingestion_job','instance_setting'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
  end loop;
end $$;

-- ── Classe B : lecture par tous, écriture par tout authentifié.
-- La restriction aux champs peu sûrs n'est PAS exprimable en RLS : c'est le
-- trigger de la Task 7 qui la porte.
do $$
declare t text;
begin
  foreach t in array array[
    'recipe','recipe_ingredient','recipe_step','recipe_step_dependency'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_read', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (true) with check (true)',
      t || '_update', t);
  end loop;
end $$;

-- ── Classe C, forme 1 : la clé EST le foyer.
alter table public.household enable row level security;
create policy household_rw on public.household
  for all to authenticated
  using (id = public.current_household())
  with check (id = public.current_household());

-- ── Classe C, forme 2 : colonne household_id directe.
alter table public.user_profile enable row level security;
create policy user_profile_rw on public.user_profile
  for all to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

alter table public.invitation enable row level security;
create policy invitation_rw on public.invitation
  for all to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- ── Classe C, forme 3 : household_id dénormalisé (maintenu par trigger, Task 7).
alter table public.nutrition_target enable row level security;
create policy nutrition_target_rw on public.nutrition_target
  for all to authenticated
  using (household_id = public.current_household())
  with check (household_id = public.current_household());
```

- [ ] **Step 5 : Appliquer et vérifier que TOUT passe**

```bash
npm run db:reset && npm run test -- tests/isolation.test.ts
```
Attendu : **tous les tests d'isolation PASSENT.** C'est le livrable central du lot : si l'un échoue, ne pas continuer.

- [ ] **Step 6 : Commit**

```bash
git add supabase/migrations/0004_current_household.sql supabase/migrations/0005_policies.sql tests/isolation.test.ts
git commit -m "feat(0a-1): current_household en SECURITY DEFINER et les 3 formes de policies"
```
