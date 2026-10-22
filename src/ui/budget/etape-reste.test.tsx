/**
 * L'étape 3 de la clôture (3.4), rendue en chaîne : l'argent — X les prévus, Y
 * l'écart, les soldes d'année, le reste négatif — avec des centimes impairs, et
 * chaque état de lecture. Aucun faux chiffre avant que tout soit lu (voir `ecran.ts`).
 * Les montants portent l'espace fine insécable (U+202F) de `toLocaleString('fr-FR')`.
 */
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Poche, Solde } from '../../lib/donnees/budget.ts'
import { recapCloture, type Ligne, type RecapCloture, type Saisie } from '../../lib/budget/mois.ts'
import type { ChoixDuReste } from '../../lib/budget/etapes.ts'
import { VueReste } from './VueReste.tsx'

const FINE = ' '
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/[ \t\n\r]+/g, ' ').trim()
const eteint = (attrs: string) => /\bdisabled(=|\s|$)/.test(attrs)
const bouton = (h: string, role: string, nom: RegExp | string): string => {
  const m = [...h.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)]
    .find(x => x[1].includes(`role="${role}"`)
      && (typeof nom === 'string' ? texte(x[2]).startsWith(nom) : nom.test(texte(x[2]))))
  if (!m) throw new Error(`pas de « ${nom} » dans ${texte(h)}`)
  return m[1]
}
const coche = (attrs: string) => /aria-checked="true"/.test(attrs)

const urgence: Poche = { id: 'p1', libelle: 'Urgence', genre: 'urgence', objectif_cents: 4_000_00,
                         echeance: null, cle: null }
const vacances: Poche = { id: 'p2', libelle: 'Vacances', genre: 'projet', objectif_cents: null,
                          echeance: null, cle: null }

/* Une charge fixe de 801,01 € et une ligne au fil du mois de 800,01 €, toutes deux à moi. */
const loyer: Ligne = { id: 'l', charge_id: 'cl', libelle: 'Loyer', montant_cents: 801_01,
  montant_prevu_cents: 801_01, facon: 'fixe', confirme_le: null, regularise_annee: null,
  parts: [{ user_profile_id: 'u1', part_cents: 801_01 }] }
const courses: Ligne = { id: 'c', charge_id: 'cc', libelle: 'Courses', montant_cents: 800_01,
  montant_prevu_cents: 800_01, facon: 'au_fil', confirme_le: null, regularise_annee: null,
  parts: [{ user_profile_id: 'u1', part_cents: 800_01 }] }
const dite = (cents: number): Saisie[] =>
  [{ id: 's', depense_id: 'c', fait_le: '2026-10-10', montant_cents: cents, saisi_par: 'u1' }]

const recapDe = (revenu: number, soldes = 0): RecapCloture => recapCloture({
  revenu, lignes: [loyer, courses], saisies: dite(642_30), moi: 'u1',
  factures: new Map(), rien: new Set(), soldes,
})

const choix = (c: Partial<ChoixDuReste> = {}): ChoixDuReste =>
  ({ garder: false, poche: 'p1', combien: null, ...c })

type Props = Parameters<typeof VueReste>[0]
const props = (p: Partial<Props> = {}): Props => ({
  recap: recapDe(3_000_01), soldes: [], mois: '2026-10-01', poches: [urgence], choix: choix(),
  changer: () => {}, dessus: 0, ...p,
})
const vue = (p: Partial<Props> = {}) => renderToStaticMarkup(<VueReste {...props(p)} />)

describe('le récap des scénarios : de quoi parlent les tests', () => {
  it('X + Y fait le chiffre, au centime', () => {
    /* 3 000,01 − 801,01 − 800,01 = 1 398,99 prévus ; 800,01 − 642,30 = 157,71 de moins dépensés. */
    expect(recapDe(3_000_01)).toEqual({ prevus: 1_398_99, ecart: 157_71, reste: 1_556_70 })
  })
})

