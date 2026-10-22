/**
 * L'heure jouée par un parcours : celle de la base (`popote.maintenant`, comme
 * `tests/helpers/horloge.ts`) et celle du front (`popote.maintenant` dans le
 * `localStorage`, que seul le paquet `development` lit — `src/lib/horloge.ts`).
 *
 * Pas `page.clock` : il avance aussi l'horloge de supabase-js, dont le jeton
 * paraît alors expiré, et chaque requête relance un rafraîchissement jusqu'à la
 * limite de débit de l'authentification.
 *
 * Une copie de `tests/helpers/horloge.ts`, pas un import : ce dossier importe
 * avec l'extension (`"type": "module"`), celui des bancs sans.
 *
 * ⚠️ L'heure de la base vaut pour TOUTE la base locale, et la poser ferme les
 *    connexions de PostgREST : jamais en même temps qu'un autre banc.
 */
import pg from 'pg'
import type { Page } from '@playwright/test'
import { db } from './amorce.ts'

/** Le superutilisateur local : seul à pouvoir poser `popote.maintenant` sur la base. */
const ADMIN = process.env.SUPABASE_ADMIN_DB_URL
  ?? 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?Z$/

async function pose(sql: (vraie: string) => string) {
  const c = new pg.Client({ connectionString: ADMIN })
  await c.connect()
  try {
    const { rows: [{ vraie }] } = await c.query('select clock_timestamp() as vraie')
    await c.query(sql((vraie as Date).toISOString()))
    /* Le réglage ne vaut que pour les connexions ouvertes après lui : on ferme
       celles de PostgREST, qui les rouvre. */
    await c.query(`select pg_terminate_backend(pid) from pg_stat_activity
                    where usename = 'authenticator' and pid <> pg_backend_pid()`)
  } finally { await c.end() }
  for (let essai = 0; essai < 50; essai++) {
    if (!(await db.rpc('maintenant')).error) return
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('PostgREST ne répond plus après le changement d’heure.')
}

/** Joue `iso` (UTC, « …Z ») : la base avance à partir de là ; le front s'y fige. */
export async function joue(page: Page, iso: string) {
  if (!ISO.test(iso)) throw new Error(`Heure illisible : ${iso}`)
  await pose(vraie => `alter database postgres set popote.maintenant = '${iso}@${vraie}'`)
  await page.addInitScript(v => {
    try { localStorage.setItem('popote.maintenant', v) } catch { /* about:blank */ }
  }, iso)
  if (page.url().startsWith('http')) {
    await page.evaluate(v => localStorage.setItem('popote.maintenant', v), iso)
  }
}

export async function remetLHeure() {
  await pose(() => 'alter database postgres reset popote.maintenant')
}
