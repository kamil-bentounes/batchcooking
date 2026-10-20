/**
 * La relecture des pages (R3) ne force rien : ce banc fixe ce qu'est un refus,
 * et quand on laisse un site tranquille.
 */
import { describe, expect, it } from 'vitest'
import {
  abandonne, cleSite, DELAI_MAX_S, estUnDefi, etatInvalide, hopSuivi, ISSUES_REGLEES, issueDe, lireArguments, lireBorne, MAX_OCTETS,
  pauseDe, PAUSE_MS, robotsDe,
} from '../src/relecture.ts'

describe('l’issue d’une page relue', () => {
  it.each([
    [200, true, 'https://a.fr/p.jpg', 'photo'],
    [200, true, null, 'sans-photo'],
    [200, false, null, 'sans-recette'],
    [404, false, null, 'disparue'],
    [410, false, null, 'disparue'],
    [401, false, null, 'refusee'],
    [403, false, null, 'refusee'],
    // Un 429 dit « arrête » : pas trois essais, le domaine est laissé tout de suite.
    [429, false, null, 'bloquee'],
    [503, false, null, 'refusee'],
    [500, false, null, 'erreur'],
    [502, false, null, 'erreur'],
    [0, false, null, 'erreur'],
    // Les bornes : 2xx est une réponse, tout le reste hors listes est une erreur.
    [199, false, null, 'erreur'],
    [204, true, null, 'sans-photo'],
    [299, false, null, 'sans-recette'],
    [300, false, null, 'erreur'],
    [301, false, null, 'erreur'],
    [400, false, null, 'erreur'],
    [499, false, null, 'erreur'],
  ] as const)('statut %i, recette %s, photo %s → %s', (statut, recette, photo, attendu) => {
    expect(issueDe(statut, recette, photo)).toBe(attendu)
  })
})

describe('un défi anti-robot, on s’arrête à la première réponse', () => {
  it('un 429 est « bloquee », quoi que dise le corps, même avec un Retry-After : aucun nouvel essai', () => {
    expect(issueDe(429, false, null)).toBe('bloquee')
    expect(issueDe(429, false, null, false)).toBe('bloquee')
    expect(issueDe(429, false, null, true)).toBe('bloquee')
  })

  it.each([401, 403, 503])('un %i qui porte la signature d’un défi est « bloquee »', statut => {
    expect(issueDe(statut, false, null, true)).toBe('bloquee')
  })

  it('sans signature, 401, 403 et 503 restent des refus ordinaires (seuil de trois)', () => {
    for (const statut of [401, 403, 503]) expect(issueDe(statut, false, null, false)).toBe('refusee')
    expect(issueDe(403, false, null)).toBe('refusee')
  })

  it('la signature ne change rien à une page qui répond : 200, 404, 500', () => {
    expect(issueDe(200, true, 'https://a.fr/p.jpg', true)).toBe('photo')
    expect(issueDe(404, false, null, true)).toBe('disparue')
    expect(issueDe(500, false, null, true)).toBe('erreur')
  })

  describe('estUnDefi : l’en-tête `cf-mitigated`, ou le corps d’un 403/503', () => {
    it('l’en-tête cf-mitigated suffit sur un refus', () => {
      expect(estUnDefi(403, true, null)).toBe(true)
      expect(estUnDefi(503, true, '')).toBe(true)
      expect(estUnDefi(401, true, null)).toBe(true)
    })

    it.each([
      '<title>Just a moment...</title>',
      '<title>Attention Required! | Cloudflare</title>',
      '<form id="challenge-form" action="/?__cf_chl_f_tk=abc">',
      '<script>window._cf_chl_opt={}</script>',
      'JUST A MOMENT',
    ])('un 403 dont le corps contient « %s »', corps => {
      expect(estUnDefi(403, false, corps)).toBe(true)
      expect(estUnDefi(503, false, corps)).toBe(true)
    })

    it('un 403 ordinaire n’est pas un défi', () => {
      expect(estUnDefi(403, false, null)).toBe(false)
      expect(estUnDefi(403, false, '')).toBe(false)
      expect(estUnDefi(403, false, '<h1>Forbidden</h1>You do not have access.')).toBe(false)
    })

    it('le corps d’un statut qui n’est pas un refus ne dit rien : une recette qui parle de défi', () => {
      expect(estUnDefi(200, false, 'Un moment : just a moment pour la sauce')).toBe(false)
      expect(estUnDefi(404, false, 'Just a moment')).toBe(false)
      expect(estUnDefi(200, true, null)).toBe(false)
    })
  })

  it('« bloquee » arrête le domaine dès la première, au milieu de pages qui passaient', () => {
    expect(abandonne(['bloquee'])).toBe(true)
    expect(abandonne(['photo', 'photo', 'bloquee'])).toBe(true)
    expect(abandonne(['photo', 'sans-photo'])).toBe(false)
  })
})