describe('l’argent de la carte encre — centimes impairs', () => {
  it('« Il te reste », le chiffre, X puis Y', () => {
    const t = texte(vue())
    expect(t).toContain('Il te reste ce mois-ci')
    expect(t).toContain(`1${FINE}556,70 €`)
    expect(t).toContain(`1${FINE}398,99 € prévus, plus 157,71 € dépensés en moins`)
  })

  it('un écart négatif : « moins Y dépensés en plus », et X + Y fait toujours le chiffre', () => {
    const recap = recapCloture({ revenu: 3_000_01, lignes: [loyer, courses], saisies: dite(900_02),
      moi: 'u1', factures: new Map(), rien: new Set(), soldes: 0 })
    expect(recap).toEqual({ prevus: 1_398_99, ecart: -100_01, reste: 1_298_98 })
    const t = texte(vue({ recap }))
    expect(t).toContain(`1${FINE}298,98 €`)
    expect(t).toContain(`1${FINE}398,99 € prévus, moins 100,01 € dépensés en plus`)
  })

  it('un reste négatif : « Il te manque », la valeur absolue, jamais « Il te reste −… »', () => {
    const recap = recapDe(500_01)
    expect(recap.reste).toBe(-943_30)
    const t = texte(vue({ recap }))
    expect(t).toContain('Il te manque ce mois-ci')
    expect(t).not.toContain('Il te reste ce mois-ci')
    expect(t).toContain('943,30 €')
    expect(t).not.toContain('−943')
    /* X est négatif : il garde son signe. */
    expect(t).toContain(`−1${FINE}101,01 € prévus, plus 157,71 € dépensés en moins`)
  })

  it('un reste de 0 € : « Il te reste ce mois-ci 0 € »', () => {
    const recap = { prevus: 100_00, ecart: -100_00, reste: 0 }
    const t = texte(vue({ recap }))
    expect(t).toContain('Il te reste ce mois-ci 0 €')
  })

  it('les mots seuls : pas de ligne de solde quand il n’y en a pas', () => {
    expect(texte(vue({ soldes: [] }))).not.toMatch(/non dépensés|de plus que prévu en/)
  })
})

describe('les soldes d’année — avant le chiffre, et dans X', () => {
  const entretien = (cents: number, annee = 2026): Solde =>
    ({ charge: 'ce', libelle: 'Entretien auto', annee, cents })

  it('un solde négatif revient ; un positif dépasse — chacun sur sa ligne, avant le chiffre', () => {
    const soldes = [entretien(-166_68), { ...entretien(83_34, 2025), charge: 'cf', libelle: 'Assurance' }]
    const h = vue({ soldes })
    const t = texte(h)
    expect(t).toContain('Entretien auto : 166,68 € non dépensés en 2026 reviennent.')
    expect(t).toContain('Assurance : 83,34 € de plus que prévu en 2025.')
    expect(t.indexOf('Entretien auto')).toBeLessThan(t.indexOf('Il te reste ce mois-ci'))
    expect(t.indexOf('Assurance')).toBeLessThan(t.indexOf('Il te reste ce mois-ci'))
  })

  it('un solde à 0 ne dit rien', () => {
    const t = texte(vue({ soldes: [entretien(0)] }))
    expect(t).not.toContain('Entretien auto')
  })

  it('les soldes comptent dans X : X + Y fait le chiffre, soldes compris', () => {
    /* Le solde de −166,68 € rend 166,68 € au mois : X monte d'autant. */
    const recap = recapDe(3_000_01, -166_68)
    expect(recap).toEqual({ prevus: 1_565_67, ecart: 157_71, reste: 1_723_38 })
    const t = texte(vue({ recap, soldes: [entretien(-166_68)] }))
    expect(t).toContain(`1${FINE}723,38 €`)
    expect(t).toContain(`1${FINE}565,67 € prévus, plus 157,71 € dépensés en moins`)
  })

  it('un solde positif en retire : X baisse', () => {
    const recap = recapDe(3_000_01, 83_34)
    expect(recap.prevus).toBe(1_315_65)
    expect(texte(vue({ recap, soldes: [entretien(83_34)] })))
      .toContain(`1${FINE}315,65 € prévus, plus 157,71 € dépensés en moins`)
  })

  it('deux années de la même charge ne se confondent pas', () => {
    const t = texte(vue({ soldes: [entretien(-10_01, 2025), entretien(20_02, 2026)] }))
    expect(t).toContain('Entretien auto : 10,01 € non dépensés en 2025 reviennent.')
    expect(t).toContain('Entretien auto : 20,02 € de plus que prévu en 2026.')
  })
})

