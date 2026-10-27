/**
 * Les ÉTATS que la revue ordinaire ne rencontre jamais.
 *
 * `captures.spec.ts` photographie chaque écran une fois, dans l'état où on le
 * rencontre le plus souvent. C'est utile et ça a trouvé des choses — mais un
 * écran ment rarement dans son état moyen. Il ment au bord :
 *
 *  · le tout PREMIER soir, quand il n'y a rien à afficher ;
 *  · quand une écriture ÉCHOUE, et qu'il faut le dire ;
 *  · quand le mois est CONFIRMÉ, ou qu'on regarde derrière soi ;
 *  · vu par l'AUTRE personne, qui n'a pas posé ces chiffres ;
 *  · quand les LIBELLÉS et les MONTANTS vont jusqu'aux bornes.
 *
 * Aucun de ces cinq n'avait jamais été photographié, et c'est le premier qui
 * compte le plus : c'est l'écran d'accueil de deux vraies personnes.
 *
 * Ce fichier n'asserte presque rien — comme `captures.spec.ts`, son produit
 * ce sont les images. Les quelques `expect` ne sont là que pour échouer fort
 * si l'écran n'est pas celui qu'on croit photographier.
 */
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { MOT_DE_PASSE, amorce, efface, sansFoyer, db } from './amorce.ts'
import type { Foyer } from './amorce.ts'
import { releve } from './couverture.ts'
import { ouvreLaLigne } from './aides-charges.ts'

async function connecte(page: Page, email: string) {
  await page.goto('/')
  await page.getByLabel(/e-?mail/i).fill(email)
  await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
  await page.getByRole('button', { name: 'Entrer', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Popote' }))
    .toBeVisible({ timeout: 15_000 })
  /* ⚠️ ICI, avant le premier `page.goto` : une navigation dure remet
     `window.__coverage__` à zéro. L'écran de connexion — le seul que TOUT le
     monde voit — était mesuré à 0 % de branches pour cette seule raison. */
  await releve(page)
}

/** Deux images, pour la même raison que dans `captures.spec.ts`. */
async function prend(page: Page, nom: string) {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `.shots/etats/${nom}.png` })
  await page.screenshot({ path: `.shots/etats/${nom}-entier.png`, fullPage: true })
  /* ⚠️ AVANT de quitter la page : `window.__coverage__` meurt avec elle, et
     une navigation suffit à perdre tout ce qu'on venait de mesurer. */
  await releve(page)
}

/**
 * TOUS les écrans, pas seulement ceux du budget.
 *
 * Choisir à la main quels écrans photographier dans quel état, c'est décider
 * d'avance où sont les défauts — or ils étaient chaque fois là où je ne
 * regardais pas. La liste vient donc du routeur, et chaque état la parcourt en
 * entier : ce qui n'a rien à montrer produit une image vide, et une image vide
 * est une information.
 */
const ECRANS = [
  ['/', 'hub'], ['/budget', 'budget'], ['/charges', 'charges'],
  ['/budget-reglages', 'budget-reglages'], ['/epargne', 'epargne'],
  ['/profil', 'profil'], ['/cuisine-accueil', 'accueil'], ['/semaine', 'semaine'],
  ['/frigo', 'frigo'], ['/bilan', 'bilan'], ['/choisir', 'choisir'],
  ['/magasin', 'magasin'], ['/plan', 'plan'], ['/cuisine', 'cuisine'],
  ['/dressage', 'dressage'], ['/inventer', 'inventer'], ['/photo', 'photo'],
  ['/ticket', 'ticket'], ['/peser', 'peser'], ['/importer', 'importer'],
  ['/objectifs', 'objectifs'], ['/reglages', 'reglages'], ['/motdepasse', 'motdepasse'],
] as const

async function tousLesEcrans(page: Page, prefixe: string) {
  for (const [chemin, nom] of ECRANS) {
    await page.goto(chemin)
    await prend(page, `${prefixe}-${nom}`)
  }
}

