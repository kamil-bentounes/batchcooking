/**
 * L'écran d'entrée, SANS logique : la porte du frigo en haut, la feuille du formulaire en bas.
 * `SignIn` garde tout ce qui parle à Supabase et lui passe l'état ; ce fichier ne fait que le montrer.
 * C'est aussi ce qui permet de le tester en chaîne, mode par mode.
 */
import type { FormEvent } from 'react'
import { Marque } from '../coque.tsx'
import { PorteDuFrigo } from './PorteDuFrigo.tsx'
import { ACTION, CHAPEAU, CHEMINS, portesOuvertes, type Mode } from './modes.ts'
import './porte.css'

export type VueDeConnexion = {
  mode: Mode
  email: string
  mdp: string
  /** Le mot de passe est montré en clair. */
  voir: boolean
  envoi: boolean
  msg: string
  err: boolean
  onEmail: (v: string) => void
  onMdp: (v: string) => void
  onVoir: () => void
  onMode: (m: Mode) => void
  onEnvoi: () => void
}

export function EcranDeConnexion(p: VueDeConnexion) {
  const { mode } = p
  const ouvert = portesOuvertes(mode, p.envoi)
  const soumet = (e: FormEvent) => { e.preventDefault(); if (!bloque(p)) p.onEnvoi() }
  return (
    <main className={ouvert ? 'pf-ecran pf-ouvert' : 'pf-ecran'} data-ouvert={ouvert ? 'true' : 'false'}>
      <PorteDuFrigo />
      <form className="pf-feuille" onSubmit={soumet} noValidate>
        <div className="pf-feuille-in">
          <div className="pf-marque">
            {/* ⚠️ Le titre de l'écran est « Connexion », pour les lecteurs d'écran seulement : le
                hub porte déjà un titre « Popote », et les bancs s'en servent pour savoir qu'on
                est ENTRÉ. La marque affichée ici ne doit pas pouvoir être prise pour lui. */}
            <h1 className="sr-only">Connexion</h1>
            <p className="pf-nom">
              <Marque taille={40} />
              Popote
            </p>
            <p className="pf-chapeau">{CHAPEAU[mode]}</p>
          </div>

          <div className="pf-champ">
            <label htmlFor="pf-mel">Ton e-mail</label>
            <div className="pf-saisie">
              <input id="pf-mel" type="email" value={p.email} autoComplete="email"
                     placeholder="toi@exemple.fr" onChange={e => p.onEmail(e.target.value)} />
            </div>
          </div>

          {mode === 'mdp' && (
            <div className="pf-champ">
              <label htmlFor="pf-mdp">Mot de passe</label>
              <div className="pf-saisie">
                <input id="pf-mdp" className="pf-avec-bouton" type={p.voir ? 'text' : 'password'}
                       value={p.mdp} autoComplete="current-password"
                       onChange={e => p.onMdp(e.target.value)} />
                <button type="button" className="pf-voir" onClick={p.onVoir} aria-controls="pf-mdp">
                  {p.voir ? 'Cacher' : 'Afficher'}
                </button>
              </div>
            </div>
          )}

          <button type="submit" className="pf-entrer" disabled={bloque(p)}
                  data-envoi={p.envoi ? '' : undefined}>
            {p.envoi ? 'Un instant…' : ACTION[mode]}
          </button>

          {/* Le `Message` du kit tire `route.ts`, qui lit `window` à l'import : l'écran se rend
              en chaîne dans les tests, il garde donc le sien — le même rendu. */}
          {p.msg && (
            <p role="status" aria-live="polite"
               className={`mt-4 text-[15px] ${p.err ? 'text-groseille' : 'text-herbe'}`}>{p.msg}</p>
          )}

          <div className="pf-chemins">
            {CHEMINS[mode].map(c => (
              <button key={c.vers} type="button" onClick={() => p.onMode(c.vers)}>{c.texte}</button>
            ))}
          </div>
        </div>
      </form>
    </main>
  )
}

/** Rien à envoyer sans adresse (ni mot de passe, en mode « mot de passe »), ni pendant un envoi. */
function bloque(p: VueDeConnexion) {
  return !p.email || (p.mode === 'mdp' && !p.mdp) || p.envoi
}
