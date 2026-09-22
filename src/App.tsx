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
import { Hub } from './pages/Hub.tsx'
import { Budget } from './pages/Budget.tsx'
import { Charges } from './pages/Charges.tsx'
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
import { Importer } from './pages/Importer.tsx'
import { AccepteAmi } from './pages/AccepteAmi.tsx'

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
    const { data: sub } = supabase.auth.onAuthStateChange(async (evenement, s) => {
      /*
       * ⚠️ L'intention ne se garde PAS en mémoire React.
       *
       *    `PASSWORD_RECOVERY` n'est émis qu'UNE fois, au chargement où le
       *    fragment d'URL porte `type=recovery` — ensuite Supabase nettoie
       *    l'URL. Un état React mourait donc au premier rechargement, et
       *    l'ancien mot de passe redevenait valable : exactement le défaut
       *    qu'on croyait avoir corrigé. Et la barre de navigation de l'écran
       *    étant faite de liens `<a href>`, un simple clic rechargeait la page.
       *
       *    On l'écrit donc en BASE. La garde redevient `!mdpPose` seule : elle
       *    survit au rechargement et aux liens par construction, et il n'y a
       *    plus qu'une seule règle à tenir.
       */
      if (evenement === 'PASSWORD_RECOVERY' && s?.user) {
        await supabase.from('user_profile')
          .update({ password_set: false }).eq('id', s.user.id)
      }
      relire()
    })
    return () => sub.subscription.unsubscribe()
  }, [relire])

  if (!pret) return <main className="min-h-dvh grid place-items-center text-doux">Un instant…</main>

  const invitation = ici.match(/^\/invite\/(.+)$/)
  const amitie = ici.match(/^\/ami\/(.+)$/)
  // La session d'un AUTRE foyer, où l'on est convié. Le seul chemin de l'app
  // qui porte un identifiant : « la » session de quelqu'un ne se devine pas.
  const sessionAmie = ici.match(/^\/cuisine\/(.+)$/)

  // L'ordre compte. Une invitation prime sur tout : sans cela, l'invité se voit
  // proposer de créer SON foyer au lieu de rejoindre celui qui l'attend.
  if (!session) return <SignIn redirectTo={window.location.href} />
  if (invitation) return <AcceptInvite token={invitation[1]} />
  if (!foyer) return <Onboarding onDone={relire} />
  // Tant qu'aucun mot de passe n'est posé, on n'entre pas — sinon on repart sur
  // un lien par mail à chaque connexion. Un retour de réinitialisation remet
  // `password_set` à faux, ce qui range les deux cas sous la même règle.
  if (!mdpPose) return <Password userId={session.user.id} onDone={relire} />

  const moi = session.user.id
  // Retour à l'accueil plutôt qu'à l'historique du navigateur : un passage
  // ouvert depuis une notification n'a pas de page précédente.
  const sortie = () => (window.history.length > 1 ? retour() : va('/'))

  // ⚠️ APRÈS le mot de passe et le foyer, à la différence d'une invitation de
  //    foyer : rejoindre des amis suppose qu'on a déjà un foyer à soi, et on
  //    n'entre jamais sans avoir posé son mot de passe.
  if (amitie) return <AccepteAmi jeton={amitie[1]} va={va} />
  if (sessionAmie) return <Cuisine userId={moi} va={va} cycleId={sessionAmie[1]} />

  switch (ici) {
    /* Les deux univers. `/` est le hub — il ne porte pas de barre du bas, c'est
       l'écran qu'on quitte immédiatement — et `/cuisine-accueil` est l'accueil
       de la cuisine, qui était `/` jusqu'ici. */
    case '/budget': return <Budget userId={moi} va={va} />
    case '/charges': return <Charges userId={moi} retour={() => va('/budget')} />
    case '/cuisine-accueil': return <Accueil userId={moi} va={va} />

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
    case '/importer': return <Importer retour={sortie} va={va} />

    // Les réglages, hors cycle.
    case '/objectifs': return <Targets userId={moi} />
    case '/reglages': return <Settings va={va} />
    // Changer son mot de passe : l'écran existait, sans aucun chemin pour y
    // aller une fois le premier posé.
    case '/motdepasse':
      return <Password userId={moi} onDone={() => va('/reglages')} />

    default: return <Hub userId={moi} va={va} />
  }
}
