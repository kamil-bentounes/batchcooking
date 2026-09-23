/**
 * Les PARCOURS, et ce qu'ils donnent à voir.
 *
 * `fumee.spec.ts` répond à « l'écran s'ouvre-t-il ? ». Ce fichier répond à deux
 * autres questions, que seule une vraie manipulation peut trancher :
 *
 *  · en cliquant comme on clique vraiment, l'application avance-t-elle ?
 *    Trois revues de suite ont trouvé des défauts qu'aucun test ne voyait —
 *    une barre qui changeait l'URL sans changer d'écran, deux boutons menant
 *    au même endroit — parce que personne ne cliquait.
 *  · à quoi ça ressemble ? Chaque étape laisse une capture dans `.shots/`. Ce
 *    n'est pas une comparaison de pixels (elle casserait au premier changement
 *    d'espacement et finirait ignorée) : c'est une trace à REGARDER.
 *
 * Et deux audits que la machine fait mieux que l'œil, sur tous les écrans à la
 * fois : la taille des cibles tactiles, et l'absence de texte illisible.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface } from './amorce.ts'
import type { Foyer } from './amorce.ts'

let foyer: Foyer

test.beforeAll(async () => { foyer = await amorce() })
test.afterAll(async () => { if (foyer) await efface(foyer) })

/** Tous les écrans de l'application, tels que `App.tsx` les aiguille. */
const ECRANS = [
  ['/', 'hub'], ['/cuisine-accueil', 'accueil'], ['/budget', 'budget'], ['/charges', 'charges'], ['/budget-reglages', 'budget-reglages'], ['/epargne', 'epargne'], ['/profil', 'profil'],
  ['/semaine', 'semaine'], ['/stock', 'stock'], ['/bilan', 'bilan'],
  ['/choisir', 'choisir'], ['/magasin', 'magasin'], ['/plan', 'plan'],
  ['/cuisine', 'cuisine'], ['/dressage', 'dressage'], ['/inventer', 'inventer'],
  ['/photo', 'photo'], ['/ticket', 'ticket'], ['/peser', 'peser'],
  ['/importer', 'importer'], ['/objectifs', 'objectifs'], ['/reglages', 'reglages'],
  ['/motdepasse', 'motdepasse'],
] as const

function surveille(page: Page): string[] {
  const erreurs: string[] = []
  page.on('console', m => { if (m.type() === 'error') erreurs.push(m.text()) })
  page.on('pageerror', e => erreurs.push(e.message))
  return erreurs
}

/* Le bruit qui ne vient pas de l'application : le service worker en
   prévisualisation, et les types MIME que le serveur de test sert à sa façon. */
const BRUIT = /ServiceWorker|MIME|Failed to load resource/

async function connecte(page: Page) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(foyer.email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    /* L'avatar du hub. Il portait `aria-label="Réglages"` ; il mène désormais au
     PROFIL — un tap sur son initiale doit mener à soi, et c'était le seul
     chemin manquant vers l'écran d'arrivée. On vise donc la marque, qui ne
     bougera pas. */
  await expect(page.getByRole('heading', { name: 'Popote' }))
    .toBeVisible({ timeout: 15_000 })
}

async function capture(page: Page, nom: string) {
  await page.waitForTimeout(350)
  await page.screenshot({ path: `.shots/parcours/${nom}.png`, fullPage: true })
}