describe('laisser un site tranquille', () => {
  it('abandonne après trois refus de suite', () => {
    expect(abandonne(['photo', 'refusee', 'sans-recette', 'refusee'])).toBe(true)
  })

  it('n’abandonne pas quand une page passe entre deux refus', () => {
    expect(abandonne(['refusee', 'refusee', 'photo', 'refusee'])).toBe(false)
  })

  it('n’abandonne pas pour des pages disparues', () => {
    expect(abandonne(['disparue', 'disparue', 'disparue'])).toBe(false)
  })

  it('n’abandonne pas avant trois pages', () => {
    expect(abandonne(['refusee', 'refusee'])).toBe(false)
  })

  it('abandonne après cinq erreurs de suite : un site en panne n’est pas martelé', () => {
    expect(abandonne(['photo', 'erreur', 'erreur', 'erreur', 'erreur', 'erreur'])).toBe(true)
  })

  it('n’abandonne pas après quatre erreurs de suite', () => {
    expect(abandonne(['erreur', 'erreur', 'erreur', 'erreur'])).toBe(false)
  })

  it('n’abandonne pas quand une page passe entre les erreurs', () => {
    expect(abandonne(['erreur', 'erreur', 'erreur', 'photo', 'erreur', 'erreur'])).toBe(false)
  })

  it('ne mélange pas refus et erreurs : deux refus et trois erreurs ne font pas un abandon', () => {
    expect(abandonne(['refusee', 'refusee', 'erreur', 'erreur', 'erreur'])).toBe(false)
    expect(abandonne(['erreur', 'erreur', 'erreur', 'refusee', 'refusee'])).toBe(false)
  })
})

describe('le fichier d’état de la reprise', () => {
  const rec = { issue: 'photo', le: '2026-10-20T10:00:00.000Z' }

  it.each([
    [{}],
    [{ 'http://127.0.0.1:54321': {} }],
    [{ 'http://127.0.0.1:54321': { 'id-1': rec, 'id-2': { issue: 'interdite', le: 'x' } } }],
    [{ a: { 1: { issue: 'sans-photo' } }, b: {} }],
  ])('accepte un état bien formé : %j', etat => {
    expect(etatInvalide(etat)).toBeNull()
  })

  it.each([
    ['null', null],
    ['une chaîne', 'x'],
    ['un nombre', 3],
    ['true', true],
    ['un tableau vide', []],
    ['un tableau', [{ a: 1 }]],
    ['une base qui n’est pas un objet', { 'http://x': 'y' }],
    ['une base nulle', { 'http://x': null }],
    ['une base en tableau', { 'http://x': [] }],
    ['une fiche nulle', { 'http://x': { 'id-1': null } }],
    ['une fiche en chaîne', { 'http://x': { 'id-1': 'photo' } }],
    ['une fiche en tableau', { 'http://x': { 'id-1': [] } }],
    ['une fiche sans issue', { 'http://x': { 'id-1': { le: 'x' } } }],
    ['une issue qui n’est pas une chaîne', { 'http://x': { 'id-1': { issue: 3 } } }],
    ['une issue qui n’est pas une issue réglée', { 'http://x': { 'id-1': { issue: 'refusee' } } }],
    ['une date qui n’est pas une chaîne', { 'http://x': { 'id-1': { issue: 'photo', le: 5 } } }],
  ])('refuse %s, et le dit', (_nom, etat) => {
    expect(etatInvalide(etat)).toEqual(expect.any(String))
    expect(etatInvalide(etat)).not.toBe('')
  })

  it('le message dit où est la faute', () => {
    expect(etatInvalide({ 'http://x': { 'id-7': { issue: 'refusee' } } })).toContain('id-7')
    expect(etatInvalide({ 'http://x': 'y' })).toContain('http://x')
  })

  it('les issues réglées sont celles que la reprise saute', () => {
    expect([...ISSUES_REGLEES].sort()).toEqual(['disparue', 'interdite', 'photo', 'sans-photo'])
  })
})

