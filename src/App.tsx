import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { useRoute } from './lib/route.ts'
import { SignIn } from './pages/SignIn'
import { Password } from './pages/Password'
import { Onboarding } from './pages/Onboarding'
import { Targets } from './pages/Targets'
import { Settings } from './pages/Settings'
import { AcceptInvite } from './pages/AcceptInvite'
import { Accueil } from './pages/Accueil.tsx'
import { Choisir } from './pages/Choisir.tsx'
import { Magasin } from './pages/Magasin.tsx'
import { Plan } from './pages/Plan.tsx'
import { Cuisine } from './pages/Cuisine.tsx'
import { Dressage } from './pages/Dressage.tsx'
import { Semaine } from './pages/Semaine.tsx'
import { Stock } from './pages/Stock.tsx'
import { Bilan } from './pages/Bilan.tsx'
import { Inventer } from './pages/Inventer.tsx'
import { Photo } from './pages/Photo.tsx'
import { Ticket } from './pages/Ticket.tsx'
import { Peser } from './pages/Peser.tsx'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [foyer, setFoyer] = useState<string | null>(null)
  const [mdpPose, setMdpPose] = useState(true)
  const [pret, setPret] = useState(false)
  const { ici, va, retour } = useRoute()

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

  if (!pret) return <main className="min-h-dvh grid place-items-center text-doux">Un instant…</main>

  const invitation = ici.match(/^\/invite\/(.+)$/)

  // L'ordre compte. Une invitation prime sur tout : sans cela, l'invité se voit
  // proposer de créer SON foyer au lieu de rejoindre celui qui l'attend.
  if (!session) return <SignIn redirectTo={window.location.href} />
  if (invitation) return <AcceptInvite token={invitation[1]} />
  if (!foyer) return <Onboarding onDone={relire} />
  if (!mdpPose) return <Password userId={session.user.id} onDone={relire} />

  const moi = session.user.id
  // Retour à l'accueil plutôt qu'à l'historique du navigateur : un passage
  // ouvert depuis une notification n'a pas de page précédente.
  const sortie = () => (window.history.length > 1 ? retour() : va('/'))

  switch (ici) {
    // Les quatre destinations permanentes.
    case '/semaine': return <Semaine userId={moi} va={va} />
    case '/stock': return <Stock va={va} />
    case '/bilan': return <Bilan va={va} />

    // Les passages du cycle : une seule sortie, pas de barre du bas.
    case '/choisir': return <Choisir retour={sortie} va={va} />
    case '/magasin': return <Magasin retour={sortie} va={va} />
    case '/plan': return <Plan retour={sortie} va={va} />
    case '/cuisine': return <Cuisine userId={moi} va={va} />
    case '/dressage': return <Dressage retour={sortie} va={va} />
    case '/inventer': return <Inventer userId={moi} retour={sortie} va={va} />
    case '/photo': return <Photo retour={sortie} va={va} />
    case '/ticket': return <Ticket retour={sortie} va={va} />
    case '/peser': return <Peser retour={sortie} />

    // Les réglages, hors cycle.
    case '/objectifs': return <Targets userId={moi} />
    case '/reglages': return <Settings va={va} />
    // Changer son mot de passe : l'écran existait, sans aucun chemin pour y
    // aller une fois le premier posé.
    case '/motdepasse':
      return <Password userId={moi} change onDone={() => va('/reglages')} />

    default: return <Accueil userId={moi} va={va} />
  }
}
