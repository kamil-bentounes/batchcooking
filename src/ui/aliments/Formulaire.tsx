/**
 * Un aliment à nous : le créer, ou le modifier (maquette `Aliment.dc.html`).
 *
 * Trois façons de le remplir, qui ne remplissent QUE les champs du dessous — la personne les vérifie et les corrige
 * avant d'enregistrer :
 *  · « Étiquette » : une photo du tableau nutritionnel → la fonction `etiquette` recopie les valeurs pour 100 g et le
 *    poids net (elle lit, elle n'estime pas) ;
 *  · « À la main » : on tape ;
 *  · « Code-barres » : les chiffres, ou l'appareil photo quand le navigateur sait les lire → Open Food Facts.
 *
 * Le calcul d'une unité (valeurs × poids / 100) s'affiche en grand, sur la carte sombre : c'est ce qui entrera dans le
 * repas, en un geste.
 */
import { useEffect, useRef, useState } from 'react'
import { BarreAction, BoutonPhoto, Passage, Principal } from '../coque.tsx'
import { Confirmation } from '../Confirmation.tsx'
import { callFunction } from '../../lib/supabase.ts'
import { prepare } from '../../lib/photo.ts'
import { photoEnFrancais } from '../../lib/reseau.ts'
import { REPERES } from '../../lib/reperes.ts'
import { useEnregistreAliment, useRetireAliment } from '../../lib/donnees/aliments.ts'
import type { Aliment } from '../../lib/donnees/aliments.ts'
import {
  brouillonVide, codeAChercher, depuisLaBase, douteSurLEnergie, empreinteDesValeurs, lis, lisLeNombre, phraseDuDoute,
} from '../../lib/aliments/brouillon.ts'
import type { Brouillon, Champ, Erreurs, Source } from '../../lib/aliments/brouillon.ts'
import { DELAI_ETIQUETTE_MS, champsDeLEtiquette, phraseDeLaPanne } from '../../lib/aliments/etiquette.ts'
import type { ChampsLus, LectureEtiquette } from '../../lib/aliments/etiquette.ts'
import { cherche as chercheOpenFoodFacts, notesDuProduit } from '../../lib/aliments/openfoodfacts.ts'
import { ecrit, pourUneUnite } from '../../lib/aliments/calcul.ts'
import { repereProposePour } from '../../lib/aliments/ordre.ts'
import { Appareil, CodeBarres, Crayon, Pot } from './Pictos.tsx'
import { LecteurDeCodes } from './LecteurDeCodes.tsx'
import { saitLireUnCode } from '../../lib/aliments/lecteur.ts'

type Mode = 'etiquette' | 'main' | 'code'

const MODES: { id: Mode; nom: string; Icone: (p: { taille?: number }) => React.ReactNode }[] = [
  { id: 'etiquette', nom: 'Étiquette', Icone: Appareil },
  { id: 'main', nom: 'À la main', Icone: Crayon },
  { id: 'code', nom: 'Code-barres', Icone: CodeBarres },
]

/**
 * Un état de la lecture d'une photo ou d'un code : ce que l'écran en dit.
 * `tardif` : le résultat est arrivé APRÈS que la personne a modifié les champs : il n'a rien écrasé, et propose de les
 * remplacer (`applique`).
 */
type Dit =
  | { etat: 'rien' }
  | { etat: 'en-cours'; texte: string }
  | { etat: 'fait'; titre: string; notes: string[]; lu: boolean }
  | { etat: 'tardif'; titre: string; applique: () => void }
  | { etat: 'panne'; texte: string }

/** Les champs qu'une lecture remplit (et que « tapé à la main » protège). */
const CHAMPS_LUS = ['label', 'kcal', 'proteines', 'glucides', 'lipides', 'fibres', 'poids'] as const satisfies readonly Champ[]
const NOM_DU_CHAMP: Record<(typeof CHAMPS_LUS)[number], string> = {
  label: 'le nom', kcal: 'les calories', proteines: 'les protéines', glucides: 'les glucides', lipides: 'les lipides',
  fibres: 'les fibres', poids: 'le poids',
}

/** Le texte d'un nombre pour un champ : 12.5 → « 12,5 ». */
const t = (n: number) => String(n).replace('.', ',')

/** Les repères qu'un aliment peut remplacer : tous ceux de `reperes.ts`, par nom. */
const NOMS_DES_REPERES = [...new Set(REPERES.map(r => r.label))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))

