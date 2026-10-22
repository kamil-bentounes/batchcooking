import { describe, expect, it } from 'vitest'
import { sessionPerdue } from './session-perdue.ts'

const CLE = 'cle-anonyme'
const REST = 'http://127.0.0.1:54321/rest/v1/rpc/current_household'

describe('sessionPerdue', () => {
  it('un refus 401 sur une requête de données partie avec la clé anonyme : la session est perdue', () => {
    expect(sessionPerdue(401, REST, `Bearer ${CLE}`, CLE)).toBe(true)
    expect(sessionPerdue(401, 'http://x/functions/v1/invite', `Bearer ${CLE}`, CLE)).toBe(true)
  })

  it('un 401 avec le jeton de quelqu’un n’est pas une session perdue (jeton refusé, autre histoire)', () => {
    expect(sessionPerdue(401, REST, 'Bearer eyJ.un.jeton', CLE)).toBe(false)
  })

  it('ni un autre statut, ni l’authentification elle-même (mauvais mot de passe : 400)', () => {
    expect(sessionPerdue(403, REST, `Bearer ${CLE}`, CLE)).toBe(false)
    expect(sessionPerdue(401, 'http://x/auth/v1/token?grant_type=password', `Bearer ${CLE}`, CLE)).toBe(false)
    expect(sessionPerdue(401, REST, null, CLE)).toBe(false)
  })
})
