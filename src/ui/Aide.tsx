/**
 * « Demande à Popote » : l'aide intégrée.
 *
 * Un « ? » dans l'en-tête des trois écrans d'entrée (l'accueil, le budget, la cuisine), à côté de l'avatar ; partout
 * ailleurs, le même « ? » flotte dans la marge du haut, là où aucun écran ne met rien. Il ouvre une FEUILLE, sur
 * l'écran où l'on est — on ne le quitte pas pour demander.
 *
 * Une bulle flottante en bas à gauche a été écartée : elle recouvrait le bouton principal de chaque formulaire.
 *
 * L'écran ne présente que ce que la fonction rend : la réponse, les pages dont elle vient, un écran à ouvrir, et ce
 * qu'elle n'a pas pu confirmer — qu'il dit plutôt que de le taire.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  OUVRE_L_AIDE, QUESTION_MAX, demande, ligneDeSource, miseEnGarde, signale, typographie, type Reponse,
} from '../lib/aide/aide.ts'
import { SOUVENT, aLeBoutonDansSonEntete, ecranPourLAide, surCetEcran } from '../lib/aide/suggestions.ts'
import { Erreur } from './coque.tsx'

type Message =
  | { role: 'moi'; texte: string }
  | { role: 'aide'; question: string; reponse: Reponse; etat: 'rien' | 'envoi' | 'fait' | 'echec' }

const FOCALISABLE = 'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

/** Le « ? » d'un en-tête : il ne sait pas ouvrir la feuille, il prévient `Aide`. 44 px touchables, 34 visibles, comme l'avatar. */
export function BoutonAide() {
  return (
    <button type="button" aria-label="Poser une question à l’aide"
            onClick={() => window.dispatchEvent(new Event(OUVRE_L_AIDE))}
            className="w-11 h-11 grid place-items-center">
      <Pastille />
    </button>
  )
}

function Pastille() {
  return (
    <span className="w-[34px] h-[34px] rounded-full border-[1.5px] border-herbe bg-surface text-herbe grid place-items-center">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4.5" />
        <circle cx="12" cy="18.2" r="0.6" fill="currentColor" />
      </svg>
    </span>
  )
}

/** La zone réellement visible : sous le clavier d'un téléphone, la feuille doit remonter avec lui. */
function useFenetre() {
  const lire = () => {
    const v = window.visualViewport
    return v
      ? { h: v.height, bas: Math.max(0, window.innerHeight - v.height - v.offsetTop) }
      : { h: window.innerHeight, bas: 0 }
  }
  const [f, setF] = useState(lire)
  useEffect(() => {
    const v = window.visualViewport
    if (!v) return
    const maj = () => setF(lire())
    v.addEventListener('resize', maj)
    v.addEventListener('scroll', maj)
    return () => { v.removeEventListener('resize', maj); v.removeEventListener('scroll', maj) }
  }, [])
  return f
}

/**
 * Monté UNE fois, dans l'appli connectée. Porte la conversation (elle survit à une fermeture de la feuille, pas à un
 * rechargement) et, hors des trois écrans à bouton d'en-tête, le « ? » flottant.
 */
export function Aide({ userId, ici, va }: { userId: string; ici: string; va: (v: string) => void }) {
  const [ouvert, setOuvert] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])

  useEffect(() => {
    const ouvre = () => setOuvert(true)
    window.addEventListener(OUVRE_L_AIDE, ouvre)
    return () => window.removeEventListener(OUVRE_L_AIDE, ouvre)
  }, [])

  return (
    <>
      {/* Toujours monté, même sous la feuille : le focus lui revient à la fermeture. */}
      {!aLeBoutonDansSonEntete(ici) && (
        <button type="button" aria-label="Poser une question à l’aide" onClick={() => setOuvert(true)}
                className="fixed right-3 top-[max(0.25rem,env(safe-area-inset-top))] z-30 w-11 h-11 grid place-items-center">
          <Pastille />
        </button>
      )}
      {ouvert && (
        <Feuille userId={userId} ici={ici} va={va} messages={messages} setMessages={setMessages}
                 ferme={() => setOuvert(false)} />
      )}
    </>
  )
}

