#!/usr/bin/env bash
# Le banc de la migration des données du budget (§ 5), sur une copie de la prod.
#
# ⚠️ Il REMET LA BASE LOCALE À ZÉRO. Tâche [base] : jamais en même temps qu'un autre
#    banc, de ce chantier ou d'un autre. Ensuite : `npx supabase db reset --local && npm run seed`.
#
#   bash scripts/banc-migration-budget.sh                      # la copie, telle quelle
#   bash scripts/banc-migration-budget.sh tests/fixtures/x.sql # la copie, plus une variante
#   bash scripts/banc-migration-budget.sh --arrets             # rejoue chaque arrêt (arret-*.sql)
#   bash scripts/banc-migration-budget.sh --variantes          # rejoue chaque variante qui passe (variante-*.sql)
#   bash scripts/banc-migration-budget.sh --tout               # la copie nue, les arrêts, les variantes
#
# Une variante `x.apres-0113.sql` se charge APRÈS les migrations d'avant 0114 : c'est le
# seul moment où `saisie`, `facture`, `cloture` existent. Les autres se chargent sur la
# base de la veille du budget refait, avec la copie. Un arrêt (`arret-*.sql`) porte en
# première ligne `-- attendu : <extrait du message>` ; le banc exige ce message ET que
# 0114 n'ait pas été enregistrée : un arrêt qui laisse passer la migration, ou qui s'arrête
# pour une autre raison, fait échouer le banc. Une variante (`variante-*.sql`) est suivie
# de `tests/budget-migration.test.ts`, qui sait ce que chacune doit donner.
set -euo pipefail
cd "$(dirname "$0")/.."
COPIE=tests/fixtures/budget-prod.local.sql
ADMIN="postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres"
LA_MIGRATION=0114
[ -f "$COPIE" ] || { echo "Copie absente : faire la tâche 1.25 d'abord." >&2; exit 1; }

# La dernière migration d'avant le budget refait (0092 à ce jour, celle des recettes).
AVANT=$(ls supabase/migrations | sort | awk '$0 < "0093"' | tail -1 | cut -c1-4)
SANS=""
nettoie() {
  psql "$ADMIN" -c "alter database postgres reset popote.maintenant" >/dev/null 2>&1 || true
  if [ -n "$SANS" ]; then rm -rf "$SANS"; fi
}
trap nettoie EXIT

