/**
 * Le dressage (D24, D25, D40, D53).
 *
 * L'étape que l'app n'avait pas, et sans laquelle tout le reste tombe : la
 * session ne produit pas des recettes, elle produit des BARQUETTES. Nommées,
 * pesées, datées, chacune avec ses macros et son coût.
 *
 * Deux objectifs, un seul plat : ce qui diffère, c'est la portion. Et si le plat
 * n'est pas assez protéiné pour l'un des deux, on ne grossit pas sa part — on
 * ajoute du skyr, parce qu'une part plus grosse donne plus de TOUT. Qui n'a pas
 * encore fixé d'objectifs reçoit quand même ses parts, au poids moyen des autres.
 *
 * Deux étapes sur le même écran : on dresse (ici), puis « On range » (`Ranger`) —
 * où l'hôte choisit ce qui reste au frigo et ce qui part au congélateur. Refait le 27/10/2026 d'après
 * la maquette `dressage.html` : repère d'étapes, nombre en grand, une carte par recette avec sa photo.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useFoyer, aDesObjectifs, objectifDe, phraseSansObjectifs, prenomDe } from '../lib/donnees/foyer.ts'
import { useRecettesMesurees } from '../lib/donnees/recettes.ts'
import type { RecetteMesuree } from '../lib/donnees/recettes.ts'
import { PART_DU_JOUR, repartit } from '../lib/nutrition/portions.ts'
import type { Repartition } from '../lib/nutrition/portions.ts'
import { barquettes, enGrasLesPrenoms, etiquettesCourtes } from '../lib/dressage.ts'
import { nb } from '../lib/nombre.ts'
import {
  Action, Avis, BoutonAction, Carte, Chargement, Colonnes, EnPanne, EtatVide, Page, Pastille, Resume, Vignette,
} from '../ui/dressage/Habillage.tsx'
import { Ranger } from './Ranger.tsx'

export function Dressage({ va, retour, userId }: { va: (v: string) => void; retour: () => void; userId?: string }) {
  const cycleQ = useCycle()
  const foyerQ = useFoyer()
  const cycle = cycleQ.data
  const foyer = foyerQ.data
  const recettesQ = useRecettesMesurees(cycle?.id)
  const recettes = useMemo(() => recettesQ.data ?? [], [recettesQ.data])
  const [etape, setEtape] = useState<'dresser' | 'ranger'>('dresser')

  // `foyer?.membres` garde son identité entre deux rendus tant que la requête
  // ne change pas ; un `?? []` en créerait un nouveau à chaque fois et le memo
  // ne servirait à rien.
  const membres = foyer?.membres

  /**
   * La découpe, recette par recette. Les parts d'une personne se répartissent au
   * prorata de ses objectifs ; le nombre de parts vient du choix du mercredi.
   * Sans objectifs (0 kcal), `repartit` lui donne la part moyenne des autres.
   */
  const decoupes = useMemo(() => recettes.map(r => {
    const gens = membres ?? []
    const parPersonne = repartitionParPersonne(r.parts, gens.length)
    const demandes = gens.map((m, i) => {
      const o = objectifDe(m)
      const f = PART_DU_JOUR.diner
      return {
        cible: { userId: m.id, kcal: o.kcal * f, proteinG: o.proteinG * f },
        nombre: parPersonne[i] ?? 0,
      }
    })
    return { recette: r, repartition: repartit(r.plat, demandes) }
  }), [recettes, membres])

  /* Le titre reçoit le focus quand on REVIENT de « On range » : sans cela, il tombe sur la page. */
  const titre = useRef<HTMLHeadingElement>(null)
  const revenu = useRef(false)
  useEffect(() => {
    if (etape === 'dresser' && revenu.current) titre.current?.focus()
    if (etape === 'ranger') revenu.current = true
  }, [etape])

  const sortie = { retour, retourTexte: 'Accueil', va, userId }

  if (cycleQ.isPending) return <Page {...sortie}><Chargement /></Page>
  if (!cycle) {
    return cycleQ.isError
      ? <Page {...sortie}><EnPanne reessayer={() => void cycleQ.refetch()} /></Page>
      : <Page {...sortie}><EtatVide titre="Aucune session" /></Page>
  }
  if (recettesQ.isPending || foyerQ.isPending) return <Page {...sortie}><Chargement /></Page>
  if (recettesQ.isError || foyerQ.isError || !foyer) {
    return (
      <Page {...sortie}>
        <EnPanne reessayer={() => { void recettesQ.refetch(); void foyerQ.refetch() }} />
      </Page>
    )
  }
  if (recettes.length === 0) {
    return (
      <Page {...sortie}>
        <EtatVide titre="Rien à dresser" texte="Aucune recette n’a été cuisinée dans ce cycle." />
      </Page>
    )
  }

  if (etape === 'ranger') {
    return <Ranger cycle={cycle} decoupes={decoupes} membres={foyer.membres} userId={userId}
                   retour={() => setEtape('dresser')} va={va} />
  }

  const total = decoupes.reduce(
    (s, d) => s + d.repartition.parts.reduce((n, p) => n + p.nombre, 0), 0)
  /* Quelqu'un sans objectifs a ses parts, au poids moyen des autres : on le dit, on ne le tait pas. */
  const sansObjectifs = (membres ?? []).filter(m => !aDesObjectifs(m))
  const prenomsSans = sansObjectifs.map(m => prenomDe(m.display_name))
  const phraseSans = phraseSansObjectifs(prenomsSans)
  const etiquettes = etiquettesCourtes(decoupes.map(d => d.recette.titre))
  const rangDe = (id: string) => Math.max(0, (membres ?? []).findIndex(m => m.id === id))
  const nomDe = (id: string) => {
    const m = foyer.membres.find(x => x.id === id)
    return m ? prenomDe(m.display_name) : 'indifférent'
  }

  return (
    <Page {...sortie}>
      <Colonnes
        resume={
          <Resume etape="dresser">
            <h1 ref={titre} tabIndex={-1} className="titre mt-4 text-[30px] font-semibold"
                style={{ fontVariationSettings: '"opsz" 120, "SOFT" 50, "WONK" 0' }}>
              Dresse <span className="chiffre text-[72px] leading-[.9] text-safran max-[360px]:text-[60px] min-[900px]:text-[84px]">{total}</span> barquette{total > 1 ? 's' : ''}
            </h1>
            <p className="mt-3 text-[15px] leading-[1.45] text-surface/80 min-[900px]:text-base">
              Remplis chacune au poids indiqué : c’est ce qui rend les parts justes.
            </p>
            <ul aria-label="Barquettes par recette" className="mt-4 flex flex-wrap gap-2 min-[900px]:mb-0">
              {decoupes.map(({ recette, repartition }, i) => {
                const n = repartition.parts.reduce((s, p) => s + p.nombre, 0)
                return (
                  <li key={recette.recipeId} aria-label={`${barquettes(n)} de ${recette.titre}`}
                      className="min-w-[64px] flex-1 rounded-2xl bg-white/10 px-1.5 pb-[9px] pt-2.5 text-center">
                    <b aria-hidden="true" className="chiffre block text-[26px] font-semibold leading-none max-[360px]:text-[22px]">{n}</b>
                    <span aria-hidden="true" className="mt-1 block text-[12px] leading-[1.2] text-surface/70 [overflow-wrap:anywhere]">{etiquettes[i]}</span>
                  </li>
                )
              })}
            </ul>
          </Resume>
        }
        avis={phraseSans ? (
          <>
            <Avis ton="sable" picto="gens" role="status">
              {enGrasLesPrenoms(phraseSans, prenomsSans).map((m, i) =>
                m.gras ? <b key={i} className="font-semibold">{m.texte}</b> : <span key={i}>{m.texte}</span>)}
            </Avis>
            {sansObjectifs.some(m => m.id === userId) && (
              <button onClick={() => va('/objectifs')}
                      className="min-h-12 w-full rounded-2xl bg-herbe px-[18px] text-[16px] font-semibold text-fond">
                Fixe tes objectifs
              </button>
            )}
          </>
        ) : undefined}
        recettes={
          <div className="grid gap-3 min-[900px]:grid-cols-2 min-[900px]:items-start min-[900px]:gap-5">
            {decoupes.map(({ recette, repartition }) => (
              <Lot key={recette.recipeId} recette={recette} repartition={repartition}
                   nomDe={nomDe} rangDe={rangDe} />
            ))}
          </div>
        }
        action={
          <Action note="Ensuite, tu choisis ce qui reste au frigo et ce qui part au congélateur.">
            <BoutonAction onClick={() => setEtape('ranger')} disabled={total === 0}>
              C’est dressé
            </BoutonAction>
          </Action>
        } />
    </Page>
  )
}