describe('les soldes d’année à deux — ta part n’est pas lisible, donc pas de chiffre faux', () => {
  /* `apercu_des_soldes` ne rend que le total du foyer ; la base répartit selon ce que chacun a
     porté sur l'année. Le récap est « avant les soldes » et le dit. */
  const entretien: Solde = { charge: 'ce', libelle: 'Entretien auto', annee: 2026, cents: -166_68 }
  const incertain = () => ({ ...recapDe(3_000_01), incertain: true as const })
  const inc = (p: Partial<Props> = {}) =>
    vue({ recap: incertain(), soldes: [entretien], dessus: 800_01, ...p })

  it('le chiffre se dit « avant les soldes d’année », avec une phrase sur ce qui s’y ajoute', () => {
    const t = texte(inc())
    expect(t).toContain('Il te reste, avant les soldes d’année')
    expect(t).not.toContain('Il te reste ce mois-ci')
    expect(t).toContain(`1${FINE}556,70 €`)
    expect(t).toContain('selon ce que chacun a mis de côté')
  })

  it('les lignes de solde (le total du foyer, ce que la base dit) restent', () => {
    expect(texte(inc())).toContain('Entretien auto : 166,68 € non dépensés en 2026 reviennent.')
  })

  it('reste négatif avant les soldes : « Il te manque, avant les soldes d’année »', () => {
    const t = texte(inc({ recap: { ...recapDe(500_01), incertain: true } }))
    expect(t).toContain('Il te manque, avant les soldes d’année')
  })

  it('aucun « passe à » ni « Au plus » : leur chiffre dépendrait de ta part', () => {
    const t = texte(inc())
    expect(t).not.toContain('passe à')
    expect(t).not.toContain('Au plus')
    expect(texte(inc({ choix: choix({ combien: '5000' }) }))).not.toContain('Au plus')
  })

  it('le champ ne pré-remplit pas un chiffre estimé : « Tout ce qui reste » en filigrane', () => {
    const h = inc()
    expect(h).toContain('value=""')
    expect(h).not.toContain('value="1556,70"')
    expect(h).toContain('placeholder="Tout ce qui reste"')
  })

  it('un reste à 0 ou négatif avant les soldes ne ferme pas « Le mettre de côté »', () => {
    const h = inc({ recap: { prevus: 100_00, ecart: -100_00, reste: 0, incertain: true } })
    expect(eteint(bouton(h, 'radio', 'Le mettre de côté'))).toBe(false)
    expect(texte(h)).not.toContain('Il ne reste rien à mettre de côté')
  })

  it('« le garder » ne promet pas « Il reste disponible » : on ne sait pas s’il reste quelque chose', () => {
    expect(texte(inc({ choix: choix({ garder: true }) }))).not.toContain('Il reste disponible')
  })

  it('sûr (pas incertain), rien ne change : « Il te reste ce mois-ci », le champ pré-rempli', () => {
    const h = vue({ soldes: [entretien] })
    expect(texte(h)).toContain('Il te reste ce mois-ci')
    expect(h).toContain('value="1556,70"')
    expect(texte(h)).not.toContain('avant les soldes')
  })
})

describe('avant que tout soit lu — aucun faux chiffre', () => {
  const FAUX = /Il te reste|Il te manque|0 €|passe à|prévus|Le mettre de côté|Clôtur/

  it('récap pas calculable : « Un instant… » seul', () => {
    const t = texte(vue({ recap: null }))
    expect(t).toContain('Un instant…')
    expect(t).not.toMatch(FAUX)
  })

  it('soldes pas lus : « Un instant… » — pas un reste à 0 € de soldes', () => {
    const t = texte(vue({ soldes: undefined }))
    expect(t).toContain('Un instant…')
    expect(t).not.toMatch(FAUX)
  })

  it('poches pas lues : « Un instant… » — ni « Le mettre de côté » grisé à tort', () => {
    const t = texte(vue({ poches: undefined }))
    expect(t).toContain('Un instant…')
    expect(t).not.toMatch(FAUX)
  })

  it('une panne : sa phrase, jamais un chiffre', () => {
    for (const manque of [{ recap: null }, { soldes: undefined }, { poches: undefined }] as Partial<Props>[]) {
      const h = vue({ ...manque, panne: new Error('apercu_des_soldes : non autorisé') })
      expect(texte(h)).toContain('Je n’ai pas pu lire le budget : apercu_des_soldes : non autorisé')
      expect(texte(h)).not.toMatch(FAUX)
      expect(h).toContain('role="alert"')
    }
  })

  it('la consigne de l’étape reste dite pendant l’attente', () => {
    expect(texte(vue({ recap: null }))).toContain('Tu décides où va l’argent qui n’a pas servi.')
  })
})

