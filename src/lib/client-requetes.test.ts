/**
 * Hors ligne, une écriture échoue tout de suite : elle ne se met pas en pause pour partir plus tard.
 *
 * Par défaut TanStack Query 5 met en pause toute mutation quand `navigator.onLine` est faux : « J'ajoute… »
 * sans fin, puis l'écriture partait à la reconnexion — deux fois si la personne avait recliqué.
 * On pose le client de l'appli, on coupe le réseau (`onlineManager`, ce que `navigator.onLine`
 * alimente) et on regarde ce que devient une mutation.
 */
import { MutationObserver, QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { creeLeClient, relancer } from './client-requetes.ts'
import { PAS_DE_RESEAU } from './reseau.ts'

beforeEach(() => onlineManager.setOnline(false))
afterEach(() => onlineManager.setOnline(true))

const attendsUnTour = () => new Promise(r => setTimeout(r, 20))

describe('le client de l’appli, réseau coupé', () => {
  it('une mutation s’exécute et échoue avec SON erreur : elle ne reste pas en pause', async () => {
    const client = creeLeClient()
    const ecrit = vi.fn(async () => { throw new Error('Pas de réseau : vérifie ta connexion, puis réessaie.') })
    const obs = new MutationObserver(client, { mutationFn: ecrit })
    const r = obs.mutate().catch(e => e as Error)
    await attendsUnTour()
    expect(ecrit).toHaveBeenCalledTimes(1)
    expect(obs.getCurrentResult().isPaused).toBe(false)
    expect(obs.getCurrentResult().status).toBe('error')
    expect((await r).message).toMatch(/Pas de réseau/)
  })

  it('sur l’ancien réglage (aucune option), la même mutation reste en pause : c’est ce qu’on évite', async () => {
    const client = new QueryClient()
    const ecrit = vi.fn(async () => 'ok')
    const obs = new MutationObserver(client, { mutationFn: ecrit })
    void obs.mutate().catch(() => {})
    await attendsUnTour()
    expect(obs.getCurrentResult().isPaused).toBe(true)
    expect(ecrit).not.toHaveBeenCalled()
  })

  it('une lecture part et échoue : elle ne reste pas « en attente » sans fin', async () => {
    const client = creeLeClient()
    const lit = vi.fn(async () => { throw new Error(PAS_DE_RESEAU) })
    const obs = new QueryObserver(client, { queryKey: ['x'], queryFn: lit })
    await obs.refetch()
    expect(lit).toHaveBeenCalledTimes(1)
    expect(obs.getCurrentResult().fetchStatus).toBe('idle')
    expect(obs.getCurrentResult().error?.message).toBe(PAS_DE_RESEAU)
  })

  it('hors ligne, une lecture ne se relance pas (supabase-js a déjà réessayé) ; en ligne, trois relances', () => {
    expect(relancer(0, new Error(PAS_DE_RESEAU))).toBe(false)
    expect(relancer(0, new Error('autre'))).toBe(false)
    onlineManager.setOnline(true)
    expect(relancer(0, new Error('boom'))).toBe(true)
    expect(relancer(2, new Error('boom'))).toBe(true)
    expect(relancer(3, new Error('boom'))).toBe(false)
    expect(relancer(0, new Error(PAS_DE_RESEAU))).toBe(false)
  })
})