# Monte la base : la veille du budget, la copie, la variante, puis les migrations.
# Laisse la sortie de la dernière migration dans $SORTIE, son code dans $CODE.
monte() {
  local variante=${1:-} f
  echo "1. La base, remise à $AVANT…"
  npx supabase db reset --local --version "$AVANT" --no-seed >/dev/null 2>&1 || return 1
  echo "2. La copie de la prod…"
  psql "$ADMIN" -q -v ON_ERROR_STOP=1 -1 -f "$COPIE" >/dev/null || return 1
  if [ -n "$variante" ] && [[ "$variante" != *.apres-0113.sql ]]; then
    echo "   + la variante $variante"
    psql "$ADMIN" -q -v ON_ERROR_STOP=1 -1 -f "$variante" >/dev/null || return 1
  fi
  echo "3. Un jour d'octobre 2026, celui du § 5…"
  psql "$ADMIN" -q -c "alter database postgres set popote.maintenant = '2026-10-19T12:00:00+02:00'" >/dev/null || return 1
  if [ -n "$variante" ] && [[ "$variante" == *.apres-0113.sql ]]; then
    echo "4a. Les migrations d'avant $LA_MIGRATION…"
    # Un projet sans 0114 : la CLI n'applique que ce qu'il contient.
    if [ -n "$SANS" ]; then rm -rf "$SANS"; fi
    SANS=$(mktemp -d)
    mkdir -p "$SANS/supabase/migrations"
    cp supabase/config.toml "$SANS/supabase/config.toml"
    # config.toml cite `./supabase/templates/*.html` (mails d'auth) : sans ce dossier, la CLI refuse de démarrer.
    ln -s "$PWD/supabase/templates" "$SANS/supabase/templates"
    for f in supabase/migrations/*.sql; do
      if [ "$(basename "$f" | cut -c1-4)" \< "$LA_MIGRATION" ]; then
        ln -s "$PWD/$f" "$SANS/supabase/migrations/$(basename "$f")"
      fi
    done
    npx supabase --workdir "$SANS" migration up --local --include-all >/dev/null 2>&1 || return 1
    echo "   + la variante $variante"
    psql "$ADMIN" -q -v ON_ERROR_STOP=1 -1 -f "$variante" >/dev/null || return 1
  fi
  echo "4. Les migrations du budget refait…"
  CODE=0
  SORTIE=$(npx supabase migration up --local --include-all 2>&1) || CODE=$?
}

# Un arrêt : le message attendu, et rien d'enregistré.
rejoue_un_arret() {
  local f=$1 attendu enregistree
  attendu=$(sed -n '1s/^-- attendu : //p' "$f")
  [ -n "$attendu" ] || { echo "ÉCHEC $f : pas de « -- attendu : … » en première ligne." >&2; return 1; }
  monte "$f" || { echo "ÉCHEC $f : le banc n'a pas pu monter la base." >&2; return 1; }
  if [ "$CODE" -eq 0 ]; then
    echo "ÉCHEC $f : la migration est passée, elle devait s'arrêter sur « $attendu »." >&2
    return 1
  fi
  if ! grep -qF -- "$attendu" <<<"$SORTIE"; then
    echo "ÉCHEC $f : arrêtée, mais pas sur « $attendu » :" >&2
    echo "$SORTIE" | grep -m3 -E "ERROR|arrêtée" >&2 || echo "$SORTIE" | tail -5 >&2
    return 1
  fi
  enregistree=$(psql "$ADMIN" -At -c \
    "select count(*) from supabase_migrations.schema_migrations where version = '$LA_MIGRATION'")
  if [ "$enregistree" != "0" ]; then
    echo "ÉCHEC $f : $LA_MIGRATION s'est arrêtée mais elle est enregistrée." >&2
    return 1
  fi
  echo "OK $f : « $attendu », $LA_MIGRATION non enregistrée."
}

rejoue_les_arrets() {
  local echecs=0 f
  for f in tests/fixtures/arret-*.sql; do
    rejoue_un_arret "$f" || echecs=$((echecs + 1))
  done
  [ "$echecs" -eq 0 ] || { echo "$echecs arrêt(s) en échec." >&2; return 1; }
}

rejoue_les_variantes() {
  local echecs=0 f
  for f in tests/fixtures/variante-*.sql; do
    monte "$f" || { echo "ÉCHEC $f : le banc n'a pas pu monter la base." >&2
                    echecs=$((echecs + 1)); continue; }
    if [ "$CODE" -ne 0 ]; then
      echo "ÉCHEC $f : la migration devait passer :" >&2
      echo "$SORTIE" | grep -m3 -E "ERROR|arrêtée" >&2 || echo "$SORTIE" | tail -5 >&2
      echecs=$((echecs + 1))
      continue
    fi
    BANC_MIGRATION=1 BANC_VARIANTE="$(basename "$f" .sql | sed "s/\.apres-0113$//")" \
      npx vitest run tests/budget-migration.test.ts || echecs=$((echecs + 1))
  done
  [ "$echecs" -eq 0 ] || { echo "$echecs variante(s) en échec." >&2; return 1; }
}

case "${1:-}" in
  --arrets) rejoue_les_arrets ;;
  --variantes) rejoue_les_variantes ;;
  --tout)
    monte
    [ "$CODE" -eq 0 ] || { echo "$SORTIE" >&2; exit "$CODE"; }
    BANC_MIGRATION=1 npx vitest run tests/budget-migration.test.ts
    rejoue_les_arrets
    rejoue_les_variantes
    ;;
  *)
    monte "${1:-}"
    echo "$SORTIE"
    exit "$CODE"
    ;;
esac
