import { useState } from 'react'
import { callFunction } from '../lib/supabase'
import { Page, Bouton, Message } from '../ui/kit'

export function AcceptInvite({ token }: { token: string }) {
  const [msg, setMsg] = useState('')

  async function rejoindre() {
    try { await callFunction('accept-invite', { token }); window.location.href = '/' }
    catch (e) { setMsg(String((e as Error).message)) }
  }

  return (
    <Page centre titre="On t’attend" chapeau="Un clic et tu partages le foyer, les courses et les sessions.">
      <Bouton onClick={rejoindre}>Rejoindre le foyer</Bouton>
      <Message texte={msg} erreur />
    </Page>
  )
}