describe('le robots.txt d’un domaine (RFC 9309)', () => {
  it.each([
    [200, 'lire'],
    // 401, 403 et 429 sont un refus, peut-être un défi : on ne contourne pas, le
    // domaine est laissé. (429 était « tout-permis » : abrogé.)
    [401, 'laisser'],
    [403, 'laisser'],
    [429, 'laisser'],
    [404, 'tout-permis'],
    [410, 'tout-permis'],
    [499, 'tout-permis'],
    [400, 'tout-permis'],
    [204, 'lire'],
    [299, 'lire'],
    [300, 'laisser'],
    [301, 'laisser'],
    [304, 'laisser'],
    [500, 'laisser'],
    [503, 'laisser'],
    [0, 'laisser'],
  ] as const)('statut %i → %s', (statut, attendu) => {
    expect(robotsDe(statut)).toBe(attendu)
  })
})

describe('le Crawl-delay a un plafond', () => {
  it('sans Crawl-delay, ou plus court que le nôtre, on garde nos 1 100 ms', () => {
    expect(pauseDe(null)).toBe(PAUSE_MS)
    expect(pauseDe(0)).toBe(PAUSE_MS)
    expect(pauseDe(1)).toBe(PAUSE_MS)
  })

  it('un Crawl-delay plus long l’emporte', () => {
    expect(pauseDe(5)).toBe(5000)
    expect(pauseDe(2.5)).toBe(2500)
  })

  it('jusqu’à 30 s compris', () => {
    expect(DELAI_MAX_S).toBe(30)
    expect(pauseDe(30)).toBe(30000)
  })

  it('au-delà, on laisse le domaine (null)', () => {
    expect(pauseDe(31)).toBeNull()
    expect(pauseDe(86400)).toBeNull()
  })
})

describe('lire un corps sans le lire tout entier', () => {
  const flux = (morceaux: Uint8Array[]) => new Response(new ReadableStream({
    start(c) { for (const m of morceaux) c.enqueue(m); c.close() },
  }))

  it('une petite page est lue en entier, accents compris', async () => {
    expect(await lireBorne(new Response('Émincez l’oignon'), 1000)).toBe('Émincez l’oignon')
  })

  it('coupe à la borne', async () => {
    const t = await lireBorne(flux([new Uint8Array(600).fill(97), new Uint8Array(600).fill(98)]), 1000)
    expect(t.length).toBe(1000)
    expect(t.endsWith('b')).toBe(true)
  })

  it('une page de 2,5 fois la borne est coupée à la borne', async () => {
    const gros = 'x'.repeat(Math.floor(MAX_OCTETS * 2.5))
    expect((await lireBorne(new Response(gros))).length).toBe(MAX_OCTETS)
  })

  it('un flux sans fin ne bloque pas, et il est annulé', async () => {
    let annule = false
    let envoyes = 0
    const infini = new Response(new ReadableStream({
      pull(c) { envoyes++; c.enqueue(new Uint8Array(64 * 1024).fill(97)) },
      cancel() { annule = true },
    }))
    const t = await lireBorne(infini, 200_000)
    expect(t.length).toBe(200_000)
    expect(annule).toBe(true)
    // Il n'en a pas été tiré beaucoup plus que la borne.
    expect(envoyes).toBeLessThan(10)
  })

  it('une réponse sans corps rend une chaîne vide', async () => {
    expect(await lireBorne(new Response(null, { status: 204 }))).toBe('')
  })
})

