import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { SignIn } from './pages/SignIn'
import { Onboarding } from './pages/Onboarding'
import { Targets } from './pages/Targets'
import { Settings } from './pages/Settings'
import { AcceptInvite } from './pages/AcceptInvite'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [foyer, setFoyer] = useState<string | null>(null)
  const [pret, setPret] = useState(false)

  const relire = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    if (data.session) {
      const { data: hh } = await supabase.rpc('current_household')
      setFoyer(hh ?? null)
    } else setFoyer(null)
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

  const invitation = window.location.pathname.match(/^\/invite\/(.+)$/)

  if (!session) return <SignIn redirectTo={window.location.href} />
  if (invitation) return <AcceptInvite token={invitation[1]} />
  if (!foyer) return <Onboarding onDone={relire} />
  if (window.location.pathname.startsWith('/settings')) return <Settings />
  return <Targets userId={session.user.id} />
}
