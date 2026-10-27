/**
 * La photo du frigo (D28, D57) — refaite d'après la maquette `saisies-photo-ticket-peser.html`.
 *
 * Un ACCÉLÉRATEUR de saisie, jamais une autorité. Le modèle propose, l'écran
 * fait valider ligne par ligne, et rien n'entre à l'inventaire sans un geste.
 *
 * Trois choses que cet écran refuse de faire, et qui sont le cœur du sujet :
 *
 *  · ajouter en silence. Une photo qui remplirait l'inventaire toute seule est
 *    une photo qu'on finirait par ne plus oser prendre.
 *  · masquer l'incertitude. Ce que le modèle a deviné est marqué comme tel, et
 *    décoché d'avance.
 *  · perdre la variété. « Yaourt aux fruits » et « yaourt nature » n'ont pas les
 *    mêmes macros : la variété fait partie du nom, pas d'une note de bas de page.
 *
 * Les chiffres affichés sont ceux de la lecture : le temps seulement s'il est mesuré, l'emplacement seulement si la
 * fonction le rend. Rien n'est posé ici pour faire joli.
 */
import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { BoutonPhoto, Chiffre, Erreur, Principal } from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { prepare } from '../lib/photo.ts'
import { useAjouteStock } from '../lib/donnees/barquettes.ts'
import {
  Astuce, BoutonDoux, Carte, CaseACocher, Colonne, Deux, Echec, EnteteDeCarte, IcoAppareil, IcoCongel, IcoFrigo,
  IcoPlacard, Lecture, PassageLarge, Puce, SceneFrigo, Titre, Viseur,
} from '../ui/saisies/Cadre.tsx'
import {
  LIEUX, NOM_LIEU, cocheesDAvance, estDevine, libelle, normaliseLieux, pluriel, quotaDit, regroupeParLieu, resumeDeLaPhoto,
  uniteAffichee,
} from '../ui/saisies/lecture.ts'
import type { Lieu, Vu } from '../ui/saisies/lecture.ts'

type LectureDuFrigo = {
  articles: Vu[]
  lisible: boolean
  commentaire: string | null
  restantes: number
  quota: number
  ms: number
}

const ICONE: Record<Lieu, () => React.JSX.Element> = {
  frigo: () => <IcoFrigo />, congelateur: () => <IcoCongel />, placard: () => <IcoPlacard />,
}

