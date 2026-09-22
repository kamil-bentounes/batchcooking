/**
 * Envie spéciale.
 *
 * Tout le reste de l'app suppose qu'on a prévu. Cette porte-là suppose le
 * contraire : rien de ce qui est prévu ne fait envie ce soir.
 *
 * Elle est en bas de l'accueil, jamais au centre. Si elle s'ouvre trois fois par
 * semaine, c'est que le choix du mercredi se trompe — et le bilan doit le dire.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  Chiffre, Erreur, Passage, Principal, Secondaire, Surface, duree,
} from '../ui/coque.tsx'
import { callFunction, ou, supabase } from '../lib/supabase.ts'
import { useAppareils, useFoyer, objectifDe } from '../lib/donnees/foyer.ts'
import { PART_DU_JOUR } from '../lib/nutrition/portions.ts'
import { appareilDuCatalogue } from '../lib/plan/duree.ts'
import { useStock } from '../lib/donnees/barquettes.ts'

type Perimetre = 'frigo' | 'courses' | 'libre'

type Recette = {
  titre: string
  parts: number
  ingredients: { nom: string; quantite: number | null; unite: string | null }[]
  etapes: { texte: string; minutes: number | null; appareil: string | null; charge: string }[]
  kcalParPart: [number, number]
  proteinesParPart: [number, number]
  minutesActives: number
  manquants: string[]
  note?: string
}

const ENVIES = ['Réconfortant', 'Asiatique', 'Sans cuisson', 'Un dessert', 'Épicé', 'Frais']

export function Inventer({ userId, retour, va }: {
  userId: string; retour: () => void; va: (v: string) => void
}) {
  const { data: foyer } = useFoyer()
  const { data: catalogue = [] } = useAppareils()
  const { data: stock = [] } = useStock()

  const moi = foyer?.membres.find(m => m.id === userId)
  const o = moi ? objectifDe(moi) : { kcal: 0, proteinG: 0 }
  const f = PART_DU_JOUR.diner

  const [envie, setEnvie] = useState('')
  const [perimetre, setPerimetre] = useState<Perimetre>('frigo')
  const [proteines, setProteines] = useState(Math.round(o.proteinG * f) || 30)
  const [kcal, setKcal] = useState(Math.round(o.kcal * f) || 620)
  const [minutes, setMinutes] = useState(25)
  const [appareils, setAppareils] = useState<string[]>([])
  const [resultat, setResultat] = useState<{ recette: Recette; restantes: number } | null>(null)

  const invente = useMutation({
    mutationFn: async () => callFunction('inventer', {
      envie, perimetre, proteinesMin: proteines, kcalMax: kcal,
      minutesMax: minutes, appareils, parts: 2,
    }) as Promise<{ recette: Recette; restantes: number }>,
    onSuccess: setResultat,
  })

  const garde = useMutation({
    mutationFn: async (r: Recette) => {
      const hh = ou(await supabase.rpc('current_household'))
      if (!hh) throw new Error('Aucun foyer.')
      const recette = ou(await supabase.from('recipe').insert({
        title: r.titre,
        origin: 'generee',
        owner_household_id: hh,
        visibility: 'privee',
        yield_servings: Math.max(1, r.parts),
        total_time_min: r.etapes.reduce((s, e) => s + (e.minutes ?? 0), 0) || null,
        license_note: 'Inventée par un modèle, jamais testée.',
      }).select().single())

      if (r.ingredients.length > 0) {
        ou(await supabase.from('recipe_ingredient').insert(r.ingredients.map((i, n) => ({
          recipe_id: recette.id,
          ordinal: n + 1,
          raw_text: [i.quantite, i.unite, i.nom].filter(Boolean).join(' '),
          qty: i.quantite,
          unit: i.unite,
          grams_reference: i.unite === 'g' ? i.quantite : null,
          resolution_source: 'llm' as const,
        })).slice(0, 60)).select())
      }
      if (r.etapes.length > 0) {
        ou(await supabase.from('recipe_step').insert(r.etapes.map((e, n) => ({
          recipe_id: recette.id,
          ordinal: n + 1,
          text: e.texte,
          duration_min: e.minutes,
          duration_source: 'llm' as const,
          // Normalisé dès l'écriture : le modèle dit « plaque », le catalogue
          // connaît « plaques », et l'ordonnanceur exige un code du catalogue.
          appliance_type: appareilDuCatalogue(e.appareil),
          load_type: ['actif', 'passif', 'bloquant'].includes(e.charge) ? e.charge : 'actif',
        })).slice(0, 40)).select())
      }
      return recette
    },
  })

  if (resultat) {
    return (
      <Resultat r={resultat.recette} restantes={resultat.restantes}
                retour={() => setResultat(null)}
                garde={garde}
                surGardee={() => va('/choisir')} />
    )
  }

  const stockTexte = stock.slice(0, 3).map(s => s.label).join(' · ')

  return (
    <Passage retour={retour}>
      <h1 className="titre text-[40px]">Envie<br />spéciale ?</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[34ch]">
        Dis ce qui te ferait plaisir. On invente une recette qui tient tes objectifs.
      </p>

      <Surface className="mt-6">
        <label className="block">
          <span className="text-[13px] text-doux">Ce soir j’ai envie de…</span>
          <textarea value={envie} onChange={e => setEnvie(e.target.value)} rows={2}
                    placeholder="quelque chose de crémeux et épicé"
                    className="mt-2 w-full bg-transparent text-[17px] resize-none
                               placeholder:text-doux/50 outline-none" />
        </label>
      </Surface>
      <div className="mt-3 flex gap-2 flex-wrap">
        {ENVIES.map(e => (
          <button key={e} onClick={() => setEnvie(v => v ? `${v}, ${e.toLowerCase()}` : e)}
                  className="px-3.5 min-h-11 inline-flex items-center rounded-full bg-brume/60 text-[13px] hover:bg-brume">
            {e}
          </button>
        ))}
      </div>

      {/* Le seul réglage qui compte vraiment. Par défaut, on reste au frigo. */}
      <h2 className="mt-9 text-[13px] text-doux uppercase tracking-[0.04em]">Avec quoi</h2>
      <div className="mt-3 flex gap-1.5 p-1.5 rounded-[15px] bg-brume/60" role="radiogroup">
        {([['frigo', 'Ce qu’on a'], ['courses', '+ 3 courses'], ['libre', 'Libre']] as const)
          .map(([v, texte]) => (
            <button key={v} role="radio" aria-checked={perimetre === v}
                    onClick={() => setPerimetre(v)}
                    className={`flex-1 min-h-11 rounded-[11px] text-[14px] transition-colors
                      ${perimetre === v ? 'bg-surface font-medium' : 'text-encre'}`}>
              {texte}
            </button>
          ))}
      </div>
      {perimetre !== 'libre' && (
        <p className="mt-3 text-[14px] text-doux">
          {stock.length === 0
            ? 'Tes placards sont vides dans l’app : ajoute ce que tu as depuis « Ce que j’ai ».'
            : <>On pioche dans les <strong className="text-encre font-medium">
                {stock.length} aliments</strong> de tes placards{stockTexte && ` — ${stockTexte}…`}</>}
        </p>
      )}

      <h2 className="mt-9 text-[13px] text-doux uppercase tracking-[0.04em]">Sans négocier</h2>
      <div className="mt-3.5 space-y-3.5">
        <Reglage label="Au moins" valeur={proteines} unite="g de protéines"
                 min={0} max={90} pas={5} surChange={setProteines} />
        <Reglage label="Au plus" valeur={kcal} unite="kcal la part"
                 min={200} max={1200} pas={20} surChange={setKcal} />
        <Reglage label="En moins de" valeur={minutes} unite="min actives"
                 min={5} max={120} pas={5} surChange={setMinutes} />
      </div>
      <div className="mt-4 flex gap-2 flex-wrap">
        {catalogue.map(a => (
          <button key={a.code}
                  onClick={() => setAppareils(l =>
                    l.includes(a.code) ? l.filter(x => x !== a.code) : [...l, a.code])}
                  aria-pressed={appareils.includes(a.code)}
                  className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-[13px] transition-colors
                    ${appareils.includes(a.code) ? 'bg-herbe text-fond' : 'bg-brume/60'}`}>
            {a.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] text-doux leading-relaxed">
        Repris de tes objectifs, ramenés à un repas. Modifiable ici sans rien
        changer ailleurs. Le modèle ne voit que ces bornes, jamais tes objectifs.
      </p>

      <div className="mt-8">
        <Principal onClick={() => invente.mutate()} disabled={invente.isPending}>
          {invente.isPending ? 'J’invente…' : 'Invente-moi ça'}
        </Principal>
        <Erreur de={invente.error} />
      </div>
    </Passage>
  )
}

function Reglage({ label, valeur, unite, min, max, pas, surChange }: {
  label: string; valeur: number; unite: string
  min: number; max: number; pas: number; surChange: (v: number) => void
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="text-[15px] grow">{label}</span>
      <input type="number" value={valeur} min={min} max={max} step={pas}
             onChange={e => surChange(Number(e.target.value) || min)}
             aria-label={`${label} ${unite}`}
             className="w-20 rounded-lg border border-brume bg-fond px-2.5 py-1.5
                        text-right chiffre outline-none focus:border-herbe" />
      <span className="text-[14px] text-doux w-[110px]">{unite}</span>
    </label>
  )
}

function Resultat({ r, restantes, retour, garde, surGardee }: {
  r: Recette
  restantes: number
  retour: () => void
  garde: { mutate: (r: Recette, o?: { onSuccess?: () => void }) => void; isPending: boolean; error: unknown }
  surGardee: () => void
}) {
  return (
    <Passage retour={retour} retourTexte="Changer l’envie">
      {/* Toujours dire qu'elle est inventée : personne ne l'a jamais cuisinée. */}
      <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{ background: '#F6E9D2' }}>
        <svg width="13" height="13" viewBox="0 0 19 19" fill="none" stroke="var(--color-ocre)"
             strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9.5 2.2 11 6.6l4.4 1.5-4.4 1.5-1.5 4.4-1.5-4.4L3.6 8.1 8 6.6z" />
        </svg>
        <span className="text-[12px] font-medium" style={{ color: 'var(--color-ocre)' }}>
          Inventée · jamais testée
        </span>
      </span>

      <h1 className="titre text-[36px] mt-4">{r.titre}</h1>

      <div className="mt-5 flex gap-6 flex-wrap">
        <div>
          <Chiffre valeur={intervalle(r.proteinesParPart)} taille={28} />
          <p className="text-[13px] text-doux mt-0.5">g protéines</p>
        </div>
        <div>
          <Chiffre valeur={intervalle(r.kcalParPart)} taille={28} />
          <p className="text-[13px] text-doux mt-0.5">kcal la part</p>
        </div>
        <div>
          <Chiffre valeur={r.minutesActives} taille={28} />
          <p className="text-[13px] text-doux mt-0.5">min actives</p>
        </div>
      </div>
      <p className="mt-3.5 text-[13px] text-doux leading-relaxed">
        Des fourchettes, pas des chiffres : les grammages sont proposés, pas
        mesurés. Ils se resserreront quand tu l’auras pesée.
      </p>

      <Surface className="mt-6">
        {r.manquants.length === 0 ? (
          <p className="text-[15px] font-medium">Tu as tout.</p>
        ) : (
          <>
            <p className="text-[15px] font-medium">
              Il te manque {r.manquants.length} chose{r.manquants.length > 1 ? 's' : ''}
            </p>
            <p className="mt-2 text-[14px] text-doux">{r.manquants.join(' · ')}</p>
          </>
        )}
        <p className="mt-2.5 text-[14px] text-doux leading-relaxed">
          {r.ingredients.map(i =>
            [i.quantite, i.unite, i.nom].filter(Boolean).join(' ')).join(' · ')}
        </p>
      </Surface>

      <h2 className="mt-8 text-[13px] text-doux uppercase tracking-[0.04em]">
        La marche à suivre
      </h2>
      <ol className="mt-4 space-y-4">
        {r.etapes.map((e, i) => (
          <li key={i} className="flex gap-3.5">
            <span className="chiffre text-[16px] text-doux w-4 shrink-0">{i + 1}</span>
            <span className="text-[15px] leading-relaxed">
              {e.texte}
              {e.minutes ? <span className="text-doux"> · {duree(e.minutes)}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {r.note && <p className="mt-5 text-[14px] text-doux leading-relaxed">{r.note}</p>}

      <div className="mt-9">
        <Principal onClick={() => garde.mutate(r, { onSuccess: surGardee })}
                   disabled={garde.isPending}>
          Garder cette recette
        </Principal>
        <Erreur de={garde.error} />
        <Secondaire onClick={retour}>Autre idée</Secondaire>
        <p className="mt-2 text-center text-[13px] text-doux leading-relaxed">
          « Garder » la range avec les autres recettes. Sinon elle disparaît.<br />
          {restantes} génération{restantes > 1 ? 's' : ''} restante
          {restantes > 1 ? 's' : ''} ce mois-ci.
        </p>
      </div>
    </Passage>
  )
}

function intervalle([bas, haut]: [number, number]): string {
  const a = Math.round(bas)
  const b = Math.round(haut)
  return a === b ? String(a) : `${a}–${b}`
}
