import { describe, expect, it } from 'vitest'
import { entierPositif, lireOptions, uuid } from './options.ts'

const spec = {
  '--prod': 'drapeau', '--sec': 'drapeau',
  '--limite': entierPositif, '--recette': uuid,
} as const
const ID = '3f2b8c1e-0a4d-4e7b-9c55-1d2e3f4a5b6c'

describe('lireOptions', () => {
  it('lit les drapeaux et les valeurs, séparées par un espace ou par « = »', () => {
    expect(lireOptions(['--prod', '--sec', '--limite', '20', `--recette=${ID}`], spec))
      .toEqual({ ok: true, options: { '--prod': true, '--sec': true, '--limite': 20, '--recette': ID } })
  })

  it('ne rend rien pour une option absente', () => {
    expect(lireOptions([], spec)).toEqual({ ok: true, options: {} })
  })

  it.each([
    [['--dry-run'], /inconnue.*--dry-run/],
    [['--prod', '--dry-run'], /inconnue/],
    [['--limite=5', '--sec=oui'], /--sec.*sans valeur/],
    [['--Sec'], /inconnue/],
    [['sec'], /inattendu/],
    [['--recette'], /--recette.*valeur/],
    [['--recette', '--sec'], /--recette.*valeur/],
    [['--recette='], /--recette.*valeur/],
    [['--limite'], /--limite.*valeur/],
    [['--limite', ''], /--limite.*valeur/],
    [['--limite', '0'], /--limite.*entier positif/],
    [['--limite=-3'], /--limite.*entier positif/],
    [['--limite', '1.5'], /--limite.*entier positif/],
    [['--limite', '20abc'], /--limite.*entier positif/],
    [['--limite', '1e3'], /--limite.*entier positif/],
    [['--limite', '99999999999999999999'], /--limite.*entier positif/],
    [['--recette', 'abc'], /--recette.*uuid/],
    [['--recette', `${ID}x`], /--recette.*uuid/],
    [['--limite', '5', '--limite', '6'], /deux fois/],
    [['--prod', '--prod'], /deux fois/],
  ])('refuse %j', (argv, motif) => {
    const r = lireOptions(argv as string[], spec)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.erreur).toMatch(motif)
  })
})