describe('suivre une redirection : seulement dans le même site', () => {
  const suit = (depuis: string, vers: string) => hopSuivi(depuis, vers)
  const url = (r: ReturnType<typeof hopSuivi>) => (r.ok ? r.url : null)

  it('le même hôte, chemin relatif ou absolu', () => {
    expect(url(suit('https://a.fr/x', '/y?z=1'))).toBe('https://a.fr/y?z=1')
    expect(url(suit('https://a.fr/x', 'https://a.fr/y'))).toBe('https://a.fr/y')
    expect(url(suit('https://a.fr/x/1', '2'))).toBe('https://a.fr/x/2')
  })

  it('l’alternance `www.` : le même site', () => {
    expect(url(suit('https://marmiton.org/x', 'https://www.marmiton.org/x'))).toBe('https://www.marmiton.org/x')
    expect(url(suit('https://www.marmiton.org/x', 'https://marmiton.org/x'))).toBe('https://marmiton.org/x')
  })

  it('http vers https sur le même hôte', () => {
    expect(url(suit('http://a.fr/x', 'https://a.fr/x'))).toBe('https://a.fr/x')
  })

  it.each([
    ['un autre site', 'https://b.fr/x'],
    ['un sous-domaine autre que www', 'https://img.a.fr/x'],
    ['un domaine qui finit pareil', 'https://evila.fr/x'],
    ['un autre port', 'https://a.fr:8443/x'],
    ['le bouclage', 'http://127.0.0.1:8787/x'],
    ['localhost', 'http://localhost/x'],
    ['le réseau privé', 'http://192.168.1.10/x'],
    ['la métadonnée du nuage', 'http://169.254.169.254/latest'],
    ['un schéma qui n’est pas http', 'file:///etc/passwd'],
    ['un schéma ftp', 'ftp://a.fr/x'],
    ['une adresse illisible', 'http://'],
  ])('refuse %s', (_nom, vers) => {
    expect(suit('https://a.fr/x', vers).ok).toBe(false)
  })

  it('un site local désigné reste lui-même : même hôte, même port', () => {
    expect(url(suit('http://127.0.0.1:8787/a', '/b'))).toBe('http://127.0.0.1:8787/b')
  })

  it('un site local désigné fait aussi l’alternance `www.`', () => {
    expect(url(suit('http://localhost:8787/a', 'http://www.localhost:8787/b'))).toBe('http://www.localhost:8787/b')
  })

  it('un site local ne mène pas à un autre port, ni à localhost', () => {
    expect(suit('http://127.0.0.1:8787/a', 'http://127.0.0.1:9999/b').ok).toBe(false)
    expect(suit('http://127.0.0.1:8787/a', 'http://localhost:8787/b').ok).toBe(false)
  })

  it('un site public ne mène pas à une adresse privée', () => {
    expect(suit('https://a.fr/x', 'http://10.0.0.1/x').ok).toBe(false)
    expect(suit('https://a.fr/x', 'http://[::1]/x').ok).toBe(false)
    expect(suit('https://a.fr/x', 'http://[fe80::1]/x').ok).toBe(false)
    expect(suit('https://a.fr/x', 'http://[fd00::1]/x').ok).toBe(false)
    expect(suit('https://a.fr/x', 'http://[::ffff:127.0.0.1]/x').ok).toBe(false)
  })

  it('une identité dans l’adresse n’est pas suivie', () => {
    expect(suit('https://a.fr/x', 'https://u:p@a.fr/x').ok).toBe(false)
  })
})

describe('la clé du rythme : le site, pas le nom', () => {
  it('`a.fr` et `www.a.fr` comptent pour un seul site, le port et le reste non', () => {
    expect(cleSite('www.A.fr')).toBe('a.fr')
    expect(cleSite('a.fr')).toBe(cleSite('www.a.fr'))
    expect(cleSite('a.fr:8787')).not.toBe(cleSite('a.fr'))
    expect(cleSite('img.a.fr')).not.toBe(cleSite('a.fr'))
  })
})

describe('les arguments de la ligne de commande', () => {
  const lis = (...a: string[]) => lireArguments(a)

  it('sans rien : local, pas à sec, sans limite, sans domaine', () => {
    expect(lis()).toEqual({ prod: false, sec: false, tout: false, limite: null, domaines: [] })
  })

  it('un `--` seul, que npm laisse parfois passer, est ignoré', () => {
    expect(lis('--', '--limite', '3')).toMatchObject({ limite: 3 })
  })

  it('les drapeaux', () => {
    expect(lis('--prod', '--sec', '--tout')).toMatchObject({ prod: true, sec: true, tout: true })
  })

  it('`--cle valeur` et `--cle=valeur` disent la même chose', () => {
    expect(lis('--limite', '20', '--domaine', 'a.fr')).toMatchObject({ limite: 20, domaines: ['a.fr'] })
    expect(lis('--limite=20', '--domaine=a.fr')).toMatchObject({ limite: 20, domaines: ['a.fr'] })
  })

  it('--domaine se répète, et se met en minuscules', () => {
    expect(lis('--domaine=A.fr', '--domaine', 'b.fr:8787')).toMatchObject({ domaines: ['a.fr', 'b.fr:8787'] })
  })

  it.each([
    ['--limite=abc'], ['--limite', 'abc'], ['--limite=0'], ['--limite=-3'], ['--limite=1.5'],
    ['--limite='], ['--limite'], ['--limite', '--prod'],
    ['--domaine'], ['--domaine='], ['--domaine', '--sec'], ['--domaine=a b'], ['--domaine=http://a.fr'],
    ['--prd'], ['--limit=20'], ['20'], ['--prod=1'], ['--sec=oui'],
  ])('refuse %j', (...a) => {
    expect('erreur' in lireArguments(a)).toBe(true)
  })

  it('l’erreur dit ce qui est illisible', () => {
    expect(lis('--limite=abc')).toEqual({ erreur: expect.stringContaining('--limite') })
    expect(lis('--prd')).toEqual({ erreur: expect.stringContaining('--prd') })
  })
})
