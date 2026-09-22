/**
 * Coller sa propre recette.
 *
 * Celle d'un carnet, d'un message, d'un site qu'on n'ingère pas. Le modèle
 * DÉCOUPE le texte — titre, parts, lignes d'ingrédients, gestes — et tout le
 * reste est fait par le même code déterministe que l'ingestion : lire
 * « 500 g de poireaux », reconnaître le verbe et l'appareil, rattacher à
 * CIQUAL, calculer les macros avec leur fourchette.
 *
 * L'écran ne cache RIEN de ce qui a été compris ou raté. C'est le seul moment
 * où la correction coûte une seconde ; plus tard, elle coûte une soirée.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  BarreAction, Erreur, Passage, Secondaire, Surface, Vide, duree,
} from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { useEnregistreImport } from '../lib/donnees/importer.ts'
import type { EtapeLue, IngredientLu, RecetteLue } from '../lib/donnees/importer.ts'

export function Importer({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const [texte, setTexte] = useState('')
  const [precisions, setPrecisions] = useState('')
  const [lue, setLue] = useState<RecetteLue | null>(null)
  /** Le défaut est le foyer seul. Partager est un geste, pas un réglage oublié. */
  const [visibility, setVisibility] = useState<'privee' | 'partagee' | 'publique'>('privee')

  const [titre, setTitre] = useState('')
  const [parts, setParts] = useState(4)
  const [ingredients, setIngredients] = useState<IngredientLu[]>([])
  const [etapes, setEtapes] = useState<EtapeLue[]>([])

  const enregistre = useEnregistreImport()

  const lit = useMutation({
    mutationFn: () => callFunction('importer', {
      texte, precisions: precisions.trim() || undefined,
    }) as Promise<RecetteLue>,
    onSuccess: r => {
      setLue(r)
      setTitre(r.titre ?? '')
      setParts(r.parts ?? 4)
      setIngredients(r.ingredients ?? [])
      setEtapes(r.etapes ?? [])
    },
  })

  const sansDuree = etapes.filter(e => e.duration_min === null).length
  const sansAliment = ingredients.filter(i => i.food_id === null).length

  async function garde() {
    const { recette } = await enregistre.mutateAsync({
      titre, parts, ingredients, etapes, note: precisions, visibility,
    })
    va(`/choisir?ajoute=${recette.id}`)
  }

  // ── L'écran de saisie ────────────────────────────────────────────────────
  if (!lue) {
    return (
      <Passage retour={retour} retourTexte="Choisir" barre={
        /* ⚠️ Par `barre`, pas en enfant : c'est ce qui fait passer `Passage` en
           `pb-40` et réserve la place sous la barre. Posée en enfant, elle
           recouvrait les vingt-trois derniers pixels de la page, que rien ne
           permettait d'atteindre. */
        <BarreAction>
          <button onClick={() => lit.mutate()}
                  disabled={texte.trim().length < 40 || lit.isPending}
                  className="w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px]
                             font-medium disabled:bg-brume disabled:text-encre
                             transition-colors">
            {lit.isPending ? 'Je range…' : 'Ranger la recette'}
          </button>
        </BarreAction>
      }>
        <h1 className="titre text-[40px]">Coller<br />une recette</h1>
        <p className="mt-3.5 text-[15px] text-doux max-w-[36ch]">
          D’un carnet, d’un message, d’un site. Elle rejoint le catalogue avec
          ses macros et son temps actif, comme les autres.
        </p>

        <label className="mt-7 block">
          <span className="text-[13px] text-doux">La recette, telle quelle</span>
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={12}
                    placeholder={'Tarte aux poireaux, pour 6\n\n3 poireaux\n200 g de crème\n'
                      + '1 pâte brisée\n\nPréchauffer le four à 180°C.\n'
                      + 'Émincer les poireaux et les faire revenir 10 minutes.\n'
                      + 'Verser sur la pâte, enfourner 35 minutes.'}
                    className="mt-1.5 w-full rounded-[16px] bg-brume/40 p-4 text-[15px]
                               leading-relaxed outline-none focus:bg-brume/60 transition-colors" />
        </label>

        {/* Le commentaire libre : il complète le texte, il ne le remplace pas. */}
        <label className="mt-5 block">
          <span className="text-[13px] text-doux">
            Une précision à ajouter ? (facultatif)
          </span>
          <input value={precisions} onChange={e => setPrecisions(e.target.value)}
                 placeholder="C’est pour 4, pas 6 · j’utilise de la crème allégée"
                 className="mt-1.5 w-full h-[48px] px-4 rounded-[14px] bg-brume/40
                            text-[15px] outline-none focus:bg-brume/60 transition-colors" />
          <span className="block mt-1.5 text-[13px] text-doux">
            Elle part avec le texte, et reste attachée à la recette — pour qu’on
            sache dans trois semaines pourquoi elle est comme ça.
          </span>
        </label>

        {lit.isPending && (
          <p className="mt-6 text-[15px] text-doux">Je range… quelques secondes.</p>
        )}
        <Erreur de={lit.error} />

      </Passage>
    )
  }

  // ── Ce qui a été compris, et ce qui manque ───────────────────────────────
  return (
    <Passage retour={() => setLue(null)} retourTexte="Reprendre le texte" barre={
      <BarreAction>
        <button onClick={garde}
                disabled={!titre.trim() || etapes.length === 0 || enregistre.isPending}
                className="w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px]
                           font-medium disabled:bg-brume disabled:text-encre transition-colors">
          {enregistre.isPending ? 'J’enregistre…' : 'Garder cette recette'}
        </button>
        <Erreur de={enregistre.error} />
      </BarreAction>
    }>
      <h1 className="titre text-[34px]">Ce que j’ai compris</h1>

      <label className="mt-6 block">
        <span className="text-[13px] text-doux">Titre</span>
        <input value={titre} onChange={e => setTitre(e.target.value)}
               className="mt-1.5 w-full h-[52px] px-4 rounded-[14px] bg-brume/40
                          text-[17px] outline-none focus:bg-brume/60" />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <span className="text-[15px] text-doux grow">Pour combien de parts ?</span>
        <input type="number" min={1} max={40} value={parts}
               onChange={e => setParts(Math.max(1, Number(e.target.value) || 1))}
               className="w-20 h-[48px] rounded-[14px] bg-brume/40 px-3 text-right
                          text-[17px] outline-none focus:bg-brume/60" />
      </div>

      {(sansDuree > 0 || sansAliment > 0 || lue.aCompleter.length > 0) && (
        <Surface className="mt-6">
          <p className="text-[13px] uppercase tracking-[0.04em]" style={{ color: 'var(--color-ocre)' }}>
            À compléter
          </p>
          <ul className="mt-2 space-y-1 text-[14px] text-doux">
            {[...new Set(lue.aCompleter)].map(m => <li key={m}>· {m}</li>)}
          </ul>
          {sansDuree > 0 && (
            <p className="mt-2.5 text-[13px] text-doux leading-relaxed">
              Sans durée sur chaque étape, la recette se garde et se lit, mais
              elle ne part pas au plan du dimanche : l’optimiseur ne saurait pas
              quand la caler.
            </p>
          )}
        </Surface>
      )}

      {/* Qui la voit. Posé ici, au moment où l'on décide de la garder — pas
          dans un réglage qu'on découvrirait trop tard. */}
      <section className="mt-7" aria-label="Qui peut la voir">
        <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">
          Qui peut la voir
        </h2>
        <div className="mt-2.5 flex flex-col gap-2">
          {([
            ['privee', 'Nous deux', 'Elle ne sort pas du foyer.'],
            ['partagee', 'Nos amis', 'Les foyers avec qui on partage la voient, avec ton prénom.'],
            ['publique', 'Tout le monde', 'Elle rejoint le catalogue commun.'],
          ] as const).map(([v, titre, quoi]) => (
            <button key={v} onClick={() => setVisibility(v)}
                    aria-pressed={visibility === v}
                    className={`text-left p-3.5 rounded-[15px] transition-colors
                      ${visibility === v ? 'bg-herbe/10 ring-1 ring-herbe' : 'bg-brume/40'}`}>
              <span className="block text-[15px]">{titre}</span>
              <span className="block text-[13px] text-doux mt-0.5">{quoi}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-label="Ingrédients">
        <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">
          {ingredients.length} ingrédients
        </h2>
        <ul className="mt-3 divide-y divide-brume/70">
          {ingredients.map((i, n) => (
            <li key={n} className="py-2.5">
              <div className="flex items-baseline gap-3">
                <span className="grow text-[15px]">{i.raw_text}</span>
                <button onClick={() => setIngredients(l => l.filter((_, k) => k !== n))}
                        aria-label={`Retirer ${i.raw_text}`}
                        className="text-[13px] text-doux underline underline-offset-2">
                  retirer
                </button>
              </div>
              <span className="block text-[13px] text-doux mt-0.5">
                {i.food_nom
                  ? <>→ {i.food_nom.split(',')[0]}
                      {i.grams_reference !== null && ` · ${Math.round(i.grams_reference)} g`}</>
                  : <span style={{ color: 'var(--color-ocre)' }}>
                      pas reconnu — il ne comptera pas dans les macros
                    </span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8" aria-label="Étapes">
        <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">
          {etapes.length} étapes
        </h2>
        <ul className="mt-3 space-y-3">
          {etapes.map((e, n) => (
            <li key={n}>
              <div className="flex items-baseline gap-3">
                <span className="grow text-[15px]">{e.text}</span>
                <button onClick={() => setEtapes(l => l.filter((_, k) => k !== n))}
                        aria-label={`Retirer l’étape ${n + 1}`}
                        className="text-[13px] text-doux underline underline-offset-2">
                  retirer
                </button>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <input type="number" min={0} max={600}
                       value={e.duration_min ?? ''}
                       placeholder="min"
                       onChange={ev => setEtapes(l => l.map((x, k) => k === n
                         ? { ...x, duration_min: ev.target.value === '' ? null
                             : Math.max(0, Number(ev.target.value)),
                             duration_source: 'confirmee' as never }
                         : x))}
                       className="w-[72px] h-11 rounded-[11px] bg-brume/40 px-2
                                  text-center text-[14px] outline-none focus:bg-brume/60" />
                <span className="text-[13px] text-doux">
                  {e.duration_min !== null ? duree(e.duration_min) : 'durée manquante'}
                  {e.appliance_type && ` · ${e.appliance_type}`}
                  {e.load_type === 'passif' && ' · passif'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {etapes.length === 0 && (
        <Vide titre="Aucune étape"
              texte="Sans geste, il n’y a pas de recette. Reprends le texte." />
      )}

      <Secondaire onClick={() => setLue(null)}>Reprendre le texte</Secondaire>
    </Passage>
  )
}
