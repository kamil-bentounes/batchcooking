/**
 * Lecture de robots.txt selon la RFC 9309 : groupes, jokers, `Allow`, plus long
 * motif gagnant. Partagé par l'ingestion, la sonde et la relecture des photos.
 */
import { describe, expect, it } from 'vitest'
import { autorise, lireRobots } from '../src/sitemap.ts'

const ok = (txt: string, chemin: string) => autorise(chemin, lireRobots(txt))

describe('robots.txt : les règles simples (comportement d’avant)', () => {
  it('un préfixe interdit, le reste est permis', () => {
    const t = 'User-agent: *\nDisallow: /interdit'
    expect(ok(t, '/interdit/2')).toBe(false)
    expect(ok(t, '/recette/1')).toBe(true)
  })

  it('un Disallow vide n’interdit rien', () => {
    expect(ok('User-agent: *\nDisallow:', '/n-importe-quoi')).toBe(true)
  })

  it('pas de robots.txt : tout est permis', () => {
    expect(autorise('/x', lireRobots(null))).toBe(true)
    expect(lireRobots(null).present).toBe(false)
  })

  it('les sitemaps se lisent hors de tout groupe, et le Crawl-delay dans le groupe', () => {
    const r = lireRobots('Sitemap: https://a.fr/s.xml\nUser-agent: *\nCrawl-delay: 5\nDisallow: /x')
    expect(r.sitemaps).toEqual(['https://a.fr/s.xml'])
    expect(r.delai).toBe(5)
    expect(r.interdits).toEqual(['/x'])
  })

  it('les commentaires et les fins de ligne Windows ne gênent pas', () => {
    const t = 'User-agent: * # tout le monde\r\nDisallow: /prive # chut\r\n'
    expect(ok(t, '/prive/a')).toBe(false)
  })

  it('un groupe d’un autre robot ne nous concerne pas', () => {
    expect(ok('User-agent: GPTBot\nDisallow: /', '/recette/1')).toBe(true)
  })
})

describe('robots.txt : les jokers', () => {
  it('`*` remplace n’importe quoi : /*/commentaires', () => {
    const t = 'User-agent: *\nDisallow: /*/commentaires'
    expect(ok(t, '/recette/12/commentaires')).toBe(false)
    expect(ok(t, '/a/commentaires/x')).toBe(false)
    expect(ok(t, '/recette/12')).toBe(true)
  })

  it('`$` ancre la fin : /x.aspx$', () => {
    const t = 'User-agent: *\nDisallow: /x.aspx$'
    expect(ok(t, '/x.aspx')).toBe(false)
    expect(ok(t, '/x.aspx?a=1')).toBe(true)
    expect(ok(t, '/x.aspx/suite')).toBe(true)
  })

  it('`*` seul en fin de motif ne change rien au préfixe', () => {
    expect(ok('User-agent: *\nDisallow: /photos*', '/photos/a.jpg')).toBe(false)
  })

  it('les caractères spéciaux d’une expression régulière restent littéraux', () => {
    const t = 'User-agent: *\nDisallow: /a.b+c(d)'
    expect(ok(t, '/a.b+c(d)')).toBe(false)
    expect(ok(t, '/aXb+c(d)')).toBe(true)
  })
})

describe('robots.txt : la chaîne de requête compte', () => {
  it('/priv? interdit /priv?x=1 mais pas /priv', () => {
    const t = 'User-agent: *\nDisallow: /priv?'
    expect(ok(t, '/priv?x=1')).toBe(false)
    expect(ok(t, '/priv')).toBe(true)
  })

  it('un motif avec `=` vise un paramètre précis', () => {
    const t = 'User-agent: *\nDisallow: /*?print=1'
    expect(ok(t, '/recette/1?print=1')).toBe(false)
    expect(ok(t, '/recette/1?page=2')).toBe(true)
  })
})

describe('robots.txt : Allow et le plus long motif', () => {
  it('un Allow plus long que le Disallow l’emporte', () => {
    const t = 'User-agent: *\nDisallow: /recettes\nAllow: /recettes/publiques'
    expect(ok(t, '/recettes/privees/1')).toBe(false)
    expect(ok(t, '/recettes/publiques/1')).toBe(true)
  })

  it('un Disallow plus long que l’Allow l’emporte', () => {
    const t = 'User-agent: *\nAllow: /a\nDisallow: /a/b'
    expect(ok(t, '/a/b/c')).toBe(false)
    expect(ok(t, '/a/c')).toBe(true)
  })

  it('à longueur égale, Allow gagne', () => {
    expect(ok('User-agent: *\nDisallow: /a\nAllow: /a', '/a/b')).toBe(true)
  })

  it('l’ordre des lignes n’y change rien', () => {
    expect(ok('User-agent: *\nAllow: /a/b\nDisallow: /a', '/a/b/c')).toBe(true)
    expect(ok('User-agent: *\nDisallow: /a\nAllow: /a/b', '/a/b/c')).toBe(true)
  })

  it('un Allow vide est ignoré', () => {
    expect(ok('User-agent: *\nAllow:\nDisallow: /a', '/a/x')).toBe(false)
  })

  it('les jokers comptent dans la longueur du motif', () => {
    const t = 'User-agent: *\nDisallow: /*\nAllow: /recette/*/photo'
    expect(ok(t, '/recette/12/photo')).toBe(true)
    expect(ok(t, '/autre')).toBe(false)
  })
})

