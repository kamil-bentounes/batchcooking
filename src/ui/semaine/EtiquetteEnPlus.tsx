/**
 * « Photographier l'étiquette », depuis « en plus » : une feuille lit l'emballage et ajoute ce qu'on en a mangé.
 *
 * La photo (jusqu'à trois : la face, le tableau, la date) part à la fonction `etiquette` avec, si on l'a écrite, la
 * consigne : « Skyr vanille, pot de 150 g. J'ai mangé le pot entier. » C'est un INDICE (le nom, l'unité, le poids que
 * l'emballage ne dit pas), jamais des chiffres : les valeurs pour 100 g se recopient de l'étiquette. La feuille les montre,
 * demande « J'en ai mangé, en grammes » (le poids lu, d'office), calcule, et — case cochée d'office — garde l'aliment dans
 * nos aliments. Rien n'est écrit tant qu'on n'a pas appuyé sur « Ajouter au soir ».
 *
 * Le délai, les pannes et les messages sont ceux de la lecture dans « Nos aliments » (`etiquette.ts`).
 */
import { useEffect, useId, useRef, useState } from 'react'
import { Feuille } from '../budget/Feuille.tsx'
import { Erreur } from '../coque.tsx'
import { Appareil } from '../aliments/Pictos.tsx'
import { callFunction } from '../../lib/supabase.ts'
import { prepare } from '../../lib/photo.ts'
import { photoEnFrancais } from '../../lib/reseau.ts'
import { useAjouteExtra } from '../../lib/donnees/barquettes.ts'
import type { Case } from '../../lib/donnees/barquettes.ts'
import { useEnregistreAliment } from '../../lib/donnees/aliments.ts'
import type { Aliment } from '../../lib/donnees/aliments.ts'
import { douteSurLEnergie, lisLeNombre, phraseDuDoute } from '../../lib/aliments/brouillon.ts'
import { DELAI_ETIQUETTE_MS, champsDeLEtiquette, phraseDeLaPanne } from '../../lib/aliments/etiquette.ts'
import type { LectureEtiquette } from '../../lib/aliments/etiquette.ts'
import { CONSIGNE_MAX, corpsDeLaLecture } from '../../lib/aliments/consigne.ts'
import {
  boutonAjouter, brouillonDeLAliment, calculEnDirect, depuisLaLecture, etiquetteVide, lisLEtiquette, phraseCourteDuCalcul,
} from '../../lib/aliments/en-plus.ts'
import type { ErreursDeLEtiquette, EtiquetteEnPlus as Champs } from '../../lib/aliments/en-plus.ts'
import { ecrit } from '../../lib/aliments/calcul.ts'
import { MOT_DU_MOMENT } from '../../lib/choix.ts'

type Lecture =
  | { etat: 'en-cours' }
  | { etat: 'fait'; notes: string[]; lu: boolean; calculDuPoids: string | null }
  | { etat: 'panne'; texte: string }

const CADRE = { boxShadow: 'inset 0 0 0 1px var(--color-brume)' } as const
const LIEN = 'inline-flex min-h-11 items-center text-[14px] font-semibold text-herbe underline underline-offset-[3px]'

/** Un bouton qui ouvre l'appareil photo (la même astuce du `<label>` que `BoutonPhoto`, avec le petit appareil). */
export function BoutonAppareil({ texte, onFichier, className, inputRef }: {
  texte: string; onFichier: (f: File) => void; className: string; inputRef?: React.Ref<HTMLInputElement>
}) {
  return (
    <label className={`${className} flex cursor-pointer items-center justify-center gap-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-herbe`}>
      <Appareil taille={18} /><span>{texte}</span>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="sr-only"
             onChange={e => {
               const f = e.target.files?.[0]
               if (f) onFichier(f)
               /* Reprendre DEUX FOIS la même photo doit marcher : sans cela le second choix ne déclenche aucun `change`. */
               e.target.value = ''
             }} />
    </label>
  )
}

