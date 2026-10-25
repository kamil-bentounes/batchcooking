/**
 * Toutes nos charges, ligne par ligne : ce que chacun en paie par mois, avec de quoi chercher et filtrer
 * (qui paie, catégorie, rythme, façon de payer) et des totaux qui suivent les filtres.
 *
 * Les chiffres sont ceux du mois type (`moisType`) : ce tableau en est le détail. On y arrive du tableau de
 * bord, ou d'une de ses catégories (`/toutes-les-charges/maison`), déjà filtré dessus.
 */
import { useState } from 'react'
import { Attente, Passage } from '../ui/coque.tsx'
import { CATEGORIES, NOM_DU_MODE, type Categorie, type Mode } from '../lib/budget/categories.ts'
import {
  estSansFiltre, filtreLesLignes, sansFiltre, totauxDe, type FiltreDuTableau, type LigneType, type Periodicite,
} from '../lib/budget/mois-type.ts'
import { montant, moisDeDepart, nomDuMois } from '../lib/budget/mois.ts'
import { eurosRonds, moisDe } from '../lib/donnees/budget.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { messageDeLecture } from '../lib/budget/ecran.ts'
import { useMoisType } from '../ui/budget/MoisType.tsx'

const RYTHMES: [Periodicite, string][] = [['mensuel', 'Chaque mois'], ['trimestriel', 'Chaque trimestre'], ['annuel', 'Chaque année']]
const SOUS_RYTHME: Record<Periodicite, string> = { mensuel: '', trimestriel: ' / trim.', annuel: ' / an' }

function Puce({ actif, choisir, couleur, children }: {
  actif: boolean; choisir: () => void; couleur?: string; children: React.ReactNode
}) {
  return (
    <button onClick={choisir} aria-pressed={actif}
            className={`min-h-9 px-3 rounded-full text-[13px] font-medium flex items-center gap-1.5
                        ${actif ? 'bg-encre text-fond' : 'bg-piste text-encre'}`}>
      {couleur && <span aria-hidden="true" className="w-2 h-2 rounded-[2px]" style={{ background: couleur }} />}
      {children}
    </button>
  )
}

