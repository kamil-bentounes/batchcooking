#!/usr/bin/env node
/**
 * Charge les référentiels (lot 0a-2) : CIQUAL et les tables de conversion.
 *
 * Idempotent : rejouable sans effet de bord, tout passe par des upsert.
 * Écrit dans la classe A, donc exige la clé de service.
 *
 *   node scripts/seed.mjs                  # base locale (.env)
 *   node scripts/seed.mjs --prod           # production (.env.production + clé passée)
 *
 * Attribution CIQUAL : ANSES-CIQUAL, Licence Ouverte Etalab.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'

const prod = process.argv.includes('--prod')
// `override: true` est indispensable : vite-node charge `.env` de lui-même
// avant que ce script démarre, et dotenv n'écrase pas ce qui existe déjà —
// `--prod` visait donc la base LOCALE avec la clé de PRODUCTION.
config({ path: prod ? '.env.production' : '.env', override: true })

const API = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!API || !KEY) {
  console.error('Il manque VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}
const db = createClient(API, KEY, { auth: { persistSession: false } })
const lire = f => JSON.parse(readFileSync(new URL(`../seed/${f}`, import.meta.url), 'utf8'))

/** Upsert par lots : PostgREST cale au-delà de quelques milliers de lignes. */
async function charger(table, lignes, onConflict, taille = 500) {
  for (let i = 0; i < lignes.length; i += taille) {
    const { error } = await db.from(table).upsert(lignes.slice(i, i + taille), { onConflict })
    if (error) throw new Error(`${table} : ${error.message}`)
  }
  console.log(`  ${table.padEnd(20)} ${String(lignes.length).padStart(5)} lignes`)
}

const c = lire('conversions.json')
console.log(`\nCible : ${API}\n`)

await charger('appliance_catalog', c.appliance_catalog, 'code')

const aliments = lire('ciqual.json').map(a => ({
  source: 'ciqual',
  source_code: a.code,
  name: a.nom,
  state: a.etat,
  ciqual_group: a.groupe,
  ciqual_subgroup: a.sous_groupe,
  nutrients: a.nutriments,
}))
await charger('food', aliments, 'source,source_code')

await charger('unit_conversion',     c.unit_conversion,     'unit_label,ciqual_subgroup')
await charger('typical_quantity',    c.typical_quantity,    'ciqual_subgroup')
await charger('default_temperature', c.default_temperature, 'preparation')
await charger('non_action_pattern',
  c.non_action.motifs.map(m => ({ pattern: m })), 'pattern')
await charger('default_duration',    c.default_duration,    'verb,appliance_type')

// Le catalogue du bouton « Compléter ma liste » (D43). La position garde
// l'ordre de la liste écrite à la main : elle vaut mieux que l'alphabétique,
// qui séparerait « Éponges » de « Éponge grattante ».
await charger('suggested_item',
  Object.entries(c.suggested_item.categories).flatMap(([category, labels]) =>
    labels.map((label, position) => ({ category, label, position }))),
  'category,label')

// La densité pointe sur un aliment : on résout le code CIQUAL en identifiant.
const codes = c.density.map(d => d.ciqual_code)
const { data: refs, error } = await db.from('food')
  .select('id, source_code').eq('source', 'ciqual').in('source_code', codes)
if (error) throw error
const parCode = Object.fromEntries(refs.map(f => [f.source_code, f.id]))
const densites = c.density
  .filter(d => parCode[d.ciqual_code])
  .map(d => ({ food_id: parCode[d.ciqual_code], grams_per_ml: d.grams_per_ml }))
await charger('density', densites, 'food_id')
if (densites.length < c.density.length)
  console.warn(`  ⚠️  ${c.density.length - densites.length} densité(s) sans aliment correspondant`)

console.log('\nTerminé.\n')
