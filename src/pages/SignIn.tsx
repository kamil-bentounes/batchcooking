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
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { Page, Bouton, Champ, Message } from '../ui/kit'

type Mode = 'mdp' | 'premiere' | 'oubli'

const CHAPEAU: Record<Mode, string> = {
  mdp: 'Ton e-mail et ton mot de passe.',
  premiere: 'On t’envoie un lien. Il sert une fois, à prouver que l’adresse est '
    + 'la tienne — ensuite tu choisis ton mot de passe.',
  oubli: 'On t’envoie un lien de réinitialisation. Il te mènera droit à l’écran '
    + 'du nouveau mot de passe.',
}

const ACTION: Record<Mode, string> = {
  mdp: 'Se connecter',
  premiere: 'Recevoir le lien',
  oubli: 'Réinitialiser mon mot de passe',
}

export function SignIn({ redirectTo }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>('mdp')
  const [email, setEmail] = useState('')
  const [mdp, setMdp] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)
  const [envoi, setEnvoi] = useState(false)

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }
  const cible = redirectTo ?? window.location.href

  async function agir() {
    setEnvoi(true)
    try {
      if (mode === 'mdp') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: mdp })
        if (error) dire('E-mail ou mot de passe incorrect.', true)
        return
      }
      if (mode === 'premiere') {
        const { error } = await supabase.auth.signInWithOtp({
          email, options: { emailRedirectTo: cible },
        })
        dire(error ? error.message
          : `Lien envoyé à ${email}. Ouvre-le depuis cet appareil : tu choisiras `
            + `ton mot de passe juste après.`, !!error)
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
      /*
       * On ne dit JAMAIS si l'adresse a un compte. Répondre « ce compte
       * n'existe pas » ferait de ce formulaire un moyen de tester quelles
       * adresses sont inscrites. Le message est donc le même dans les deux cas.
       */
      dire(error ? error.message
        : `Si un compte existe pour ${email}, le lien vient de partir. `
          + `Il est valable une heure.`, !!error)
    } finally {
      setEnvoi(false)
    }
  }

  return (
    <Page centre titre="On cuisine ?" chapeau={CHAPEAU[mode]}>
      <div className="space-y-5">
        <Champ label="Ton e-mail" type="email" value={email} autoComplete="email"
               placeholder="toi@exemple.fr" onChange={e => setEmail(e.target.value)} />

        {mode === 'mdp' && (
          <Champ label="Mot de passe" type="password" value={mdp} autoComplete="current-password"
                 placeholder="••••••••" onChange={e => setMdp(e.target.value)} />
        )}

        <Bouton onClick={agir}
                disabled={!email || (mode === 'mdp' && !mdp) || envoi}>
          {envoi ? 'Un instant…' : ACTION[mode]}
        </Bouton>
      </div>

      <Message texte={msg} erreur={err} />

      {/* Les deux chemins sont SÉPARÉS, et nommés pour ce qu'ils font. */}
      <div className="mt-7 space-y-2.5">
        {mode !== 'mdp' && (
          <button onClick={() => { setMode('mdp'); setMsg('') }}
                  className="block text-herbe underline underline-offset-4 text-[15px]">
            J’ai déjà un mot de passe
          </button>
        )}
        {mode !== 'premiere' && (
          <button onClick={() => { setMode('premiere'); setMsg('') }}
                  className="block text-herbe underline underline-offset-4 text-[15px]">
            Première connexion
          </button>
        )}
        {mode !== 'oubli' && (
          <button onClick={() => { setMode('oubli'); setMsg('') }}
                  className="block text-doux underline underline-offset-4 text-[15px]">
            Mot de passe oublié
          </button>
        )}
      </div>
    </Page>
  )
}