describe('« Le mettre de côté » — la phrase de la poche', () => {
  it('par défaut, tout ce qui reste : « Ton épargne d’urgence passe à … sur 4 000 € »', () => {
    const t = texte(vue({ dessus: 800_01 }))
    /* 800,01 déjà là + 1 556,70 qui part. */
    expect(t).toContain(`Ton épargne d’urgence passe à 2${FINE}356,71 € sur 4${FINE}000 €.`)
  })

  it('un montant tapé : la phrase le suit, au centime', () => {
    const t = texte(vue({ dessus: 800_01, choix: choix({ combien: '316,81' }) }))
    expect(t).toContain('passe à 1' + FINE + '116,82 €')
  })

  it('tapé au-delà du reste : la phrase compte le reste, et l’écran le dit', () => {
    const t = texte(vue({ dessus: 0, choix: choix({ combien: '5000' }) }))
    expect(t).toContain(`passe à 1${FINE}556,70 €`)
    expect(t).toContain(`Au plus 1${FINE}556,70 € : c’est tout ce qui reste.`)
  })

  it('la poche vide : « passe à X » est le montant seul — un cumul de 0 est un cumul lu', () => {
    expect(texte(vue({ dessus: 0 }))).toContain(`passe à 1${FINE}556,70 €`)
  })

  it('un cumul négatif se dit avec son signe', () => {
    const t = texte(vue({ dessus: -2_000_00, poches: [{ ...urgence, objectif_cents: null }] }))
    expect(t).toContain('passe à −443,30 €.')
  })

  it('cumul pas encore lu : pas de « passe à », jamais un montant sans ce que la poche porte', () => {
    const t = texte(vue({ dessus: 'chargement' }))
    expect(t).toContain('Urgence : solde en cours de lecture…')
    expect(t).not.toContain('passe à')
  })

  it('cumul illisible : pas de « passe à », une phrase qui le dit', () => {
    const t = texte(vue({ dessus: 'illisible' }))
    expect(t).toContain('Urgence : solde illisible.')
    expect(t).not.toContain('passe à')
  })

  it('une saisie illisible : aucune phrase de poche', () => {
    const t = texte(vue({ choix: choix({ combien: 'abc' }) }))
    expect(t).not.toContain('passe à')
  })

  it('une poche de projet porte son nom, sans objectif ni « sur »', () => {
    const t = texte(vue({ poches: [vacances], choix: choix({ poche: 'p2' }), dessus: 120_01 }))
    expect(t).toContain(`Vacances passe à 1${FINE}676,71 €.`)
  })
})

describe('les deux choix', () => {
  it('par défaut : « Le mettre de côté » coché, « Le garder » non', () => {
    const h = vue()
    expect(coche(bouton(h, 'radio', 'Le mettre de côté'))).toBe(true)
    expect(coche(bouton(h, 'radio', 'Le garder sur le compte'))).toBe(false)
    expect(texte(h)).not.toContain('Il reste disponible pour')
  })

  it('« Le garder » : « Il reste disponible pour novembre. », et plus de champ', () => {
    const h = vue({ choix: choix({ garder: true }) })
    expect(coche(bouton(h, 'radio', 'Le garder sur le compte'))).toBe(true)
    expect(texte(h)).toContain('Il reste disponible pour novembre.')
    expect(h).not.toContain('<input')
    expect(texte(h)).not.toContain('passe à')
  })

  it('en décembre, « le garder » dit janvier', () => {
    const t = texte(vue({ mois: '2026-12-01', choix: choix({ garder: true }) }))
    expect(t).toContain('Il reste disponible pour janvier.')
  })

  it('sans poche : « Le mettre de côté » grisé, « Le garder » coché, la raison dite', () => {
    const h = vue({ poches: [] })
    expect(eteint(bouton(h, 'radio', 'Le mettre de côté'))).toBe(true)
    expect(coche(bouton(h, 'radio', 'Le garder sur le compte'))).toBe(true)
    expect(texte(h)).toContain('Il n’y a pas encore de poche d’épargne.')
    expect(h).not.toContain('<input')
  })

  it('un reste négatif : grisé, « Le garder » coché, et aucun montant à mettre de côté', () => {
    const h = vue({ recap: recapDe(500_01) })
    expect(eteint(bouton(h, 'radio', 'Le mettre de côté'))).toBe(true)
    expect(coche(bouton(h, 'radio', 'Le garder sur le compte'))).toBe(true)
    expect(texte(h)).toContain('Il ne reste rien à mettre de côté ce mois-ci.')
    expect(texte(h)).not.toContain('Il reste disponible pour')
    expect(h).not.toContain('<input')
  })

  it('un reste de 0 : grisé aussi', () => {
    const h = vue({ recap: { prevus: 100_00, ecart: -100_00, reste: 0 } })
    expect(eteint(bouton(h, 'radio', 'Le mettre de côté'))).toBe(true)
  })

  it('tabulation itinérante : seul le coché est dans l’ordre de Tab', () => {
    const mettre = vue()
    expect(bouton(mettre, 'radio', 'Le mettre de côté')).toContain('tabindex="0"')
    expect(bouton(mettre, 'radio', 'Le garder sur le compte')).toContain('tabindex="-1"')
    const garder = vue({ choix: choix({ garder: true }) })
    expect(bouton(garder, 'radio', 'Le mettre de côté')).toContain('tabindex="-1"')
    expect(bouton(garder, 'radio', 'Le garder sur le compte')).toContain('tabindex="0"')
  })

  it('la carte de l’épargne porte sa vignette ; l’autre non', () => {
    const h = vue()
    expect(h.match(/budget\/epargne\.jpg/g)).toHaveLength(1)
  })
})