test.describe('avant d’être connecté', () => {
  /*
   * LE TROU DE MÉTHODE.
   *
   * Treize revues, une centaine de captures, et pas une n'avait jamais vu cet
   * écran — parce que tous les bancs commencent par `connecte(page)`. Le seul
   * écran que TOUT LE MONDE voit avant les autres est resté le seul que
   * personne ne regardait : son titre datait du premier jour et demandait
   * encore « On cuisine ? » à quelqu'un qui vient gérer son budget.
   *
   * Ce banc-ci ne se connecte pas. C'est tout son intérêt.
   */
  test('les trois chemins d’entrée, et ce qu’ils disent', async ({ page }) => {
    test.setTimeout(120_000)
    await page.goto('/')
    await expect(page.getByRole('button', { name: 'Entrer', exact: true }))
      .toBeVisible({ timeout: 20_000 })
    await prend(page, 'avant-01-connexion')

    /* Le titre ne parle plus que de cuisine : l'application gère aussi
       l'argent, et c'est le premier mot qu'on lit d'elle. */
    await expect(page.getByRole('heading', { name: /on cuisine/i }),
      'le titre d’entrée ne parle que de cuisine').toHaveCount(0)
    /* La marque est un texte, pas un titre : le titre « Popote » est celui du hub. */
    await expect(page.getByText('Popote', { exact: true }),
      'rien ne dit où l’on vient d’arriver').toBeVisible()

    await page.getByRole('button', { name: 'Première connexion' }).click()
    await expect(page.getByRole('button', { name: /recevoir le lien/i }))
      .toBeVisible({ timeout: 10_000 })
    await prend(page, 'avant-02-premiere')

    await page.getByRole('button', { name: 'Mot de passe oublié' }).click()
    await expect(page.getByRole('button', { name: /réinitialiser/i }))
      .toBeVisible({ timeout: 10_000 })
    await prend(page, 'avant-03-oubli')

    /* Et le message d'erreur, que personne n'avait vu non plus. */
    await page.getByRole('button', { name: 'J’ai déjà un mot de passe' }).click()
    await page.getByLabel(/e-?mail/i).fill('personne@nulle-part.test')
    await page.getByLabel(/mot de passe/i).fill('faux-mot-de-passe')
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await expect(page.getByText(/incorrect/i)).toBeVisible({ timeout: 20_000 })
    await prend(page, 'avant-04-refus')
  })
})