/** Un champ de la feuille : son nom en clair, sa case, sa phrase de refus dessous. */
function Zone({ id, nom, valeur, surChange, erreur, unite, inputMode = 'decimal', pleine = false }: {
  id: string; nom: string; valeur: string; surChange: (v: string) => void; erreur?: string; unite?: string
  inputMode?: 'decimal' | 'text'; pleine?: boolean
}) {
  return (
    <div className={pleine ? 'col-span-2' : undefined}>
      <label htmlFor={id} className="block text-[13px] font-semibold">{nom}</label>
      <div className="mt-1 flex items-center gap-1.5">
        <input id={id} value={valeur} onChange={e => surChange(e.target.value)} inputMode={inputMode} autoComplete="off"
               aria-invalid={erreur ? true : undefined} aria-describedby={erreur ? `${id}-erreur` : undefined}
               className="h-11 min-w-0 flex-1 rounded-[12px] bg-fond px-3 text-[16px] text-encre"
               style={erreur ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE} />
        {unite && <span className="shrink-0 text-[13px] text-doux">{unite}</span>}
      </div>
      {erreur && <p id={`${id}-erreur`} className="mt-1 text-[12px] leading-[1.35] text-groseille">{erreur}</p>}
    </div>
  )
}

const MAX_PHOTOS = 3