export function Photo({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [lieu, setLieu] = useState<Lieu>('frigo')
  const [apercu, setApercu] = useState<string | null>(null)
  const [lecture, setLecture] = useState<LectureDuFrigo | null>(null)
  const [retenus, setRetenus] = useState<Set<number>>(new Set())
  const ajoute = useAjouteStock()
  const [range, setRange] = useState(false)
  const choix = useRef<(HTMLButtonElement | null)[]>([])

  const lit = useMutation({
    mutationFn: async ({ fichier, lieu: choisi }: { fichier: File; lieu: Lieu }) => {
      const p = await prepare(fichier)
      setApercu(p.dataUrl)
      const r = await callFunction('frigo', { image: p.dataUrl, lieu: choisi }) as LectureDuFrigo
      // Un lieu absent ou inconnu prend celui qu'on a choisi : aucune ligne ne doit manquer d'une carte.
      return normaliseLieux(r, choisi)
    },
    onSuccess: r => {
      setLecture(r)
      // On coche d'avance ce dont le modèle est sûr, et seulement cela.
      setRetenus(cocheesDAvance(r.articles))
    },
  })

  function reprend() {
    setLecture(null)
    setApercu(null)
    setRetenus(new Set())
    lit.reset()
    ajoute.reset()
  }

  async function rangeTout() {
    if (!lecture || range) return
    setRange(true)
    const faits: number[] = []
    try {
      for (const [i, a] of lecture.articles.entries()) {
        if (!retenus.has(i)) continue
        await ajoute.mutateAsync({
          label: libelle(a),
          quantite: a.quantite,
          // Les unités de comptage (« pot », « barquette ») ne sont pas des unités
          // de mesure : on garde ce que le modèle a vu, l'écran le montre tel quel.
          unite: a.unite,
          lieu: a.lieu,
        })
        faits.push(i)
      }
    } catch {
      // Une ligne a échoué : celles qui sont entrées se décochent, pour qu'un second appui ne les ajoute pas deux fois.
      setRetenus(s => { const n = new Set(s); faits.forEach(i => n.delete(i)); return n })
      setRange(false)
      return
    }
    va('/frigo')
  }

  const bascule = (i: number) => setRetenus(s => {
    const n = new Set(s)
    if (n.has(i)) n.delete(i); else n.add(i)
    return n
  })

  /** Les flèches changent de lieu, comme un groupe de radios : un seul arrêt au clavier. */
  function flecheSurLieu(e: KeyboardEvent, i: number) {
    const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!pas) return
    e.preventDefault()
    const j = (i + pas + LIEUX.length) % LIEUX.length
    setLieu(LIEUX[j])
    choix.current[j]?.focus()
  }

  const illisible = lecture !== null && !lecture.lisible
  const lue = lecture?.lisible ? lecture : null

  return (
    <PassageLarge retour={retour} retourTexte="Frigo">
      {lue ? (
        <Titre sous="Décoche ce qui n’y est pas, coche ce que le modèle a raté. Tu pourras toujours retirer une ligne depuis le frigo.">
          Ce que j’ai vu
        </Titre>
      ) : (
        <Titre sous="Le modèle propose, tu valides. Rien n’entre à l’inventaire sans que tu l’aies coché.">
          Photo du frigo
        </Titre>
      )}

      {!lue && (
        <Deux rapport="1-1">
          <Colonne>
            {!illisible && (
              <Carte className="grid gap-3.5">
                <span id="ou-photo" className="text-[13.5px] font-medium text-doux">Où est-ce que tu photographies ?</span>
                <div role="radiogroup" aria-labelledby="ou-photo"
                     className="grid auto-cols-fr grid-flow-col gap-1 rounded-2xl bg-piste p-1">
                  {LIEUX.map((l, i) => (
                    <button key={l} type="button" role="radio" aria-checked={lieu === l}
                            ref={el => { choix.current[i] = el }}
                            tabIndex={lieu === l ? 0 : -1} disabled={lit.isPending}
                            onClick={() => setLieu(l)} onKeyDown={e => flecheSurLieu(e, i)}
                            className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-1 text-[14.5px]
                                        font-semibold leading-[1.15] max-[360px]:text-[13.5px]
                                        ${lieu === l ? 'bg-surface text-encre shadow-[0_1px_3px_rgba(28,43,35,.12)]' : 'font-medium text-encre'}`}>
                      <span className="max-[360px]:hidden">{ICONE[l]()}</span>
                      {NOM_LIEU[l]}
                    </button>
                  ))}
                </div>

                <BoutonPhoto
                  texte={<span className="inline-flex items-center gap-3"><IcoAppareil />{lit.isPending ? 'Je regarde…' : 'Prendre la photo'}</span>}
                  disabled={lit.isPending}
                  onFichier={f => lit.mutate({ fichier: f, lieu })}
                  className={`min-h-[60px] w-full rounded-[20px] text-[18px] font-semibold min-[900px]:max-w-[420px]
                              has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-herbe
                              ${lit.isPending ? '' : 'bg-herbe text-fond'}`} />
                <Erreur de={lit.error} />
              </Carte>
            )}

            {!illisible && (
              <Astuce>
                Cadre <b>une étagère à la fois</b>, de face. Les étiquettes lisibles donnent la variété : un yaourt aux
                fruits n’a pas les mêmes macros qu’un nature.
              </Astuce>
            )}

            <div aria-live="polite">
              {lit.isPending && <Lecture texte="Je regarde… une quinzaine de secondes." />}
              {illisible && (
                <Echec texte={lecture.commentaire ?? 'La photo ne montre pas d’aliments identifiables.'}
                       surReprise={reprend} />
              )}
            </div>
          </Colonne>

          <Colonne>
            <Viseur photo={apercu} alt="La photo envoyée" coins={!illisible} etiquette="Le cadre à viser">
              <SceneFrigo />
            </Viseur>
          </Colonne>
        </Deux>
      )}

      {/* La lecture s'annonce une fois, à son arrivée : cocher une case ne relit pas le résumé. */}
      <p role="status" className="sr-only">
        {lue ? `Lecture terminée : ${lue.articles.length} ${resumeDeLaPhoto(lue.articles.length, cocheesDAvance(lue.articles).size, lue.ms)}.` : ''}
      </p>

      {lue && (
        <Deux rapport="5-7">
          <Colonne>
            {apercu && <Viseur photo={apercu} alt="La photo envoyée" coins={false} />}

            <Carte>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <Chiffre valeur={lue.articles.length} taille={36} couleur="var(--color-herbe)" />
                <span className="text-[14.5px] text-doux">{resumeDeLaPhoto(lue.articles.length, retenus.size, lue.ms)}</span>
              </div>
              <p className="mt-2 text-[13.5px] leading-[1.4] text-doux">
                {lue.commentaire
                  ?? 'Ce dont le modèle est sûr est coché d’avance ; ce qu’il a deviné est marqué, et décoché.'}
              </p>
            </Carte>

            <div className="grid gap-2">
              <Principal onClick={rangeTout} disabled={range || retenus.size === 0}>
                {range ? 'Je range…' : `Ajouter ${retenus.size} ${pluriel(retenus.size, 'article')}`}
              </Principal>
              <Erreur de={ajoute.error} />
              <BoutonDoux onClick={reprend} disabled={range}>Reprendre une photo</BoutonDoux>
              {quotaDit(lue.restantes, 'photo') && (
                <p className="text-center text-[13.5px] text-doux">{quotaDit(lue.restantes, 'photo')}</p>
              )}
            </div>
          </Colonne>

          <Colonne>
            {regroupeParLieu(lue.articles).map(g => (
              <Carte key={g.lieu} aria-label={NOM_LIEU[g.lieu]}>
                <EnteteDeCarte titre={NOM_LIEU[g.lieu]}
                               droite={(
                                 <Puce ton={g.lieu === 'congelateur' ? 'congel' : g.lieu === 'frigo' ? 'frais' : 'piste'}>
                                   {ICONE[g.lieu]()}{g.items.length} {pluriel(g.items.length, 'article')}
                                 </Puce>
                               )} />
                <ul className="grid">
                  {g.items.map(({ a, i }) => (
                    <LigneVue key={i} a={a} coche={retenus.has(i)} surBascule={() => bascule(i)} />
                  ))}
                </ul>
              </Carte>
            ))}
          </Colonne>
        </Deux>
      )}
    </PassageLarge>
  )
}

function LigneVue({ a, coche, surBascule }: { a: Vu; coche: boolean; surBascule: () => void }) {
  const devine = estDevine(a)
  const unite = uniteAffichee(a.unite, a.quantite)
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-1.5 border-t border-brume py-2 first:border-t-0">
      <CaseACocher coche={coche} nom={libelle(a)} surBascule={surBascule} />
      <div className="min-w-0">
        <b className={`block text-[16px] font-semibold leading-[1.25] [overflow-wrap:anywhere] ${coche ? '' : 'text-doux'}`}>
          {a.nom}
          {a.variete && <em className="font-normal not-italic text-doux"> {a.variete}</em>}
        </b>
        {/* L'emplacement vient de la lecture : s'il manque, la ligne n'en invente pas. */}
        <span className="mt-0.5 block text-[13px] leading-[1.35] text-doux">
          {[a.ou, a.remarque].filter(Boolean).join(' · ')}
          {/* L'incertitude s'affiche, elle ne se cache pas. */}
          {devine && (
            <span className="whitespace-nowrap font-semibold text-ocre">
              {a.ou || a.remarque ? ' · ' : ''}deviné, à vérifier
            </span>
          )}
        </span>
      </div>
      <div className={`min-w-14 rounded-[14px] px-2 py-1.5 text-center max-[360px]:min-w-12 ${devine ? 'bg-sable' : 'bg-piste'}`}>
        <b className="chiffre block text-[20px] font-semibold leading-none">{a.quantite ?? '—'}</b>
        <small className="mt-0.5 block text-[11.5px] leading-tight text-encre">
          {a.quantite === null ? 'à compter' : unite || ' '}
        </small>
      </div>
    </li>
  )
}