function Feuille({ userId, ici, va, messages, setMessages, ferme }: {
  userId: string; ici: string; va: (v: string) => void
  messages: Message[]; setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  ferme: () => void
}) {
  const { data: foyer } = useFoyer()
  const titreId = useId()
  const racine = useRef<HTMLDivElement>(null)
  const champ = useRef<HTMLInputElement>(null)
  const fin = useRef<HTMLDivElement>(null)
  const [saisie, setSaisie] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<unknown>(null)
  const fenetre = useFenetre()

  /* Le focus entre dans la feuille et revient à ce qui l'avait ouverte ; la page dessous ne défile plus. */
  useEffect(() => {
    const avant = document.activeElement
    champ.current?.focus()
    const html = document.documentElement
    const overflow = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = overflow
      if (avant instanceof HTMLElement && avant.isConnected) avant.focus()
    }
  }, [])

  useEffect(() => { fin.current?.scrollIntoView?.({ block: 'end' }) }, [messages, enCours])

  const dernier = [...messages].reverse().find(m => m.role === 'aide')
  const precedent = dernier && dernier.role === 'aide'
    ? { question: dernier.question, reponse: dernier.reponse.reponse } : null

  async function pose(texte: string) {
    const question = texte.trim()
    if (question.length < 3 || enCours) return
    setSaisie(''); setErreur(null); setEnCours(true)
    setMessages(m => [...m, { role: 'moi', texte: question }])
    try {
      const reponse = await demande(question, precedent, ecranPourLAide(ici))
      setMessages(m => [...m, { role: 'aide', question, reponse, etat: 'rien' }])
    } catch (e) {
      /* La question revient dans le champ : un aller-retour raté ne doit pas la faire retaper. */
      setMessages(m => m.slice(0, -1))
      setSaisie(question)
      setErreur(e)
    } finally {
      setEnCours(false)
    }
  }

  function envoie(e: FormEvent) { e.preventDefault(); void pose(saisie) }

  async function signaleFaux(i: number) {
    const m = messages[i]
    if (m.role !== 'aide' || !foyer) return
    const maj = (etat: 'envoi' | 'fait' | 'echec') =>
      setMessages(ms => ms.map((x, j) => (j === i && x.role === 'aide' ? { ...x, etat } : x)))
    maj('envoi')
    try {
      await signale({
        foyerId: foyer.id, userId, question: m.question, reponse: m.reponse.reponse,
        pages: m.reponse.sources.map(s => s.id),
      })
      maj('fait')
    } catch { maj('echec') }
  }

  function clavier(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); ferme(); return }
    if (e.key !== 'Tab' || !racine.current) return
    const cibles = [...racine.current.querySelectorAll<HTMLElement>(FOCALISABLE)]
    if (cibles.length === 0) return
    const premiere = cibles[0], derniere = cibles[cibles.length - 1]
    if (e.shiftKey && document.activeElement === premiere) { e.preventDefault(); derniere.focus() }
    else if (!e.shiftKey && document.activeElement === derniere) { e.preventDefault(); premiere.focus() }
  }

  const suggestionsIci = surCetEcran(ici)

  return (
    <div className="fixed inset-0 z-40" onKeyDown={clavier}>
      <div aria-hidden="true" onClick={ferme} className="absolute inset-0 bg-encre/40" />
      <div ref={racine} role="dialog" aria-modal="true" aria-labelledby={titreId}
           style={{ height: Math.min(fenetre.h * 0.88, 720), bottom: fenetre.bas }}
           className="absolute inset-x-0 mx-auto w-full max-w-lg flex flex-col rounded-t-[28px] bg-surface
                      px-6 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(28,43,35,0.18)]">
        <div aria-hidden="true" className="mx-auto h-[5px] w-11 shrink-0 rounded-full bg-brume" />
        <div className="mt-4 flex shrink-0 items-center justify-between">
          <h2 id={titreId} className="titre text-[26px]">Demande à Popote</h2>
          <button type="button" onClick={ferme} aria-label="Fermer l’aide"
                  className="w-11 h-11 grid place-items-center rounded-full bg-piste">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                 strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <div role="log" aria-live="polite" className="mt-3 min-h-0 grow overflow-y-auto pr-1">
          {messages.length === 0 && (
            <>
              <p className="text-[15px] leading-[22px] text-doux">
                Je connais l’appli : ses écrans, ses règles, ses calculs. Je ne vois pas tes chiffres.
              </p>
              {suggestionsIci.length > 0 && <Suggestions titre="Sur cet écran" questions={suggestionsIci} pose={pose} />}
              <Suggestions titre="Souvent demandé" questions={SOUVENT} pose={pose} />
            </>
          )}

          <div className="flex flex-col gap-4">
            {messages.map((m, i) => m.role === 'moi' ? (
              <div key={i} className="self-end max-w-[85%] rounded-[22px] rounded-br-[6px] bg-herbe px-4 py-3
                                      text-[16px] leading-[23px] text-fond whitespace-pre-line">
                {m.texte}
              </div>
            ) : (
              <Echange key={i} m={m} ouvre={chemin => { ferme(); va(chemin) }} faux={() => void signaleFaux(i)} />
            ))}
            {enCours && (
              <div className="self-start rounded-[22px] rounded-bl-[6px] border border-brume bg-fond px-4 py-3
                              text-[15px] text-doux">
                Je cherche dans le manuel…
              </div>
            )}
          </div>
          <Erreur de={erreur} />
          <div ref={fin} />
        </div>

        <form onSubmit={envoie} className="mt-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <label htmlFor="question-aide" className="sr-only">Ta question</label>
            <input id="question-aide" ref={champ} type="text" value={saisie} maxLength={QUESTION_MAX}
                   onChange={e => setSaisie(e.target.value)} enterKeyHint="send" autoComplete="off"
                   placeholder="Pose ta question sur l’appli…"
                   className="h-14 min-w-0 grow rounded-full border border-brume bg-fond px-5 text-[16px]
                              placeholder:text-doux" />
            <button type="submit" aria-label="Envoyer" disabled={enCours || saisie.trim().length < 3}
                    className="h-14 w-14 shrink-0 grid place-items-center rounded-full bg-herbe text-fond
                               disabled:opacity-50">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
                   strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </button>
          </div>
          <p className="mt-2.5 px-1 text-[13px] leading-[18px] text-doux">
            Je réponds d’après le manuel de l’appli, relu contre le code.
          </p>
        </form>
      </div>
    </div>
  )
}