function Lot({ recette, repartition, nomDe, rangDe }: {
  recette: RecetteMesuree
  repartition: Repartition
  nomDe: (id: string) => string
  rangDe: (id: string) => number
}) {
  const n = repartition.parts.reduce((s, p) => s + p.nombre, 0)
  /* Un complément se lit sous la ligne de la personne qu'il complète. */
  const dePersonne = (id: string) => repartition.complements.filter(c => c.userId === id)
  const orphelins = repartition.complements.filter(c => !repartition.parts.some(p => p.userId === c.userId))
  const complement = (c: Repartition['complements'][number]) => (
    <li key={`${c.userId}-${c.source}`} className="pb-2">
      <Avis ton="sable" picto="etincelle">
        <b className="font-semibold">+ {c.grammes} g de {c.source}</b> pour {nomDe(c.userId)}
      </Avis>
    </li>
  )
  return (
    <Carte label={recette.titre}>
      <div className="grid grid-cols-[64px_1fr_auto] items-center gap-3.5 max-[360px]:grid-cols-[56px_1fr_auto] max-[360px]:gap-2.5
                      min-[900px]:grid-cols-[64px_1fr]">
        <Vignette photo={recette.photo} />
        <div className="min-w-0">
          <h2 className="titre text-[19px] font-semibold leading-[1.15] [overflow-wrap:anywhere] min-[900px]:text-[21px]">{recette.titre}</h2>
          <span className="mt-0.5 block text-[13.5px] text-doux">{n} barquette{n > 1 ? 's' : ''} à remplir</span>
        </div>
        <div aria-hidden="true" className="text-right min-[900px]:hidden">
          <span className="chiffre block text-[34px] font-semibold leading-none text-herbe max-[360px]:text-[28px]">{n}</span>
          <small className="mt-[3px] block text-[12px] text-doux">barquette{n > 1 ? 's' : ''}</small>
        </div>
      </div>

      {!recette.fiable && (
        <Avis ton="sable" picto="alerte" className="mt-3">
          Recette mal quantifiée : les parts sont égales, faute de mieux.
        </Avis>
      )}

      <ul className="mt-3">
        {repartition.parts.map(p => (
          <li key={p.userId} className="list-none">
            <div className="grid grid-cols-[30px_1fr_auto] items-center gap-3 border-t border-brume py-[11px]
                            max-[360px]:grid-cols-[28px_1fr_auto] max-[360px]:gap-2">
              <Pastille nom={nomDe(p.userId)} rang={rangDe(p.userId)} />
              <div className="min-w-0">
                <span className="chiffre block whitespace-nowrap text-[24px] font-semibold leading-[1.05] max-[360px]:text-[20px]">
                  {p.nombre} × {p.grammes} g
                </span>
                <span className="mt-0.5 block text-[13.5px] text-doux">
                  pour {nomDe(p.userId)}{p.sansObjectifs ? ' · parts égales' : ''}
                </span>
              </div>
              <div className="whitespace-nowrap text-right text-[13.5px] leading-[1.3] text-doux max-[360px]:text-[12.5px]">
                <b className="block text-[14.5px] font-semibold text-encre max-[360px]:text-[13.5px]">{p.kcal} kcal</b>
                {nb(p.proteinG)} g de prot.
              </div>
            </div>
            {dePersonne(p.userId).length > 0 && <ul>{dePersonne(p.userId).map(complement)}</ul>}
          </li>
        ))}
      </ul>
      {orphelins.length > 0 && <ul>{orphelins.map(complement)}</ul>}

      <p className="mt-2.5 text-[13px] leading-[1.45] text-doux">
        {repartition.explication}
      </p>
    </Carte>
  )
}

/** Répartit N parts entre P personnes sans en perdre une en route. */
function repartitionParPersonne(parts: number, personnes: number): number[] {
  if (personnes <= 0) return []
  const base = Math.floor(parts / personnes)
  const reste = parts % personnes
  return Array.from({ length: personnes }, (_, i) => base + (i < reste ? 1 : 0))
}
