import { useEffect, useRef, useState } from 'react'
import { animate, useMotionValue, useMotionValueEvent } from 'motion/react'
import { supabase } from '../lib/supabase'
import { Page, Groupe, Bouton, Message } from '../ui/kit'

type Cible = { kcal: number; protein_g: number; fiber_g: number; carb_g: number; fat_g: number }
const DEFAUT: Cible = { kcal: 2000, protein_g: 150, fiber_g: 30, carb_g: 200, fat_g: 60 }

const MESURES = [
  { cle: 'kcal',      nom: 'calories',  unite: 'kcal', min: 1200, max: 4000, pas: 50, accent: false },
  { cle: 'protein_g', nom: 'protéines', unite: 'g',    min: 40,   max: 250,  pas: 5,  accent: true  },
  { cle: 'fiber_g',   nom: 'fibres',    unite: 'g',    min: 10,   max: 60,   pas: 1,  accent: false },
  { cle: 'carb_g',    nom: 'glucides',  unite: 'g',    min: 50,   max: 500,  pas: 10, accent: false },
  { cle: 'fat_g',     nom: 'lipides',   unite: 'g',    min: 20,   max: 150,  pas: 5,  accent: false },
] as const

/** Le chiffre compte jusqu'à sa valeur : la seule animation non sollicitée de l'app. */
function Mesure({ m, valeur, onChange }:
  { m: typeof MESURES[number]; valeur: number; onChange: (v: number) => void }) {
  const mv = useMotionValue(valeur)
  const [affiche, setAffiche] = useState(valeur)
  useMotionValueEvent(mv, 'change', v => setAffiche(Math.round(v)))
  const premier = useRef(true)
  useEffect(() => {
    if (premier.current) { premier.current = false; mv.set(valeur); setAffiche(valeur); return }
    const c = animate(mv, valeur, { duration: 0.35, ease: [0.22, 1, 0.36, 1] })
    return () => c.stop()
  }, [valeur, mv])

  return (
    <div className="px-5 py-4">
      <div className="flex items-baseline gap-2.5">
        <span className={`chiffre text-[2.75rem] leading-none ${m.accent ? 'text-safran' : 'text-encre'}`}>
          {affiche.toLocaleString('fr-FR')}
        </span>
        <span className="text-doux text-[15px]">{m.unite}</span>
        <span className="ml-auto text-doux text-[15px]">{m.nom}</span>
      </div>
      <input
        type="range" min={m.min} max={m.max} step={m.pas} value={valeur}
        aria-label={m.nom}
        onChange={e => onChange(Number(e.target.value))}
        className="mt-3 w-full accent-herbe"
      />
    </div>
  )
}

export function Targets({ userId }: { userId: string }) {
  const [v, setV] = useState<Cible>(DEFAUT)
  const [hist, setHist] = useState<any[]>([])
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)

  async function charger() {
    const { data } = await supabase.from('nutrition_target')
      .select('*').eq('user_profile_id', userId).order('valid_from', { ascending: false })
    setHist(data ?? [])
    if (data?.[0]) {
      const { kcal, protein_g, fiber_g, carb_g, fat_g } = data[0]
      setV({ kcal: +kcal, protein_g: +protein_g, fiber_g: +fiber_g, carb_g: +carb_g, fat_g: +fat_g })
    }
  }
  useEffect(() => { charger() }, [userId])

  async function enregistrer() {
    // Le trigger redérive household_id, mais la colonne est NOT NULL : on la
    // pose quand même, pour que le code dise ce que la base exige.
    const { data: hh } = await supabase.rpc('current_household')
    if (!hh) { setErr(true); setMsg('Aucun foyer.'); return }
    // INSERT, jamais UPDATE : les objectifs sont historisés.
    const { error } = await supabase.from('nutrition_target')
      .insert({ user_profile_id: userId, household_id: hh, ...v })
    setErr(!!error); setMsg(error ? error.message : 'Objectif enregistré.')
    if (!error) charger()
  }

  return (
    <Page nav titre="Mes objectifs" chapeau="Ce que tu vises chaque jour. Ta moitié a les siens.">
      <Groupe>
        {MESURES.map(m => (
          <Mesure key={m.cle} m={m} valeur={v[m.cle]}
                  onChange={n => setV({ ...v, [m.cle]: n })} />
        ))}
      </Groupe>

      <div className="mt-6"><Bouton onClick={enregistrer}>Enregistrer</Bouton></div>
      <Message texte={msg} erreur={err} />

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Ce que tu visais avant</h2>
        {hist.length === 0
          ? <p className="mt-2 text-doux">Rien encore. Enregistre un premier objectif.</p>
          : <ul className="mt-3 space-y-1.5 text-[15px] text-doux">
              {hist.map(h => (
                <li key={h.id}>
                  <time dateTime={h.valid_from}>
                    {new Date(h.valid_from).toLocaleDateString('fr-FR',
                      { day: 'numeric', month: 'long' })}
                  </time>
                  {' — '}{Number(h.kcal).toLocaleString('fr-FR')} kcal,{' '}
                  <span className="text-encre">{h.protein_g} g de protéines</span>
                </li>
              ))}
            </ul>}
      </section>
    </Page>
  )
}
