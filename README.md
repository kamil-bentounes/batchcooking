# Popote

Application de batch cooking, diététique et budget pour un foyer.
Une session de cuisine le dimanche, planifiée pour exploiter le four, l'air fryer et les feux
en parallèle ; des objectifs nutritionnels par personne ; la liste de courses qui en découle.

| | |
|---|---|
| Documentation | [`docs/`](docs/) — [API](docs/api.md) · [schéma](docs/schema.md) · [lancer en local](docs/dev.md) |
| Conception | `.design/` — spec, plan, mesures terrain. Brouillons de travail, pas de la doc. |
| Stack | React 19 · Vite 8 · Tailwind v4 · Motion · TanStack Query · PWA · Supabase (Postgres, région UE) |

```bash
npm install && npx supabase start && npm run db:reset && npm run test && npm run dev
```

## État

| Lot | Contenu | État |
|---|---|---|
| **0a-1** | Schéma, auth sur invitation, isolation multi-foyers, budget LLM, export/suppression, 5 écrans | ✅ **39 tests verts** |
| 0a-2 | Chargement CIQUAL, Open Food Facts, tables de conversion | ⬜ |
| 0b | Ingestion des recettes | ⬜ précédé des mesures R1, R1b, R1c |
| 1 | Optimiseur de session de batch cooking | ⬜ |
| 2 à 6 | Courses · frigo · envies · prix · suivi | ⬜ |

## Le test qui compte

L'isolation entre foyers n'est pas une intention, c'est une propriété vérifiée :

```bash
npm run db:reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "alter table public.recipe disable row level security;
      alter table public.household disable row level security;"
npm run test          # 10 tests DOIVENT rougir
npm run db:reset
```

Si la suite reste verte en retirant la sécurité, elle ne prouve rien.
