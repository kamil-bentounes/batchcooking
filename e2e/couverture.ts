/**
 * Relever la couverture de BRANCHES pendant les captures.
 *
 * « Dans le code on peut connaître tous nos cas possibles » — alors mesurons
 * lesquels aucune capture n'a jamais déclenchés, au lieu de les choisir à la
 * main. Chaque `&&` et chaque `? :` d'un JSX est un écran possible.
 *
 * Le bundle n'est instrumenté que si `COUVERTURE=1` : hors de là, ces
 * fonctions ne trouvent rien et ne coûtent rien. Ce qui part en production
 * n'est jamais instrumenté.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'

const ACTIF = process.env.COUVERTURE === '1'

/** À appeler avant de quitter une page : `__coverage__` meurt avec elle. */
export async function releve(page: Page) {
  if (!ACTIF) return
  const c = await page.evaluate(() => (window as unknown as
    { __coverage__?: unknown }).__coverage__ ?? null).catch(() => null)
  if (!c) return
  mkdirSync('.nyc_output', { recursive: true })
  writeFileSync(`.nyc_output/${randomUUID()}.json`, JSON.stringify(c))
}