describe('robots.txt : le groupe qui nous vise', () => {
  const t = [
    'User-agent: *',
    'Disallow: /',
    '',
    'User-agent: batchcooking-perso',
    'Disallow: /prive',
    'Crawl-delay: 3',
  ].join('\n')

  it('notre groupe passe avant `*`, même placé après', () => {
    expect(ok(t, '/recette/1')).toBe(true)
    expect(ok(t, '/prive/1')).toBe(false)
  })

  it('et le groupe `*` n’y est pas ajouté : on prend l’un OU l’autre', () => {
    const r = lireRobots(t)
    expect(r.interdits).toEqual(['/prive'])
    expect(r.delai).toBe(3)
  })

  it('notre jeton se reconnaît sans tenir compte de la casse ni de la version', () => {
    expect(ok('User-agent: BatchCooking-Perso/1.0\nDisallow: /a\n\nUser-agent: *\nDisallow:', '/a/x')).toBe(false)
  })

  it('notre groupe placé avant `*`', () => {
    const avant = 'User-agent: batchcooking-perso\nDisallow: /a\n\nUser-agent: *\nDisallow: /b'
    expect(ok(avant, '/a')).toBe(false)
    expect(ok(avant, '/b')).toBe(true)
  })

  it('notre groupe qui n’interdit rien libère ce que `*` interdisait', () => {
    expect(ok('User-agent: *\nDisallow: /\n\nUser-agent: batchcooking-perso\nDisallow:', '/x')).toBe(true)
  })

  it('plusieurs user-agent d’affilée partagent les mêmes règles', () => {
    const g = 'User-agent: Googlebot\nUser-agent: batchcooking-perso\nDisallow: /x\n\nUser-agent: *\nDisallow:'
    expect(ok(g, '/x/1')).toBe(false)
  })

  it('`*` suivi d’un autre user-agent garde ses règles', () => {
    const g = 'User-agent: *\nUser-agent: Googlebot\nDisallow: /x'
    expect(ok(g, '/x/1')).toBe(false)
  })

  it('deux groupes à notre nom se cumulent', () => {
    const g = 'User-agent: batchcooking-perso\nDisallow: /a\n\nUser-agent: batchcooking-perso\nDisallow: /b'
    expect(ok(g, '/a')).toBe(false)
    expect(ok(g, '/b')).toBe(false)
    expect(ok(g, '/c')).toBe(true)
  })

  it('un autre jeton qui contient le nôtre n’est pas le nôtre', () => {
    expect(ok('User-agent: batchcooking-perso-pro\nDisallow: /\n\nUser-agent: *\nDisallow:', '/x')).toBe(true)
  })
})

const chrono = <T>(f: () => T): { v: T; ms: number } => {
  const t = performance.now()
  const v = f()
  return { v, ms: performance.now() - t }
}

describe('robots.txt : un robots.txt hostile ne bloque pas la relecture', () => {
  it('douze `*a` d’affilée sur 40 caractères : linéaire, pas exponentiel', () => {
    const t = `User-agent: *\nDisallow: /${'*a'.repeat(12)}*b`
    const r = lireRobots(t)
    const { v, ms } = chrono(() => autorise(`/${'a'.repeat(40)}`, r))
    expect(v).toBe(true)
    expect(ms).toBeLessThan(50)
    // Et le même motif trouve bien son `b` quand il y est.
    expect(autorise(`/${'a'.repeat(40)}b`, r)).toBe(false)
  })

  it('vingt `*a` sur un chemin de 5 000 caractères : borné aussi', () => {
    const r = lireRobots(`User-agent: *\nDisallow: /${'*a'.repeat(20)}*b$`)
    const { v, ms } = chrono(() => autorise(`/${'a'.repeat(5000)}`, r))
    expect(v).toBe(true)
    expect(ms).toBeLessThan(200)
  })

  it('500 Ko de règles (18 000 et plus), 1 400 appels : moins d’une seconde', () => {
    let gros = 'User-agent: *\n'
    for (let i = 0; gros.length < 500 * 1024; i++) gros += `Disallow: /rep${i}/*/page$\n`
    const r = lireRobots(gros)
    expect(r.regles.length).toBeGreaterThan(18000)
    const { v, ms } = chrono(() => {
      let permis = 0
      for (let k = 0; k < 1400; k++) if (autorise(`/recette/${k}-gratin-dauphinois`, r)) permis++
      return permis
    })
    expect(v).toBe(1400)
    expect(ms).toBeLessThan(1000)
    // Les règles se lisent bien : la première interdit, une qui n'existe pas non.
    expect(autorise('/rep0/x/page', r)).toBe(false)
    expect(autorise('/rep0/x/page?a=1', r)).toBe(true)
  })

  it('les mêmes règles donnent les mêmes réponses d’un appel à l’autre', () => {
    const r = lireRobots('User-agent: *\nDisallow: /a*c*e$\nAllow: /a*c*e/ok')
    for (let i = 0; i < 3; i++) {
      expect(autorise('/abcde', r)).toBe(false)
      expect(autorise('/abcde/ok', r)).toBe(true)
      expect(autorise('/abcdef', r)).toBe(true)
    }
  })
})

