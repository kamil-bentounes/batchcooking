#!/usr/bin/env node
/**
 * Publier le site, sans pouvoir publier l'ancien.
 *
 * Ce script existe parce que le cas s'est produit DEUX FOIS : `npm run build`
 * échoue (une erreur de typage suffit), il s'arrête avant d'écrire, `dist/`
 * garde le contenu de la fois précédente — parfaitement valide — et `gh-pages`
 * le publie sans rien signaler. Le site reste en ligne, à jour de rien.
 *
 * Trois verrous, dans cet ordre :
 *
 *   1. `dist/` est EFFACÉ avant le build. Un build raté ne peut plus laisser
 *      d'ancienne version derrière lui.
 *   2. le build est lancé en héritant du code de sortie, et toute valeur non
 *      nulle arrête tout.
 *   3. on vérifie que `dist/index.html` référence un fichier qui existe, et on
 *      affiche l'empreinte publiée — pour pouvoir la comparer à ce que sert
 *      GitHub Pages une minute plus tard.
 *
 *   npm run deploy
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const lance = (cmd, args, env = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })

console.log('1. On efface dist/ — un build raté ne doit rien laisser derrière lui.')
rmSync('dist', { recursive: true, force: true })

console.log('2. Build (base /batchcooking/)…')
lance('npm', ['run', 'build'], { PAGES: '1' })

/*
 * Le repli des sous-chemins.
 *
 * GitHub Pages sert des FICHIERS. L'application, elle, route côté client : il
 * n'existe aucun fichier à `/invite/<jeton>`, `/reglages` ou `/budget`, et
 * Pages y répondait donc 404 — le lien d'invitation compris, ce qui rendait
 * impossible d'entrer dans un foyer par le chemin prévu pour ça.
 *
 * `404.html` est la porte de sortie : Pages le sert pour tout chemin inconnu,
 * l'application démarre, lit `location.pathname` et affiche le bon écran. Une
 * copie d'`index.html` suffit — il n'y a rien d'autre à faire, et rien de plus
 * à maintenir puisque la copie se refait à chaque déploiement.
 */
console.log('3. Repli des sous-chemins (404.html)…')
copyFileSync(join('dist', 'index.html'), join('dist', '404.html'))

console.log('4. Vérification de ce qui va partir…')
const index = join('dist', 'index.html')
if (!existsSync(index)) {
  console.error('   ✗ dist/index.html absent : le build n’a rien écrit.')
  process.exit(1)
}
const html = readFileSync(index, 'utf8')
const refs = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map(m => m[1])
if (refs.length === 0) {
  console.error('   ✗ index.html ne référence aucun asset.')
  process.exit(1)
}
for (const r of refs) {
  const chemin = join('dist', r.replace(/^\/batchcooking\//, ''))
  if (!existsSync(chemin)) {
    console.error(`   ✗ ${r} est référencé mais absent de dist/.`)
    process.exit(1)
  }
}
if (!existsSync(join('dist', '404.html'))) {
  console.error('   ✗ 404.html absent : tous les sous-chemins répondront 404 en ligne.')
  process.exit(1)
}
const bundle = refs.find(r => r.endsWith('.js')) ?? refs[0]
console.log(`   ✓ ${refs.length} fichiers + le repli 404.html, bundle ${bundle}`)

console.log('5. Publication sur gh-pages…')
lance('npx', ['gh-pages', '-d', 'dist', '-b', 'gh-pages', '-m', 'deploy'])

console.log(`\nPublié. Vérifie dans une minute que le site sert bien ${bundle} :`)
console.log('  curl -s https://kamil-bentounes.github.io/batchcooking/ | grep -o "assets/[^\\"]*\\.js"')