describe('le choix de la poche', () => {
  it('plusieurs poches : un sélecteur, la défaut cochée', () => {
    const h = vue({ poches: [vacances, urgence], choix: choix({ poche: null }) })
    expect(h).toContain('aria-label="Sur quelle poche"')
    expect(coche(bouton(h, 'radio', 'Urgence'))).toBe(true)
    expect(coche(bouton(h, 'radio', 'Vacances'))).toBe(false)
  })

  it('une poche choisie qui n’existe plus : la défaut est cochée, pas aucune', () => {
    const h = vue({ poches: [vacances, urgence], choix: choix({ poche: 'disparue' }) })
    expect(coche(bouton(h, 'radio', 'Urgence'))).toBe(true)
  })

  it('une seule poche : pas de sélecteur', () => {
    expect(vue()).not.toContain('Sur quelle poche')
  })

  it('en gardant l’argent : pas de sélecteur', () => {
    expect(vue({ poches: [vacances, urgence], choix: choix({ garder: true }) }))
      .not.toContain('Sur quelle poche')
  })
})

describe('« Combien mettre de côté »', () => {
  it('par défaut : tout ce qui reste, au format du champ — « 1556,70 », pas « 1556.7 »', () => {
    expect(vue()).toContain('value="1556,70"')
    expect(vue({ recap: { prevus: 100_00, ecart: 5, reste: 100_05 } })).toContain('value="100,05"')
    expect(vue({ recap: { prevus: 100_00, ecart: 10, reste: 100_10 } })).toContain('value="100,10"')
    expect(vue({ recap: { prevus: 100_00, ecart: 0, reste: 100_00 } })).toContain('value="100"')
  })

  it('« Tout ce qui reste » n’apparaît qu’après une saisie', () => {
    expect(texte(vue())).not.toContain('Tout ce qui reste')
    expect(texte(vue({ choix: choix({ combien: '10' }) }))).toContain('Tout ce qui reste')
  })

  it('ce qu’on tape se garde tel quel dans le champ', () => {
    expect(vue({ choix: choix({ combien: '316,8' }) })).toContain('value="316,8"')
  })

  it('un champ illisible dit ce qu’il attend ; un champ vide ne crie pas, mais dit pourquoi « Clôturer » attend', () => {
    const faux = vue({ choix: choix({ combien: 'abc' }) })
    expect(faux).toContain('role="alert"')
    expect(texte(faux)).toContain('Un montant')
    expect(texte(faux)).not.toContain('Écris un montant')
    const vide = vue({ choix: choix({ combien: '' }) })
    expect(vide).not.toContain('role="alert"')
    expect(vide).toContain('role="status"')
    expect(texte(vide)).toContain('Écris un montant, ou 0 pour ne rien mettre de côté.')
  })

  it('pas de phrase quand le champ n’est pas vide, ni quand on garde l’argent', () => {
    expect(texte(vue({ choix: choix({ combien: '12' }) }))).not.toContain('Écris un montant')
    expect(texte(vue())).not.toContain('Écris un montant')
    expect(texte(vue({ choix: choix({ combien: '', garder: true }) }))).not.toContain('Écris un montant')
  })

  it('0 € est permis', () => {
    const h = vue({ choix: choix({ combien: '0' }), dessus: 800_01 })
    expect(h).not.toContain('role="alert"')
    expect(texte(h)).toContain('passe à 800,01 €')
  })

  it('pile le reste : aucune mention « Au plus »', () => {
    expect(texte(vue({ choix: choix({ combien: '1556,70' }) }))).not.toContain('Au plus')
  })
})

