/**
 * Toutes nos charges, ligne par ligne : ce que chacun en paie par mois, avec de quoi chercher et filtrer
 * (qui paie, catégorie, rythme, façon de payer) et des totaux qui suivent les filtres.
 *
 * Les chiffres sont ceux du mois type (`moisType`) : ce tableau en est le détail. On y arrive du tableau de
 * bord, ou d'une de ses catégories (`/toutes-les-charges/maison`), déjà filtré dessus.
 */
import { useState } from 'react'
import { Attente } from '../ui/coque.tsx'
import { CATEGORIES, NOM_DU_MODE, type Categorie, type Mode } from '../lib/budget/categories.ts'
import {
  estSansFiltre, filtreLesLignes, sansFiltre, totauxDe, type FiltreDuTableau, type LigneType, type Periodicite,
} from '../lib/budget/mois-type.ts'
import { montant, moisDeDepart, nomDuMois } from '../lib/budget/mois.ts'
import { eurosRonds, moisDe } from '../lib/donnees/budget.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { messageDeLecture } from '../lib/budget/ecran.ts'
import { useMoisType } from '../ui/budget/MoisType.tsx'
import { Photo } from '../ui/budget/Photo.tsx'
import { EnTete } from '../ui/charges/EnTete.tsx'
import { Avatars } from '../ui/charges/Pastilles.tsx'
import { Loupe } from '../ui/charges/icones.tsx'
import { CHOISIE, FILET } from '../ui/charges/Choix.tsx'

const RYTHMES: [Periodicite, string][] = [['mensuel', 'Chaque mois'], ['trimestriel', 'Chaque trimestre'], ['annuel', 'Chaque année']]
const SOUS_RYTHME: Record<Periodicite, string> = { mensuel: '', trimestriel: ' / trim.', annuel: ' / an' }

/** La largeur d'une colonne de montant : celle de la maquette à 390 px, plus étroite à 320, plus large au bureau. */
const COLONNE = 'w-[62px] max-[360px]:w-[52px] min-[900px]:w-[100px] shrink-0'

function Puce({ actif, choisir, couleur, children }: {
  actif: boolean; choisir: () => void; couleur?: string; children: React.ReactNode
}) {
  return (
    <button type="button" onClick={choisir} aria-pressed={actif}
            className={`min-h-11 px-3.5 rounded-full text-[13.5px] font-medium inline-flex items-center gap-1.5
                        ${actif ? CHOISIE : FILET}`}>
      {couleur && <span aria-hidden="true" className="w-[9px] h-[9px] rounded-[3px]" style={{ background: couleur }} />}
      {children}
    </button>
  )
}

