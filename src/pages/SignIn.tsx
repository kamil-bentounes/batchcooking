import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

type Mode = 'mdp' | 'lien'

export function SignIn({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>('mdp')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }

  async function connecter() {
    setEnvoi(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
    setEnvoi(false)
    if (error) dire('E-mail ou mot de passe incorrect.', true)
  }

  async function envoyerLien() {
    setEnvoi(true)
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: redirectTo ?? window.location.href },
    })
    setEnvoi(false)
    dire(error ? error.message : `Lien envoyé à ${email}. Ouvre-le depuis cet appareil.`, !!error)
  }

  return (
    <Page centre titre="On cuisine ?"
          chapeau={mode === 'mdp'
            ? 'Ton e-mail et ton mot de passe.'
            : 'On t’envoie un lien. Tu t’en serviras une fois, pour choisir ton mot de passe.'}>
      <div className="space-y-5">
        <Champ label="Ton e-mail" type="email" value={email} autoComplete="email"
               placeholder="toi@exemple.fr" onChange={e => setEmail(e.target.value)} />

        {mode === 'mdp' && (
          <Champ label="Mot de passe" type="password" value={mdp} autoComplete="current-password"
                 placeholder="••••••••" onChange={e => setMdp(e.target.value)} />
        )}

        <Bouton onClick={mode === 'mdp' ? connecter : envoyerLien}
                disabled={!email || (mode === 'mdp' && !mdp) || envoi}>
          {envoi ? 'Un instant…' : mode === 'mdp' ? 'Se connecter' : 'Recevoir le lien'}
        </Bouton>
      </div>

      <Message texte={msg} erreur={err} />

      <button onClick={() => { setMode(mode === 'mdp' ? 'lien' : 'mdp'); setMsg('') }}
              className="mt-6 text-herbe underline underline-offset-4 text-[15px]">
        {mode === 'mdp'
          ? 'Première fois, ou mot de passe oublié ?'
          : 'J’ai déjà un mot de passe'}
      </button>
    </Page>
  )
}
