/**
 * Le tableau de bord du mois type : l'anneau des catégories, la jauge de chacun, une carte par catégorie.
 *
 * Il se lit AVANT le premier mois suivi — c'est là qu'il est né : tout était posé en octobre pour un budget
 * qui part en novembre, et l'écran ne disait que « Pas encore » — et il reste ouvert ensuite (`/mois-type`).
 * Les chiffres viennent de `moisType` : les charges telles qu'elles sont posées, ramenées au mois, partagées
 * avec les parts de la base.
 *
 * Le parti pris : UN geste fort, l'anneau. On touche une catégorie (dans l'anneau ou sa légende), son arc
 * ressort et son montant prend le centre ; on la retouche, le total revient. Le reste se tait : pas d'autre
 * animation que le tracé de l'anneau et des jauges à l'ouverture, et rien du tout en « animations réduites ».
 *
 * Les couleurs des catégories (D74) ne se distinguent pas toutes pour un œil daltonien (Auto et Crédits) :
 * la couleur n'est donc jamais seule — légende nommée, fil entre les arcs, nom au centre, photo sur la carte.
 * Et le texte reste à l'encre : la couleur marque, elle n'écrit pas.
 */
import { useEffect, useState } from 'react'
import { Attente } from '../coque.tsx'
import { moisType, type CategorieType, type MoisType } from '../../lib/budget/mois-type.ts'
import type { Categorie } from '../../lib/budget/categories.ts'
import { nomDuMois } from '../../lib/budget/mois.ts'
import { eurosRonds, useCharges, usePartsDuFoyer, useRevenus } from '../../lib/donnees/budget.ts'
import { prenomDe, useFoyer } from '../../lib/donnees/foyer.ts'
import { messageDeLecture } from '../../lib/budget/ecran.ts'
import { Photo } from './Photo.tsx'

/** Une couleur par personne, la même partout (la session en cuisine a les mêmes). */
export const COULEUR_DE_LA_PERSONNE = ['#2F5D45', '#B8791A']

export type Personne = { id: string; prenom: string; couleur: string }

/** Les lectures du mois type, en une : rien ne se montre tant qu'une manque (`etatDeLEcran`, même règle). */
export function useMoisType(mois: string): {
  etat: 'chargement' | 'erreur' | 'pret'; erreur: unknown; donnees: MoisType | null; personnes: Personne[]
} {
  const charges = useCharges()
  const revenus = useRevenus()
  const parts = usePartsDuFoyer(mois)
  const { data: foyer, error: erreurFoyer } = useFoyer()
  const personnes = (foyer?.membres ?? []).map((m, i) => ({
    id: m.id, prenom: prenomDe(m.display_name), couleur: COULEUR_DE_LA_PERSONNE[i % 2],
  }))
  const lectures = [charges, revenus, parts]
  const panne = lectures.find(q => q.data === undefined && q.error)?.error ?? (foyer ? null : erreurFoyer)
  if (panne) return { etat: 'erreur', erreur: panne, donnees: null, personnes }
  if (!charges.data || !revenus.data || !parts.data || !foyer) {
    return { etat: 'chargement', erreur: null, donnees: null, personnes }
  }
  return {
    etat: 'pret', erreur: null, personnes,
    donnees: moisType({ charges: charges.data, parts: parts.data, membres: personnes.map(p => p.id),
                        revenus: revenus.data, mois }),
  }
}

/** Le seul mouvement de l'écran : l'anneau et les jauges se tracent une fois, à l'ouverture. */
function useTrace(): boolean {
  const [trace, setTrace] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setTrace(true))
    return () => cancelAnimationFrame(id)
  }, [])
  return trace
}
const TRACE = 'stroke-dasharray 1100ms cubic-bezier(.22,.8,.24,1), opacity 200ms ease'

const pourcent = (part: number, tout: number) => (tout > 0 ? Math.round((100 * part) / tout) : 0)

