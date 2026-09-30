import { useState } from 'react'
import { callFunction, supabase } from '../lib/supabase'
import { Page, Bouton, Message } from '../ui/kit'

export function AcceptInvite({ token, dejaChezToi, va, compte }: {
  token: string
  /** La session ouverte a déjà un foyer. */
  dejaChezToi: boolean
  va: (vers: string) => void
  /** L'adresse de la session ouverte. */
  compte: string
}) {
  const [msg, setMsg] = useState('')

  /* ⚠️ Pas de bouton voué à l'échec.
     `accept-invite` refuse qui a déjà un foyer (« Déjà rattaché à un foyer »).
     Le 30 septembre, le seul « Rejoindre le foyer » cliqué venait de la session
     de l'hôte, sur son ordinateur : il ouvrait le lien qu'il venait de créer,
     l'écran lui proposait de rejoindre son propre foyer, et le refus arrivait
     après le clic au lieu de la phrase qui dit à qui ce lien s'adresse.
     ⚠️ Sans présumer QUI lit : l'invitée déjà entrée qui rouvre son mail, ou
     revient en arrière après avoir rejoint, tombe sur ce même écran — lui
     dire « envoie-le à la personne que tu invites » l'aurait prise pour
     l'hôte.
     ⚠️ Et sur un appareil PARTAGÉ, c'est l'invitée qui lit, sur la session
     de l'hôte : elle doit voir quel compte est ouvert, et pouvoir en sortir.
     `scope: 'local'` — la sortie par défaut fermait la session de l'hôte sur
     TOUS ses appareils. Puis on RECHARGE, comme la sortie des réglages : la
     mémoire de l'application — charges, revenus de l'hôte — restait sinon
     là pour la personne suivante. */
  if (dejaChezToi) {
    return (
      <Page centre marque titre="Tu es déjà dans un foyer"
            chapeau="Ce lien sert à en rejoindre un quand on n’en a pas encore. Si c’est
                     toi qui l’as créé, envoie-le à la personne invitée : c’est sur son
                     téléphone qu’il s’ouvre.">
        <Bouton onClick={() => va('/')}>Retour à l’accueil</Bouton>
        <p className="mt-6 text-[15px] text-doux">
          Compte ouvert ici : <span className="text-encre">{compte}</span>
        </p>
        <button onClick={async () => {
                  await supabase.auth.signOut({ scope: 'local' })
                  window.location.reload()
                }}
                className="mt-2 text-herbe underline underline-offset-4 text-[15px]">
          Ce n’est pas moi
        </button>
      </Page>
    )
  }

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
