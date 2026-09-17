import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [nom, setNom] = useState('Notre foyer')
  const [msg, setMsg] = useState('')

  async function creer() {
    const { error } = await supabase.rpc('create_household', { p_name: nom })
    if (error) return setMsg(error.message)
    onDone()
  }

  return (
    <Page centre titre="Votre foyer"
          chapeau="Un foyer, deux objectifs différents, une seule session de cuisine le dimanche.">
      <div className="space-y-5">
        <Champ label="Comment vous l’appelez" value={nom} onChange={e => setNom(e.target.value)} />
        <Bouton onClick={creer} disabled={!nom.trim()}>Créer le foyer</Bouton>
      </div>
      <p className="mt-6 text-doux text-[15px]">
        Si quelqu’un t’a déjà invité·e, ouvre plutôt le lien reçu par e-mail.
      </p>
      <Message texte={msg} erreur />
    </Page>
  )
}
