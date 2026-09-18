/**
 * La photo du frigo (D28, D57).
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
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  BoutonPhoto, Chiffre, Erreur, Passage, Principal, Secondaire, Surface, Vide,
} from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { prepare } from '../lib/photo.ts'
import { useAjouteStock } from '../lib/donnees/barquettes.ts'

type Lieu = 'frigo' | 'congelateur' | 'placard'

type Vu = {
  /** Où le modèle l'a vu. Il le rend AVANT de compter : c'est ce qui l'empêche
      de fusionner deux groupes distincts du même produit. */
  ou: string
  nom: string
  variete: string | null
  quantite: number | null
  unite: string | null
  lieu: Lieu
  confiance: number
  remarque: string | null
}

type Lecture = {
  articles: Vu[]
  lisible: boolean
  commentaire: string | null
  restantes: number
  quota: number
  ms: number
}

const NOM_LIEU: Record<Lieu, string> = {
  frigo: 'Frigo', congelateur: 'Congélateur', placard: 'Placard',
}

/** En dessous, le modèle a deviné : on le dit, et on ne coche pas d'avance. */
const SEUIL_SUR = 0.8

const libelle = (a: Vu) => [a.nom, a.variete].filter(Boolean).join(' ')

export function Photo({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [lieu, setLieu] = useState<Lieu>('frigo')
  const [apercu, setApercu] = useState<string | null>(null)
  const [lecture, setLecture] = useState<Lecture | null>(null)
  const [retenus, setRetenus] = useState<Set<number>>(new Set())
  const ajoute = useAjouteStock()
  const [range, setRange] = useState(false)

  const lit = useMutation({
    mutationFn: async (fichier: File) => {
      const p = await prepare(fichier)
      setApercu(p.dataUrl)
      return callFunction('frigo', { image: p.dataUrl, lieu }) as Promise<Lecture>
    },
    onSuccess: r => {
      setLecture(r)
      // On coche d'avance ce dont le modèle est sûr, et seulement cela.
      setRetenus(new Set(r.articles.map((a, i) => (a.confiance >= SEUIL_SUR ? i : -1))
        .filter(i => i >= 0)))
    },
  })

  async function rangeTout() {
    if (!lecture) return
    setRange(true)
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
    }
    va('/stock')
  }

  return (
    <Passage retour={retour} retourTexte="Ce que j’ai">
      <h1 className="titre text-[40px]">Photo<br />du frigo</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[34ch]">
        Le modèle propose, tu valides. Rien n’entre à l’inventaire sans que tu
        l’aies coché.
      </p>

      {!lecture && (
        <>
          <div className="mt-7 flex gap-1.5 p-1.5 rounded-[15px] bg-brume/60" role="radiogroup">
            {(['frigo', 'congelateur', 'placard'] as Lieu[]).map(l => (
              <button key={l} role="radio" aria-checked={lieu === l} onClick={() => setLieu(l)}
                      className={`flex-1 py-2.5 rounded-[11px] text-[14px] transition-colors
                        ${lieu === l ? 'bg-surface font-medium' : 'text-doux'}`}>
                {NOM_LIEU[l]}
              </button>
            ))}
          </div>

          <BoutonPhoto texte={lit.isPending ? 'Je regarde…' : 'Prendre la photo'}
                       disabled={lit.isPending}
                       onFichier={f => lit.mutate(f)} />

          {lit.isPending && (
            <p className="mt-6 text-[15px] text-doux">Je regarde… une quinzaine de secondes.</p>
          )}
          <Erreur de={lit.error} />

          <p className="mt-8 text-[13px] text-doux leading-relaxed">
            Cadre une étagère à la fois, de face. Les étiquettes lisibles donnent
            la variété — et un yaourt aux fruits n’a pas les mêmes macros qu’un
            nature.
          </p>
        </>
      )}

      {lecture && !lecture.lisible && (
        <>
          <Vide titre="Je n’ai rien su lire"
                texte={lecture.commentaire ?? 'La photo ne montre pas d’aliments identifiables.'} />
          <Secondaire onClick={() => { setLecture(null); setApercu(null) }}>
            Reprendre une photo
          </Secondaire>
        </>
      )}

      {lecture?.lisible && (
        <>
          {apercu && (
            <img src={apercu} alt="La photo envoyée"
                 className="mt-6 w-full rounded-[18px]" />
          )}

          <p className="mt-6 text-[15px] text-doux">
            <Chiffre valeur={lecture.articles.length} taille={22} /> articles vus ·
            {' '}{retenus.size} retenus · {(lecture.ms / 1000).toFixed(0)} s
          </p>

          <ul className="mt-5 divide-y divide-brume/70">
            {lecture.articles.map((a, i) => {
              const sur = a.confiance >= SEUIL_SUR
              return (
                <li key={i} className="flex items-start gap-3 py-1">
                  <button role="checkbox" aria-checked={retenus.has(i)}
                          aria-label={libelle(a)}
                          onClick={() => setRetenus(s => {
                            const n = new Set(s)
                            if (n.has(i)) n.delete(i); else n.add(i)
                            return n
                          })}
                          className="w-11 h-11 grid place-items-center shrink-0">
                    <span className={`w-[22px] h-[22px] rounded-[7px] border-2 grid place-items-center
                                      ${retenus.has(i) ? 'bg-herbe border-herbe' : 'border-brume'}`}>
                      {retenus.has(i) && (
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F2F4EF"
                             strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                          <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
                        </svg>
                      )}
                    </span>
                  </button>

                  <span className="grow py-2.5">
                    <span className="block text-[15px]">
                      {a.quantite !== null && (
                        <strong className="font-medium">
                          {a.quantite} {a.unite ?? ''}{' '}
                        </strong>
                      )}
                      {a.nom}
                      {a.variete && <span className="text-doux"> {a.variete}</span>}
                    </span>
                    <span className="block text-[13px] text-doux mt-0.5">
                      {a.ou}
                      {a.remarque && ` · ${a.remarque}`}
                      {/* L'incertitude s'affiche, elle ne se cache pas. */}
                      {!sur && (
                        <span style={{ color: '#8F5A0D' }}>
                          {' · '}deviné, à vérifier
                        </span>
                      )}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>

          <Surface className="mt-6">
            <p className="text-[13px] text-doux leading-relaxed">
              {lecture.commentaire
                ?? 'Décoche ce qui n’y est pas, coche ce que le modèle a raté. '
                 + 'Tu pourras toujours corriger les quantités depuis « Ce que j’ai ».'}
            </p>
          </Surface>

          <div className="mt-8">
            <Principal onClick={rangeTout} disabled={range || retenus.size === 0}>
              {range ? 'Je range…' : `Ajouter ${retenus.size} article${retenus.size > 1 ? 's' : ''}`}
            </Principal>
            <Erreur de={ajoute.error} />
            <Secondaire onClick={() => { setLecture(null); setApercu(null) }}>
              Reprendre une photo
            </Secondaire>
            <p className="mt-2 text-center text-[13px] text-doux">
              {lecture.restantes} photo{lecture.restantes > 1 ? 's' : ''} restante
              {lecture.restantes > 1 ? 's' : ''} ce mois-ci.
            </p>
          </div>
        </>
      )}
    </Passage>
  )
}
