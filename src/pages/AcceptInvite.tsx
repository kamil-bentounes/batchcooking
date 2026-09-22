import { useState } from 'react'
import { callFunction } from '../lib/supabase'
import { Page, Bouton, Message } from '../ui/kit'

export function AcceptInvite({ token }: { token: string }) {
  const [msg, setMsg] = useState('')

  async function rejoindre() {
    /* `'/'` sortait de l'application : le site est servi sous un sous-chemin,
       et on atterrissait à la racine du domaine. Le rechargement, lui, est
       voulu — le foyer vient de changer, tout l'état doit être relu. */
    try { await callFunction('accept-invite', { token }); window.location.href = import.meta.env.BASE_URL }
    catch (e) { setMsg(String((e as Error).message)) }
  }

  return (
    <Page centre marque titre="On t’attend"
          chapeau="Un clic et tu partages le foyer : les courses, le budget, et les sessions de cuisine.">
      <Bouton onClick={rejoindre}>Rejoindre le foyer</Bouton>
      <Message texte={msg} erreur />
    </Page>
  )
}
