/**
 * Entrer.
 *
 * Trois chemins, et ils ne font PAS la même chose — c'est le défaut qu'on a
 * corrigé ici. Un seul bouton disait « Première fois, ou mot de passe
 * oublié ? », et les deux envoyaient le même lien de connexion. Résultat :
 * quelqu'un qui avait oublié son mot de passe était simplement reconnecté, et
 * n'avait jamais l'occasion d'en poser un nouveau.
 *
 *   · MOT DE PASSE  — on connaît le sien, on entre.
 *   · PREMIÈRE FOIS — le compte n'a pas encore de mot de passe. Le lien sert à
 *     prouver l'adresse, puis l'application EXIGE d'en poser un.
 *   · OUBLIÉ        — le compte en a un, on ne s'en souvient plus. Le lien est
 *     un lien de RÉINITIALISATION, et il mène à l'écran du mot de passe quoi
 *     qu'en dise `password_set`.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { erreurDeLien } from '../lib/lien.ts'
import { PAS_DE_RESEAU, estUnePanneDeReseau } from '../lib/reseau.ts'
import { EcranDeConnexion } from '../ui/porte/EcranDeConnexion.tsx'
import type { Mode } from '../ui/porte/modes.ts'

/**
 * `redirectTo` est OBLIGATOIRE : le défaut `window.location.href` emportait le
 * fragment de l'URL dans chaque lien envoyé. Voir `App.tsx`.
 */
export function SignIn({ redirectTo: cible, info }: {
  redirectTo: string
  /** Ce qu'il faut dire en arrivant ici, hors lien mort : la session a expiré. */
  info?: string
}) {
  const [mode, setMode] = useState<Mode>('mdp')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [voir, setVoir] = useState(false)
  /* Un lien mort le DIT. L'écran se taisait : on arrivait d'un clic sur un
     lien, et rien n'expliquait pourquoi on se retrouvait à la porte. */
  const [lienMort] = useState(() => erreurDeLien(window.location.href))
  const [msg, setMsg] = useState(lienMort ?? info ?? ''); const [err, setErr] = useState(!!(lienMort ?? info))
  const [envoi, setEnvoi] = useState(false)

  /* Puis on l'efface de la barre d'adresse : un fragment d'erreur qui traîne
     est exactement ce qui empoisonnait les liens suivants. Le chemin seul
     suffit — l'application ne porte rien dans la requête. */
  useEffect(() => {
    if (lienMort) window.history.replaceState(window.history.state, '', window.location.pathname)
  }, [lienMort])

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }

  /**
   * Le même message, que l'adresse ait un compte ou non.
   *
   * ⚠️ Le message uniforme ne suffisait pas : il n'était rendu que dans le cas
   *    SANS erreur, et le cas avec erreur affichait le texte brut de Supabase,
   *    qui, lui, distingue. Deux clics de suite sur « réinitialiser » donnaient
   *    « you can only request this after 60 seconds » sur une adresse connue,
   *    et le message uniforme sur une inconnue : le formulaire devenait un
   *    moyen de tester quelles adresses sont inscrites.
   *
   *    Ce qui mérite d'être dit à quelqu'un — « attends une minute » — l'est,
   *    en français, et sans rien révéler de plus.
   */
  function sansFuite(erreur: { message: string } | null, succes: string): string {
    if (!erreur) return succes
    if (/only request this after|rate limit|too many/i.test(erreur.message)) {
      return 'Doucement : attends une minute avant de redemander un lien.'
    }
    if (/invalid|email/i.test(erreur.message) && /format|valid/i.test(erreur.message)) {
      return 'Cette adresse n’a pas l’air valide.'
    }
    // Tout le reste est un incident de notre côté, pas une information sur
    // l'adresse : on ne le détaille pas.
    return succes
  }

  async function agir() {
    setEnvoi(true)
    /* Une connexion RÉUSSIE garde le bouton en attente : l'écran ne change
       qu'une fois le foyer relu, deux allers-retours plus tard. Réactivé
       entre-temps, un second clic ouvrait une seconde session — ou, pris par
       la limite de débit, disait « mot de passe incorrect » à quelqu'un qui
       venait d'entrer. */
    let entre = false
    try {
      if (mode === 'mdp') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
        if (error) dire(estUnePanneDeReseau(error) ? PAS_DE_RESEAU : 'E-mail ou mot de passe incorrect.', true)
        else entre = true
        return
      }
      if (mode === 'premiere') {
        const { error } = await supabase.auth.signInWithOtp({
          email, options: { emailRedirectTo: cible },
        })
        if (estUnePanneDeReseau(error)) return dire(PAS_DE_RESEAU, true)
        dire(sansFuite(error,
          `Lien envoyé à ${email}. Ouvre-le depuis cet appareil : tu choisiras `
          + `ton mot de passe juste après.`), false)
        return
      }
      /*
       * ⚠️ `resetPasswordForEmail`, pas `signInWithOtp`.
       *
       *    C'est ce qui fait arriver la session avec l'événement
       *    `PASSWORD_RECOVERY`, sur lequel l'application force l'écran du mot de
       *    passe. Avec un simple lien de connexion, quelqu'un qui en a déjà un
       *    était reconnecté sans qu'on lui demande rien — le défaut d'origine.
       */
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: cible })
      /* Une panne n'apprend rien sur l'adresse : on ne dit PAS « le lien vient de partir ». */
      if (estUnePanneDeReseau(error)) return dire(PAS_DE_RESEAU, true)
      dire(sansFuite(error,
        `Si un compte existe pour ${email}, le lien vient de partir. `
        + `Il est valable une heure.`), false)
    } finally {
      if (!entre) setEnvoi(false)
    }
  }

  /* ⚠️ Le titre « On s’y met ? » datait du premier jour — 17 septembre, « interface, 5 écrans » —
     quand l'application ne faisait que le batch cooking. Elle s'appelle Popote depuis, et gère
     aussi ce que ça coûte : l'écran porte la marque et dit les deux, sur la porte d'un frigo.

     Personne ne l'avait vu parce que TOUS les bancs commencent par se connecter : le seul écran
     qu'on voit avant de l'être est le seul que personne ne regardait.

     Les portes s'ouvrent pendant l'envoi (`envoi`) et se referment à l'erreur : elles suivent l'état
     sans jamais l'attendre — la connexion part au clic, l'animation la regarde. */
  return (
    <EcranDeConnexion
      mode={mode} email={email} mdp={mdp} voir={voir} envoi={envoi} msg={msg} err={err}
      onEmail={setEmail} onMdp={setMdp} onVoir={() => setVoir(v => !v)}
      onMode={m => { setMode(m); setMsg(''); setVoir(false) }}
      onEnvoi={agir} />
  )
}
