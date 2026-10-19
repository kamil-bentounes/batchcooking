/**
 * Rejoindre un foyer par son lien, SANS compte.
 *
 * Décision du 19/10/2026 : le lien suffit. Cinq invitées réelles n'avaient
 * jamais dépassé la création de compte : le mail d'invitation portait un lien
 * de connexion Supabase, mort au bout d'une heure, consommé par les antivirus
 * de messagerie, parti par un serveur limité à deux mails par heure. Le 30
 * septembre, l'une a ouvert un mail vieux de huit jours : lien mort.
 *
 * Ici, le lien `/invite/<jeton>` — trente jours, une seule fois — suffit :
 * elle lit qui l'invite, choisit son mot de passe, et son compte naît. Aucun
 * mail à attendre.
 */
import { useEffect, useState } from 'react'
import { callFunctionPublique, ErreurDeFonction, supabase } from '../lib/supabase'
import { erreurDeLien } from '../lib/lien.ts'
import { Page, Bouton, Champ, Message } from '../ui/kit'

type Info = {
  email: string
  invite_par: string
  expire_le: string
  etat: 'valide' | 'expiree' | 'utilisee'
}

/** `undefined` : on lit encore. `null` : aucune invitation derrière ce jeton. */
type Lecture = Info | null | undefined

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function Rejoindre({ token, connexion }: {
  token: string
  /** Elle a déjà un compte : l'écran de connexion, sur ce même lien. */
  connexion: () => void
}) {
  const [info, setInfo] = useState<Lecture>(undefined)
  const [horsLigne, setHorsLigne] = useState(false)
  const [mdp, setMdp] = useState('')
  const [voir, setVoir] = useState(false)
  const [envoi, setEnvoi] = useState(false)
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)
  const [dejaUnCompte, setDejaUnCompte] = useState(false)

  /* ⚠️ Un ancien mail d'invitation dépose ici `#error=…otp_expired…`. Ce
     lien-là ne sert plus à rien, mais son fragment empoisonnait la session
     suivante (voir `App.tsx`) : on l'efface, et le formulaire suffit. */
  useEffect(() => {
    if (erreurDeLien(window.location.href)) {
      window.history.replaceState(window.history.state, '', window.location.pathname)
    }
  }, [])

  // Un jeton mal recopié n'est pas un UUID : la base le refuserait en anglais.
  const lisible = UUID.test(token)

  useEffect(() => {
    let vivant = true
    if (!lisible) return
    supabase.rpc('invitation_par_jeton', { jeton: token }).then(({ data, error }) => {
      if (!vivant) return
      if (error) { setHorsLigne(true); return }
      setInfo((data?.[0] as Info | undefined) ?? null)
    })
    return () => { vivant = false }
  }, [token, lisible])

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }

  async function creer() {
    if (!info) return
    setEnvoi(true)
    try {
      await callFunctionPublique('accept-invite', { token, mot_de_passe: mdp })
    } catch (e) {
      if (e instanceof ErreurDeFonction && e.code === 'compte_existant') setDejaUnCompte(true)
      dire(e instanceof Error ? e.message : String(e), true)
      setEnvoi(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email: info.email, password: mdp })
    if (error) {
      setDejaUnCompte(true)
      dire('Ton compte est créé. Connecte-toi avec ton e-mail et ce mot de passe.', true)
      setEnvoi(false)
      return
    }
    /* `BASE_URL`, pas `'/'` : le site est servi sous un sous-chemin. Et on
       REMPLACE l'entrée : revenir en arrière ne doit pas rouvrir ce lien,
       qui dirait alors « déjà servi » à celle qui vient de s'en servir. */
    window.location.replace(import.meta.env.BASE_URL)
  }

  if (horsLigne) {
    return (
      <Page centre marque titre="Ce lien n’a pas pu être lu"
            chapeau="Vérifie ta connexion, puis recharge la page.">
        <Bouton onClick={() => window.location.reload()}>Recharger</Bouton>
      </Page>
    )
  }
  if (lisible && info === undefined) {
    return <main className="min-h-dvh grid place-items-center text-doux">Un instant…</main>
  }

  const jaiUnCompte = (
    <button onClick={connexion}
            className="mt-7 block text-herbe underline underline-offset-4 text-[15px]">
      J’ai déjà un compte
    </button>
  )

  if (!lisible || !info) {
    return (
      <Page centre marque titre="Ce lien ne mène nulle part"
            chapeau="Il a peut-être été mal recopié. Demande à la personne qui t’invite de te le renvoyer.">
        {jaiUnCompte}
      </Page>
    )
  }
  if (info.etat === 'expiree') {
    return (
      <Page centre marque titre="Ce lien a expiré"
            chapeau={`Demande à ${info.invite_par === 'Ton foyer' ? 'la personne qui t’invite'
              : info.invite_par} de t’en envoyer un nouveau : il vaudra trente jours.`}>
        {jaiUnCompte}
      </Page>
    )
  }
  if (info.etat === 'utilisee') {
    return (
      <Page centre marque titre="Ce lien a déjà servi"
            chapeau="Si tu l’as déjà utilisé, connecte-toi avec ton e-mail et ton mot de passe.">
        <Bouton onClick={connexion}>Me connecter</Bouton>
      </Page>
    )
  }

  const titre = info.invite_par === 'Ton foyer'
    ? 'On t’attend dans un foyer'
    : `${info.invite_par} t’invite`

  return (
    <Page centre marque titre={titre}
          chapeau="Choisis ton mot de passe : ton compte est créé, et tu rejoins le foyer — les courses, le budget et les sessions de cuisine.">
      <div className="space-y-5">
        <Champ label="Ton e-mail" type="email" value={info.email} readOnly
               autoComplete="username" />
        <Champ label="Choisis ton mot de passe" type={voir ? 'text' : 'password'} value={mdp}
               autoComplete="new-password" placeholder="8 caractères au moins"
               onChange={e => setMdp(e.target.value)} />
        <button type="button" onClick={() => setVoir(v => !v)}
                className="-mt-2 text-doux underline underline-offset-4 text-[15px]">
          {voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        </button>
        <Bouton onClick={creer} disabled={mdp.length < 8 || envoi}>
          {envoi ? 'Un instant…' : 'Créer mon compte'}
        </Bouton>
      </div>
      <Message texte={mdp.length > 0 && mdp.length < 8 ? 'Il en faut au moins 8.' : msg}
               erreur={err || (mdp.length > 0 && mdp.length < 8)} />
      {dejaUnCompte
        ? <div className="mt-5"><Bouton variante="discret" onClick={connexion}>Me connecter</Bouton></div>
        : jaiUnCompte}
    </Page>
  )
}
