/**
 * La semaine (D33, D39, D41).
 *
 * Sans cet écran, personne ne sait ce qu'on mange ce soir — c'était le trou de
 * l'app avant qu'on remette le cycle au centre. La distribution est proposée à
 * la fin de la session, puis se déplace librement.
 *
 * Trois états par case, et « vide » n'est PAS « zéro » : une case non renseignée
 * veut dire « on ne sait pas », et le bilan doit pouvoir le dire.
 */
import { useMemo, useState } from 'react'
import { Attente, Ecran, Surface, Vide, dateLongue, jourCourt } from '../ui/coque.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  NOM_REPAS, REPAS, jour, useBarquettes, useDistribue, useMange, useSaute, useSemaine,
} from '../lib/donnees/barquettes.ts'
import type { Barquette, Case, Repas } from '../lib/donnees/barquettes.ts'
import { useCycle } from '../lib/donnees/cycle.ts'
import { urgence } from '../lib/peremption.ts'

export function Semaine({ userId, va }: { userId: string; va: (v: string) => void }) {
  const debut = useMemo(() => new Date(), [])
  const { data: foyer } = useFoyer()
  const { data: cycle } = useCycle()
  const { data: cases = [], isPending } = useSemaine(debut, 7)
  const { data: libres = [] } = useBarquettes()
  const mange = useMange()
  const saute = useSaute()
  const distribue = useDistribue()

  const [qui, setQui] = useState<string | 'tous'>(userId)
  const [quoi, setQuoi] = useState<Repas | 'tous'>('tous')
  const [caseOuverte, setCaseOuverte] = useState<string | null>(null)

  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(debut)
    d.setDate(d.getDate() + i)
    return d
  }), [debut])

  const membres = foyer?.membres ?? []
  const placees = new Set(cases.map(c => c.portion_id).filter(Boolean))
  const disponibles = libres.filter(b => !placees.has(b.id))

  const visibles = cases.filter(c =>
    (qui === 'tous' || c.user_profile_id === qui) &&
    (quoi === 'tous' || c.meal === quoi))

  if (isPending) return <Ecran actif="semaine" va={va}><Attente /></Ecran>

  return (
    <Ecran actif="semaine" va={va}>
      <h1 className="titre text-[38px]">La semaine</h1>
      <p className="mt-2.5 text-[15px] text-doux">
        {cases.filter(c => c.portion_id).length} barquettes placées
        {disponibles.length > 0 && ` · ${disponibles.length} encore libre${disponibles.length > 1 ? 's' : ''}`}
      </p>

      <div className="mt-6 flex gap-2 flex-wrap" role="group" aria-label="Filtrer">
        <Puce actif={qui === 'tous'} surClic={() => setQui('tous')}>Tout le monde</Puce>
        {membres.map(m => (
          <Puce key={m.id} actif={qui === m.id} surClic={() => setQui(m.id)}>
            {m.display_name}
          </Puce>
        ))}
      </div>
      <div className="mt-2.5 flex gap-2 flex-wrap" role="group" aria-label="Filtrer par repas">
        <Puce actif={quoi === 'tous'} surClic={() => setQuoi('tous')}>Tous les repas</Puce>
        {REPAS.map(r => (
          <Puce key={r} actif={quoi === r} surClic={() => setQuoi(r)}>{NOM_REPAS[r]}</Puce>
        ))}
      </div>

      {visibles.length === 0 ? (
        <Vide titre="Rien de planifié"
              texte={cycle
                ? 'La distribution se fait à la fin de la session de cuisine.'
                : 'Ouvre une semaine depuis l’accueil.'} />
      ) : (
        <div className="mt-8 space-y-8">
          {jours.map(d => {
            const j = jour(d)
            const duJour = visibles.filter(c => c.day === j)
            if (duJour.length === 0) return null
            const aujourdhui = j === jour(new Date())
            return (
              <section key={j} aria-label={dateLongue(d)}>
                <h2 className={`text-[13px] uppercase tracking-[0.04em]
                                ${aujourdhui ? 'text-encre' : 'text-doux'}`}>
                  {aujourdhui ? 'Aujourd’hui' : jourCourt(d)}
                </h2>
                <ul className="mt-3 space-y-3">
                  {duJour.map(c => (
                    <Ligne key={c.id} cas={c}
                           qui={qui === 'tous'
                             ? membres.find(m => m.id === c.user_profile_id)?.display_name ?? null
                             : null}
                           ouvert={caseOuverte === c.id}
                           disponibles={disponibles}
                           surOuvre={() => setCaseOuverte(caseOuverte === c.id ? null : c.id)}
                           surMange={() => mange.mutate(c.id)}
                           surSaute={() => saute.mutate(c.id)}
                           surPlace={p => cycle && distribue.mutate({
                             cycleId: cycle.id,
                             cases: [{
                               userId: c.user_profile_id, jour: c.day,
                               repas: c.meal as Repas, portionId: p,
                             }],
                           })} />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {disponibles.length > 0 && (
        <Surface className="mt-10">
          <p className="text-[15px]">
            {disponibles.length} barquette{disponibles.length > 1 ? 's' : ''} sans jour
          </p>
          <p className="text-[13px] text-doux mt-1.5">
            Touche une case vide ci-dessus pour en poser une. Les plus pressées
            d’abord : elles périment en premier.
          </p>
        </Surface>
      )}
    </Ecran>
  )
}

function Ligne({ cas, qui, ouvert, disponibles, surOuvre, surMange, surSaute, surPlace }: {
  cas: Case
  qui: string | null
  ouvert: boolean
  disponibles: Barquette[]
  surOuvre: () => void
  surMange: () => void
  surSaute: () => void
  surPlace: (portionId: string) => void
}) {
  const p = cas.portion
  const u = p ? urgence(p.expires_at, p.location as 'frigo' | 'congelateur') : null
  const mange = cas.state === 'mange'
  const saute = cas.state === 'saute'

  return (
    <li>
      <button onClick={surOuvre} className="w-full flex items-center gap-3 text-left py-1">
        <span className="w-[68px] shrink-0 text-[13px] text-doux">
          {NOM_REPAS[cas.meal as Repas]}
        </span>
        <span className="grow">
          <span className={`block text-[15px] ${mange ? 'text-doux line-through' : ''}
                            ${saute ? 'text-doux italic' : ''}`}>
            {saute ? 'Rien' : p?.label ?? '—'}
          </span>
          {(qui || (p && !mange)) && (
            <span className="block text-[13px] text-doux mt-0.5">
              {[qui, p && !mange && `${Math.round(Number(p.grams))} g · ${Math.round(Number(p.protein_g))} g de protéines`]
                .filter(Boolean).join(' · ')}
            </span>
          )}
          {cas.extras.length > 0 && (
            <span className="block text-[13px] text-doux mt-0.5">
              + {cas.extras.map(e => e.label).join(', ')}
            </span>
          )}
        </span>
        {u && !mange && u.niveau !== 'ok' && (
          <span className="text-[13px] shrink-0" style={{ color: u.encre }}>{u.mot}</span>
        )}
        {mange && (
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none" stroke="#2F5D45"
               strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
               className="shrink-0" aria-label="Mangé">
            <path d="M3.5 9 7 12.5l6.5-8" />
          </svg>
        )}
      </button>

      {ouvert && (
        <div className="pl-[80px] pb-3 space-y-3">
          {!mange && (
            <div className="flex gap-2 flex-wrap">
              {p && (
                <button onClick={surMange}
                        className="px-4 py-2 rounded-full bg-herbe text-fond text-[14px]">
                  Je l’ai mangé
                </button>
              )}
              <button onClick={surSaute}
                      className="px-4 py-2 rounded-full bg-brume/60 text-[14px]">
                Sauté
              </button>
            </div>
          )}
          {!p && disponibles.length > 0 && (
            <div>
              <p className="text-[13px] text-doux mb-2">Poser une barquette</p>
              <div className="flex gap-2 flex-wrap">
                {disponibles.slice(0, 6).map(b => (
                  <button key={b.id} onClick={() => surPlace(b.id)}
                          className="px-3.5 py-2 rounded-full bg-surface text-[14px]
                                     hover:bg-brume/60 transition-colors">
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Puce({ actif, surClic, children }:
  { actif: boolean; surClic: () => void; children: React.ReactNode }) {
  return (
    <button onClick={surClic} aria-pressed={actif}
            className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors
              ${actif ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
      {children}
    </button>
  )
}
