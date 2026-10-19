#!/usr/bin/env node
/**
 * Les captures de référence des maquettes, au format téléphone : 412 px de large, la
 * largeur du Pixel 7 de playwright.config.ts. Une capture par écran, élément par élément,
 * dans captures/.
 *
 *   node docs/superpowers/maquettes/captures.mjs
 *
 * Les pages doivent exister : budget/project/*.dc.html (versionnées) et
 * recettes/recettes.html (`python3 recettes/photos.py && python3 recettes/build.py`).
 *
 * Trois choix, à connaître avant de comparer avec l'application :
 * - Les maquettes sont dessinées sur 390 px. Pour la capture, l'écran prend toute la
 *   largeur (412 px) ; les générateurs, eux, ne changent pas.
 * - Pas d'émulation mobile (`isMobile`) : ces pages n'ont pas de <meta name="viewport">,
 *   Chromium les mettrait en page sur 980 px puis les réduirait. Densité 1, pour des
 *   images de 412 px qui restent légères.
 * - `support.js`, que chargent les planches du Budget, est fourni par le type « Design »
 *   de claude.ai et n'existe pas en local : on le sert vide. Le rendu ne dépend que du
 *   HTML statique de la planche.
 *
 * Toute erreur de console, de page ou de chargement fait échouer le script.
 */
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices } from '@playwright/test'

const ICI = path.dirname(fileURLToPath(import.meta.url))
const SORTIE = path.join(ICI, 'captures')
const LARGEUR = devices['Pixel 7'].viewport.width // 412
const HAUTEUR = devices['Pixel 7'].viewport.height

// Planche du Budget → nom de la capture, dans l'ordre du canevas.
const BUDGET = [
  ['Main.dc.html', 'budget-01-mois.png'],
  ['Courses.dc.html', 'budget-feuille-courses.png'],
  ['Entretien.dc.html', 'budget-feuille-facture.png'],
  ['Cloture.dc.html', 'budget-cloture.png'],
  ['Nuit.dc.html', 'budget-ecartee-b-nuit.png'],
  ['Album.dc.html', 'budget-ecartee-c-album.png'],
]
// Titre de l'écran dans recettes.html → nom de la capture.
const RECETTES = new Map([
  ['A · Grandes photos', 'recettes-liste-a.png'],
  ['B · Vignettes', 'recettes-liste-b.png'],
  ['La fiche (i)', 'recettes-fiche.png'],
  ['Le bas de la liste', 'recettes-bas-de-liste.png'],
])

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png',
  '.json': 'application/json', '.js': 'text/javascript',
}
const serveur = http.createServer((req, res) => {
  const chemin = path.join(ICI, decodeURIComponent(new URL(req.url, 'http://local').pathname))
  if (!chemin.startsWith(ICI + path.sep)) return res.writeHead(403).end()
  fs.readFile(chemin, (err, data) => {
    if (err) return res.writeHead(404).end()
    res.writeHead(200, { 'content-type': TYPES[path.extname(chemin)] ?? 'application/octet-stream' }).end(data)
  })
})
await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok))
const BASE = `http://127.0.0.1:${serveur.address().port}`

for (const f of [...BUDGET.map(([p]) => `budget/project/${p}`), 'recettes/recettes.html']) {
  if (!fs.existsSync(path.join(ICI, f))) {
    console.error(`Manque ${f} — voir le README du dossier.`)
    process.exit(1)
  }
}
fs.mkdirSync(SORTIE, { recursive: true })

const navigateur = await chromium.launch()
const contexte = await navigateur.newContext({
  viewport: { width: LARGEUR, height: HAUTEUR },
  deviceScaleFactor: 1,
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
})
await contexte.route('**/support.js', (route) =>
  route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* fourni par le type Design de claude.ai */\n' }))

const erreurs = []
const faites = []

async function ouvre(chemin, css) {
  const page = await contexte.newPage()
  const note = (m) => erreurs.push(`${chemin} : ${m}`)
  page.on('console', (m) => { if (m.type() === 'error') note(m.text()) })
  page.on('pageerror', (e) => note(String(e)))
  page.on('requestfailed', (r) => note(`${r.url()} : ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 400) note(`${r.status()} ${r.url()}`) })
  await page.goto(`${BASE}/${chemin}`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: css })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})))
  })
  return page
}

async function capture(element, nom) {
  const fichier = path.join(SORTIE, nom)
  await element.screenshot({ path: fichier, animations: 'disabled' })
  const b = await element.boundingBox()
  faites.push(`${nom} ${Math.round(b.width)}×${Math.round(b.height)}`)
}

// Le Budget : une planche par page ; la planche prend la largeur de l'écran.
for (const [planche, nom] of BUDGET) {
  const page = await ouvre(`budget/project/${planche}`, 'x-dc > div { width: 100% !important; }')
  await capture(page.locator('x-dc > div'), nom)
  await page.close()
}

// Les recettes : quatre écrans dans une page ; on prend chaque téléphone (.tel).
{
  const page = await ouvre('recettes/recettes.html',
    'body { padding-inline: 0 !important; } .ecran { width: 100% !important; }')
  const ecrans = page.locator('.ecran')
  const n = await ecrans.count()
  if (n !== RECETTES.size) erreurs.push(`recettes.html : ${n} écrans, ${RECETTES.size} attendus`)
  for (let i = 0; i < n; i++) {
    const titre = (await ecrans.nth(i).locator(':scope > h2').innerText()).trim()
    const nom = [...RECETTES].find(([t]) => t.toLowerCase() === titre.toLowerCase())?.[1]
    if (!nom) { erreurs.push(`recettes.html : écran inconnu « ${titre} »`); continue }
    await capture(ecrans.nth(i).locator('.tel'), nom)
  }
  await page.close()
}

await navigateur.close()
serveur.close()
console.log(faites.join('\n'))
if (erreurs.length) {
  console.error(`\n${erreurs.length} erreur(s) :\n${erreurs.join('\n')}`)
  process.exit(1)
}
console.log(`\n${faites.length} captures dans ${path.relative(process.cwd(), SORTIE) || '.'}, aucune erreur de console.`)