function Suggestions({ titre, questions, pose }: {
  titre: string; questions: string[]; pose: (q: string) => Promise<void>
}) {
  return (
    <>
      <p className="mt-6 mb-2.5 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">{titre}</p>
      <div className="flex flex-col gap-2.5">
        {questions.map(q => (
          <button key={q} type="button" onClick={() => void pose(q)}
                  className="min-h-[52px] rounded-2xl border border-brume bg-fond px-[18px] py-3 text-left text-[16px]">
            {q}
          </button>
        ))}
      </div>
    </>
  )
}

function Echange({ m, ouvre, faux }: {
  m: Extract<Message, { role: 'aide' }>; ouvre: (chemin: string) => void; faux: () => void
}) {
  const source = typographie(ligneDeSource(m.reponse.sources) ?? '')
  const garde = typographie(miseEnGarde(m.reponse) ?? '')
  return (
    <div className="self-start max-w-[92%]">
      <div className="rounded-[22px] rounded-bl-[6px] border border-brume bg-fond px-4 py-3.5 text-[16px]
                      leading-[24px] whitespace-pre-line">
        {typographie(m.reponse.reponse)}
      </div>
      {garde && <p role="note" className="mt-2 px-1 text-[13px] leading-[19px] text-ocre">{garde}</p>}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {m.reponse.ouvrir && (
          <button type="button" onClick={() => ouvre(m.reponse.ouvrir!.chemin)}
                  className="min-h-11 rounded-full bg-herbe px-[18px] text-[15px] font-medium text-fond">
            {m.reponse.ouvrir.bouton}
          </button>
        )}
        {m.etat === 'fait' ? (
          <p className="flex min-h-11 items-center px-1 text-[14px] text-doux">Merci, c’est noté.</p>
        ) : (
          <button type="button" onClick={faux} disabled={m.etat === 'envoi'}
                  className="min-h-11 rounded-full border border-brume bg-surface px-[18px] text-[15px] disabled:opacity-60">
            Cette réponse est fausse
          </button>
        )}
      </div>
      {m.etat === 'echec' && (
        <p role="alert" className="mt-1.5 px-1 text-[13px] text-groseille">
          Le signalement n’est pas parti. Réessaie dans un instant.
        </p>
      )}
      {source !== '' && <p className="mt-2 px-1 text-[13px] leading-[19px] text-doux">{source}</p>}
    </div>
  )
}