/** Où le focus va, par ordre d'apparition à l'écran, quand l'enregistrement refuse. */
const CIBLES: [keyof Erreurs, string][] = [
  ['label', 'aliment-nom'], ['codeBarres', 'aliment-code'], ['kcal', 'aliment-kcal'], ['proteines', 'aliment-proteines'],
  ['glucides', 'aliment-glucides'], ['lipides', 'aliment-lipides'], ['fibres', 'aliment-fibres'],
  ['macros', 'aliment-proteines'], ['energie', 'aliment-energie-action'], ['unite', 'aliment-unite'], ['poids', 'aliment-poids'],
]

const CADRE = { boxShadow: 'inset 0 0 0 1px var(--color-brume)' } as const

/** Une valeur pour 100 g : son nom, son chiffre en grand (Fraunces), son unité. */
function Mesure({ nom, unite, valeur, erreur, id, surChange, surSortie }: {
  nom: string; unite: string; valeur: string; erreur?: string; id: string; surChange: (v: string) => void; surSortie?: () => void
}) {
  return (
    <div>
      <label className="block rounded-[14px] bg-surface px-3 py-2 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-herbe"
             style={erreur ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE}>
        <span className="block text-[12px] text-doux">{nom}</span>
        <span className="flex items-baseline gap-1">
          <input value={valeur} onChange={e => surChange(e.target.value)} onBlur={surSortie} inputMode="decimal" id={id}
                 aria-invalid={erreur ? true : undefined} aria-describedby={erreur ? `${id}-erreur` : undefined}
                 className="champ-mesure chiffre w-full min-w-0 bg-transparent p-0 text-[24px] font-semibold text-encre outline-none" />
          <span className="shrink-0 text-[13px] text-doux">{unite}</span>
        </span>
      </label>
      {erreur && <p id={`${id}-erreur`} className="mt-1 px-1 text-[12px] leading-[1.35] text-groseille">{erreur}</p>}
    </div>
  )
}