function Rangee({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-1.5">
      <legend className="text-[13.5px] font-medium text-doux">{titre}</legend>
      <div className="mt-1.5 flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  )
}

/** Une cellule de montant : un tiret plutôt que « 0 € », qui se lirait comme une charge gratuite. */
const Cellule = ({ cents, fort = false, doux = false }: { cents: number; fort?: boolean; doux?: boolean }) => (
  <span role="cell" className={`${COLONNE} text-right text-[13px] min-[900px]:text-[15px] tabular-nums max-[360px]:text-[12px]
                    ${fort ? 'font-bold' : ''} ${doux ? 'text-doux' : ''}`}>
    {cents > 0 ? eurosRonds(cents) : '—'}
  </span>
)

/** Le cadre de la page : défini ICI et non dans le rendu — un composant recréé à chaque rendu se remonte, et la
    saisie de « Chercher » perdrait le focus à chaque lettre. */
function Cadre({ userId, retour, children }: { userId: string; retour: () => void; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh px-4 pb-16 min-[900px]:px-8 min-[900px]:pb-14">
      <div className="mx-auto w-full max-w-[1180px]">
        <EnTete userId={userId} retour={retour} retourTexte="Budget" />
        {children}
      </div>
    </main>
  )
}

export function ToutesLesCharges({ userId, retour, categorie, qui }: {
  userId: string; retour: () => void; categorie?: string; qui?: string
}) {
  const { data: foyer } = useFoyer()
  const moi = foyer?.membres.find(m => m.id === userId)
  const mois = moisDeDepart(moi?.entre_le, moisDe())
  const { etat, erreur, donnees, personnes, partage } = useMoisType(mois)
  const [f, setF] = useState<FiltreDuTableau>(() => ({
    ...sansFiltre(),
    categorie: CATEGORIES.some(c => c.cle === categorie) ? categorie as Categorie : 'toutes',
    qui: qui ?? 'tout',
  }))
  const [tri, setTri] = useState<'montant' | 'nom'>('montant')
  const change = (o: Partial<FiltreDuTableau>) => setF(v => ({ ...v, ...o }))

  if (etat === 'chargement') return <Cadre userId={userId} retour={retour}><Attente /></Cadre>
  if (etat === 'erreur' || !donnees) {
    return (
      <Cadre userId={userId} retour={retour}>
        <p role="alert" className="text-[15px] text-doux">{messageDeLecture(erreur)}</p>
      </Cadre>
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
  const membres = foyer?.membres ?? []

  return (
    <Cadre userId={userId} retour={retour}>
      <h1 className="titre text-[34px] mt-3.5 leading-[1.05] max-[360px]:text-[30px] min-[900px]:text-[46px]">
        Toutes nos charges
      </h1>
      <p className="mt-2 max-w-[46ch] text-[15.5px] leading-[1.45] text-doux">
        {lignes.length} ligne{lignes.length > 1 ? 's' : ''}, par mois à partir {/^[aeiouy]/.test(nomDuMois(mois)) ? 'd’' : 'de '}
        {nomDuMois(mois)}, et ce que chacun en paie.
      </p>

      <div className="mt-[18px] grid grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:grid-cols-[4fr_8fr] min-[900px]:items-start min-[900px]:gap-5">
        <div className="rounded-[24px] bg-surface p-4 shadow-carte grid grid-cols-[minmax(0,1fr)] gap-1.5 min-w-0 min-[900px]:p-[22px] min-[900px]:rounded-[26px]">
          <label className="relative block">
            <span className="sr-only">Chercher</span>
            <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-doux"><Loupe /></span>
            <input type="search" value={f.cherche} onChange={e => change({ cherche: e.target.value })}
                   placeholder="Netflix, prêt, assurance…"
                   className="w-full min-h-12 rounded-[14px] border-[1.5px] border-brume bg-surface pl-11 pr-3.5 text-[16px]
                              text-encre placeholder:text-doux" />
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

          <div className="mt-1.5 flex items-center justify-between">
            <button type="button" onClick={() => setF(sansFiltre())} disabled={libre}
                    className="min-h-11 text-[15px] font-medium text-herbe underline underline-offset-[3px] disabled:opacity-50 disabled:no-underline">
              Tout effacer
            </button>
            <button type="button" onClick={() => setTri(tri === 'montant' ? 'nom' : 'montant')}
                    className="min-h-11 px-4 rounded-2xl bg-piste text-[16px] font-semibold">
              Trier : {tri === 'montant' ? 'montant' : 'nom'}
            </button>
          </div>
        </div>

        <div className="min-w-0">
          <section aria-label="Les charges" className="rounded-[24px] bg-surface shadow-carte overflow-hidden">
            {/* Un vrai tableau pour un lecteur d'écran : « 429 € » se lit avec sa colonne (Kamil, Thauba, Total). */}
            <div role="table" aria-label="Les charges, par mois">
              <div role="row" className="flex items-center gap-0.5 px-3 min-h-[46px] bg-piste text-[12.5px] font-bold text-doux
                                          max-[360px]:px-2 min-[900px]:px-5">
                <span role="columnheader" className="grow">Charge</span>
                {personnes.map(p => (
                  <span key={p.id} role="columnheader" className={`${COLONNE} flex items-center justify-end gap-1.5 text-encre`}>
                    <span className="max-[360px]:hidden"><Avatars ids={[p.id]} membres={membres} taille={20} /></span>
                    <span className="truncate">{p.prenom}</span>
                  </span>
                ))}
                <span role="columnheader" className={`${COLONNE} text-right`}>Total</span>
              </div>

              {groupes.map(g => (
                <div key={g.cle} role="rowgroup" className="border-t border-brume">
                  <div role="row" className="flex items-center gap-0.5 px-3 pt-1.5 min-h-[52px] max-[360px]:px-2 min-[900px]:px-5">
                    <span role="rowheader" className="grow min-w-0 flex items-center gap-2.5 text-[15px] font-bold">
                      <span aria-hidden="true" className="max-[360px]:hidden shrink-0 w-[34px] h-[34px] rounded-[10px] overflow-hidden">
                        <Photo categorie={g.cle} taille={34} />
                      </span>
                      <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[3px] shrink-0 min-[361px]:hidden" style={{ background: g.clair }} />
                      {g.nom}
                    </span>
                    {ids.map(q => <Cellule key={q} cents={g.parPersonne[q] ?? 0} fort />)}
                    <Cellule cents={g.total} fort />
                  </div>
                  {g.lignes.map(l => (
                    <div key={l.id} role="row"
                         className="flex items-center gap-0.5 px-3 py-1 min-h-[52px] max-[360px]:px-2 min-[900px]:px-5">
                      <span role="rowheader" className="grow min-w-0 flex flex-col pl-11 max-[360px]:pl-1">
                        <span className={`text-[14.5px] min-[900px]:text-[15.5px] font-medium leading-tight ${l.plusTard ? 'text-doux' : ''}`}>
                          {l.libelle}
                        </span>
                        <span className="text-[11.5px] min-[900px]:text-[12.5px] text-doux leading-snug">
                          {quiPaie(l)}
                          {l.periodicite !== 'mensuel' && ` · ${montant(l.montant_cents)}${SOUS_RYTHME[l.periodicite]}`}
                          {` · ${NOM_DU_MODE[l.mode]}`}
                          {l.pourquoi === 'debut' && ' · commence plus tard'}
                          {l.pourquoi === 'arrivee' && ' · pas encore dans le foyer'}
                        </span>
                      </span>
                      {ids.map(q => <Cellule key={q} cents={l.parts[q] ?? 0} doux={l.plusTard} />)}
                      <Cellule cents={l.mensuel} doux />
                    </div>
                  ))}
                </div>
              ))}

              <div role="row" className="flex items-center gap-0.5 px-3 min-h-[62px] border-t-2 border-encre bg-sable
                                          max-[360px]:px-2 min-[900px]:px-5">
                <span role="rowheader" className="grow text-[15.5px] font-bold">{libre ? 'Total par mois' : 'Total filtré'}</span>
                {ids.map(q => <Cellule key={q} cents={totaux.parPersonne[q] ?? 0} fort />)}
                <Cellule cents={totaux.total} fort />
              </div>
              {libre && (
                <>
                  <div role="row" className="flex items-center gap-0.5 px-3 min-h-11 text-[13px] text-doux max-[360px]:px-2 min-[900px]:px-5">
                    <span role="rowheader" className="grow">Revenu</span>
                    {donnees.personnes.map(p => <Cellule key={p.id} cents={p.revenu ?? 0} doux />)}
                    <Cellule cents={donnees.personnes.reduce((t, p) => t + (p.revenu ?? 0), 0)} doux />
                  </div>
                  <div role="row" className="flex items-center gap-0.5 px-3 min-h-[70px] text-herbe max-[360px]:px-2 min-[900px]:px-5">
                    <span role="rowheader" className="grow titre text-[17px] font-semibold">Il reste</span>
                    {donnees.personnes.map(p => (
                      <span key={p.id} role="cell"
                            className={`${COLONNE} text-right font-titre text-[18px] max-[360px]:text-[14.5px] min-[900px]:text-[22px] font-semibold tabular-nums`}
                            style={p.reste !== null && p.reste < 0 ? { color: 'var(--color-ocre)' } : undefined}>
                        {p.reste === null ? '—' : `${p.reste < 0 ? '−' : ''}${eurosRonds(Math.abs(p.reste))}`}
                      </span>
                    ))}
                    <span role="cell" className={`${COLONNE} text-right font-titre text-[18px] max-[360px]:text-[14.5px] min-[900px]:text-[22px] font-semibold tabular-nums`}>
                      {donnees.personnes.every(p => p.reste !== null)
                        ? eurosRonds(donnees.personnes.reduce((t, p) => t + (p.reste ?? 0), 0)) : '—'}
                    </span>
                  </div>
                </>
              )}
            </div>
            {lignes.length === 0 && (
              <p className="px-4 py-7 text-center text-[14px] text-doux">Aucune charge ne correspond à ces filtres.</p>
            )}
          </section>
          <p className="mt-3 mx-1 text-[12.5px] leading-[1.5] text-doux">
            {partage} Une charge trimestrielle ou annuelle compte au mois. Une ligne grisée ne compte pas encore : elle
            commence plus tard, ou personne de ceux qui la paient n’est encore dans le foyer.
          </p>
        </div>
      </div>
    </Cadre>
  )
}
