#!/usr/bin/env node
/**
 * Le manuel de l'aide : le générer, et refuser qu'il vieillisse en silence.
 *
 *   npm run manuel:genere    docs/aide/*.md  →  supabase/functions/aide/manuel.generated.ts
 *   npm run manuel:verifie   échoue si une page est périmée, mal formée, ou si le paquet n'est pas à jour
 *
 * Une page porte `sources` (les fichiers dont dépendent ses affirmations) et `verifie_sur` (le commit contre lequel
 * elle a été relue). Si un de ces fichiers a changé depuis — commité ou non — la page est NON VÉRIFIÉE, et le
 * déploiement s'arrête : c'est le code qui prime, et rien d'autre ne prévient qu'une page a cessé de dire vrai.
 *
 * Lancé avec `node --experimental-strip-types` : le noyau (`_shared/manuel.ts`) est le même que celui de la fonction.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lisPage, perimees } from '../supabase/functions/_shared/manuel.ts'

const DOSSIER = 'docs/aide'
const PAQUET = 'supabase/functions/aide/manuel.generated.ts'

const git = (racine, ...args) =>
  execFileSync('git', args, { cwd: racine, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

/** Les pages du manuel : tout `.md` du dossier, sauf le guide et les fichiers de doutes (`_…`). */
export function lisLesPages(racine = '.') {
  const noms = readdirSync(join(racine, DOSSIER))
    .filter(n => n.endsWith('.md') && n !== 'LISEZMOI.md' && !n.startsWith('_'))
    .sort()
  const pages = noms.map(n => {
    const p = lisPage(readFileSync(join(racine, DOSSIER, n), 'utf8'), `${DOSSIER}/${n}`)
    if (`${p.id}.md` !== n) throw new Error(`${DOSSIER}/${n} : l'id « ${p.id} » doit être le nom du fichier`)
    return p
  })
  const vus = new Set()
  for (const p of pages) {
    if (vus.has(p.id)) throw new Error(`id en double : ${p.id}`)
    vus.add(p.id)
  }
  return pages
}

/** Le contenu du paquet, daté : `verifie_le` est la date du commit de vérification. */
export function construit(racine = '.') {
  const pages = lisLesPages(racine).map(p => {
    let date
    try { date = git(racine, 'log', '-1', '--format=%cs', p.verifie_sur) } catch { date = '' }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`${p.id} : le commit ${p.verifie_sur} est introuvable dans ce dépôt`)
    }
    return { ...p, verifie_le: date }
  })
  const contenu = `/**
 * GÉNÉRÉ par \`npm run manuel:genere\` depuis docs/aide/*.md — ne pas modifier à la main.
 * \`npm run manuel:verifie\` (et le déploiement) échouent si ce fichier n'est pas à jour.
 */
import type { PageDatee } from '../_shared/manuel.ts'

export const PAGES: PageDatee[] = ${JSON.stringify(pages, null, 2)}
`
  return { pages, contenu }
}

/** Les fichiers de `sources` qui diffèrent entre `sha` et l'arbre de travail (suivis par git). */
function fichiersChanges(racine) {
  return (sha, sources) => {
    const dehors = []
    for (const s of sources) {
      if (!existsSync(join(racine, s))) { dehors.push(`${s} (absent)`); continue }
      const diff = git(racine, 'diff', '--name-only', sha, '--', s)
      if (diff !== '') dehors.push(s)
    }
    return dehors
  }
}

export function verifie(racine = '.') {
  const problemes = []
  let pages = []
  let contenu = ''
  try { ({ pages, contenu } = construit(racine)) } catch (e) { problemes.push(String(e.message ?? e)) }

  for (const p of perimees(pages, fichiersChanges(racine))) {
    problemes.push(`page périmée « ${p.id} » : ${p.fichiers.join(', ')} a changé depuis ${pages.find(x => x.id === p.id).verifie_sur}`)
  }
  if (contenu !== '') {
    const actuel = existsSync(join(racine, PAQUET)) ? readFileSync(join(racine, PAQUET), 'utf8') : ''
    if (actuel !== contenu) problemes.push(`${PAQUET} n'est pas à jour : lance « npm run manuel:genere »`)
  }
  return problemes
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2]
  if (cmd === 'genere') {
    const { pages, contenu } = construit()
    writeFileSync(PAQUET, contenu)
    console.log(`${pages.length} page(s) → ${PAQUET}`)
  } else if (cmd === 'verifie') {
    const problemes = verifie()
    if (problemes.length > 0) {
      console.error('Le manuel de l’aide n’est pas prêt :')
      for (const p of problemes) console.error(`  ✗ ${p}`)
      console.error('Relis les pages concernées contre le code (docs/aide/LISEZMOI.md), mets `verifie_sur` à jour, puis `npm run manuel:genere`.')
      process.exit(1)
    }
    console.log('Le manuel de l’aide est à jour avec le code.')
  } else {
    console.error('usage : manuel.mjs genere | verifie')
    process.exit(2)
  }
}
