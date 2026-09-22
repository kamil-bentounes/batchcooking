/**
 * Ajouter à la main ce qu'on n'a pas cuisiné (D28, D29, D33).
 *
 * Deux choses entrent au congélateur, et elles ne sont PAS de même nature :
 *
 *  · un PRODUIT — un sachet de petits pois. Il sert aux courses : savoir qu'on
 *    l'a évite de le racheter. Il n'est le repas de personne ;
 *  · un PLAT — une barquette. Il se mange depuis la semaine et pèse dans les
 *    calories du jour. Le ranger dans l'inventaire le ferait disparaître du
 *    plan et compter pour zéro, ce que D33 interdit précisément.
 *
 * On le demande donc, en une question, plutôt que de deviner d'après le nom.
 *
 * Les calories d'un plat ont trois provenances, et une seule demande un
 * modèle : un aliment, le référentiel les connaît ; un plat de notre batch
 * cooking, la recette les calcule ; un plat acheté dehors, personne — sauf
 * l'emballage. D'où la lecture d'étiquette, qui est de la LECTURE et non de
 * l'estimation. Ce qu'elle rend reste modifiable : elle remplit les champs,
 * elle ne valide rien.
 */
import { useState } from 'react'
import { BoutonPhoto, Erreur, Surface } from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { prepare } from '../lib/photo.ts'
import { useAjouteBarquette, useAjouteStock } from '../lib/donnees/barquettes.ts'

type Lieu = 'frigo' | 'congelateur' | 'placard'

/** D29 : trois mois au congélateur. La date imprimée sur un emballage prime. */
const MOIS_AU_FROID = 3

/**
 * Le jour tel qu'on le vit, pas tel que Greenwich le voit.
 *
 * `toISOString()` bascule à minuit UTC : entre 00 h et 02 h à Paris, « congelé
 * le » proposait la veille, et le `max` d'aujourd'hui interdisait aujourd'hui.
 */
const jour = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Une date que `<input type="date">` sait rendre, et `Date` interpréter. */
const estUnJour = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(`${v}T12:00:00`))

/** Au-delà, ce n'est plus un aliment : 900 kcal/100 g, c'est de l'huile pure. */
const KCAL_MAX_100G = 900

function dansTroisMois(depuis: string): string {
  const d = new Date(`${depuis}T12:00:00`)
  d.setMonth(d.getMonth() + MOIS_AU_FROID)
  return jour(d)
}

type Lecture = {
  nom: string | null
  poids_g: number | null
  parts: number | null
  kcal_100g: number | null
  proteines_100g: number | null
  glucides_100g: number | null
  lipides_100g: number | null
  fibres_100g: number | null
  kcal_portion: number | null
  dlc: string | null
  lisible: boolean
  confiance: number
  commentaire: string | null
  restantes?: number
  erreur?: string
}