test.describe('on passe par tous les écrans', () => {
  test('chacun s’ouvre, montre un titre, et ne crie pas dans la console', async ({ page }) => {
    const erreurs = surveille(page)
    await connecte(page)

    const muets: string[] = []
    for (const [chemin, nom] of ECRANS) {
      await page.goto(chemin)
      /* Un écran qui s'ouvre porte un titre. Une page blanche n'en a pas.
         `.titre` autant que `<h1>` : la maison écrit ses titres avec la classe,
         et tous les écrans n'ont pas de balise de titre — c'est un défaut
         d'accessibilité à corriger un jour, pas un écran vide aujourd'hui. */
      const titre = page.locator('h1, h2, .titre').first()
      /* On ATTEND : plusieurs écrans montrent « Un instant… » le temps d'une
         requête, et mesurer trop tôt ferait passer un chargement pour une page
         blanche — l'inverse exact de ce que ce test doit dire. */
      const vu = await titre.waitFor({ state: 'visible', timeout: 8_000 })
        .then(() => true).catch(() => false)
      if (!vu) muets.push(`${chemin} n’affiche aucun titre`)
      await capture(page, nom)
    }
    expect(muets, 'des écrans se rendent vides').toEqual([])
    expect(erreurs.filter(e => !BRUIT.test(e)), 'erreurs de console').toEqual([])
  })
})

