import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

/**
 * Poser ou CHANGER son mot de passe.
 *
 * Le second usage manquait, et le trou était complet : l'écran ne s'affichait
 * que tant que `password_set` valait faux. Quelqu'un qui oubliait son mot de
 * passe recevait bien un lien magique, entrait — et se retrouvait avec
 * `password_set` déjà vrai, donc sans aucun moyen d'en poser un nouveau.
 * Condamné au lien par mail à vie.
 */
export function Password({ userId, onDone, change = false }:
  { userId: string; onDone: () => void; change?: boolean }) {
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
    <Page centre nav={change}
          titre={change ? 'Changer ton mot de passe' : 'Choisis ton mot de passe'}
          chapeau={change
            ? 'Le précédent cessera de fonctionner tout de suite.'
            : 'C’est la dernière fois qu’on te demande un e-mail pour entrer.'}>
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