export function FormulaireAjout({ lieu, surFini }: { lieu: Lieu; surFini: () => void }) {
  // Un placard ne contient pas de repas : la question ne se pose que là où
  // elle a deux réponses.
  const [quoi, setQuoi] = useState<'plat' | 'produit'>('produit')
  const estPlat = quoi === 'plat' && lieu !== 'placard'

  return (
    <Surface className="mt-4">
      {lieu !== 'placard' && (
        <div className="flex gap-2 mb-4" role="radiogroup" aria-label="Ce que j’ajoute">
          {([['produit', 'Un produit'], ['plat', 'Un plat']] as const).map(([v, nom]) => (
            <button key={v} role="radio" aria-checked={quoi === v} onClick={() => setQuoi(v)}
                    className={`px-4 min-h-11 rounded-full text-[14px] transition-colors
                      ${quoi === v ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
              {nom}
            </button>
          ))}
          <span className="self-center text-[13px] text-doux">
            {estPlat ? 'un repas, il compte dans ta semaine' : 'un ingrédient, il compte dans tes courses'}
          </span>
        </div>
      )}

      {estPlat
        ? <Plat lieu={lieu} surFini={surFini} />
        : <Produit lieu={lieu} surFini={surFini} />}
    </Surface>
  )
}

/** ── Un produit ───────────────────────────────────────────────────────────── */
function Produit({ lieu, surFini }: { lieu: Lieu; surFini: () => void }) {
  const ajoute = useAjouteStock()
  const [label, setLabel] = useState('')
  const [quantite, setQuantite] = useState('')
  const [unite, setUnite] = useState('g')
  const [congele, setCongele] = useState(jour(new Date()))
  const [perime, setPerime] = useState(dansTroisMois(jour(new Date())))

  const auFroid = lieu === 'congelateur'

  return (
    <form className="space-y-3" onSubmit={e => {
      e.preventDefault()
      if (!label.trim()) return
      ajoute.mutate({
        label, lieu,
        quantite: quantite === '' ? null : Number(quantite),
        unite: quantite === '' ? null : unite,
        congeleLe: auFroid ? new Date(`${congele}T12:00:00`).toISOString() : null,
        perimeLe: auFroid ? new Date(`${perime}T12:00:00`).toISOString() : null,
      }, { onSuccess: () => { setLabel(''); setQuantite(''); surFini() } })
    }}>
      <div className="flex gap-2">
        <input value={label} onChange={e => setLabel(e.target.value)} autoFocus
               placeholder="Ce qu’il y a" aria-label="Aliment"
               className="grow min-w-0 rounded-xl border border-brume bg-fond px-4 py-2.5
                          outline-none focus:border-herbe" />
        <input value={quantite} onChange={e => setQuantite(e.target.value)} type="number"
               min="0" placeholder="0" aria-label="Quantité"
               className="w-20 rounded-xl border border-brume bg-fond px-3 py-2.5
                          text-right outline-none focus:border-herbe" />
        <select value={unite} onChange={e => setUnite(e.target.value)} aria-label="Unité"
                className="rounded-xl border border-brume bg-fond px-2 py-2.5
                           outline-none focus:border-herbe">
          <option value="g">g</option>
          <option value="ml">ml</option>
          <option value="u">u</option>
        </select>
      </div>

      {auFroid && (
        <Dates congele={congele} perime={perime}
               surCongele={d => { setCongele(d); setPerime(dansTroisMois(d)) }}
               surPerime={setPerime} />
      )}

      <button className="w-full h-[46px] rounded-[16px] bg-herbe text-fond text-[15px]
                         font-medium">
        Ajouter
      </button>
      <Erreur de={ajoute.error} />
    </form>
  )
}

/** ── Un plat ──────────────────────────────────────────────────────────────── */
function Plat({ lieu, surFini }: { lieu: 'frigo' | 'congelateur'; surFini: () => void }) {
  const ajoute = useAjouteBarquette()
  const [nom, setNom] = useState('')
  const [parts, setParts] = useState('1')
  const [grammes, setGrammes] = useState('')
  const [kcal, setKcal] = useState('')
  const [prot, setProt] = useState('')
  const [gluc, setGluc] = useState('')
  const [lip, setLip] = useState('')
  const [fib, setFib] = useState('')
  const [congele, setCongele] = useState(jour(new Date()))
  const [perime, setPerime] = useState(dansTroisMois(jour(new Date())))

  const [photos, setPhotos] = useState<string[]>([])
  const [lecture, setLecture] = useState<Lecture | null>(null)
  /** Ce que l'étiquette a donné, gardé tel quel : c'est lui qu'on redivise
      quand le nombre de parts change. Sans ça, passer de 2 à 4 parts gardait
      200 g et 300 kcal PAR PART, soit 800 g sortis d'une boîte de 400. */
  const [lu, setLu] = useState<{ poids: number | null; parts: number | null } | null>(null)
  const [lit, setLit] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  const auFroid = lieu === 'congelateur'

  async function ajoutePhoto(f: File) {
    setErreur(null)
    try {
      const p = await prepare(f)
      setPhotos(l => [...l, p.dataUrl].slice(0, 3))
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Photo illisible.')
    }
  }

  /**
   * Lire l'emballage, puis REMPLIR — sans rien valider.
   *
   * Le tableau nutritionnel est légalement pour 100 g : on le ramène au poids
   * d'une part. Quand l'emballage donne lui-même une colonne « par portion », on
   * la préfère, parce qu'elle vient de celui qui a pesé le plat.
   */
  async function lis() {
    if (photos.length === 0) return
    setLit(true); setErreur(null)
    try {
      const r = await callFunction<Lecture>('etiquette', { images: photos })
      if (r.erreur) { setErreur(r.erreur); return }
      setLecture(r)

      if (r.nom && !nom) setNom(r.nom)
      if (r.parts && r.parts > 0) setParts(String(r.parts))
      setLu({ poids: r.poids_g, parts: r.parts })
      remplit(r, r.parts && r.parts > 0 ? r.parts : Number(parts) || 1)
      // ⚠️ La date imprimée n'est reprise que si elle a la FORME d'une date.
      //    Le modèle rend parfois « 14/02/2027 » ; `<input type="date">`
      //    l'ignore mais l'état la gardait, et le submit levait un RangeError
      //    hors de tout `try`.
      if (r.dlc && estUnJour(r.dlc)) setPerime(r.dlc)
    } catch (e) {
      // `callFunction` lève le CORPS brut quand la réponse n'est pas 200 : c'est
      // là que passent le quota atteint et la panne du modèle. Le texte est du
      // JSON, et il porte déjà une phrase en français — autant la rendre plutôt
      // que d'afficher l'accolade.
      const brut = e instanceof Error ? e.message : ''
      let dit = brut || 'La lecture a échoué.'
      try { dit = JSON.parse(brut).erreur ?? dit } catch { /* pas du JSON */ }
      setErreur(dit)
    } finally {
      setLit(false)
    }
  }

  /**
   * Ramener une étiquette à UNE part.
   *
   * Deux pièges, et les deux valent un facteur deux :
   *
   *  · `kcal_portion` est la colonne « par portion » du fabricant. Elle ne vaut
   *    que si l'emballage annonce AUSSI combien de portions il contient —
   *    sinon « une portion » n'est pas « une de nos parts », et on crédite
   *    300 kcal à une barquette de 400 g qui en fait 600 ;
   *  · un tableau lu en kJ passe pour des kcal. 900 kcal/100 g est le plafond
   *    physique d'un aliment : au-delà, on ne remplit rien et on le dit.
   */
  function remplit(r: Lecture, nbParts: number) {
    const poidsPart = r.poids_g && nbParts > 0 ? Math.round(r.poids_g / nbParts) : null
    if (poidsPart) setGrammes(String(poidsPart))

    const par100 = r.kcal_100g !== null && r.kcal_100g > 0 && r.kcal_100g <= KCAL_MAX_100G
      ? r.kcal_100g : null
    const calcule = par100 && poidsPart ? Math.round(par100 * poidsPart / 100) : null
    // On ne préfère la colonne du fabricant que si l'emballage a dit combien de
    // portions il contient — et si elle ne contredit pas le calcul.
    const annoncee = r.kcal_portion !== null && r.parts && r.parts > 0 && r.parts === nbParts
      ? r.kcal_portion : null
    const coherente = annoncee !== null && calcule !== null
      ? Math.abs(annoncee - calcule) <= calcule * 0.25
      : annoncee !== null
    const parPart = coherente ? annoncee : calcule
    if (parPart) setKcal(String(parPart))

    const pour = (v: number | null) =>
      v !== null && poidsPart ? String(Math.round(v * poidsPart / 10) / 10) : ''
    setProt(pour(r.proteines_100g))
    setGluc(pour(r.glucides_100g))
    setLip(pour(r.lipides_100g))
    setFib(pour(r.fibres_100g))
  }

  /** Changer le nombre de parts redécoupe la boîte lue, il ne la duplique pas. */
  function changeParts(v: string) {
    setParts(v)
    const n = Number(v)
    if (lecture && lu && n > 0) remplit(lecture, n)
  }

  /*
   * ⚠️ Les protéines sont exigées comme les calories, et pour la même raison.
   *
   *    `bilanDuJour` somme `portion.protein_g` dès qu'une case est mangée : un
   *    zéro n'est pas « inconnu », c'est « ce repas ne t'a rien apporté ». Or
   *    les protéines sont un PLANCHER — le suivi dirait qu'on en manque alors
   *    qu'on vient d'en manger trente grammes. Toutes les étiquettes les
   *    portent ; il n'y a pas de raison de deviner.
   */
  const pret = nom.trim() !== '' && Number(grammes) > 0
    && Number(kcal) > 0 && prot !== '' && estUnJour(perime)
    && (!auFroid || (estUnJour(congele) && perime >= congele))

  return (
    <form className="space-y-3" onSubmit={e => {
      e.preventDefault()
      if (!pret) return
      ajoute.mutate({
        label: nom,
        parts: Number(parts) || 1,
        grammes: Number(grammes),
        kcal: Number(kcal),
        proteines: prot === '' ? null : Number(prot),
        glucides: gluc === '' ? null : Number(gluc),
        lipides: lip === '' ? null : Number(lip),
        fibres: fib === '' ? null : Number(fib),
        // La provenance dit d'où viennent les CHIFFRES, pas si l'on a pris une
        // photo : une étiquette illisible ne fait pas d'un plat un plat acheté.
        achete: lecture?.lisible === true,
        lieu,
        congeleLe: auFroid ? new Date(`${congele}T12:00:00`).toISOString() : null,
        // ⚠️ null au frigo, et ce n'est pas un détail : le champ n'y est même
        //    pas affiché, mais la valeur partait quand même — et depuis 0047
        //    la base la RESPECTE. Un plat mis au frigo héritait donc des trois
        //    mois du congélateur au lieu des quatre jours de D29.
        perimeLe: auFroid ? new Date(`${perime}T12:00:00`).toISOString() : null,
      }, { onSuccess: surFini })
    }}>
      {/* La lecture d'étiquette, en premier : elle remplit le reste. */}
      <div className="rounded-[16px] bg-brume/40 p-3.5">
        <p className="text-[14px]">
          Un plat acheté ? Photographie l’emballage.
        </p>
        <p className="mt-1 text-[13px] text-doux">
          Jusqu’à trois photos : la face, le tableau nutritionnel, la date. Je
          recopie ce qui est imprimé — je n’estime rien.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {photos.map((p, i) => (
            <span key={i} className="relative">
              <img src={p} alt={`Photo ${i + 1}`}
                   className="w-14 h-14 rounded-lg object-cover" />
              {/* La cible fait 44 px, la pastille 20 : le doigt vise large, l'œil
                  voit petit. Le bouton nu à 20 px se ratait une fois sur trois. */}
              <button type="button" aria-label={`Retirer la photo ${i + 1}`}
                      onClick={() => setPhotos(l => l.filter((_, j) => j !== i))}
                      className="absolute -top-4 -right-4 w-11 h-11 grid place-items-center">
                <span className="w-5 h-5 rounded-full bg-encre text-fond text-[12px]
                                 leading-none grid place-items-center">×</span>
              </button>
            </span>
          ))}
          {photos.length < 3 && (
            <BoutonPhoto onFichier={ajoutePhoto}
                         texte={photos.length === 0 ? 'Photographier' : 'Une de plus'}
                         className="h-[44px] px-4 rounded-[14px] bg-herbe text-fond text-[15px]" />
          )}
          {photos.length > 0 && (
            <button type="button" onClick={lis} disabled={lit}
                    className="h-[44px] px-4 rounded-[14px] bg-encre text-fond text-[15px]">
              {lit ? 'Je lis…' : 'Lire l’étiquette'}
            </button>
          )}
        </div>
        {lecture && (
          <p className="mt-2.5 text-[13px] text-doux">
            {lecture.lisible
              ? `Lu${lecture.confiance < 0.7 ? ' — à vérifier, le tableau n’est pas net' : ''}.`
              : 'Je n’ai rien pu lire sur ces photos.'}
            {lecture.commentaire ? ` ${lecture.commentaire}` : ''}
          </p>
        )}
        {erreur && <p className="mt-2.5 text-[13px] text-groseille">{erreur}</p>}
      </div>

      <input value={nom} onChange={e => setNom(e.target.value)}
             placeholder="Le plat" aria-label="Nom du plat"
             className="w-full rounded-xl border border-brume bg-fond px-4 py-2.5
                        outline-none focus:border-herbe" />

      <div className="flex gap-2">
        <Champ label="Parts" value={parts} onChange={changeParts} min={1} max={20} />
        <Champ label="g / part" value={grammes} onChange={setGrammes} />
        <Champ label="kcal / part" value={kcal} onChange={setKcal} />
      </div>
      <div className="flex gap-2">
        <Champ label="Protéines" value={prot} onChange={setProt} />
        <Champ label="Glucides" value={gluc} onChange={setGluc} />
        <Champ label="Lipides" value={lip} onChange={setLip} />
        <Champ label="Fibres" value={fib} onChange={setFib} />
      </div>

      {auFroid && (
        <Dates congele={congele} perime={perime}
               surCongele={d => { setCongele(d); setPerime(dansTroisMois(d)) }}
               surPerime={setPerime} />
      )}

      {/* ⚠️ On n'accepte PAS un plat sans calories. Une barquette à zéro
          entrerait dans le bilan du jour comme un repas gratuit — exactement le
          mensonge que D33 interdit. Mieux vaut refuser d'ajouter. */}
      <button disabled={!pret || ajoute.isPending}
              className="w-full h-[46px] rounded-[16px] bg-herbe text-fond text-[15px]
                         font-medium disabled:bg-brume disabled:text-doux">
        {ajoute.isPending ? 'J’ajoute…'
          : `Ajouter ${Number(parts) > 1 ? `${parts} parts` : 'la barquette'}`}
      </button>
      {!pret && (
        <p className="text-[13px] text-doux">
          Il manque le nom, le poids d’une part, ses calories et ses protéines —
          sans elles, le jour où tu le mangeras compterait pour zéro, et tu te
          croirais en manque de protéines après en avoir mangé.
        </p>
      )}
      <Erreur de={ajoute.error} />
    </form>
  )
}

function Champ({ label, value, onChange, min = 0, max }:
  { label: string; value: string; onChange: (v: string) => void
    min?: number; max?: number }) {
  return (
    <label className="grow min-w-0">
      <span className="block text-[13px] text-doux mb-1">{label}</span>
      <input type="number" min={min} max={max} value={value}
             onChange={e => onChange(e.target.value)}
             className="w-full rounded-xl border border-brume bg-fond px-3 py-2.5
                        text-right outline-none focus:border-herbe" />
    </label>
  )
}

/**
 * Les deux dates.
 *
 * Changer la mise au froid recale la péremption : un plat congelé il y a un
 * mois n'a pas trois mois devant lui, et c'est le genre d'erreur qu'on ne voit
 * qu'en ouvrant la boîte.
 */
function Dates({ congele, perime, surCongele, surPerime }: {
  congele: string; perime: string
  surCongele: (v: string) => void; surPerime: (v: string) => void
}) {
  return (
    <div className="flex gap-2">
      <label className="grow">
        <span className="block text-[13px] text-doux mb-1">Congelé le</span>
        <input type="date" value={congele} max={jour(new Date())}
               onChange={e => surCongele(e.target.value)}
               className="w-full rounded-xl border border-brume bg-fond px-3 py-2.5
                          outline-none focus:border-herbe" />
      </label>
      <label className="grow">
        <span className="block text-[13px] text-doux mb-1">À manger avant</span>
        {/* Jamais avant la mise au froid : une péremption antérieure à la
            congélation est une saisie, pas une information. */}
        <input type="date" value={perime} min={congele}
               onChange={e => surPerime(e.target.value)}
               className="w-full rounded-xl border border-brume bg-fond px-3 py-2.5
                          outline-none focus:border-herbe" />
      </label>
    </div>
  )
}
