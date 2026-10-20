/**
 * Avant la PREMIÈRE requête à un hôte, on sait s'il est chez nous : `source_url`
 * est réécrivable par un foyer, donc rien de ce qu'elle désigne n'est de confiance.
 */
import { describe, expect, it } from 'vitest'
import { exempteLocal, hoteInterdit, urlRefusee } from '../src/relecture.ts'

describe('exempteLocal : l’essai local, jamais la prod', () => {
  it('en local, le domaine désigné est permis (au www. près), pas un autre', () => {
    expect(exempteLocal(false, ['127.0.0.1:9101'], '127.0.0.1:9101')).toBe(true)
    expect(exempteLocal(false, ['localhost:9101'], 'www.localhost:9101')).toBe(true)
    expect(exempteLocal(false, ['localhost:9101'], 'localhost:9102')).toBe(false)
    expect(exempteLocal(false, ['localhost:9101'], '169.254.169.254')).toBe(false)
    expect(exempteLocal(false, [], '127.0.0.1:9101')).toBe(false)
  })

  it.each([
    ['127.0.0.1:9101'], ['localhost:9101'], ['169.254.169.254'], ['10.0.0.1'],
  ])('avec --prod, %s n’est jamais exempté, même désigné par --domaine', h => {
    expect(exempteLocal(true, [h], h)).toBe(false)
  })
})

describe('hoteInterdit : un nom ou une adresse de chez nous', () => {
  it.each([
    // IPv4 : bouclage, privé, lien local, métadonnées, CGNAT, « ce réseau ».
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255',
    '172.16.0.1', '172.20.5.5', '172.31.255.255',
    '192.168.0.1', '192.168.255.255',
    '169.254.169.254', '169.254.0.1',
    '100.64.0.1', '100.100.100.200', '100.127.255.255',
    '0.0.0.0', '0.1.2.3',
    '224.0.0.1', '255.255.255.255',
    // IPv6.
    '::1', '::', '[::1]',
    'fc00::1', 'fd12:3456:789a::1', 'FD00::1',
    'fe80::1', 'febf::1', 'fe80::1%eth0',
    'ff02::1',
    '::ffff:10.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '[::ffff:a00:1]', '::ffff:169.254.169.254',
    '64:ff9b::7f00:1', '2002:7f00:1::1',
    // Noms qui n'existent que chez nous.
    'localhost', 'LOCALHOST.', 'localhost.', 'api.localhost', 'imprimante.local', 'db.internal', 'nas.lan',
    // IPv4 écrites de travers : décimal, octal, hexadécimal, formes courtes.
    '2130706433', '0x7f000001', '0x7f.1', '0x7f.0.0.1', '127.1', '017700000001', '0177.0.0.1',
    '167772161', '0xa.0.0.1', '3232235521', '2852039166',
    // Chiffres suivis de rien d'une adresse : ambigu, refusé.
    '256.1.1.1', '1.2.3.4.5', '08.0.0.1',
    // Vide.
    '',
  ])('refuse %j', h => {
    expect(hoteInterdit(h)).toEqual(expect.any(String))
  })

  it.each([
    'www.marmiton.org', 'cuisine.example.fr', 'a.fr', 'xn--caf-dma.fr', 'example.com.',
    '8.8.8.8', '1.1.1.1', '93.184.216.34', '172.15.0.1', '172.32.0.1', '100.63.255.255', '100.128.0.1',
    '169.253.0.1', '11.0.0.1', '192.167.0.1', '192.169.0.1', '223.255.255.255',
    '2606:4700:4700::1111', '2001:4860:4860::8888', '[2606:4700::1]',
    '::ffff:8.8.8.8', '::ffff:808:808',
    // Un nom qui COMMENCE par des chiffres n'est pas une adresse.
    '1password.com', '123.fr', '0x.fr', 'a.0x7f.fr',
  ])('laisse passer %j', h => {
    expect(hoteInterdit(h)).toBeNull()
  })

  it('un nom public qui se RÉSOUT vers une adresse de chez nous est refusé', () => {
    expect(hoteInterdit('www.exemple.fr', ['93.184.216.34', '10.0.0.5'])).toEqual(expect.stringContaining('10.0.0.5'))
    expect(hoteInterdit('www.exemple.fr', ['127.0.0.1'])).toEqual(expect.any(String))
    expect(hoteInterdit('www.exemple.fr', ['169.254.169.254'])).toEqual(expect.any(String))
    expect(hoteInterdit('www.exemple.fr', ['::1'])).toEqual(expect.any(String))
    expect(hoteInterdit('www.exemple.fr', ['fe80::1'])).toEqual(expect.any(String))
    expect(hoteInterdit('www.exemple.fr', ['::ffff:10.0.0.1'])).toEqual(expect.any(String))
  })

  it('un nom public qui se résout vers des adresses publiques passe', () => {
    expect(hoteInterdit('www.exemple.fr', ['93.184.216.34', '2606:2800:220:1::1'])).toBeNull()
  })

  it('une adresse résolue illisible est refusée : dans le doute, on ne frappe pas', () => {
    expect(hoteInterdit('www.exemple.fr', ['pas-une-adresse'])).toEqual(expect.any(String))
  })

  it('la raison nomme l’hôte', () => {
    expect(hoteInterdit('localhost')).toContain('localhost')
    expect(hoteInterdit('169.254.169.254')).toContain('169.254.169.254')
  })
})

describe('urlRefusee : schéma, identité, hôte avec port', () => {
  it.each([
    ['https://www.marmiton.org/recettes/x.aspx'],
    ['http://a.fr:8080/p'],
    ['https://8.8.8.8/p'],
    ['https://[2606:4700::1]/p'],
  ])('laisse passer %s', u => {
    expect(urlRefusee(u)).toBeNull()
  })

  it.each([
    ['file:///etc/passwd'],
    ['ftp://a.fr/x'],
    ['javascript:alert(1)'],
    ['gopher://a.fr/'],
    ['https://user:mdp@a.fr/'],
    ['https://user@a.fr/'],
    ['http://:mdp@a.fr/'],
    ['pas une adresse'],
    [''],
    ['http://169.254.169.254/latest/meta-data/'],
    ['http://localhost:8787/'],
    ['http://LOCALHOST./'],
    ['http://[::1]:80/'],
    ['http://[::ffff:10.0.0.1]/'],
    ['http://2130706433/'],
    ['http://0x7f.1/'],
    ['http://0177.0.0.1/'],
    ['http://127.1/'],
    ['http://10.0.0.1:9200/_cluster'],
  ])('refuse %s', u => {
    expect(urlRefusee(u)).toEqual(expect.any(String))
  })
})