/** L'anneau des catégories, et sa légende : toucher l'une ou l'autre met une catégorie au centre. */
function Anneau({ categories, total, legende }: {
  categories: CategorieType[]; total: number; legende: string
}) {
  const trace = useTrace()
  const [choisie, setChoisie] = useState<Categorie | null>(null)
  const pleines = categories.filter(c => c.total > 0)
  const r = 84
  const tour = 2 * Math.PI * r
  /* Le fil entre deux arcs : la surface qui passe, 3 px. Un seul arc n'a pas de voisin. */
  const fil = pleines.length > 1 ? 3 : 0
  let deja = 0
  const arcs = pleines.map(c => {
    const long = (tour * c.total) / total
    const arc = { c, long: Math.max(long - fil, 0.8), depart: deja }
    deja += long
    return arc
  })
  const centre = pleines.find(c => c.cle === choisie) ?? null
  const choisis = (cle: Categorie) => setChoisie(choisie === cle ? null : cle)

  return (
    <div>
      <div className="relative w-[232px] h-[232px] mx-auto">
        <svg width="232" height="232" viewBox="0 0 232 232" role="img"
             aria-label={`Répartition par catégorie : ${pleines
               .map(c => `${c.nom} ${pourcent(c.total, total)} %`).join(', ')}`}>
          <circle cx="116" cy="116" r={r} fill="none" stroke="var(--color-piste)" strokeWidth="26" />
          <g transform="rotate(-90 116 116)" fill="none">
            {arcs.map(a => (
              <circle key={a.c.cle} cx="116" cy="116" r={r} stroke={a.c.couleur}
                      strokeWidth={centre?.cle === a.c.cle ? 34 : 26}
                      strokeDasharray={`${trace ? a.long : 0} ${tour}`} strokeDashoffset={-a.depart}
                      opacity={centre && centre.cle !== a.c.cle ? 0.28 : 1}
                      onClick={() => choisis(a.c.cle)}
                      className="cursor-pointer motion-reduce:!transition-none"
                      style={{ transition: `${TRACE}, stroke-width 200ms ease` }} />
            ))}
          </g>
        </svg>
        {/* Le centre parle de ce qu'on regarde : le total, ou la catégorie touchée. */}
        <div aria-live="polite"
             className="absolute inset-[44px] rounded-full flex flex-col items-center justify-center text-center pointer-events-none">
          {centre ? (
            <>
              <span className="text-[13px] font-semibold leading-tight">{centre.nom}</span>
              <span className="chiffre text-[30px] leading-none mt-1">{eurosRonds(centre.total)}</span>
              <span className="mt-1 text-[12px] text-doux">{pourcent(centre.total, total)} % du mois</span>
            </>
          ) : (
            <>
              <span className="chiffre text-[34px] leading-none">{eurosRonds(total)}</span>
              <span className="mt-1.5 text-[12px] text-doux leading-tight max-w-[110px]">{legende}</span>
            </>
          )}
        </div>
      </div>

      <ul className="mt-5 grid grid-cols-2 gap-1">
        {pleines.map(c => (
          <li key={c.cle}>
            <button onClick={() => choisis(c.cle)} aria-pressed={choisie === c.cle}
                    className={`w-full min-h-10 px-2.5 rounded-[12px] flex items-center gap-2 text-left text-[13px]
                                transition-colors ${choisie === c.cle ? 'bg-piste' : ''}`}>
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] shrink-0" style={{ background: c.couleur }} />
              <span className="grow truncate">{c.nom}</span>
              <span className="text-doux tabular-nums">{pourcent(c.total, total)} %</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** La jauge d'une personne : la part de son revenu que ses charges prennent. */
function Jauge({ part, couleur, deborde }: { part: number; couleur: string; deborde: boolean }) {
  const trace = useTrace()
  const r = 33
  const tour = 2 * Math.PI * r
  return (
    <div className="relative w-[80px] h-[80px] shrink-0">
      <svg width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--color-piste)" strokeWidth="9" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={deborde ? 'var(--color-ocre)' : couleur}
                strokeWidth="9" strokeLinecap="round" transform="rotate(-90 40 40)"
                strokeDasharray={`${trace ? tour * Math.min(part, 1) : 0} ${tour}`}
                className="motion-reduce:!transition-none" style={{ transition: TRACE }} />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="chiffre text-[19px]">{Math.round(part * 100)}<span className="text-[12px]"> %</span></span>
        <span className="mt-0.5 text-[10px] text-doux">du revenu</span>
      </span>
    </div>
  )
}

/** Une pastille de couleur et son texte à l'encre : l'identité sans écrire en couleur. */
const Repere = ({ couleur, opacite = 1, children }: { couleur: string; opacite?: number; children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <span aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: couleur, opacity: opacite }} />
    {children}
  </span>
)

export function TableauDeBord({ mois, va, avant = false }: {
  mois: string; va: (v: string) => void
  /** Le mois n'a pas commencé : la phrase d'ouverture le dit. */
  avant?: boolean
}) {
  const { etat, erreur, donnees, personnes } = useMoisType(mois)
  /* Le foyer entier, ou la part d'une personne : l'anneau et les catégories se recomptent sur elle. */
  const [vue, setVue] = useState<string>('foyer')
  if (etat === 'chargement') return <Attente />
  if (etat === 'erreur' || !donnees) {
    return <p role="alert" className="mt-6 text-[15px] text-doux">{messageDeLecture(erreur)}</p>
  }
  if (donnees.lignes.length === 0) {
    return (
      <div className="mt-8 text-center">
        <p className="titre text-[26px]">Aucune charge posée</p>
        <p className="mt-2 text-[15px] text-doux">Le mois type se dessine dès la première.</p>
        <button onClick={() => va('/charges')}
                className="mt-5 w-full h-[52px] rounded-[16px] bg-herbe text-fond text-[16px] font-medium">
          Poser les charges
        </button>
      </div>
    )
  }

  const aDeux = personnes.length > 1
  const surQui = aDeux && vue !== 'foyer' ? vue : null
  const nomDe = (id: string) => personnes.find(p => p.id === id)?.prenom ?? '—'
  /* Vu par une personne, une catégorie pèse SA part, et ses lignes sont celles dont elle paie quelque chose. */
  const categories = donnees.categories
    .map(c => surQui === null ? c : {
      ...c, total: c.parPersonne[surQui] ?? 0,
      lignes: c.lignes.filter(l => (l.parts[surQui] ?? 0) > 0)
        .map(l => ({ ...l, mensuel: l.parts[surQui] ?? 0 })).sort((a, z) => z.mensuel - a.mensuel),
    })
    .filter(c => c.lignes.length > 0)
    .sort((a, z) => z.total - a.total)
  const total = categories.reduce((t, c) => t + c.total, 0)
  const plusLourde = Math.max(...categories.map(c => c.total), 1)
  const autre = categories.find(c => c.cle === 'autre')
  const versLeDetail = (cle?: string) =>
    va(`/toutes-les-charges${cle ? `/${cle}` : ''}${cle && surQui ? `/${surQui}` : ''}`)

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed text-doux">
        {avant ? `Vos charges telles qu’elles sont posées, ramenées au mois. ${nomDuMois(mois).replace(/^./, x => x.toUpperCase())} commence le 1er.`
               : 'Vos charges telles qu’elles sont posées, ramenées au mois.'}
      </p>

      {/* Un sélecteur à curseur : une seule vue à la fois, et l'on voit laquelle. */}
      {aDeux && (
        <div role="group" aria-label="Voir pour" className="flex p-1 rounded-full bg-piste">
          {[{ id: 'foyer', prenom: 'Le foyer' }, ...personnes].map(p => (
            <button key={p.id} onClick={() => setVue(p.id)} aria-pressed={vue === p.id}
                    className={`flex-1 min-h-10 rounded-full text-[14px] font-medium transition-colors
                                ${vue === p.id ? 'bg-surface text-encre shadow-carte' : 'text-doux'}`}>
              {p.prenom}
            </button>
          ))}
        </div>
      )}

      <section aria-label={surQui ? `Ce que ${nomDe(surQui)} paie, par mois` : 'Le foyer, par mois'}
               className="rounded-[28px] bg-surface shadow-carte px-4 pt-6 pb-4">
        <Anneau key={vue} categories={categories} total={total}
                legende={surQui ? `pour ${nomDe(surQui)}, par mois` : 'de charges par mois'} />
      </section>

      {!surQui && (
        <section aria-label="Chacun, par mois" className="rounded-[28px] bg-surface shadow-carte p-5 flex flex-col gap-6">
          {donnees.personnes.map(p => {
            const qui = personnes.find(x => x.id === p.id)!
            const base = p.revenu && p.revenu > 0 ? p.revenu : Math.max(p.total, 1)
            return (
              <div key={p.id} className="flex gap-4 items-center">
                <Jauge part={p.total / base} couleur={qui.couleur} deborde={p.reste !== null && p.reste < 0} />
                <div className="grow min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-[17px] font-semibold">{qui.prenom}</span>
                    <span className="chiffre text-[19px] whitespace-nowrap">{eurosRonds(p.total)}</span>
                  </div>
                  {/* Le commun puis ce qui n'est qu'à soi, posés sur la largeur du revenu. */}
                  <div className="mt-2 h-2 rounded-full bg-piste flex gap-[2px] overflow-hidden" aria-hidden="true">
                    <span className="rounded-l-full" style={{ width: `${Math.min(100, (100 * p.commun) / base)}%`, background: qui.couleur }} />
                    <span className="rounded-r-full" style={{ width: `${Math.min(100, (100 * p.perso) / base)}%`, background: qui.couleur, opacity: 0.4 }} />
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-doux">
                    {aDeux && <Repere couleur={qui.couleur}>Commun {eurosRonds(p.commun)}</Repere>}
                    <Repere couleur={qui.couleur} opacite={0.4}>{aDeux ? 'À soi' : 'Charges'} {eurosRonds(p.perso)}</Repere>
                  </p>
                  <p className="mt-1.5 text-[14px]">
                    {p.reste === null ? <span className="text-doux">Revenu pas encore posé</span> : (
                      <>{p.reste < 0 ? 'Il manque ' : 'Il reste '}
                        <strong className="font-semibold"
                                style={{ color: p.reste < 0 ? 'var(--color-ocre)' : 'var(--color-herbe)' }}>
                          {eurosRonds(Math.abs(p.reste))}
                        </strong>
                        {p.revenu !== null && <span className="text-doux"> sur {eurosRonds(p.revenu)}</span>}</>
                    )}
                  </p>
                </div>
              </div>
            )
          })}
          {aDeux && (
            <p className="text-[12px] leading-relaxed text-doux">
              Le commun se partage comme le mois le fera : au prorata des revenus, sauf une charge réglée
              « Moitié-moitié ». Ce qui se paie au trimestre ou à l’année compte au mois.
            </p>
          )}
        </section>
      )}

      <div className="mt-4 flex items-baseline justify-between">
        <h2 className="titre text-[26px]">Par catégorie</h2>
        <button onClick={() => versLeDetail()} className="min-h-11 text-[15px] font-medium text-herbe">
          Toutes les lignes
        </button>
      </div>
      <div className="-mt-1 flex flex-col gap-2.5">
        {categories.map(c => (
          <button key={`${vue}-${c.cle}`} onClick={() => versLeDetail(c.cle)}
                  aria-label={`${c.nom} : ${eurosRonds(c.total)} par mois. Voir ses ${c.lignes.length} lignes`}
                  className="w-full text-left rounded-[22px] bg-surface shadow-carte p-3.5 flex flex-col gap-3">
            <span className="flex items-center gap-3 w-full">
              <Photo categorie={c.cle} taille={46} />
              <span className="grow min-w-0">
                <span className="block text-[16px] font-semibold leading-tight">{c.nom}</span>
                <span className="block mt-0.5 text-[12px] text-doux truncate">
                  {c.lignes.slice(0, 3).map(l => l.libelle).join(', ')}
                  {c.lignes.length > 3 ? ` et ${c.lignes.length - 3} autre${c.lignes.length > 4 ? 's' : ''}` : ''}
                </span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="chiffre text-[21px] leading-none whitespace-nowrap">{eurosRonds(c.total)}</span>
                <span className="mt-1 text-[12px] text-doux tabular-nums">{pourcent(c.total, total)} %</span>
              </span>
            </span>
            <span className="block h-[6px] rounded-full bg-piste" aria-hidden="true">
              <span className="block h-[6px] rounded-full"
                    style={{ width: `${Math.max((100 * c.total) / plusLourde, 2)}%`, background: c.couleur }} />
            </span>
            {aDeux && !surQui && (
              <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-doux">
                {personnes.filter(p => (c.parPersonne[p.id] ?? 0) > 0).map(p => (
                  <Repere key={p.id} couleur={p.couleur}>{p.prenom} {eurosRonds(c.parPersonne[p.id])}</Repere>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>

      {autre && total > 0 && autre.total / total >= 0.2 && (
        <div className="rounded-[20px] bg-sable p-4 text-[14px] leading-relaxed">
          « Autre » pèse {pourcent(autre.total, total)} % du mois. Un prêt ou un remboursement s’y lit mieux rangé
          dans sa catégorie.
          <button onClick={() => va('/charges')}
                  className="mt-3 block min-h-11 px-4 rounded-full bg-herbe text-fond text-[14px] font-medium">
            Ranger mes charges
          </button>
        </div>
      )}
    </div>
  )
}