function Rangee({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-3">
      <legend className="text-[12px] text-doux">{titre}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

/** Une cellule de montant : un tiret plutôt que « 0 € », qui se lirait comme une charge gratuite. */
const Cellule = ({ cents, fort = false, doux = false }: { cents: number; fort?: boolean; doux?: boolean }) => (
  <span className={`w-[60px] shrink-0 text-right text-[13px] tabular-nums ${fort ? 'font-semibold' : ''}
                    ${doux ? 'text-doux' : ''}`}>
    {cents > 0 ? eurosRonds(cents) : '—'}
  </span>
)

export function ToutesLesCharges({ userId, retour, categorie, qui }: {
  userId: string; retour: () => void; categorie?: string; qui?: string
}) {
  const { data: foyer } = useFoyer()
  const moi = foyer?.membres.find(m => m.id === userId)
  const mois = moisDeDepart(moi?.entre_le, moisDe())
  const { etat, erreur, donnees, personnes } = useMoisType(mois)
  const [f, setF] = useState<FiltreDuTableau>(() => ({
    ...sansFiltre(),
    categorie: CATEGORIES.some(c => c.cle === categorie) ? categorie as Categorie : 'toutes',
    qui: qui ?? 'tout',
  }))
  const [tri, setTri] = useState<'montant' | 'nom'>('montant')
  const change = (o: Partial<FiltreDuTableau>) => setF(v => ({ ...v, ...o }))

  if (etat === 'chargement') return <Passage retour={retour} retourTexte="Budget"><Attente /></Passage>
  if (etat === 'erreur' || !donnees) {
    return (
      <Passage retour={retour} retourTexte="Budget">
        <p role="alert" className="text-[15px] text-doux">{messageDeLecture(erreur)}</p>
      </Passage>
    )
  }

  const ids = personnes.map(p => p.id)
  const lignes = filtreLesLignes(donnees.lignes, f)
  const ordre = (a: LigneType, z: LigneType) =>
    tri === 'nom' ? a.libelle.localeCompare(z.libelle, 'fr') : z.mensuel - a.mensuel
  const groupes = CATEGORIES
    .map(c => ({ ...c, lignes: lignes.filter(l => l.categorie === c.cle).sort(ordre) }))
    .filter(g => g.lignes.length > 0)
    .map(g => ({ ...g, ...totauxDe(g.lignes, ids) }))
    .sort((a, z) => tri === 'nom' ? a.nom.localeCompare(z.nom, 'fr') : z.total - a.total)
  const totaux = totauxDe(lignes, ids)
  const libre = estSansFiltre(f)
  const quiPaie = (l: LigneType) => l.commun ? 'Commun'
    : personnes.filter(p => (l.parts[p.id] ?? 0) > 0).map(p => p.prenom).join(' et ') || '—'

  return (
    <Passage retour={retour} retourTexte="Budget">
      <h1 className="titre text-[36px] leading-tight">Toutes nos charges</h1>
      <p className="mt-2 text-[15px] text-doux">
        {lignes.length} ligne{lignes.length > 1 ? 's' : ''}, par mois à partir {/^[aeiouy]/.test(nomDuMois(mois)) ? 'd’' : 'de '}
        {nomDuMois(mois)}, et ce que chacun en paie.
      </p>

      <label className="mt-5 flex flex-col gap-1.5 text-[12px] text-doux">
        Chercher
        <input type="search" value={f.cherche} onChange={e => change({ cherche: e.target.value })}
               placeholder="Netflix, prêt, assurance…"
               className="h-11 rounded-[14px] border border-brume bg-surface px-3.5 text-[15px] text-encre" />
      </label>

      <Rangee titre="Qui paie">
        <Puce actif={f.qui === 'tout'} choisir={() => change({ qui: 'tout' })}>Tout le monde</Puce>
        {personnes.length > 1 && <Puce actif={f.qui === 'commun'} choisir={() => change({ qui: 'commun' })}>Commun</Puce>}
        {personnes.map(p => (
          <Puce key={p.id} actif={f.qui === p.id} choisir={() => change({ qui: p.id })}>{p.prenom}</Puce>
        ))}
      </Rangee>
      <Rangee titre="Catégorie">
        <Puce actif={f.categorie === 'toutes'} choisir={() => change({ categorie: 'toutes' })}>Toutes</Puce>
        {CATEGORIES.filter(c => donnees.lignes.some(l => l.categorie === c.cle)).map(c => (
          <Puce key={c.cle} actif={f.categorie === c.cle} couleur={c.clair}
                choisir={() => change({ categorie: c.cle })}>{c.nom}</Puce>
        ))}
      </Rangee>
      <Rangee titre="Rythme">
        <Puce actif={f.rythme === 'tous'} choisir={() => change({ rythme: 'tous' })}>Tous</Puce>
        {RYTHMES.map(([r, nom]) => (
          <Puce key={r} actif={f.rythme === r} choisir={() => change({ rythme: r })}>{nom}</Puce>
        ))}
      </Rangee>
      <Rangee titre="Façon de payer">
        <Puce actif={f.facon === 'toutes'} choisir={() => change({ facon: 'toutes' })}>Toutes</Puce>
        {(Object.keys(NOM_DU_MODE) as Mode[]).map(m => (
          <Puce key={m} actif={f.facon === m} choisir={() => change({ facon: m })}>{NOM_DU_MODE[m]}</Puce>
        ))}
      </Rangee>

      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => setF(sansFiltre())} disabled={libre}
                className="min-h-11 text-[14px] font-medium text-herbe underline disabled:opacity-40 disabled:no-underline">
          Tout effacer
        </button>
        <button onClick={() => setTri(tri === 'montant' ? 'nom' : 'montant')}
                className="min-h-11 px-3.5 rounded-full border border-brume bg-surface text-[14px] font-medium">
          Trier : {tri === 'montant' ? 'montant' : 'nom'}
        </button>
      </div>

      <section aria-label="Les charges" className="mt-3 -mx-3 rounded-[22px] bg-surface shadow-carte overflow-hidden">
        <div className="flex items-center gap-1 px-3 py-3 bg-piste text-[12px] font-semibold text-doux">
          <span className="grow">Charge</span>
          {personnes.map(p => (
            <span key={p.id} className="w-[60px] shrink-0 flex items-center justify-end gap-1 text-encre">
              <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.couleur }} />
              <span className="truncate">{p.prenom}</span>
            </span>
          ))}
          <span className="w-[60px] shrink-0 text-right">Total</span>
        </div>

        {lignes.length === 0 && (
          <p className="px-4 py-7 text-center text-[14px] text-doux">Aucune charge ne correspond à ces filtres.</p>
        )}

        {groupes.map(g => (
          <div key={g.cle} className="border-t border-brume">
            <div className="flex items-center gap-1 px-3 pt-3.5 pb-2">
              <span className="grow flex items-center gap-2 text-[14px] font-semibold">
                <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px]" style={{ background: g.clair }} />
                {g.nom}
              </span>
              {ids.map(q => <Cellule key={q} cents={g.parPersonne[q] ?? 0} fort />)}
              <Cellule cents={g.total} fort />
            </div>
            <ul>
              {g.lignes.map(l => (
                <li key={l.id} className={`flex items-center gap-1 px-3 py-2 min-h-11 ${l.plusTard ? 'opacity-45' : ''}`}>
                  <span className="grow min-w-0 flex flex-col">
                    <span className="text-[14px] leading-snug">{l.libelle}</span>
                    <span className="text-[11px] text-doux leading-snug">
                      {quiPaie(l)}
                      {l.periodicite !== 'mensuel' && ` · ${montant(l.montant_cents)}${SOUS_RYTHME[l.periodicite]}`}
                      {` · ${NOM_DU_MODE[l.mode]}`}
                      {l.plusTard && ' · commence plus tard'}
                    </span>
                  </span>
                  {ids.map(q => <Cellule key={q} cents={l.parts[q] ?? 0} />)}
                  <Cellule cents={l.mensuel} doux />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex items-center gap-1 px-3 py-4 border-t-2 border-encre bg-sable">
          <span className="grow text-[15px] font-semibold">{libre ? 'Total par mois' : 'Total filtré'}</span>
          {ids.map(q => <Cellule key={q} cents={totaux.parPersonne[q] ?? 0} fort />)}
          <Cellule cents={totaux.total} fort />
        </div>
        {libre && (
          <>
            <div className="flex items-center gap-1 px-3 py-3 text-[13px] text-doux">
              <span className="grow">Revenu</span>
              {donnees.personnes.map(p => <Cellule key={p.id} cents={p.revenu ?? 0} doux />)}
              <Cellule cents={donnees.personnes.reduce((t, p) => t + (p.revenu ?? 0), 0)} doux />
            </div>
            <div className="flex items-center gap-1 px-3 pb-4 text-herbe">
              <span className="grow text-[14px] font-semibold">Il reste</span>
              {donnees.personnes.map(p => (
                <span key={p.id} className="w-[60px] shrink-0 text-right text-[13px] font-semibold tabular-nums"
                      style={p.reste !== null && p.reste < 0 ? { color: 'var(--color-ocre)' } : undefined}>
                  {p.reste === null ? '—' : `${p.reste < 0 ? '−' : ''}${eurosRonds(Math.abs(p.reste))}`}
                </span>
              ))}
              <span className="w-[60px] shrink-0 text-right text-[13px] font-semibold tabular-nums">
                {donnees.personnes.every(p => p.reste !== null)
                  ? eurosRonds(donnees.personnes.reduce((t, p) => t + (p.reste ?? 0), 0)) : '—'}
              </span>
            </div>
          </>
        )}
      </section>
      <p className="mt-3 text-[12px] leading-relaxed text-doux">
        Le commun se partage comme le mois le fera. Une charge trimestrielle ou annuelle compte au mois. Une ligne
        grisée commence plus tard et n’entre pas dans les totaux.
      </p>
    </Passage>
  )
}