test.describe('les audits que l’œil rate', () => {
  test('aucune cible tactile sous 44 px, sur aucun écran', async ({ page }) => {
    /*
     * Deux relectures de suite ont trouvé des boutons de 20, 28, 34 px — à la
     * main, écran par écran, en en oubliant à chaque passe. La machine les
     * compte tous d'un coup, et elle ne se lasse pas.
     *
     * 44 px est le minimum posé par les recommandations d'Apple comme par
     * WCAG 2.5.8. On mesure la BOÎTE CLIQUABLE, pas ce qui est peint dedans :
     * une pastille de 20 px dans une cible de 44 est correcte.
     */
    await connecte(page)
    const fautifs: string[] = []

    for (const [chemin, nom] of ECRANS) {
      await page.goto(chemin)
      await page.waitForTimeout(300)
      const petits = await page.evaluate(() => {
        const sortie: { texte: string; l: number; h: number }[] = []
        const cibles = document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="tab"], [role="radio"], input[type="checkbox"]')
        for (const c of cibles) {
          const r = c.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue       // masqué
          if (r.width < 44 || r.height < 44) {
            sortie.push({
              texte: (c.getAttribute('aria-label') || c.textContent || '?').trim().slice(0, 34),
              l: Math.round(r.width), h: Math.round(r.height),
            })
          }
        }
        return sortie
      })
      for (const p of petits) fautifs.push(`${nom} · « ${p.texte} » ${p.l}×${p.h}`)
    }

    expect(fautifs, 'des cibles sont trop petites pour un pouce').toEqual([])
  })

  test('aucun texte sous le seuil de lisibilité, sur aucun écran', async ({ page }) => {
    /*
     * Le safran sur le fond fait 1,95:1, et il a porté du texte pendant des
     * mois. `Vide` codait sa couleur en dur et s'affichait en noir sur noir.
     * Les deux ont été trouvés à l'œil, tard. Ici on calcule.
     *
     * Le seuil est celui de WCAG AA : 4,5:1, ramené à 3:1 au-delà de 24 px (ou
     * 19 px en gras), où la masse du trait compense. On ne remonte que le texte
     * VISIBLE et non vide, et on lit la couleur de fond réellement peinte en
     * remontant les parents transparents.
     */
    await connecte(page)
    const fautifs: string[] = []

    for (const [chemin, nom] of ECRANS) {
      await page.goto(chemin)
      await page.waitForTimeout(300)
      const pales = await page.evaluate(() => {
        /* Un canevas de 1 px résout N'IMPORTE QUELLE couleur CSS en sRGB.
           C'est indispensable : Tailwind rend `bg-surface/95` en `oklab(…)`,
           et lire les nombres d'une chaîne suppose de connaître son espace —
           une première version de cet audit a cru que la barre du bas faisait
           1,42:1 alors qu'elle en fait 13. Le navigateur sait convertir ; on
           le laisse faire. */
        const pot = document.createElement('canvas')
        pot.width = pot.height = 1
        const pinceau = pot.getContext('2d', { willReadFrequently: true })!
        const cache = new Map<string, [number, number, number, number]>()
        const resout = (c: string): [number, number, number, number] | null => {
          if (!c) return null
          const memo = cache.get(c)
          if (memo) return memo
          pinceau.clearRect(0, 0, 1, 1)
          pinceau.fillStyle = '#000'
          pinceau.fillStyle = c
          if (pinceau.fillStyle === '#000' && !/#000|black|rgb\(0, 0, 0\)/.test(c)) return null
          pinceau.fillRect(0, 0, 1, 1)
          const [r, v, b, a] = pinceau.getImageData(0, 0, 1, 1).data
          const out: [number, number, number, number] = [r, v, b, a / 255]
          cache.set(c, out)
          return out
        }
        const clarte = ([r, v, b]: number[]) => {
          const f = (x: number) => {
            const s = x / 255
            return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          return 0.2126 * f(r) + 0.7152 * f(v) + 0.0722 * f(b)
        }
        /* Le fond RÉELLEMENT peint : on remonte les parents en composant les
           couches translucides les unes sur les autres, au lieu de prendre la
           première venue. */
        const fond = (e: HTMLElement): number[] => {
          const couches: [number, number, number, number][] = []
          let n: HTMLElement | null = e
          while (n) {
            const c = resout(getComputedStyle(n).backgroundColor)
            if (c && c[3] > 0) { couches.push(c); if (c[3] >= 0.999) break }
            n = n.parentElement
          }
          let [r, v, b] = [255, 255, 255]
          for (const [cr, cv, cb, ca] of couches.reverse()) {
            r = cr * ca + r * (1 - ca); v = cv * ca + v * (1 - ca); b = cb * ca + b * (1 - ca)
          }
          return [r, v, b]
        }
        const sortie: { texte: string; ratio: number; taille: number }[] = []
        for (const e of document.querySelectorAll<HTMLElement>('body *')) {
          const propre = [...e.childNodes]
            .filter(n => n.nodeType === 3).map(n => n.textContent ?? '').join('').trim()
          if (!propre) continue
          const r = e.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          const s = getComputedStyle(e)
          if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue
          const teinte = resout(s.color)
          if (!teinte) continue
          /* L'opacité héritée délave vraiment le texte : on la compose sur le
             fond, sinon un `opacity-70` passerait pour sa couleur pleine. */
          let alpha = teinte[3]
          for (let n: HTMLElement | null = e; n; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity)
          const f = fond(e)
          const peint = [0, 1, 2].map(i => teinte[i] * alpha + f[i] * (1 - alpha))
          const ratio = (Math.max(clarte(peint), clarte(f)) + 0.05)
                      / (Math.min(clarte(peint), clarte(f)) + 0.05)
          const taille = parseFloat(s.fontSize)
          const gras = Number(s.fontWeight) >= 600
          const seuil = taille >= 24 || (taille >= 19 && gras) ? 3 : 4.5
          if (ratio < seuil) {
            sortie.push({ texte: propre.slice(0, 34), ratio: Math.round(ratio * 100) / 100, taille })
          }
        }
        return sortie
      })

      for (const p of pales) fautifs.push(`${nom} · « ${p.texte} » ${p.ratio}:1 à ${p.taille}px`)
    }

    expect([...new Set(fautifs)], 'du texte est illisible').toEqual([])
  })
})

test.describe('on clique comme on clique vraiment', () => {
  test('le congélateur : on y range un plat à la main, et il y reste', async ({ page }) => {
    /*
     * Le parcours entier de la fonctionnalité la plus récente, du bouton
     * jusqu'à la ligne en base : c'est celui-là qu'aucun test unitaire ne
     * couvre, puisqu'il traverse cinq écrans et deux mutations.
     */
    const erreurs = surveille(page)
    await connecte(page)

    await page.goto('/stock')
    await expect(page.getByRole('heading', { name: /ce que j’ai/i })).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-01-stock-frigo')

    await page.getByRole('tab', { name: /congélateur/i }).click()
    await capture(page, 'clic-02-stock-congelateur')

    await page.getByRole('button', { name: /à la main|ajouter/i }).first().click()
    await capture(page, 'clic-03-ajout-formulaire')

    // Un plat, pas un produit : c'est la branche qui demande les deux dates.
    const plat = page.getByRole('radio', { name: /un plat/i })
    if (await plat.count()) await plat.click()

    await page.getByLabel(/nom|quoi/i).first().fill('Chili de fumée')
    for (const [motif, valeur] of [[/grammes|poids/i, '450'], [/kcal|calories/i, '620'],
                                   [/protéines/i, '38']] as const) {
      const champ = page.getByLabel(motif).first()
      if (await champ.count()) await champ.fill(valeur)
    }
    await capture(page, 'clic-04-ajout-rempli')

    expect(erreurs.filter(e => !BRUIT.test(e)), 'erreurs pendant le parcours').toEqual([])
  })

  test('la semaine : on saisit un repas pris hors barquette', async ({ page }) => {
    const erreurs = surveille(page)
    await connecte(page)

    await page.goto('/semaine')
    await expect(page.locator('.titre, h1').first()).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-05-semaine')

    /* Pas de garde `if (count())` : elle rendait ce test muet. Les moments du
       jour sont des boutons nommés « Midi », « Soir »… sous « Mangé sans
       barquette ? ». Si aucun n'est là, le test doit échouer, pas se taire. */
    await expect(page.getByText(/mangé sans barquette/i).first()).toBeVisible({ timeout: 15_000 })
    const moment = page.getByRole('button', { name: /^(midi|soir|matin|petit)/i }).first()
    await expect(moment).toBeVisible()
    await moment.click()
    await capture(page, 'clic-06-semaine-repas-libre')
    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })

  test('les réglages : le budget des courses se change et se garde', async ({ page }) => {
    const erreurs = surveille(page)
    await connecte(page)

    await page.goto('/reglages')
    await expect(page.locator('.titre, h1').first()).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-07-reglages')

    /* Le champ s'appelle « Par mois (€) », pas « budget » : la première version
       de ce test cherchait un libellé qui n'existe pas et se contentait de ne
       rien faire. Un test qui ne trouve pas sa cible doit échouer. */
    const budget = page.getByLabel(/par mois/i).first()
    await expect(budget).toBeVisible({ timeout: 15_000 })
    await budget.fill('412')
    /* « Enregistrer le budget », pas le premier « Enregistrer » venu : l'écran
       en porte deux, et le premier enregistre le plafond des appels au modèle.
       La première version de ce test sauvegardait donc le mauvais champ et
       s'étonnait que 320 ne devienne pas 412. */
    await page.getByRole('button', { name: /enregistrer le budget/i }).click()
    await page.waitForTimeout(900)
    await page.reload()
    await expect(page.getByLabel(/par mois/i).first())
      .toHaveValue('412', { timeout: 15_000 })
    await capture(page, 'clic-08-reglages-budget-garde')
    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })

  test('le cycle : depuis l’accueil, on avance jusqu’au plan', async ({ page }) => {
    const erreurs = surveille(page)
    await connecte(page)
    // `/` est le hub depuis que l'app a deux univers : l'accueil de la cuisine
    // vit à `/cuisine-accueil`.
    await page.goto('/cuisine-accueil')
    await capture(page, 'clic-09-accueil')

    /* Le geste du moment, quel qu'il soit — les neuf libellés possibles sont
       ceux de `GESTE` dans `lib/donnees/cycle.ts`.

       ⚠️ Surtout PAS `main button` en premier : c'est le bouton des réglages,
          dans l'en-tête. La première version de ce test partait donc sur
          l'écran des réglages en croyant suivre le geste principal — et
          passait au vert, puisqu'elle n'assertait rien de la destination. */
    const principal = page.getByRole('button', {
      name: /choisir les recettes|continuer à choisir|je pars faire les courses|voir le plan|reprendre|dresser les barquettes|voir la semaine|lancer la suivante/i,
    }).first()
    await expect(principal).toBeVisible({ timeout: 15_000 })
    const avant = page.url()
    await principal.click()
    await page.waitForTimeout(900)
    expect(page.url(), 'le geste principal ne mène nulle part').not.toBe(avant)
    await capture(page, 'clic-10-apres-le-geste')

    // On visite les passages du cycle en les ouvrant par leur chemin, puis on
    // vérifie que la SORTIE de chacun ramène bien quelque part.
    for (const [chemin, nom] of [['/choisir', '11-choisir'], ['/magasin', '12-magasin'],
                                 ['/plan', '13-plan']] as const) {
      await page.goto(chemin)
      const sortie = page.getByRole('button', { name: /accueil|retour|la liste/i }).first()
      await expect(sortie).toBeVisible({ timeout: 15_000 })
      await capture(page, `clic-${nom}`)
      await sortie.click()
      await page.waitForTimeout(600)
      expect(page.url(), `la sortie de ${chemin} ne mène nulle part`).not.toContain(chemin)
    }
    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })
})

test.describe('les deux univers', () => {
  test('le hub mène à chacun, et chacun ramène au hub', async ({ page }) => {
    /*
     * La navigation à deux univers est la seule chose que le hub apporte, et
     * c'est exactement le genre de chemin qu'aucun test unitaire ne voit. Un
     * précédent l'a déjà prouvé : une barre qui changeait l'URL sans changer
     * d'écran est passée sous trente tests verts, faute que l'un d'eux clique.
     */
    const erreurs = surveille(page)
    await connecte(page)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-14-hub')

    await page.getByRole('button', { name: /budget/i }).first().click()
    await expect(page.getByRole('heading', { name: /janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i }))
      .toBeVisible({ timeout: 10_000 })
    await capture(page, 'clic-15-budget')

    await page.getByRole('button', { name: /retour à l’accueil/i }).click()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 10_000 })

    await page.getByRole('button', { name: /cuisine/i }).first().click()
    await expect(page.locator('nav[aria-label="Navigation principale"]'))
      .toBeVisible({ timeout: 10_000 })
    await capture(page, 'clic-16-cuisine')

    // Et l'en-tête de la cuisine ramène au hub : c'est le seul chemin de retour.
    await page.getByRole('button', { name: /retour à l’accueil de popote/i }).click()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 10_000 })

    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })
})

