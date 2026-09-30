/**
 * Ce que l'écran de connexion dit d'un lien qui n'a pas ouvert de session, et
 * comment on répare un lien que Supabase a empoisonné.
 *
 * Les URL sont celles que Supabase produit vraiment : la première est mot pour
 * mot celle du 30 septembre 2026, quand l'invitée a ouvert un mail
 * d'invitation vieux de huit jours ; l'empoisonnée est celle que le GoTrue
 * local rend pour une adresse de retour qui portait déjà ce fragment.
 */
import { describe, it, expect } from 'vitest'
import { erreurDeLien, fragmentRepare } from './lien.ts'

const BASE = 'https://kamil-bentounes.github.io/batchcooking/invite/3fb8'
const EXPIRE = '#error=access_denied&error_code=otp_expired'
  + '&error_description=Email+link+is+invalid+or+has+expired&sb='
const JETONS = 'access_token=x&expires_at=1790792369&expires_in=3600'
  + '&refresh_token=y&sb=&token_type=bearer&type=magiclink'

describe('erreurDeLien', () => {
  it('dit qu’un lien expiré a expiré', () => {
    expect(erreurDeLien(BASE + EXPIRE)).toMatch(/ce lien a expiré/i)
  })

  it('le dit aussi quand un jeton a été collé derrière l’erreur', () => {
    /* L'URL empoisonnée elle-même : c'est bien l'erreur qui a tué la session,
       et c'est donc elle qu'il faut annoncer. */
    expect(erreurDeLien(`${BASE}${EXPIRE}#access_token=x&refresh_token=y&type=magiclink`))
      .toMatch(/ce lien a expiré/i)
  })

  it('le lit dans la requête aussi, où le flux PKCE le range', () => {
    expect(erreurDeLien(`${BASE}?error=access_denied&error_code=otp_expired`))
      .toMatch(/ce lien a expiré/i)
  })

  it('ne prend JAMAIS un lien réussi pour une erreur', () => {
    expect(erreurDeLien(`${BASE}#access_token=x&refresh_token=y&type=recovery&sb=`)).toBeNull()
    expect(erreurDeLien(BASE)).toBeNull()
    expect(erreurDeLien(`${BASE}#`)).toBeNull()
  })

  it('reste vague sur une erreur qu’il ne connaît pas, sans la taire', () => {
    const m = erreurDeLien(`${BASE}#error=server_error&error_code=unexpected_failure`)
    expect(m).not.toBeNull()
    expect(m).not.toMatch(/expiré/i)
  })
})

describe('fragmentRepare', () => {
  it('rend les jetons d’un lien empoisonné, sans l’erreur qui les masquait', () => {
    expect(fragmentRepare(`${EXPIRE}#${JETONS}`)).toBe(`#${JETONS}`)
  })

  it('ne touche ni à un lien sain, ni à une erreur seule', () => {
    expect(fragmentRepare(`#${JETONS}`)).toBeNull()
    expect(fragmentRepare(EXPIRE)).toBeNull()
    expect(fragmentRepare('')).toBeNull()
  })

  it('ne répare rien qui ne porte pas de jeton au bout', () => {
    /* Deux fragments, mais aucun jeton : il n'y a pas de session à sauver, et
       l'erreur doit rester lisible pour l'écran de connexion. */
    expect(fragmentRepare(`${EXPIRE}#foo=bar`)).toBeNull()
  })

  it('garde le DERNIER fragment, même empoisonné deux fois', () => {
    expect(fragmentRepare(`${EXPIRE}#${EXPIRE.slice(1)}#${JETONS}`)).toBe(`#${JETONS}`)
  })
})
