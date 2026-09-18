import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { SignIn } from './pages/SignIn'
import { Password } from './pages/Password'
import { Onboarding } from './pages/Onboarding'
import { Targets } from './pages/Targets'
import { Settings } from './pages/Settings'
import { AcceptInvite } from './pages/AcceptInvite'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [foyer, setFoyer] = useState<string | null>(null)
  const [mdpPose, setMdpPose] = useState(true)
  const [pret, setPret] = useState(false)

  const relire = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session) {
      const { data: hh } = await supabase.rpc('current_household')
      setFoyer(hh ?? null)
      // Tant que le mot de passe n'est pas posé, on n'entre pas : sinon la
      // personne repart sur un lien par mail à chaque connexion.
      const { data: p } = await supabase.from('user_profile')
        .select('password_set').eq('id', data.session.user.id).maybeSingle()
      setMdpPose(p ? !!p.password_set : true)
    } else { setFoyer(null); setMdpPose(true) }
    setPret(true)
  }, [])

  useEffect(() => {
    relire()
    const { data: sub } = supabase.auth.onAuthStateChange(() => relire())
    return () => sub.subscription.unsubscribe()
  }, [relire])

  // Aperçu visuel des écrans sans session. Retiré du bundle de production par
  // le tree-shaking : import.meta.env.DEV vaut false à la compilation.
  if (import.meta.env.DEV) {
    const apercu = new URLSearchParams(window.location.search).get('apercu')
    if (apercu === 'objectifs') return <Targets userId="00000000-0000-0000-0000-000000000000" />
    if (apercu === 'reglages') return <Settings />
    if (apercu === 'foyer') return <Onboarding onDone={() => {}} />
  }

  if (!pret) return <main className="min-h-dvh grid place-items-center text-doux">Un instant…</main>

  // Retire le préfixe de base (/batchcooking/ sur GitHub Pages, / en local).
  const chemin = '/' + window.location.pathname
    .slice(import.meta.env.BASE_URL.length).replace(/^\/+/, '')
  const invitation = chemin.match(/^\/invite\/(.+)$/)

  // L'ordre compte. Une invitation prime sur tout : sans cela, l'invité se voit
  // proposer de créer SON foyer au lieu de rejoindre celui qui l'attend.
  if (!session) return <SignIn redirectTo={window.location.href} />
  if (invitation) return <AcceptInvite token={invitation[1]} />
  if (!foyer) return <Onboarding onDone={relire} />
  if (!mdpPose) return <Password userId={session.user.id} onDone={relire} />
  if (chemin.startsWith('/settings')) return <Settings />
  return <Targets userId={session.user.id} />
}
