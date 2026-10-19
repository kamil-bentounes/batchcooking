// La fumée de la PROD, en LECTURE SEULE : on ouvre des pages comme une invitée,
// on ne crée rien, on ne se connecte pas. `node scripts/fumee-prod.mjs`
import { chromium, devices } from '@playwright/test'
const B = 'https://kamil-bentounes.github.io/batchcooking'
const nav = await chromium.launch()
/* ⚠️ Le réseau de ce poste intercepte le TLS de supabase.co (autorité de
   certification d'entreprise, que `curl` connaît et que Chromium ignore) :
   sans ce drapeau, la page dirait « Ce lien n'a pas pu être lu » à cause de
   la machine, pas de l'application. */
const ctx = await nav.newContext({ ...devices['Pixel 7'], locale: 'fr-FR',
  timezoneId: 'Europe/Paris', ignoreHTTPSErrors: !!process.env.RESEAU_INTERCEPTE })
const p = await ctx.newPage()
const erreurs = []
p.on('pageerror', e => erreurs.push('pageerror ' + e.message))
p.on('console', m => { if (m.type() === 'error') erreurs.push('console ' + m.text()) })
for (const [nom, chemin, attendu] of [
  ['accueil', '/', /on s’y met/i],
  ['lien-inconnu', '/invite/00000000-0000-0000-0000-000000000000', /ce lien ne mène nulle part/i],
  ['lien-casse', '/invite/pas-un-jeton', /ce lien ne mène nulle part/i],
]) {
  const r = await p.goto(B + chemin, { waitUntil: 'networkidle' })
  const titre = await p.locator('h1').first().innerText().catch(() => '(aucun h1)')
  console.log(nom, r?.status(), JSON.stringify(titre), attendu.test(titre) ? 'OK' : 'ÉCHEC')
  await p.screenshot({ path: `.shots/prod/${nom}.png` })
}
console.log('erreurs :', erreurs.filter(e => !/404|ServiceWorker/i.test(e)))
await nav.close()
