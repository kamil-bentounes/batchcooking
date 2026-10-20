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
