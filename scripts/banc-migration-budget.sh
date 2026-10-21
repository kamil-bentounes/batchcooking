#!/usr/bin/env bash
# Le banc de la migration des données du budget (§ 5), sur une copie de la prod.
#
# ⚠️ Il REMET LA BASE LOCALE À ZÉRO. Tâche [base] : jamais en même temps qu'un autre
#    banc, de ce chantier ou d'un autre. Ensuite : `npx supabase db reset --local && npm run seed`.
#
#   bash scripts/banc-migration-budget.sh                      # la copie, telle quelle
#   bash scripts/banc-migration-budget.sh tests/fixtures/x.sql # la copie, plus une variante
set -euo pipefail
cd "$(dirname "$0")/.."
COPIE=tests/fixtures/budget-prod.local.sql
VARIANTE=${1:-}
ADMIN="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"
[ -f "$COPIE" ] || { echo "Copie absente : faire la tâche 1.25 d'abord." >&2; exit 1; }

# La dernière migration d'avant le budget refait (0092 à ce jour, celle des recettes).
AVANT=$(ls supabase/migrations | sort | awk '$0 < "0093"' | tail -1 | cut -c1-4)
echo "1. La base, remise à $AVANT…"
npx supabase db reset --local --version "$AVANT" --no-seed
echo "2. La copie de la prod…"
psql "$ADMIN" -v ON_ERROR_STOP=1 -1 -f "$COPIE"
if [ -n "$VARIANTE" ]; then psql "$ADMIN" -v ON_ERROR_STOP=1 -1 -f "$VARIANTE"; fi
echo "3. Un jour d'octobre 2026, celui du § 5…"
psql "$ADMIN" -c "alter database postgres set popote.maintenant = '2026-10-19T12:00:00+02:00'"
trap 'psql "$ADMIN" -c "alter database postgres reset popote.maintenant" >/dev/null' EXIT
echo "4. Les migrations du budget refait…"
npx supabase migration up --local --include-all
