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
const PAS_ENREGISTRE = 'Ton mot de passe n’a pas pu être enregistré. Vérifie ta connexion, puis réessaie.'

export function Password({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [mdp, setMdp] = useState('')
  const [msg, setMsg] = useState('')

  const trop_court = mdp.length > 0 && mdp.length < 8

  async function enregistrer() {
    const { error } = await supabase.auth.updateUser({ password: mdp })
    /* Le message de Supabase est en ANGLAIS. Le cas le plus courant n'a rien
       d'une panne : après « mot de passe oublié », on retape souvent l'ancien,
       qu'on croyait perdu. */
    if (error) {
      return setMsg(error.code === 'same_password'
        ? 'C’est déjà ton mot de passe : choisis-en un autre.'
        : error.code === 'weak_password'
          ? 'Ce mot de passe est trop facile à deviner : allonge-le, ou mélange lettres et chiffres.'
          : PAS_ENREGISTRE)
    }
    const { error: e2 } = await supabase.from('user_profile')
      .update({ password_set: true }).eq('id', userId)
    if (e2) return setMsg(PAS_ENREGISTRE)
    onDone()
  }

  return (
    /*
     * ⚠️ JAMAIS de navigation ici.
     *
     *    `Nav` est faite de liens `<a href>`, donc de rechargements pleins. Les
     *    afficher revenait à offrir trois moyens de sauter l'étape, juste
     *    au-dessus de la phrase qui dit qu'on ne peut pas la sauter.
     */
    <Page centre marque titre="Ton mot de passe"
          chapeau="Choisis-le : c’est lui qui te fera entrer ensuite, sur tous tes appareils.">
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