export function EtiquetteEnPlus({ cas, photoInitiale, fermer, surFini }: {
  /** La case du moment, réelle ou seulement affichée (elle se crée à l'ajout). */
  cas: Pick<Case, 'id' | 'user_profile_id' | 'day' | 'meal'>
  /** La première photo, déjà réduite (`prepare`) : la lecture part dès que la feuille s'ouvre. */
  photoInitiale: string
  fermer: () => void
  /** L'extra est écrit : la feuille se referme, et l'appelant aussi. */
  surFini?: () => void
}) {
  const id = useId()
  const mot = MOT_DU_MOMENT[cas.meal] ?? MOT_DU_MOMENT.diner
  const [photos, setPhotos] = useState<string[]>([photoInitiale])
  const [consigne, setConsigne] = useState('')
  const [lecture, setLecture] = useState<Lecture>({ etat: 'en-cours' })
  const [e, setE] = useState<Champs>(etiquetteVide)
  const [corrige, setCorrige] = useState(false)
  const [garder, setGarder] = useState(true)
  const [justes, setJustes] = useState<string | null>(null)
  const [erreurs, setErreurs] = useState<ErreursDeLEtiquette>({})
  const [panne, setPanne] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreurPhoto, setErreurPhoto] = useState('')

  const enregistre = useEnregistreAliment()
  const ajoute = useAjouteExtra()
  /* La lecture qui compte est la dernière : une photo reprise pendant qu'une autre se lit ne laisse pas l'ancienne
     réponse écraser la nouvelle. */
  const lectures = useRef(0)
  const demarre = useRef(false)
  /* Ce que la personne a tapé elle-même : une nouvelle lecture ne le remplace pas (les grammes mangés). */
  const grammesTapes = useRef(false)
  /* L'aliment déjà créé par un essai dont l'ajout a échoué : un second essai ne le recrée pas (le nom est unique). */
  const dejaCree = useRef<{ aliment: Aliment; signature: string } | null>(null)
  /* Un ajout à la fois : un double toucher n'écrit pas deux fois. */
  const enVol = useRef(false)
  const bouton = useRef<HTMLInputElement>(null)

  async function lisLesPhotos(lot: string[], texte: string) {
    const moi = ++lectures.current
    const debut = Date.now()
    setPhotos(lot)
    setLecture({ etat: 'en-cours' })
    try {
      const r = await callFunction<LectureEtiquette>('etiquette', corpsDeLaLecture(lot, texte), DELAI_ETIQUETTE_MS)
      if (moi !== lectures.current) return
      if (r.erreur) throw new Error(r.erreur)
      const { champs, notes, calculDuPoids } = champsDeLEtiquette(r)
      if (!r.lisible) {
        /* Rien n'a été lu : ce que des photos précédentes avaient donné reste. */
        setLecture({ etat: 'fait', notes, lu: false, calculDuPoids: null })
        setCorrige(true)
        return
      }
      setE(avant => {
        const lu = depuisLaLecture(champs)
        return { ...lu, grammes: grammesTapes.current ? avant.grammes : lu.grammes }
      })
      setErreurs({})
      setJustes(null)
      setCorrige(false)
      setLecture({ etat: 'fait', notes, lu: true, calculDuPoids })
    } catch (err) {
      if (moi !== lectures.current) return
      lectures.current += 1
      setLecture({ etat: 'panne', texte: phraseDeLaPanne(err, Date.now() - debut) })
      setCorrige(true)
    }
  }

  useEffect(() => {
    if (demarre.current) return
    demarre.current = true
    void lisLesPhotos([photoInitiale], '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- une seule lecture à l'ouverture (StrictMode la monte deux fois)
  }, [])

  async function surPhoto(f: File, ajouteUneFace: boolean) {
    setErreurPhoto('')
    let p: string
    try { p = (await prepare(f)).dataUrl } catch (err) { setErreurPhoto(photoEnFrancais(err)); return }
    await lisLesPhotos(ajouteUneFace ? [...photos, p].slice(0, MAX_PHOTOS) : [p], consigne)
  }

  const pose = (c: keyof Champs) => (v: string) => {
    if (c === 'grammes') grammesTapes.current = v.trim() !== ''
    setE(p => ({ ...p, [c]: v }))
    setErreurs(x => ({ ...x, [c]: undefined, energie: undefined, macros: undefined }))
    setJustes(null)
  }

  const calcul = calculEnDirect(e)
  const empreinte = [e.kcal, e.proteines, e.glucides, e.lipides, e.fibres].map(x => x.trim()).join('|')
  const energieJuste = justes === empreinte
  const doute = douteSurLEnergie(brouillonDeLAliment(e))
  const nom = e.label.replace(/\s+/g, ' ').trim()
  const lectureEnCours = lecture.etat === 'en-cours'

  async function ajouter() {
    if (enVol.current || lectureEnCours) return
    const r = lisLEtiquette(e, { energieJuste })
    if (!r.ok) {
      setErreurs(r.erreurs)
      const premier = (['label', 'kcal', 'proteines', 'glucides', 'lipides', 'fibres', 'macros', 'energie', 'grammes'] as const)
        .find(c => r.erreurs[c])
      if (premier && ['label', 'kcal', 'proteines', 'glucides', 'lipides', 'fibres'].includes(premier)) setCorrige(true)
      setTimeout(() => document.getElementById(`${id}-${premier === 'macros' ? 'proteines' : premier === 'energie' ? 'energie' : premier}`)?.focus(), 0)
      return
    }
    setErreurs({})
    setPanne('')
    enVol.current = true
    setEnCours(true)
    try {
      let alimentId: string | null = null
      if (garder) {
        const signature = JSON.stringify(r.aliment)
        const deja = dejaCree.current
        const aliment = deja && deja.signature === signature ? deja.aliment
          : await enregistre.mutateAsync({ id: deja?.aliment.id, valeurs: r.aliment })
        dejaCree.current = { aliment, signature }
        alimentId = aliment.id
      }
      await ajoute.mutateAsync({ cas, ...r.extra, alimentId })
      surFini?.()
      fermer()
    } catch (err) {
      setPanne(err instanceof Error ? err.message : String(err))
    } finally {
      enVol.current = false
      setEnCours(false)
    }
  }

  /* Ce qui a été lu, en une ligne : « 64 kcal · 9,5 g de protéines · 6,1 g de glucides · 0,2 g de lipides ». */
  const lu = (() => {
    const n = (v: string) => lisLeNombre(v)
    const dit = (v: string, suite: string, zeroDit = true) => {
      const x = n(v)
      return x === null || Number.isNaN(x) || (!zeroDit && x === 0) ? null : `${ecrit(x)} ${suite}`
    }
    return [dit(e.kcal, 'kcal'), dit(e.proteines, 'g de protéines'), dit(e.glucides, 'g de glucides'), dit(e.lipides, 'g de lipides'),
      dit(e.fibres, 'g de fibres', false)].filter((x): x is string => x !== null)
  })()

  return (
    <Feuille ouverte fermer={fermer} titre={`L’étiquette, en plus ${mot.du}`}>
      <h2 className="titre mx-1 text-[24px] font-semibold">L’étiquette, en plus {mot.du}</h2>

      {/* Les photos : la face, le tableau, la date. */}
      <div className="mx-1 mt-3 grid gap-2 rounded-[18px] bg-[#24342B] p-2"
           style={{ gridTemplateColumns: `repeat(${photos.length}, minmax(0, 1fr))` }}>
        {photos.map((p, i) => (
          <img key={i} src={p} alt={`Photo ${i + 1} de l’étiquette`} className="h-[150px] w-full rounded-[12px] bg-[#1b2822] object-contain" />
        ))}
      </div>
      <div className="mx-1 mt-1 flex flex-wrap gap-x-4">
        <BoutonAppareil texte="Reprendre la photo" onFichier={f => surPhoto(f, false)} inputRef={bouton}
                        className="min-h-11 text-[14px] font-semibold text-herbe underline underline-offset-[3px]" />
        {photos.length < MAX_PHOTOS && (
          <BoutonAppareil texte="Ajouter l’autre face" onFichier={f => surPhoto(f, true)}
                          className="min-h-11 text-[14px] font-semibold text-herbe underline underline-offset-[3px]" />
        )}
      </div>
      {erreurPhoto && <p role="alert" className="mx-1 text-[13px] leading-[1.45] text-groseille">{erreurPhoto}</p>}

      {/* La consigne : un indice facultatif, relu à la demande. */}
      <div className="mx-1 mt-2">
        <label htmlFor={`${id}-consigne`} className="block text-[15px] font-bold">Dis-moi ce que c’est (facultatif)</label>
        <textarea id={`${id}-consigne`} value={consigne} onChange={ev => setConsigne(ev.target.value)} rows={2} maxLength={CONSIGNE_MAX}
                  placeholder="Skyr vanille, pot de 150 g. J’ai mangé le pot entier."
                  className="mt-1.5 w-full resize-none rounded-[14px] bg-surface px-3.5 py-2.5 text-[16px] leading-[1.4] text-encre placeholder:text-doux/70"
                  style={CADRE} />
        <button type="button" disabled={lectureEnCours} onClick={() => lisLesPhotos(photos, consigne)}
                className={`${LIEN} disabled:opacity-60`}>
          Relire avec cette consigne
        </button>
      </div>

      {lecture.etat === 'en-cours' && <p role="status" className="mx-1 mt-1 text-[15px] font-bold">Je lis l’étiquette…</p>}
      {lecture.etat === 'panne' && (
        <div className="mx-1 mt-1">
          <p role="alert" className="text-[13px] leading-[1.45] text-groseille">{lecture.texte}</p>
          <button type="button" onClick={() => lisLesPhotos(photos, consigne)} className={LIEN}>Réessayer</button>
        </div>
      )}
      {lecture.etat === 'fait' && lecture.notes.length > 0 && (
        <ul className="mx-1 mt-1 space-y-1 text-[13px] leading-[1.45] text-ocre">
          {lecture.notes.map(n => <li key={n}>{n}</li>)}
        </ul>
      )}

      {/* Ce qui a été lu, pour 100 g ; « Corriger » ouvre les cases. */}
      <div className="mx-1 mt-3 rounded-[18px] bg-surface px-3.5 py-3" style={CADRE}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-doux">Lu sur l’étiquette, pour 100 g</p>
          <button type="button" aria-pressed={corrige} disabled={lectureEnCours} onClick={() => setCorrige(c => !c)}
                  className="inline-flex min-h-11 items-center text-[13px] font-semibold text-herbe underline underline-offset-[3px] disabled:opacity-60">
            {corrige ? 'Fermer les cases' : 'Corriger'}
          </button>
        </div>
        {!corrige && (
          <p data-lu="" className="text-[15px] leading-[1.5]">
            {lu.length === 0
              ? <span className="text-doux">{lectureEnCours ? '…' : 'Rien de lu pour l’instant.'}</span>
              : lu.map((x, i) => (
                <span key={x}>{i > 0 && <span className="text-doux"> · </span>}{i === 0 ? <b>{x}</b> : x}</span>
              ))}
          </p>
        )}
        {(corrige || nom === '') && (
          <div className="mt-2 grid grid-cols-2 gap-x-2.5 gap-y-2.5">
            <Zone id={`${id}-label`} nom="Son nom" valeur={e.label} surChange={pose('label')} erreur={erreurs.label} inputMode="text" pleine />
            {corrige && (
              <>
                <Zone id={`${id}-kcal`} nom="Calories" unite="kcal" valeur={e.kcal} surChange={pose('kcal')} erreur={erreurs.kcal} />
                <Zone id={`${id}-proteines`} nom="Protéines" unite="g" valeur={e.proteines} surChange={pose('proteines')} erreur={erreurs.proteines} />
                <Zone id={`${id}-glucides`} nom="Glucides" unite="g" valeur={e.glucides} surChange={pose('glucides')} erreur={erreurs.glucides} />
                <Zone id={`${id}-lipides`} nom="Lipides" unite="g" valeur={e.lipides} surChange={pose('lipides')} erreur={erreurs.lipides} />
                <Zone id={`${id}-fibres`} nom="Fibres" unite="g" valeur={e.fibres} surChange={pose('fibres')} erreur={erreurs.fibres} />
              </>
            )}
          </div>
        )}
        {!corrige && (erreurs.kcal || erreurs.proteines) && (
          <p role="alert" className="mt-1 text-[13px] text-groseille">{[erreurs.kcal, erreurs.proteines].filter(Boolean).join(' ')}</p>
        )}
        {erreurs.macros && <p role="alert" className="mt-1 text-[13px] text-groseille">{erreurs.macros}</p>}
        {doute && (erreurs.energie || energieJuste) && (
          <div id={`${id}-energie`} className="mt-2 rounded-[14px] bg-sable px-3 py-2.5">
            <p role="alert" className="text-[14px] leading-[1.45]">{phraseDuDoute(doute)}</p>
            <label className="mt-1 flex min-h-11 items-center gap-2.5 text-[14px] font-semibold">
              <input type="checkbox" checked={energieJuste} onChange={ev => setJustes(ev.target.checked ? empreinte : null)}
                     className="h-5 w-5 shrink-0 accent-[var(--color-herbe)]" />
              Les valeurs sont justes
            </label>
          </div>
        )}
      </div>

      {/* Ce qu'on en a mangé, et ce que ça pèse. */}
      <div className="mx-1 mt-4">
        <label htmlFor={`${id}-grammes`} className="block text-[15px] font-bold">J’en ai mangé, en grammes</label>
        <div className="mt-1.5 flex items-center gap-3">
          <input id={`${id}-grammes`} value={e.grammes} onChange={ev => pose('grammes')(ev.target.value)} inputMode="decimal" autoComplete="off"
                 aria-invalid={erreurs.grammes ? true : undefined} aria-describedby={erreurs.grammes ? `${id}-grammes-erreur` : undefined}
                 className="h-12 min-w-0 flex-1 rounded-[14px] bg-surface px-3.5 text-[17px] text-encre"
                 style={erreurs.grammes ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE} />
          <p aria-live="polite" data-calcul="" className="titre w-[132px] shrink-0 text-[18px] font-semibold leading-[1.2] text-herbe">
            {calcul ? phraseCourteDuCalcul(calcul) : ''}
          </p>
        </div>
        {erreurs.grammes && <p id={`${id}-grammes-erreur`} className="mt-1 text-[13px] text-groseille">{erreurs.grammes}</p>}
      </div>

      <label className="mx-1 mt-3 flex min-h-11 items-start gap-3 py-1.5 text-[15px] leading-[1.35]">
        <input type="checkbox" checked={garder} onChange={ev => setGarder(ev.target.checked)}
               className="mt-0.5 size-6 shrink-0 accent-[var(--color-herbe)]" />
        <span>Le garder dans nos aliments, sous « {nom || '…'} »</span>
      </label>

      {panne && <div className="mx-1"><Erreur de={panne} /></div>}
      <button type="button" onClick={ajouter} disabled={enCours || lectureEnCours}
              className="mx-1 mt-3 min-h-[56px] w-[calc(100%-0.5rem)] rounded-[18px] bg-herbe px-4 text-[17px] font-semibold text-fond disabled:opacity-60">
        {enCours ? 'J’ajoute…' : boutonAjouter(mot.au)}
      </button>
    </Feuille>
  )
}