describe('robots.txt : les jokers, cas limites du filtre', () => {
  it.each([
    // [motif, chemin, correspond ?]
    ['/a*b', '/ab', true],
    ['/a*b', '/aXXb/c', true],
    ['/a*b', '/aXXc', false],
    ['/a*b*c', '/abc', true],
    ['/a*b*c', '/acb', false],
    ['/a*a*a', '/aa', false],
    ['/a*a*a', '/aaa', true],
    ['/**', '/x', true],
    ['/*', '/', true],
    ['/a**b', '/ab', true],
    ['/a*b$', '/aXb', true],
    ['/a*b$', '/aXbY', false],
    ['/a*b$', '/aXbb', true],
    ['/*b*b$', '/b', false],
    ['/*b*b$', '/bb', true],
    ['/a*$', '/a?x=1', true],
    ['/a$', '/a', true],
    ['/a$', '/ab', false],
    ['/$', '/', true],
    ['/$', '/a', false],
    ['/*.php$', '/x.php', true],
    ['/*.php$', '/x.php?a=1', false],
    // Un `$` au milieu n'ancre rien : il se lit tel quel.
    ['/a$b', '/a$b', true],
    ['/a$b', '/a', false],
  ] as const)('%s sur %s → %s', (motif, chemin, attendu) => {
    expect(autorise(chemin, lireRobots(`User-agent: *\nDisallow: ${motif}`))).toBe(!attendu)
  })
})

describe('robots.txt : motif et chemin normalisés avant comparaison (RFC 9309 § 2.2.2)', () => {
  it('un motif non ASCII vise le chemin tel que l’URL l’encode', () => {
    const t = 'User-agent: *\nDisallow: /café'
    expect(ok(t, '/caf%C3%A9/1')).toBe(false)
    expect(ok(t, '/café/1')).toBe(false)
    expect(ok(t, '/cafe/1')).toBe(true)
  })

  it('une lettre échappée dans le motif vaut la lettre : /a%62c vise /abc', () => {
    const t = 'User-agent: *\nDisallow: /a%62c'
    expect(ok(t, '/abc/2')).toBe(false)
    expect(ok(t, '/a%62c/2')).toBe(false)
    expect(ok(t, '/abd/2')).toBe(true)
  })

  it('la casse des chiffres hexadécimaux ne compte pas', () => {
    expect(ok('User-agent: *\nDisallow: /caf%c3%a9', '/caf%C3%A9/1')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /caf%C3%A9', '/caf%c3%a9/1')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /caf%c3%a9', '/café/1')).toBe(false)
  })

  it('%7E et ~ sont le même caractère', () => {
    expect(ok('User-agent: *\nDisallow: /%7Esmith', '/~smith/a')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /~smith', '/%7esmith/a')).toBe(false)
  })

  it('un caractère réservé échappé reste échappé : %2F n’est pas /, %3F n’est pas ?', () => {
    expect(ok('User-agent: *\nDisallow: /a%2Fb', '/a/b')).toBe(true)
    expect(ok('User-agent: *\nDisallow: /a%2fb', '/a%2Fb')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /a%3Fb', '/a?b')).toBe(true)
  })

  it('%2A n’est pas un joker et %24 n’est pas la fin du chemin', () => {
    expect(ok('User-agent: *\nDisallow: /a%2Ab', '/aXb')).toBe(true)
    expect(ok('User-agent: *\nDisallow: /a%2Ab', '/a%2Ab')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /a%24', '/a%24/suite')).toBe(false)
  })

  it('un % isolé reste lui-même', () => {
    expect(ok('User-agent: *\nDisallow: /100%', '/100%25')).toBe(false)
    expect(ok('User-agent: *\nDisallow: /100%', '/100%')).toBe(false)
  })

  it('la longueur d’un motif se compte une fois normalisé : l’Allow plus précis gagne', () => {
    const t = 'User-agent: *\nDisallow: /caf%C3%A9\nAllow: /café/carte'
    expect(ok(t, '/caf%C3%A9/carte')).toBe(true)
    expect(ok(t, '/caf%C3%A9/autre')).toBe(false)
  })
})