/** Le cadre de la photo : le tableau dessiné avec ses quatre coins safran, ou la photo prise. */
function CadreDePhoto({ photo }: { photo?: string }) {
  const coin = 'absolute h-4 w-4 border-safran'
  return (
    <div role="img" aria-label={photo ? 'Photo de l’étiquette nutritionnelle' : 'Emplacement de la photo de l’étiquette'}
         className="relative h-[132px] w-[118px] shrink-0 overflow-hidden rounded-2xl bg-[#24342B]">
      {photo ? (
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-x-3.5 inset-y-4 -rotate-2 rounded-[4px] bg-[#F7F5EE] p-[7px]">
          <div className="h-[5px] w-[70%] bg-encre" />
          <div className="mt-1.5 h-px bg-encre" />
          {[85, 65, 78, 55, 72].map((l, i) => <div key={i} className="mt-[5px] h-[3px] bg-[#9AA59E]" style={{ width: `${l}%` }} />)}
        </div>
      )}
      <span aria-hidden="true" className={`${coin} left-1.5 top-1.5 rounded-tl-[4px] border-l-[2.5px] border-t-[2.5px]`} />
      <span aria-hidden="true" className={`${coin} right-1.5 top-1.5 rounded-tr-[4px] border-r-[2.5px] border-t-[2.5px]`} />
      <span aria-hidden="true" className={`${coin} bottom-1.5 left-1.5 rounded-bl-[4px] border-b-[2.5px] border-l-[2.5px]`} />
      <span aria-hidden="true" className={`${coin} bottom-1.5 right-1.5 rounded-br-[4px] border-b-[2.5px] border-r-[2.5px]`} />
    </div>
  )
}

const LIEN = 'inline-flex min-h-11 items-center text-[14px] font-semibold text-herbe underline underline-offset-[3px]'
/* Un lien qui ouvre l'appareil photo : `BoutonPhoto` est une grille, pas un `inline-flex`. */
const LIEN_PHOTO = 'min-h-11 self-start text-[14px] font-semibold text-herbe underline underline-offset-[3px]'

export function Formulaire({ aliment, surRetour, surFini }: {
  /** L'aliment qu'on modifie ; absent : on en crée un. */
  aliment?: Aliment
  surRetour: () => void
  surFini: (message: string) => void
}) {
  const [b, setB] = useState<Brouillon>(() => (aliment ? depuisLaBase(aliment) : brouillonVide()))
  /* Les rappels asynchrones (une lecture qui revient) lisent les champs tels qu'ils sont MAINTENANT, pas tels qu'ils
     étaient au lancement. */
  const bActuel = useRef(b)
  useEffect(() => { bActuel.current = b })
  const [mode, setMode] = useState<Mode>(aliment ? 'main' : 'etiquette')
  const [erreurs, setErreurs] = useState<Erreurs>({})
  const [retire, setRetire] = useState(false)
  const enregistre = useEnregistreAliment()
  const supprime = useRetireAliment()

  /** « 500 g en 4 portions = 125 g » : montré sous le poids tant que la personne ne l'a pas retapé. */
  const [calculPoids, setCalculPoids] = useState<string | null>(null)

  /* Ce que la personne a TAPÉ elle-même : une lecture (photo, code) ne l'écrase pas. Le nom d'un aliment qu'on modifie
     compte pour tapé. `modifs` compte chaque frappe : une lecture lancée avant, arrivée après, ne touche à rien. */
  const tapes = useRef<Set<Champ>>(new Set(aliment ? ['label'] : []))
  const modifs = useRef(0)
  /* Le repère remplacé est proposé d'après le nom, jusqu'à ce que la personne le choisisse (ou le retire) elle-même. */
  const remplaceChoisi = useRef(!!aliment)
  /* Le seul code-barres qui reste quand on quitte le mode « Code-barres » : celui qu'Open Food Facts a trouvé. */
  const codeTrouve = useRef(aliment?.code_barres ?? '')

  /* Le focus demandé après un rendu : le champ n'existe peut-être pas encore (le mode « Code-barres » se monte). */
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  useEffect(() => { if (focus) document.getElementById(focus.id)?.focus() }, [focus])
  const demandeLeFocus = (id: string) => setFocus(f => ({ id, n: (f?.n ?? 0) + 1 }))

  const pose = (c: Champ) => (v: string) => {
    modifs.current += 1
    /* Un champ vidé n'est plus « tapé » : une lecture peut le remplir de nouveau. */
    if (v.trim() === '') tapes.current.delete(c)
    else tapes.current.add(c)
    if (c === 'poids') setCalculPoids(null)
    setB(p => {
      const n = { ...p, [c]: v }
      if (c === 'label' && !remplaceChoisi.current) n.remplaceRepere = repereProposePour(v, REPERES)?.label ?? ''
      return n
    })
    setErreurs(e => (e[c] || e.macros || e.energie ? { ...e, [c]: undefined, macros: undefined, energie: undefined } : e))
  }

  /* Ce que le contrôle des calories a à dire, et ce que la personne en a décidé. */
  const [justes, setJustes] = useState<string | null>(null)
  const [doutesVus, setDoutesVus] = useState(false)
  const empreinte = empreinteDesValeurs(b)
  const energieJuste = justes === empreinte
  const doute = douteSurLEnergie(b)
  const vu = () => setDoutesVus(true)

  /** Remplir les champs d'après une lecture. `force` : la personne a demandé de remplacer ce qu'elle avait tapé. */
  function applique(lu: ChampsLus, source: Source, force = false): string[] {
    const p = bActuel.current
    const n: Brouillon = { ...p, source }
    const gardes: string[] = []
    for (const c of CHAMPS_LUS) {
      if (!force && tapes.current.has(c)) {
        if ((lu[c] ?? '') !== '' && lu[c] !== p[c]) gardes.push(NOM_DU_CHAMP[c])
        continue
      }
      n[c] = lu[c] ?? ''
    }
    if (force) tapes.current.clear()
    if (!remplaceChoisi.current) n.remplaceRepere = repereProposePour(n.label, REPERES)?.label ?? ''
    bActuel.current = n
    setB(n)
    setErreurs({})
    setJustes(null)
    setDoutesVus(true)
    return gardes
  }
  /** « Je n'ai pas modifié ce que tu avais tapé : le poids, les fibres. » */
  const phraseDesGardes = (g: string[]) => (g.length === 0 ? [] : [`Je n’ai pas modifié ce que tu avais tapé : ${g.join(', ')}.`])

  // ── L'étiquette ──────────────────────────────────────────────────────────
  const [photos, setPhotos] = useState<string[]>([])
  const [etiquette, setEtiquette] = useState<Dit>({ etat: 'rien' })
  const lectures = useRef(0)

  async function lisLesPhotos(lot: string[]) {
    const moi = ++lectures.current
    const avant = modifs.current
    const debut = Date.now()
    setPhotos(lot)
    setEtiquette({ etat: 'en-cours', texte: 'Je lis l’étiquette…' })
    try {
      const r = await callFunction<LectureEtiquette>('etiquette', { images: lot }, DELAI_ETIQUETTE_MS)
      if (moi !== lectures.current) return
      if (r.erreur) throw new Error(r.erreur)
      const { champs, notes, calculDuPoids } = champsDeLEtiquette(r)
      const titre = r.lisible ? 'Étiquette lue' : 'Étiquette illisible'
      if (!r.lisible) {
        /* Rien n'a été lu : on n'efface pas ce que de précédentes photos avaient donné. */
        setEtiquette({ etat: 'fait', titre, notes, lu: false })
      } else if (modifs.current !== avant) {
        setEtiquette({
          etat: 'tardif', titre,
          applique: () => { applique(champs, 'etiquette', true); setCalculPoids(calculDuPoids); setEtiquette({ etat: 'fait', titre, notes, lu: true }) },
        })
      } else {
        const gardes = applique(champs, 'etiquette')
        setCalculPoids(tapes.current.has('poids') ? null : calculDuPoids)
        setEtiquette({ etat: 'fait', titre, notes: [...notes, ...phraseDesGardes(gardes)], lu: true })
      }
    } catch (e) {
      if (moi !== lectures.current) return
      lectures.current += 1
      setEtiquette({ etat: 'panne', texte: phraseDeLaPanne(e, Date.now() - debut) })
    }
  }
  async function surPhoto(f: File, ajoute: boolean) {
    let p: string
    try { p = (await prepare(f)).dataUrl } catch (e) { setEtiquette({ etat: 'panne', texte: photoEnFrancais(e) }); return }
    await lisLesPhotos(ajoute ? [...photos, p].slice(0, 3) : [p])
  }

  // ── Le code-barres ───────────────────────────────────────────────────────
  const [code, setCode] = useState<Dit>({ etat: 'rien' })
  const [scan, setScan] = useState(false)
  /* Une recherche à la fois : Entrée dans le champ pendant qu'elle court n'en lance pas une deuxième. */
  const recherche = useRef(false)

  async function chercheLeCode(saisie = b.codeBarres) {
    if (recherche.current) return
    const { code: chiffres, valide } = codeAChercher(saisie)
    if (!valide) {
      setCode({ etat: 'panne', texte: chiffres === '' ? 'Tape les chiffres du code-barres.' : 'Ce code ne ressemble pas à un code-barres : un chiffre doit être faux.' })
      return
    }
    recherche.current = true
    const avant = modifs.current
    setB(p => ({ ...p, codeBarres: chiffres }))
    setErreurs(e => (e.codeBarres ? { ...e, codeBarres: undefined } : e))
    setCode({ etat: 'en-cours', texte: 'Je cherche sur Open Food Facts…' })
    try {
      const l = await chercheOpenFoodFacts(chiffres)
      const connu = (label: string) => (label === '' ? 'Open Food Facts connaît ce produit' : `Open Food Facts connaît « ${label} »`)
      if (l.etat === 'introuvable') {
        setCode({ etat: 'panne', texte: 'Open Food Facts ne connaît pas ce code. Photographie l’étiquette, ou remplis à la main.' })
      } else if (l.etat === 'sans_valeurs') {
        setCode({ etat: 'panne', texte: `${connu(l.label)}, mais sans ses calories. Remplis à la main.` })
      } else if (l.etat === 'incoherent') {
        setCode({ etat: 'panne', texte: `Les chiffres d’Open Food Facts pour ${l.label === '' ? 'ce produit' : `« ${l.label} »`} ne tiennent pas (trop de calories, ou plus de 100 g pour 100 g). Remplis à la main.` })
      } else {
        const x = l.produit
        const champs: ChampsLus = {
          label: x.label, kcal: t(x.kcal),
          ...(x.protein !== null && { proteines: t(x.protein) }), ...(x.carb !== null && { glucides: t(x.carb) }),
          ...(x.fat !== null && { lipides: t(x.fat) }), ...(x.fiber !== null && { fibres: t(x.fiber) }),
          ...(x.uniteG !== null && { poids: t(x.uniteG) }),
        }
        const titre = x.label === '' ? 'Produit trouvé' : `« ${x.label} » trouvé`
        const notes = notesDuProduit(x)
        if (modifs.current !== avant) {
          setCode({
            etat: 'tardif', titre,
            applique: () => {
              applique(champs, 'code_barres', true)
              codeTrouve.current = chiffres
              setB(p => ({ ...p, codeBarres: chiffres }))
              setCalculPoids(null)
              setCode({ etat: 'fait', titre, notes, lu: true })
            },
          })
        } else {
          const gardes = applique(champs, 'code_barres')
          codeTrouve.current = chiffres
          setB(p => ({ ...p, codeBarres: chiffres }))
          setCalculPoids(null)
          setCode({ etat: 'fait', titre, notes: [...notes, ...phraseDesGardes(gardes)], lu: true })
        }
      }
    } catch (e) {
      setCode({ etat: 'panne', texte: e instanceof Error ? e.message : 'La recherche a échoué.' })
    } finally {
      recherche.current = false
    }
  }

  /** Changer de façon de remplir : un code qu'Open Food Facts n'a pas trouvé est oublié, avec son erreur, et la caméra s'éteint. */
  function changeDeMode(m: Mode) {
    if (m === mode) return
    if (mode === 'code') {
      setScan(false)
      if (b.codeBarres.replace(/\s/g, '') !== codeTrouve.current) {
        setB(p => ({ ...p, codeBarres: codeTrouve.current }))
        setErreurs(e => (e.codeBarres ? { ...e, codeBarres: undefined } : e))
        setCode({ etat: 'rien' })
      }
    }
    setMode(m)
  }

  // ── Ce que vaut une unité ────────────────────────────────────────────────
  const nombre = (c: Champ) => lisLeNombre(b[c])
  const [kcal, prot, gluc, lip, fib, poids] = [nombre('kcal'), nombre('proteines'), nombre('glucides'), nombre('lipides'), nombre('fibres'), nombre('poids')]
  const bon = (n: number | null): n is number => n !== null && Number.isFinite(n) && n >= 0
  const unite = bon(kcal) && bon(prot) && bon(poids) && poids > 0
    ? pourUneUnite({ kcal, protein: prot, carb: bon(gluc) ? gluc : 0, fat: bon(lip) ? lip : 0, fiber: bon(fib) ? fib : 0 }, poids)
    : null
  const mot = b.unite.trim() || 'unité'

  /* « Non, le garder » : le bouton « Retirer cet aliment » revient (il s'était effacé derrière la question), et le focus avec lui. */
  const boutonRetirer = useRef<HTMLButtonElement>(null)
  const retirait = useRef(false)
  useEffect(() => {
    if (retirait.current && !retire) boutonRetirer.current?.focus()
    retirait.current = retire
  }, [retire])

  function enregistrer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (enregistre.isPending) return
    const r = lis(b, { energieJuste, codeDejaRange: aliment?.code_barres ?? null })
    if (!r.ok) {
      setErreurs(r.erreurs)
      setDoutesVus(true)
      /* Toute erreur bloquante se voit, et le focus va sur la première : un code-barres refusé ouvre son mode. */
      const premiere = CIBLES.find(([c]) => r.erreurs[c])
      if (r.erreurs.codeBarres && mode !== 'code') setMode('code')
      if (premiere) demandeLeFocus(premiere[0] === 'energie' && !doute?.enKcal ? 'aliment-energie-juste' : premiere[1])
      return
    }
    setErreurs({})
    enregistre.mutate({ id: aliment?.id, valeurs: r.valeurs }, {
      onSuccess: () => surFini(aliment ? `« ${r.valeurs.label} » est à jour.` : `« ${r.valeurs.label} » est dans nos aliments.`),
    })
  }

  return (
    <form onSubmit={enregistrer} noValidate>
      <Passage retour={surRetour} retourTexte="Nos aliments" barre={
        <BarreAction>
          <Principal type="submit" disabled={enregistre.isPending}>
            {enregistre.isPending ? 'J’enregistre…' : aliment ? 'Enregistrer les changements' : 'Enregistrer dans mes aliments'}
          </Principal>
        </BarreAction>
      }>
        <h1 className="titre text-[30px] font-semibold leading-[1.1] [overflow-wrap:anywhere]">
          {aliment ? aliment.label : 'Nouvel aliment'}
        </h1>
        <p className="mt-1.5 text-[14px] text-doux">Un aliment à vous, avec ses vraies valeurs.</p>

        <label className="mt-4 block">
          <span className="text-[13px] font-semibold">Son nom</span>
          <input value={b.label} onChange={e => pose('label')(e.target.value)} maxLength={80}
                 placeholder="Yaourt dessert protéiné" autoComplete="off" id="aliment-nom"
                 aria-invalid={erreurs.label ? true : undefined} aria-describedby={erreurs.label ? 'aliment-nom-erreur' : undefined}
                 className="mt-1 h-12 w-full rounded-[14px] bg-surface px-3.5 text-[17px] text-encre placeholder:text-doux/70"
                 style={erreurs.label ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE} />
        </label>
        {erreurs.label && <p id="aliment-nom-erreur" className="mt-1 px-1 text-[12px] text-groseille">{erreurs.label}</p>}

        <div role="group" aria-label="Comment le remplir"
             className="mt-4 grid grid-cols-3 gap-1 rounded-[14px] bg-piste p-1">
          {MODES.map(m => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => changeDeMode(m.id)}
                    className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-[10px] px-0.5 text-[12px] font-semibold whitespace-nowrap
                                ${mode === m.id ? 'bg-encre text-fond' : 'bg-transparent text-encre'}`}>
              <m.Icone taille={15} /><span>{m.nom}</span>
            </button>
          ))}
        </div>

        {/* ── L'étiquette ── */}
        {mode === 'etiquette' && (
          <div className="mt-3.5 flex items-stretch gap-3">
            <CadreDePhoto photo={photos[0]} />
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
              {etiquette.etat === 'rien' && (<>
                <div className="text-[15px] font-bold">Photographie le tableau</div>
                <div className="text-[13px] leading-[1.45] text-doux">Le « pour 100 g », bien net. Je recopie les chiffres, je n’estime rien.</div>
                <BoutonPhoto texte="Photographier l’étiquette" onFichier={f => surPhoto(f, false)}
                             className="mt-1 min-h-11 rounded-[14px] bg-herbe px-3 text-[14px] font-semibold text-fond" />
              </>)}
              {etiquette.etat === 'en-cours' && <div role="status" className="text-[15px] font-bold">{etiquette.texte}</div>}
              {etiquette.etat === 'fait' && (<>
                <div role="status" className="text-[15px] font-bold">{etiquette.titre}</div>
                {etiquette.lu && <div className="text-[13px] leading-[1.45] text-doux">Les valeurs pour 100 g sont remplies. Vérifie-les avant d’enregistrer.</div>}
                <BoutonPhoto texte="Reprendre la photo" onFichier={f => surPhoto(f, false)}
                             className={LIEN_PHOTO} />
                {photos.length < 3 && (
                  <BoutonPhoto texte="Ajouter l’autre face" onFichier={f => surPhoto(f, true)} className={LIEN_PHOTO} />
                )}
              </>)}
              {etiquette.etat === 'tardif' && (<>
                <div role="status" className="text-[15px] font-bold">{etiquette.titre}</div>
                <div className="text-[13px] leading-[1.45] text-doux">Tu as modifié des champs pendant la lecture : je n’y ai pas touché.</div>
                <button type="button" onClick={etiquette.applique} className={LIEN_PHOTO}>Remplacer par les valeurs lues</button>
                <BoutonPhoto texte="Reprendre la photo" onFichier={f => surPhoto(f, false)} className={LIEN_PHOTO} />
              </>)}
              {etiquette.etat === 'panne' && (<>
                <div role="alert" className="text-[13px] leading-[1.45] text-groseille">{etiquette.texte}</div>
                {photos.length > 0 && (
                  <button type="button" onClick={() => lisLesPhotos(photos)} className={LIEN_PHOTO}>Réessayer</button>
                )}
                <BoutonPhoto texte="Reprendre la photo" onFichier={f => surPhoto(f, false)} className={LIEN_PHOTO} />
              </>)}
            </div>
          </div>
        )}
        {mode === 'etiquette' && etiquette.etat === 'fait' && etiquette.notes.length > 0 && (
          <ul className="mt-2 space-y-1 text-[13px] leading-[1.45] text-ocre">
            {etiquette.notes.map(n => <li key={n}>{n}</li>)}
          </ul>
        )}

        {/* ── Le code-barres ── */}
        {mode === 'code' && (
          <div className="mt-3.5">
            <label className="block">
              <span className="text-[13px] font-semibold">Les chiffres du code-barres</span>
              <div className="mt-1 flex gap-2">
                <input value={b.codeBarres} onChange={e => pose('codeBarres')(e.target.value)} inputMode="numeric" autoComplete="off"
                       placeholder="3033490004743" id="aliment-code" maxLength={20}
                       onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); chercheLeCode() } }}
                       aria-invalid={erreurs.codeBarres ? true : undefined}
                       className="h-12 min-w-0 flex-1 rounded-[14px] bg-surface px-3.5 text-[17px] tracking-wide text-encre placeholder:text-doux/70"
                       style={erreurs.codeBarres ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : CADRE} />
                <button type="button" onClick={() => chercheLeCode()} disabled={code.etat === 'en-cours'}
                        className="min-h-12 shrink-0 rounded-[14px] bg-herbe px-4 text-[15px] font-semibold text-fond disabled:bg-brume disabled:text-encre">
                  Chercher
                </button>
              </div>
            </label>
            {erreurs.codeBarres && <p className="mt-1 px-1 text-[12px] text-groseille">{erreurs.codeBarres}</p>}
            {saitLireUnCode() && !scan && (
              <button type="button" onClick={() => setScan(true)} className={`${LIEN} gap-1.5 no-underline`}>
                <Appareil taille={16} /><span className="underline underline-offset-[3px]">Lire avec l’appareil photo</span>
              </button>
            )}
            {scan && (
              <LecteurDeCodes annule={() => setScan(false)}
                              surCode={c => { setScan(false); setB(p => ({ ...p, codeBarres: c })); chercheLeCode(c) }} />
            )}
            {code.etat === 'en-cours' && <p role="status" className="mt-2 text-[14px] text-doux">{code.texte}</p>}
            {code.etat === 'fait' && (
              <div role="status" className="mt-2 text-[13px] leading-[1.45] text-doux">
                <span className="text-[15px] font-bold text-encre">{code.titre}.</span> Les valeurs pour 100 g sont remplies. Vérifie-les avant d’enregistrer.
                {code.notes.map(n => <span key={n} className="mt-1 block text-ocre">{n}</span>)}
              </div>
            )}
            {code.etat === 'tardif' && (
              <div role="status" className="mt-2 text-[13px] leading-[1.45] text-doux">
                <span className="text-[15px] font-bold text-encre">{code.titre}.</span> Tu as modifié des champs pendant la recherche : je n’y ai pas touché.
                <button type="button" onClick={code.applique} className={`${LIEN} block`}>Remplacer par les valeurs lues</button>
              </div>
            )}
            {code.etat === 'panne' && <p role="alert" className="mt-2 text-[13px] leading-[1.45] text-groseille">{code.texte}</p>}
          </div>
        )}

        {/* ── Les valeurs pour 100 g ── */}
        <h2 className="mt-5 text-[15px] font-bold">Pour 100 g</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Mesure id="aliment-kcal" nom="Calories" unite="kcal" valeur={b.kcal} surChange={pose('kcal')} erreur={erreurs.kcal} surSortie={vu} />
          <Mesure id="aliment-proteines" nom="Protéines" unite="g" valeur={b.proteines} surChange={pose('proteines')} erreur={erreurs.proteines} surSortie={vu} />
          <Mesure id="aliment-glucides" nom="Glucides" unite="g" valeur={b.glucides} surChange={pose('glucides')} erreur={erreurs.glucides} surSortie={vu} />
          <Mesure id="aliment-lipides" nom="Lipides" unite="g" valeur={b.lipides} surChange={pose('lipides')} erreur={erreurs.lipides} surSortie={vu} />
          <Mesure id="aliment-fibres" nom="Fibres" unite="g" valeur={b.fibres} surChange={pose('fibres')} erreur={erreurs.fibres} surSortie={vu} />
        </div>
        {erreurs.macros && <p role="alert" className="mt-1.5 px-1 text-[12px] text-groseille">{erreurs.macros}</p>}

        {/* Des calories qui ne cadrent pas avec les macros (des kJ pris pour des kcal ?) : une question, pas un refus sec. */}
        {doute && doutesVus && (
          <div id="aliment-energie" className="mt-2.5 rounded-[14px] bg-sable px-3.5 py-3 text-encre"
               style={{ boxShadow: `inset 0 0 0 ${erreurs.energie ? '1.5px var(--color-groseille)' : '1px var(--color-ocre)'}` }}>
            <p role="alert" className="text-[14px] leading-[1.45]">{phraseDuDoute(doute)}</p>
            {doute.enKcal !== null && (
              <button id="aliment-energie-action" type="button"
                      onClick={() => { pose('kcal')(String(doute.enKcal)); demandeLeFocus('aliment-kcal') }}
                      className="mt-2 min-h-11 w-full rounded-[14px] bg-herbe px-3 text-[14px] font-semibold text-fond">
                Corriger en {doute.enKcal} kcal
              </button>
            )}
            <label className="mt-1 flex min-h-11 items-center gap-2.5 text-[14px] font-semibold">
              <input id="aliment-energie-juste" type="checkbox" checked={energieJuste}
                     onChange={e => setJustes(e.target.checked ? empreinte : null)}
                     className="h-5 w-5 shrink-0 accent-[var(--color-herbe)]" />
              Les valeurs sont justes
            </label>
          </div>
        )}

        {/* ── L'unité ── */}
        <div className="mt-3.5 rounded-[18px] bg-surface px-3.5 py-3" style={CADRE}>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
            <Pot />
            <span className="text-[15px] font-semibold">Un</span>
            <input value={b.unite} onChange={e => pose('unite')(e.target.value)} aria-label="Nom de l’unité" maxLength={20} id="aliment-unite"
                   autoComplete="off"
                   aria-invalid={erreurs.unite ? true : undefined}
                   className="h-11 w-[92px] rounded-[10px] bg-fond px-2 text-center text-[16px] font-bold text-encre" />
            <label className="flex items-center gap-2 text-[15px] font-semibold">
              pèse
              <input value={b.poids} onChange={e => pose('poids')(e.target.value)} inputMode="decimal" autoComplete="off"
                     aria-label={`Poids d’un ${mot} en grammes`} id="aliment-poids"
                     aria-invalid={erreurs.poids ? true : undefined} aria-describedby={erreurs.poids ? 'aliment-poids-erreur' : undefined}
                     className="h-11 w-[72px] rounded-[10px] bg-fond px-1 text-center text-[17px] font-bold text-encre"
                     style={erreurs.poids ? { boxShadow: 'inset 0 0 0 1.5px var(--color-groseille)' } : undefined} />
              <span className="text-[13px] font-normal text-doux">g</span>
            </label>
          </div>
          {erreurs.unite && <p className="mt-1.5 text-[12px] text-groseille">{erreurs.unite}</p>}
          {erreurs.poids && <p id="aliment-poids-erreur" className="mt-1.5 text-[12px] text-groseille">{erreurs.poids}</p>}
          {calculPoids && !erreurs.poids && (
            <p className="mt-1.5 text-[12px] leading-[1.4] text-doux">{calculPoids}. Change le poids si besoin.</p>
          )}
        </div>

        <div role="group" aria-label={`Valeurs d’un ${mot}`}
             className="sur-encre mt-2.5 rounded-[18px] bg-encre px-4 py-3.5 text-fond">
          <div className="flex flex-wrap items-baseline gap-x-[18px] gap-y-1">
            <div className="flex-1 whitespace-nowrap text-[13px] text-[#B9C7BD]">Un {mot}</div>
            <div>
              <span className="chiffre text-[26px] font-semibold" data-valeur="kcal">{unite ? ecrit(unite.kcal) : '—'}</span>
              <span className="text-[13px] text-[#B9C7BD]"> kcal</span>
            </div>
            <div>
              <span className="chiffre text-[26px] font-semibold" data-valeur="proteines">{unite ? ecrit(unite.protein) : '—'}</span>
              <span className="text-[13px] text-[#B9C7BD]"> g de protéines</span>
            </div>
          </div>
          {unite && (
            <p className="mt-1 text-[12px] text-[#B9C7BD]">
              {ecrit(unite.carb)} g de glucides · {ecrit(unite.fat)} g de lipides · {ecrit(unite.fiber)} g de fibres
            </p>
          )}
        </div>

        <label className="mt-3.5 block">
          <span className="text-[13px] font-semibold">Remplace le repère</span>
          <select id="aliment-remplace" value={b.remplaceRepere}
                  onChange={e => { remplaceChoisi.current = true; setB(p => ({ ...p, remplaceRepere: e.target.value })) }}
                  className="mt-1 h-12 w-full rounded-[14px] bg-surface px-3 text-[16px] text-encre" style={CADRE}>
            <option value="">Aucun : tous les repères restent</option>
            {[...(NOMS_DES_REPERES.includes(b.remplaceRepere) || b.remplaceRepere === '' ? [] : [b.remplaceRepere]), ...NOMS_DES_REPERES]
              .map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <p className="mt-1.5 px-1 text-[12px] leading-[1.45] text-doux">
          {b.remplaceRepere
            ? <>Le repère « {b.remplaceRepere} » n’est plus proposé : c’est cet aliment qui prend sa place, en un geste, avec ces chiffres.</>
            : <>Facultatif. La semaine le propose en un geste, avec ces chiffres, avant les repères. Aucun repère n’est caché.</>}
        </p>

        {enregistre.error && <p role="alert" className="mt-3 text-[14px] text-groseille">{enregistre.error.message}</p>}

        {aliment && !retire && (
          <button ref={boutonRetirer} type="button" onClick={() => setRetire(true)}
                  className="mt-3 inline-flex min-h-11 items-center text-[14px] font-semibold text-groseille underline underline-offset-[3px]">
            Retirer cet aliment
          </button>
        )}
        {aliment && retire && (
          <Confirmation titre={`Retirer « ${aliment.label} » de nos aliments ?`}
                        texte="Les repas déjà notés avec lui gardent leurs chiffres."
                        oui="Oui, le retirer" non="Non, le garder" enCours={supprime.isPending}
                        surNon={() => setRetire(false)}
                        surOui={() => supprime.mutate(aliment.id, { onSuccess: () => surFini(`« ${aliment.label} » est retiré.`) })} />
        )}
        {supprime.error && <p role="alert" className="mt-2 text-[14px] text-groseille">{supprime.error.message}</p>}
      </Passage>
    </form>
  )
}
