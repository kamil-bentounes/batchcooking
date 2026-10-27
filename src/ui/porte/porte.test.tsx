/**
 * L'écran d'entrée, rendu en chaîne : les trois modes, l'erreur qui referme les portes, « Afficher ».
 * La logique de connexion (Supabase) est dans `SignIn` et passe au banc e2e ; ici on garde ce que
 * l'écran MONTRE à partir de l'état qu'on lui donne.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EcranDeConnexion, type VueDeConnexion } from './EcranDeConnexion.tsx'
import { ACTION, CHAPEAU, CHEMINS, PHRASE, portesOuvertes, type Mode } from './modes.ts'

const rien = () => {}
const vue = (p: Partial<VueDeConnexion> = {}) => renderToStaticMarkup(
  <EcranDeConnexion mode="mdp" email="" mdp="" voir={false} envoi={false} msg="" err={false}
    onEmail={rien} onMdp={rien} onVoir={rien} onMode={rien} onEnvoi={rien} {...p} />)
const texte = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

describe('les trois modes', () => {
  it('« mot de passe » : la phrase, les deux champs, « Entrer », et les deux autres chemins', () => {
    const h = vue()
    expect(texte(h)).toContain(PHRASE)
    expect(h).toMatch(/autoComplete="email"|autocomplete="email"/)
    expect(h).toMatch(/autoComplete="current-password"|autocomplete="current-password"/)
    expect(h).toContain('Ton e-mail')
    expect(h).toContain('>Mot de passe<')
    expect(h).toContain('>Entrer<')
    expect(h).toContain('>Première connexion<')
    expect(h).toContain('>Mot de passe oublié<')
    expect(h).not.toContain('J’ai déjà un mot de passe')
  })

  it('« première connexion » : pas de mot de passe, le lien est annoncé, « Recevoir le lien »', () => {
    const h = vue({ mode: 'premiere' })
    expect(texte(h)).toContain('ensuite tu choisis ton mot de passe')
    expect(h).not.toContain('current-password')
    expect(h).toContain('>Recevoir le lien<')
    expect(h).toContain('>J’ai déjà un mot de passe<')
    expect(h).toContain('>Mot de passe oublié<')
    expect(h).not.toContain('>Première connexion<')
  })

  it('« mot de passe oublié » : lien de réinitialisation, « Réinitialiser mon mot de passe »', () => {
    const h = vue({ mode: 'oubli' })
    expect(texte(h)).toContain('lien de réinitialisation')
    expect(h).not.toContain('current-password')
    expect(h).toContain('>Réinitialiser mon mot de passe<')
    expect(h).toContain('>J’ai déjà un mot de passe<')
    expect(h).toContain('>Première connexion<')
  })

  it('chaque mode a son texte, son action et deux chemins vers les AUTRES modes', () => {
    for (const m of ['mdp', 'premiere', 'oubli'] as Mode[]) {
      expect(CHAPEAU[m]).toBeTruthy()
      expect(ACTION[m]).toBeTruthy()
      expect(CHEMINS[m]).toHaveLength(2)
      expect(CHEMINS[m].map(c => c.vers)).not.toContain(m)
    }
  })

  it('le bouton reste grisé sans adresse, et sans mot de passe en mode « mot de passe »', () => {
    expect(vue()).toMatch(/class="pf-entrer"[^>]*disabled/)
    expect(vue({ email: 'a@b.fr' })).toMatch(/class="pf-entrer"[^>]*disabled/)
    expect(vue({ email: 'a@b.fr', mdp: 'x' })).not.toMatch(/class="pf-entrer"[^>]*disabled/)
    expect(vue({ mode: 'premiere', email: 'a@b.fr' })).not.toMatch(/class="pf-entrer"[^>]*disabled/)
  })
})

describe('les portes', () => {
  it('fermées au repos', () => {
    expect(vue()).toContain('data-ouvert="false"')
  })

  it('ouvertes pendant l’envoi d’une connexion par mot de passe, « Un instant… » sur le bouton', () => {
    const h = vue({ email: 'a@b.fr', mdp: 'x', envoi: true })
    expect(h).toContain('data-ouvert="true"')
    expect(h).toContain('pf-ouvert')
    expect(texte(h)).toContain('Un instant…')
  })

  it('l’erreur referme les portes ET affiche le message', () => {
    const h = vue({ email: 'a@b.fr', mdp: 'x', envoi: false, msg: 'E-mail ou mot de passe incorrect.', err: true })
    expect(h).toContain('data-ouvert="false"')
    expect(h).toContain('role="status"')
    expect(texte(h)).toContain('E-mail ou mot de passe incorrect.')
  })

  it('un lien envoyé n’ouvre rien : seul le mot de passe ouvre', () => {
    expect(portesOuvertes('mdp', true)).toBe(true)
    expect(portesOuvertes('mdp', false)).toBe(false)
    expect(portesOuvertes('premiere', true)).toBe(false)
    expect(portesOuvertes('oubli', true)).toBe(false)
  })

  it('les portes et leurs aimants sont cachés aux lecteurs d’écran, et leurs exemples inventés', () => {
    const h = vue()
    expect(h).toContain('84,20\u00a0€')
    expect(h).toContain('14')
    expect(texte(h)).toContain('Dimanche')
    expect(h).toMatch(/pf-porte pf-porte-g[^>]*aria-hidden="true"/)
    expect(h).not.toContain('<img')
  })
})

describe('« Afficher »', () => {
  it('le mot de passe est masqué, et le bouton propose de l’afficher', () => {
    const h = vue({ mdp: 'secret' })
    expect(h).toMatch(/id="pf-mdp"[^>]*type="password"|type="password"[^>]*id="pf-mdp"/)
    expect(h).toContain('>Afficher<')
  })

  it('affiché : champ en clair, et le bouton propose de le cacher', () => {
    const h = vue({ mdp: 'secret', voir: true })
    expect(h).toMatch(/type="text"[^>]*value="secret"|value="secret"[^>]*type="text"/)
    expect(h).toContain('>Cacher<')
  })

  it('le bouton ne soumet pas le formulaire et ne porte pas « mot de passe » dans son nom', () => {
    const h = vue()
    expect(h).toMatch(/<button type="button" class="pf-voir"/)
    expect(h).not.toMatch(/aria-label="[^"]*mot de passe/i)
  })
})
