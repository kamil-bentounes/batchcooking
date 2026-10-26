/**
 * Le bilan et le suivi (D54, lot 6).
 *
 * Deux lectures d'une même donnée : la SEMAINE sert à décider du cycle suivant
 * — ce qu'on a jeté, ce qui est resté, ce qui a coûté plus cher que prévu — le
 * MOIS et les TROIS MOIS servent à voir si, dans la durée, ça tient.
 *
 * Trois partis pris, tous destinés à ce que l'écran ne mente pas :
 *
 *  · **Deux graphiques, jamais deux axes.** Des kilocalories et des grammes de
 *    protéines sur un même dessin obligent à une double échelle, et une double
 *    échelle se lit de travers — on peut lui faire dire n'importe quoi en
 *    choisissant les bornes.
 *  · **Un jour non renseigné est un trou, pas un zéro** (D33). Il se voit comme
 *    un trou, et il ne compte pas dans la moyenne.
 *  · **Le payé ne se mélange pas à l'estimé.** La jauge ne se remplit qu'avec
 *    ce qui est vraiment sorti du compte, d'après les tickets (lot 5).
 */
import { useMemo, useState } from 'react'
import { Attente, Ecran, Erreur, Vide } from '../ui/coque.tsx'
import { useBilan } from '../lib/donnees/bilan.ts'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'
import { useRecettesDesPlats } from '../lib/donnees/frigo.ts'
import { moisEnArriere } from '../lib/suivi.ts'
import { Barquettes } from '../ui/bilan/Barquettes.tsx'
import { CartePersonne } from '../ui/bilan/CartePersonne.tsx'
import { CeQuiEstPasse } from '../ui/bilan/CeQuiEstPasse.tsx'
import { Courses } from '../ui/bilan/Courses.tsx'
import { echelleCommune } from '../ui/bilan/echelle.ts'

type Periode = 'semaine' | 'mois' | 'trimestre'

const NOM: Record<Periode, string> = {
  semaine: '7 jours', mois: 'Ce mois', trimestre: '3 mois',
}

export function Bilan({ va, userId }: { va: (v: string) => void; userId: string }) {
  const [dit, setDit] = useState('')
  const [periode, setPeriode] = useState<Periode>('semaine')
  const { data: cycle } = useCycle()
  const change = useChangeEtat()

  const [depuis, jusqu] = useMemo(() => {
    const fin = new Date()
    if (periode === 'semaine') {
      const d = new Date()
      d.setDate(d.getDate() - 6)
      return [d, fin]
    }
    if (periode === 'mois') return [new Date(fin.getFullYear(), fin.getMonth(), 1), fin]
    return [moisEnArriere(2, fin), fin]
  }, [periode])

  const { data: bilan, isPending, error } = useBilan(depuis, jusqu)

  /* Les photos des recettes de la période : les mêmes que celles du frigo. */
  const idsRecettes = useMemo(
    () => [...new Set((bilan?.recettes ?? []).map(r => r.recipeId).filter((x): x is string => !!x))],
    [bilan])
  const { data: recettes } = useRecettesDesPlats(idsRecettes)
  const photoDe = (id: string | null) => (id ? recettes?.get(id)?.image_url ?? null : null)

  const entete = (
    <>
      <h1 className="titre text-[38px] font-semibold">Le bilan</h1>

      <div className="mt-4 flex gap-2" role="radiogroup" aria-label="Période">
        {(['semaine', 'mois', 'trimestre'] as Periode[]).map(p => (
          <button key={p} onClick={() => setPeriode(p)}
                  role="radio" aria-checked={periode === p}
                  className={`h-11 whitespace-nowrap px-3 min-[360px]:px-[18px] rounded-full text-[15px] font-medium transition-colors
                    ${periode === p ? 'bg-herbe text-white' : 'bg-piste text-encre'}`}>
            {NOM[p]}
          </button>
        ))}
      </div>
    </>
  )

  if (isPending) return <Ecran actif="bilan" va={va}><Attente /></Ecran>
  /* Une panne se dit : « Rien à mesurer » prétendrait que la période est vide. */
  if (error) {
    return (
      <Ecran actif="bilan" va={va}>
        {entete}
        <Vide titre="Le bilan ne se charge pas" texte="Réessaie dans un instant." />
        <Erreur de={error} />
      </Ecran>
    )
  }
  if (!bilan) return <Ecran actif="bilan" va={va}><Vide titre="Rien à mesurer" /></Ecran>

  const b = bilan.budget
  const rien = bilan.dressees === 0 && b.paye === 0 && b.estimeRestant === 0
    && bilan.personnes.every(p => p.serie.renseignes === 0)
  const echelle = echelleCommune(bilan.personnes)

  return (
    <Ecran actif="bilan" va={va}>
      {entete}

      {rien ? (
        <Vide titre="Rien à mesurer encore"
              texte="Le bilan se remplit tout seul : coche ce que tu manges, photographie un ticket, et il se construit." />
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <Courses b={b} />
          <Barquettes mangees={bilan.mangees} restantes={bilan.restantes} jetees={bilan.jetees} />

          {/* ⚠️ SOI D'ABORD.
              L'ordre venait de la base, donc du hasard : Thauba ouvrait « Le
              bilan » et lisait en gros, au-dessus de la ligne de flottaison,
              les courbes de Kamil. Son propre bilan ne lui parlait pas d'elle.
              Le foyer partage l'écran, il ne partage pas l'ordre de lecture. */}
          {bilan.personnes
            .map((p, rang) => ({ p, rang }))
            .sort((x, y) => (x.p.userId === userId ? -1 : y.p.userId === userId ? 1 : 0))
            .map(({ p, rang }) => (
              <CartePersonne key={p.userId} p={p} rang={rang} echelle={echelle} />
            ))}

          {bilan.recettes.length > 0 && <CeQuiEstPasse recettes={bilan.recettes} photoDe={photoDe} />}
        </div>
      )}

      {/* La clôture : elle ferme la boucle et rouvre la suivante (D54). */}
      {cycle?.state === 'semaine' && (
        <section className="mt-4 rounded-[26px] bg-sable p-5" aria-label="Clore la semaine">
          <h2 className="titre text-[24px] font-semibold">Clore la semaine</h2>
          <p className="mt-2.5 text-[15px] leading-snug">
            {bilan.restantes > 0
              ? `${bilan.restantes} barquette${bilan.restantes > 1 ? 's' : ''} restent au frais : elles ne disparaissent pas.`
              : 'Tout a été mangé.'}
            {' '}Clore permet d’ouvrir le cycle suivant.
          </p>
          {/* Irréversible, et ça ne demandait rien — pendant que RETIRER une
              charge, qui s'archive et se récupère, demandait confirmation.
              L'échelle de gravité était exactement inversée. */}
          <button onClick={() => {
                    if (!confirm('Clore la semaine ? Le cycle se termine et un nouveau '
                      + 'commence. On ne revient pas en arrière.')) return
                    change.mutate({ id: cycle.id, vers: 'cloture' },
                      { onSuccess: () => setDit('Semaine close.') })
                  }}
                  disabled={change.isPending}
                  className="mt-4 min-h-[52px] w-full rounded-[18px] bg-herbe px-5 py-2.5 text-[16px] font-semibold
                             text-white disabled:bg-brume disabled:text-encre">
            {change.isPending ? 'Je clos…' : 'Clore et préparer la semaine prochaine'}
          </button>
          {dit && <p className="mt-3 text-[15px]" role="status">{dit}</p>}
          <Erreur de={change.error} />
        </section>
      )}
    </Ecran>
  )
}
