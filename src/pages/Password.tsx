import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

/** Après la première connexion par lien : on pose un mot de passe, une fois. */
export function Password({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [mdp, setMdp] = useState('')
  const [msg, setMsg] = useState('')

  const trop_court = mdp.length > 0 && mdp.length < 8

  async function enregistrer() {
    const { error } = await supabase.auth.updateUser({ password: mdp })
    if (error) return setMsg(error.message)
    const { error: e2 } = await supabase.from('user_profile')
      .update({ password_set: true }).eq('id', userId)
    if (e2) return setMsg(e2.message)
    onDone()
  }

  return (
    <Page centre titre="Choisis ton mot de passe"
          chapeau="C’est la dernière fois qu’on te demande un e-mail pour entrer.">
      <div className="space-y-5">
        <Champ label="Mot de passe" type="password" value={mdp} autoComplete="new-password"
               placeholder="8 caractères au moins"
               onChange={e => setMdp(e.target.value)} />
        <Bouton onClick={enregistrer} disabled={mdp.length < 8}>Enregistrer</Bouton>
      </div>
      <Message texte={trop_court ? 'Il en faut au moins 8.' : msg} erreur />
    </Page>
  )
}