/* ── Les gestes : on appelle ce que l'arbre rendu branche sur les boutons ── */
function trouve(n: ReactNode, ok: (e: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(n)) { for (const x of n) { const r = trouve(x, ok); if (r) return r } return null }
  if (!isValidElement<Record<string, unknown>>(n)) return null
  if (ok(n)) return n
  return trouve(n.props.children as ReactNode, ok)
}
const element = (p: Props, role: string, nom: string) => {
  const e = trouve(VueReste(p), x => x.type === 'button' && x.props.role === role
    && JSON.stringify(x.props.children).includes(nom))
  if (!e) throw new Error(`pas de « ${nom} »`)
  return e.props as { onClick: () => void; onKeyDown: (ev: unknown) => void }
}
const touche = (key: string) => {
  const vers = { focus: vi.fn() }
  return { key, preventDefault: vi.fn(),
           currentTarget: { parentElement: { children: [{ focus: vi.fn() }, vers, vers] } }, vers }
}

describe('les gestes', () => {
  it('« Le garder » garde la poche et la saisie : revenir à « Le mettre de côté » les retrouve', () => {
    const changer = vi.fn()
    const c = choix({ poche: 'p2', combien: '12' })
    element(props({ changer, choix: c, poches: [urgence, vacances] }), 'radio', 'Le garder').onClick()
    expect(changer).toHaveBeenCalledWith({ garder: true, poche: 'p2', combien: '12' })
    element(props({ changer, choix: { ...c, garder: true }, poches: [urgence, vacances] }),
            'radio', 'Le mettre de côté').onClick()
    expect(changer).toHaveBeenLastCalledWith({ garder: false, poche: 'p2', combien: '12' })
  })

  it('une poche choisie : seule la poche change', () => {
    const changer = vi.fn()
    element(props({ changer, poches: [urgence, vacances], choix: choix({ combien: '5' }) }),
            'radio', 'Vacances').onClick()
    expect(changer).toHaveBeenCalledWith({ garder: false, poche: 'p2', combien: '5' })
  })

  it('« Tout ce qui reste » remet `combien` à null', () => {
    const changer = vi.fn()
    const e = trouve(VueReste(props({ changer, choix: choix({ combien: '5' }) })),
                     x => x.type === 'button' && JSON.stringify(x.props.children).includes('Tout ce qui reste'))
    ;(e!.props.onClick as () => void)()
    expect(changer).toHaveBeenCalledWith({ garder: false, poche: 'p1', combien: null })
  })

  it('les flèches passent d’un choix à l’autre, et le focus suit', () => {
    const changer = vi.fn()
    const ev = touche('ArrowDown')
    element(props({ changer }), 'radio', 'Le mettre de côté').onKeyDown(ev)
    expect(changer).toHaveBeenCalledWith({ garder: true, poche: 'p1', combien: null })
    expect(ev.preventDefault).toHaveBeenCalled()
    expect(ev.vers.focus).toHaveBeenCalled()
  })

  it('« Le mettre de côté » grisé : les flèches n’y mènent pas', () => {
    const changer = vi.fn()
    const ev = touche('ArrowUp')
    element(props({ changer, poches: [] }), 'radio', 'Le garder').onKeyDown(ev)
    expect(changer).not.toHaveBeenCalled()
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('une autre touche reste au navigateur', () => {
    const changer = vi.fn()
    const ev = touche('Tab')
    element(props({ changer }), 'radio', 'Le mettre de côté').onKeyDown(ev)
    expect(changer).not.toHaveBeenCalled()
    expect(ev.preventDefault).not.toHaveBeenCalled()
  })

  it('les flèches des poches changent de poche', () => {
    const changer = vi.fn()
    const ev = touche('ArrowRight')
    element(props({ changer, poches: [urgence, vacances] }), 'radio', 'Urgence').onKeyDown(ev)
    expect(changer).toHaveBeenCalledWith({ garder: false, poche: 'p2', combien: null })
  })
})