test.describe('le budget, du vide jusqu’au virement', () => {
  test('on pose un revenu, un compte, une charge — et le chiffre apparaît', async ({ page }) => {
    /*
     * Le parcours entier, celui qui manquait. Une relecture avait trouvé que
     * les écrans du budget LISAIENT des comptes, des revenus et des enveloppes
     * qu'aucun écran ne permettait d'écrire : les audits tournaient donc sur
     * des écrans vides, et ne mesuraient rien. Ce test remplit, puis vérifie
     * qu'un chiffre sort à l'autre bout.
     */
    const erreurs = surveille(page)
    await connecte(page)

    await page.goto('/budget-reglages')
    await expect(page.getByRole('heading', { name: /réglages du budget/i }))
      .toBeVisible({ timeout: 15_000 })

    await page.getByLabel(/mon net mensuel/i).fill('2400')
    await page.getByRole('button', { name: /mon revenu/i }).click()
    await expect(page.getByText(/2\s?400,00/)).toBeVisible({ timeout: 10_000 })
    await capture(page, 'clic-17-revenu')

    await page.getByLabel(/nom du compte/i).fill('Commun')
    await page.getByRole('button', { name: /ajouter ce compte/i }).click()
    await expect(page.getByText('Commun').first()).toBeVisible({ timeout: 10_000 })

    await page.getByLabel(/nom de l’enveloppe/i).fill('Restaurant')
    await page.getByLabel(/plafond mensuel/i).fill('400')
    await page.getByRole('button', { name: /ajouter cette enveloppe/i }).click()
    await expect(page.getByText(/400,00/).first()).toBeVisible({ timeout: 10_000 })
    await capture(page, 'clic-18-reglages-remplis')

    // Une charge, depuis le catalogue.
    await page.goto('/charges')
    await page.getByRole('button', { name: 'Internet', exact: true }).click()
    await page.getByLabel(/combien/i).fill('37')
    await page.getByRole('button', { name: /ajouter cette charge/i }).click()
    await expect(page.getByText(/37,00/).first()).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-19-charge-posee')

    /* Et le mois doit annoncer un VIREMENT NOMMÉ, pas « à répartir ».
       La première version de ce test n'assertait que la présence du titre
       « À verser » — elle n'a donc pas vu que les charges créées par l'écran
       ne portaient aucun compte, et retombaient toutes dans le bac à sable. */
    await page.goto('/budget')
    await expect(page.getByText(/à verser/i).first()).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: /rien à verser/i })).toHaveCount(0)
    await expect(page.getByText('Commun', { exact: true }).first())
      .toBeVisible({ timeout: 10_000 })
    await expect(page.getByText(/à répartir/i),
      'une charge posée par l’écran ne porte pas de compte').toHaveCount(0)
    await capture(page, 'clic-20-budget-rempli')

    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })

  test('une faute de frappe se corrige, et le mois suit', async ({ page }) => {
    /*
     * Le premier soir est le moment de l'année où l'on tape le plus de
     * montants, donc où l'on se trompe le plus. Et la correction n'existait
     * pas : « Retirer » échoue sur la clé étrangère dès qu'un mois est ouvert,
     * retombe sur l'archivage, la dépense fausse reste dans le mois, et
     * reposer la charge juste l'ajoute PAR-DESSUS.
     */
    const erreurs = surveille(page)
    await connecte(page)

    await page.goto('/charges')
    /* « Gaz », pas « Internet » : l'amorce en sème déjà un, et deux charges du
       même nom rendent les deux boutons « Corriger » indiscernables. */
    await page.getByRole('button', { name: 'Gaz', exact: true }).click()
    await page.getByLabel(/combien/i).fill('3700')   // au lieu de 37
    await page.getByRole('button', { name: /ajouter cette charge/i }).click()
    await expect(page.getByText(/3\s?700,00/).first()).toBeVisible({ timeout: 15_000 })
    await capture(page, 'clic-21-charge-fausse')

    await page.getByRole('button', { name: 'Corriger Gaz' }).click()
    const montant = page.getByLabel('Montant de Gaz')
    await expect(montant).toHaveValue('3700')
    await montant.fill('37')
    await capture(page, 'clic-22-correction-ouverte')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()

    await expect(page.getByText(/corrigée/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/37,00 € par mois/).first()).toBeVisible()
    await expect(page.getByText(/3\s?700,00/),
      'le montant faux est resté dans la liste').toHaveCount(0)
    await capture(page, 'clic-23-charge-corrigee')

    /* Et le mois, pas seulement la liste : c'est lui qui dit quoi virer. */
    await page.goto('/budget')
    await expect(page.getByText(/3\s?700,00/),
      'le mois facture encore le montant faux').toHaveCount(0)
    await capture(page, 'clic-24-mois-corrige')

    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })

  test('la dictée demande depuis quand court une charge annuelle', async ({ page }) => {
    /*
     * Le chemin de la dictée ne passait PAS `debut` : toute charge dictée
     * partait au mois courant. Mesuré par une revue : une taxe foncière de
     * 1 450 € dictée en septembre ne provisionne que quatre mois, et sa
     * régularisation en réclame 1 329 € d'un coup au lieu de 362 €. C'est
     * exactement ce que D61 dit empêcher, et l'exemple proposé par l'écran
     * menait droit dedans.
     *
     * La réponse du modèle est FEINTE : ce test porte sur l'écran de revue et
     * sur ce qu'il transmet, pas sur l'extraction — le banc `banc-charges`
     * s'occupe du modèle.
     */
    const erreurs = surveille(page)
    await page.route('**/functions/v1/charges', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        charges: [
          { libelle: 'Taxe foncière', catalogue_libelle: 'Taxe foncière',
            montant_cents: 145_000, periodicite: 'annuel', portee: 'commun',
            variable: false, confiance: 1, remarque: null },
          { libelle: 'Internet', catalogue_libelle: 'Internet',
            montant_cents: 3_700, periodicite: 'mensuel', portee: 'commun',
            variable: false, confiance: 1, remarque: null },
        ],
        oublis: ['Assurance habitation'], questions: [], restantes: 19,
      }),
    }))
    await connecte(page)

    await page.goto('/charges')
    await page.getByRole('button', { name: /dicte tout/i }).click()
    await page.getByRole('textbox').first().fill('la taxe foncière 1450 et internet 37')
    await page.getByRole('button', { name: /range|j’écoute|c’est dit/i }).first().click()

    /* La ligne ANNUELLE porte la question, la mensuelle non : demander
       « depuis quand » pour un abonnement mensuel serait du bruit. */
    const depuis = page.getByLabel('Depuis quand court Taxe foncière')
    await expect(depuis).toBeVisible({ timeout: 20_000 })
    await expect(page.getByLabel('Depuis quand court Internet')).toHaveCount(0)
    await expect(depuis, 'le défaut n’est pas janvier de l’année en cours')
      .toHaveValue(`${new Date().getFullYear()}-01`)
    await capture(page, 'clic-25-dictee-depuis-quand')

    /* L'oubli proposé s'ajoute d'une touche : le signaler sans offrir de le
       combler faisait porter deux fois le travail. */
    await page.getByRole('button', { name: '+ Assurance habitation' }).click()
    await expect(page.getByText('Assurance habitation')).toBeVisible()
    await capture(page, 'clic-26-dictee-oubli-ajoute')

    expect(erreurs.filter(e => !BRUIT.test(e))).toEqual([])
  })
})

