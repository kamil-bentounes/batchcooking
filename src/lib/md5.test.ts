import { describe, expect, it } from 'vitest'
import { md5 } from './md5.ts'

/** Les vecteurs de la RFC 1321 (annexe A.5), plus quelques cas qui coupent les blocs de 64 octets. */
describe('md5', () => {
  it.each([
    ['', 'd41d8cd98f00b204e9800998ecf8427e'],
    ['a', '0cc175b9c0f1b6a831c399e269772661'],
    ['abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['message digest', 'f96b697d7cb7938d525a2f31aaf161d0'],
    ['abcdefghijklmnopqrstuvwxyz', 'c3fcd3d76192e4007dfb496cca67e13b'],
    ['ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 'd174ab98d277d9f5a5611c2c9f419d9f'],
    ['12345678901234567890123456789012345678901234567890123456789012345678901234567890',
      '57edf4a22be3c955ac49da2e2107b67a'],
  ])('« %s »', (entree, attendu) => {
    expect(md5(entree)).toBe(attendu)
  })

  /* Valeurs relevées sur `select md5(…)` de la base locale (Postgres 17, base UTF-8) ; le banc
     `tests/md5-base.test.ts` les recompare à la base à chaque passage. */
  it('deux uuid collés (72 caractères : ce que la base hache) tiennent sur deux blocs', () => {
    expect(md5('11111111-1111-1111-1111-11111111111122222222-2222-2222-2222-222222222222'))
      .toBe('47e7170d735f4df0fe69f563f353ccd3')
  })

  it('les caractères hors ASCII se hachent en UTF-8, comme Postgres', () => {
    expect(md5('é')).toBe('66ddcd97cfdeabb2f6fb8a999b4bc76f')
  })
})
