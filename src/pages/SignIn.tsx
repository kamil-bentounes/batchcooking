import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

export function SignIn({ redirectTo }: { redirectTo?: string }) {
  const [email, setEmail] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  async function envoyer() {
    setEnvoi(true)
    const { error } = await supabase.auth.signInWithOtp({
      email, options: { emailRedirectTo: redirectTo ?? window.location.href },
    })
    setEnvoi(false); setErr(!!error)
    setMsg(error ? error.message : `Lien envoyé à ${email}. Ouvre-le depuis cet appareil.`)
  }

  return (
    <Page centre titre="On cuisine ?" chapeau="Pas de mot de passe. On t’envoie un lien, tu cliques, c’est tout.">
      <div className="space-y-5">
        <Champ label="Ton e-mail" type="email" value={email} autoComplete="email"
               placeholder="toi@exemple.fr"
               onChange={e => setEmail(e.target.value)} />
        <Bouton onClick={envoyer} disabled={!email || envoi}>
          {envoi ? 'Envoi…' : 'Recevoir le lien'}
        </Bouton>
      </div>
      <Message texte={msg} erreur={err} />
    </Page>
  )
}