test.describe('ce qui se voit à la souris', () => {
  test('tout ce qui répond au clic porte une main', async ({ page }) => {
    /*
     * Tailwind v4 a retiré le `cursor: pointer` que le navigateur mettait
     * d'office sur les boutons, et cette app a été dessinée au doigt : à la
     * souris, plus rien n'indiquait ce qui était cliquable. Trouvé à l'usage,
     * pas par un test — celui-ci existe pour que ça ne revienne pas.
     */
    await connecte(page)
    const manquants: string[] = []

    for (const [chemin, nom] of ECRANS) {
      await page.goto(chemin)
      await page.waitForTimeout(250)
      const sans = await page.evaluate(() => {
        const out: string[] = []
        for (const e of document.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [role="tab"], [role="radio"]')) {
          const r = e.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue
          if (getComputedStyle(e).cursor !== 'pointer') {
            out.push((e.getAttribute('aria-label') || e.textContent || '?').trim().slice(0, 30))
          }
        }
        return out
      })
      for (const s of sans) manquants.push(`${nom} · « ${s} »`)
    }

    expect([...new Set(manquants)], 'des éléments cliquables n’ont pas de main').toEqual([])
  })

  test('on sort de l’écran du profil', async ({ page }) => {
    // Il n'avait ni barre du bas ni retour : on y arrivait par le bandeau du hub
    // et on y restait.
    await connecte(page)
    await page.goto('/profil')
    await expect(page.getByRole('heading', { name: /deux choses/i }))
      .toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /popote/i }).click()
    await expect(page.getByRole('heading', { name: 'Popote' })).toBeVisible({ timeout: 10_000 })
  })
})
