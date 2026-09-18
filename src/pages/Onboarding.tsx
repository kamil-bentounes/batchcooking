import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

/**
 * Une personne authentifiée sans foyer. Deux cas très différents :
 * — elle amorce l'instance (personne n'a encore de foyer) → elle crée le sien ;
 * — l'instance est fermée → elle attend une invitation, et on le lui dit.
 * Sans cette distinction, un invité qui arrive sans son lien se crée un foyer
 * vide au lieu de rejoindre celui qui l'attend.
 */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [nom, setNom] = useState('Notre foyer')
  const [ouvert, setOuvert] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('instance_setting')
        .select('value').eq('key', 'allow_household_creation').maybeSingle()
      setOuvert(data ? !!(data.value as any)?.enabled : false)
    })()
  }, [])

  async function creer() {
    const { error } = await supabase.rpc('create_household', { p_name: nom })
    if (error) return setMsg(error.message)
    onDone()
  }

  if (ouvert === null) return <Page centre titre="Un instant…"><span /></Page>

  if (!ouvert) {
    return (
      <Page centre titre="Il te faut une invitation"
            chapeau="Cette application se rejoint sur invitation. Demande à la personne du foyer de t’envoyer son lien.">
        <div className="rounded-2xl border border-brume bg-surface p-5">
          <p className="text-doux text-[15px] leading-relaxed">
            Tu as reçu un lien&nbsp;? Ouvre-le directement, il te fera rejoindre le foyer.
            Ton compte est déjà créé, il ne te manque que ça.
          </p>
        </div>
        <button onClick={() => supabase.auth.signOut()}
                className="mt-6 text-herbe underline underline-offset-4 text-[15px]">
          Se déconnecter
        </button>
      </Page>
    )
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