test.describe('le tout premier soir', () => {
  let vide: Foyer
  test.beforeAll(async () => { vide = await amorce({ budget: false }) })
  test.afterAll(async () => { if (vide) await efface(vide) })

  test('un foyer sans un centime, écran par écran', async ({ page }) => {
    test.setTimeout(300_000)
    await connecte(page, vide.email)
    await tousLesEcrans(page, 'vide')
  })

  /*
   * Une pastille se CLIQUE. Une capture prouve qu'elle est dessinée, pas
   * qu'elle fait quelque chose — trois fois cette session un banc est resté
   * vert avec un mauvais libellé, parce que rien n'actionnait ce qu'il
   * montrait. Ici on tape, et on vérifie les trois effets :
   * le nom se pose, le GENRE se pose avec lui, et la proposition disparaît
   * une fois le compte créé.
   */
  test('les propositions remplissent le formulaire, et s’effacent une fois prises',
    async ({ page }) => {
      test.setTimeout(120_000)
      await connecte(page, vide.email)
      await page.goto('/budget-reglages')

      /* « Livret A » est en épargne alors que le formulaire s'ouvre sur
         « Commun » : si le genre ne suivait pas, l'erreur serait invisible. */
      const epargne = page.getByRole('radio', { name: 'Épargne' })
      await expect(epargne).toHaveAttribute('aria-checked', 'false')
      await page.getByRole('button', { name: 'Livret A', exact: true }).click()
      await expect(page.getByLabel('Nom du compte')).toHaveValue('Livret A')
      await expect(epargne).toHaveAttribute('aria-checked', 'true')

      await page.getByRole('button', { name: 'Ajouter ce compte' }).click()
      await expect(page.getByText('Livret A', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(page.getByRole('button', { name: 'Livret A', exact: true }),
        'la proposition survit à sa propre création').toHaveCount(0)

      await prend(page, 'vide-budget-reglages-pioche')
    })
})

test.describe('arriver sans foyer', () => {
  /* Le premier écran de quelqu'un qui se connecte sans son lien d'invitation.
     Aucune capture ne le rendait : zéro branche mesurée sur `Onboarding`, alors
     que c'est là que se décide si un couple finit avec deux budgets séparés. */
  let perdu: { email: string; userId: string }
  test.beforeAll(async () => { perdu = await sansFoyer() })

  test('on lui dit qu’on l’attend, ou on le laisse créer', async ({ page }) => {
    await page.goto('/')
    await page.getByLabel(/e-?mail/i).fill(perdu.email)
    await page.getByLabel(/mot de passe/i).fill(MOT_DE_PASSE)
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    /* Pas de marque « Popote » ici : l'écran d'arrivée n'est pas le hub. On
       attend donc n'importe lequel des deux titres possibles. */
    await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
    await prend(page, 'sansfoyer-01-arrivee')
  })
})

test.describe('les états du foyer rempli', () => {
  let foyer: Foyer
  test.beforeAll(async () => { foyer = await amorce() })
  test.afterAll(async () => { if (foyer) await efface(foyer) })

  test('un montant hors borne : l’écran le refuse avant la base, et le dit', async ({ page }) => {
    /* « Mes charges » vérifie désormais le montant à la frappe (`peutCorriger`) :
       le refus de `corrige_la_charge` (un million d'euros au plus) n'est plus atteint
       par ce geste, et ce test, qui attendait la réponse de la base, cliquait sur
       un bouton grisé. On regarde donc ce que la personne voit : le refus, en
       clair, DANS la fenêtre, et rien qui s'écrive.

       ⚠️ Le bandeau d'erreur d'une écriture que la base refuse vraiment n'a plus de
       banc ici : aucun geste de cet écran n'y mène sans passer par la garde. */
    await connecte(page, foyer.email)
    await page.goto('/charges')
    await ouvreLaLigne(page, 'Internet')
    await page.getByRole('button', { name: 'Corriger Internet' }).click()
    await page.getByLabel('Montant de Internet').fill('2000000')
    /* ⚠️ `toBeVisible` ne dit pas « on le voit » : un message quatre écrans
       plus haut est « visible » pour Playwright. On exige donc qu'il soit DANS la
       fenêtre, à côté du champ touché. */
    const refus = page.getByText(/au plus 1\s000\s000/)
    await expect(refus).toBeVisible({ timeout: 15_000 })
    await expect(refus).toBeInViewport()
    await expect(page.getByRole('button', { name: 'Enregistrer', exact: true }),
      'un montant refusé peut encore s’enregistrer').toBeDisabled()
    await prend(page, 'erreur-01-charge-refusee')
  })

  test('le mois d’avant, et la porte des charges', async ({ page }) => {
    /* Le mois d'avant se lit d'une pastille, et la porte vers les charges est le
       premier geste, sans condition : conditionnée à un virement à faire, elle
       a disparu une fois, et les charges sont devenues inatteignables.
       « Vraiment payé » et « Marquer ce mois comme réglé » ne sont plus à
       l'écran : la facture se valide dans sa feuille, le mois se clôture
       (lot 3), et ce qu'on a versé reviendra avec « À verser » (lot 4). */
    await connecte(page, foyer.email)
    await page.goto('/budget')
    await expect(page.getByRole('region', { name: 'Ce qui reste' })).toBeVisible({ timeout: 15_000 })
    await prend(page, 'confirme-01-mois')

    await page.getByRole('button', { name: /^Mois précédent/ }).click()
    await expect(page.getByRole('button', { name: /^Mois suivant/ })).toBeVisible()
    await page.waitForTimeout(800)
    await prend(page, 'confirme-02-mois-precedent')

    await page.getByRole('button', { name: 'Mes charges' }).click()
    await expect(page.getByRole('heading', { name: 'Les charges' }),
      'la porte ne mène pas à l’écran des charges').toBeVisible({ timeout: 15_000 })
  })

  test('ce que Thauba voit d’elle-même', async ({ page }) => {
    /* Elle n'a posé aucun de ces chiffres. Les écrans lui parlent-ils d'elle,
       ou de celui qui a rempli ? Le parcours d'invitation la crée mais ne
       photographie que la liste des charges. */
    test.setTimeout(300_000)
    await connecte(page, foyer.elleEmail)
    await tousLesEcrans(page, 'elle')
  })

  test('et le même foyer, écran par écran, vu par celui qui l’a rempli', async ({ page }) => {
    /* Le témoin. Sans lui, on ne sait pas si ce qui cloche chez elle vient de
       ce qu'elle est l'autre, ou de l'écran lui-même. */
    test.setTimeout(300_000)
    await connecte(page, foyer.email)
    await tousLesEcrans(page, 'lui')
  })

  test('les gestes d’une ligne de charge, un par un', async ({ page }) => {
    /*
     * Ce sont EXACTEMENT les gestes qui ont cassé aujourd'hui : « Changer qui
     * participe » ne faisait rien en silence, « Rattacher » levait dans le
     * vide, et rien ne les touchait. Ils étaient la moitié des branches non
     * mesurées de cet écran.
     */
    test.setTimeout(120_000)
    await connecte(page, foyer.email)
    await page.goto('/charges')

    /* ── Retirer quelqu'un d'une charge commune, puis le remettre ───────── */
    await ouvreLaLigne(page, 'Internet')
    await page.getByRole('button', { name: 'Changer qui participe' }).click()
    const thauba = page.getByRole('checkbox', { name: 'Thauba' }).first()
    await expect(thauba).toHaveAttribute('aria-checked', 'true')
    await thauba.click()
    await expect(thauba).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 })
    await prend(page, 'gestes-01-qui-participe')
    await thauba.click()
    await expect(thauba).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
    await page.getByRole('button', { name: 'Fermer' }).click()

    /* ── Rattacher une charge sans compte ──────────────────────────────── */
    await ouvreLaLigne(page, 'Charges de copropriété du bâtiment B')
    const rattacher = page.getByRole('button', { name: 'Rattacher' })
    await expect(rattacher, 'l’amorce n’a plus de charge sans compte').toBeVisible()
    await rattacher.click()
    await expect(page.getByRole('button', { name: 'Rattacher' }),
      'la charge n’a pas reçu de compte').toHaveCount(0, { timeout: 15_000 })
    await prend(page, 'gestes-02-rattachee')

    /* ── Chercher dans le catalogue ────────────────────────────────────── */
    await page.getByLabel(/chercher une charge/i).fill('assurance')
    await page.waitForTimeout(400)
    await prend(page, 'gestes-03-catalogue-cherche')
    await page.getByLabel(/chercher une charge/i).fill('zzzz')
    await page.waitForTimeout(400)
    await prend(page, 'gestes-04-catalogue-vide')
    await page.getByLabel(/chercher une charge/i).fill('')

    /* ── Retirer une charge : elle part de TOUS les mois, et l'écran le dit.
           Elle s'archivait dès qu'elle avait une ligne, et les mois déjà
           ouverts la gardaient — un doublon retiré comptait encore 580 € en
           septembre. La confirmation annonce désormais ce qui va se passer. ── */
    let annonce = ''
    page.on('dialog', d => { annonce = d.message(); d.accept() })
    await ouvreLaLigne(page, 'Forfait mobile')
    await page.getByRole('button', { name: 'Retirer Forfait mobile' }).click()
    await expect(page.getByText(/« Forfait mobile » retirée/)).toBeVisible({ timeout: 15_000 })
    expect(annonce, 'la confirmation ne dit pas que la charge part de tous les mois')
      .toMatch(/disparaîtra de tous les mois/)
    const { data: restes } = await db.from('depense').select('mois, confirme_le, regle_le')
      .eq('household_id', foyer.householdId).eq('libelle', 'Forfait mobile')
    expect((restes ?? []).filter(l => !l.confirme_le && !l.regle_le),
      'un mois ouvert garde encore la charge retirée').toEqual([])
    await prend(page, 'gestes-05-charge-retiree')
  })

  test('les libellés et les montants poussés jusqu’aux bornes', async ({ page }) => {
    /* L'amorce sème un libellé de 75 caractères et un montant à sept chiffres,
       les deux au maximum de ce que la base accepte. Une carte, un total et un
       virement les portent-ils sans casser ? */
    await connecte(page, foyer.email)
    await page.goto('/charges')
    await expect(page.getByText(/Crédit immobilier de la résidence/))
      .toBeVisible({ timeout: 15_000 })
    await prend(page, 'bornes-01-charges')

    await page.goto('/budget')
    await prend(page, 'bornes-02-budget')

    await page.goto('/')
    await prend(page, 'bornes-03-hub')
  })
})
