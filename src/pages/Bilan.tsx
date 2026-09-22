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
import { Attente, Chiffre, Ecran, Erreur, Surface, Vide } from '../ui/coque.tsx'
import { useBilan } from '../lib/donnees/bilan.ts'
import type { Personne } from '../lib/donnees/bilan.ts'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'
import { moisEnArriere } from '../lib/suivi.ts'
import type { Jour } from '../lib/suivi.ts'

/** Les deux verts validés en contraste pour les aplats de graphique. */
const BARRE = '#1E6B41'
const BARRE_CLAIRE = '#9CB5A6'
/** L'ocre des avertissements, le seul autre pigment de l'application. */
const ALERTE = 'var(--color-ocre)'

type Periode = 'semaine' | 'mois' | 'trimestre'

const NOM: Record<Periode, string> = {
  semaine: '7 jours', mois: 'Ce mois', trimestre: '3 mois',
}

export function Bilan({ va }: { va: (v: string) => void }) {
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

  const { data: bilan, isPending } = useBilan(depuis, jusqu)

  if (isPending) return <Ecran actif="bilan" va={va}><Attente /></Ecran>
  if (!bilan) return <Ecran actif="bilan" va={va}><Vide titre="Rien à mesurer" /></Ecran>

  const b = bilan.budget
  const rien = bilan.dressees === 0 && b.paye === 0 && b.estimeRestant === 0
    && bilan.personnes.every(p => p.serie.renseignes === 0)

  return (
    <Ecran actif="bilan" va={va}>
      <h1 className="titre text-[38px]">Le bilan</h1>

      <div className="mt-5 flex gap-2" role="radiogroup" aria-label="Période">
        {(['semaine', 'mois', 'trimestre'] as Periode[]).map(p => (
          <button key={p} onClick={() => setPeriode(p)}
                  role="radio" aria-checked={periode === p}
                  className={`h-11 px-4 rounded-[13px] text-[14px] transition-colors
                    ${periode === p ? 'bg-herbe text-fond' : 'bg-brume/50'}`}>
            {NOM[p]}
          </button>
        ))}
      </div>

      {rien ? (
        <Vide titre="Rien à mesurer encore"
              texte="Le bilan se remplit tout seul : coche ce que tu manges, photographie un ticket, et il se construit." />
      ) : (
        <>
          {/* ── Le budget ────────────────────────────────────────────────── */}
          <section className="mt-9" aria-label="Budget">
            <div className="flex items-baseline justify-between">
              <Chiffre valeur={fmt(b.paye)} unite="€ payés" taille={30} />
              {b.plafond !== null && (
                <span className="text-[14px] text-doux">sur {fmt(b.plafond)} €</span>
              )}
            </div>

            {b.part !== null && (
              <>
                <div className="h-1.5 rounded-full bg-brume mt-3 overflow-hidden">
                  <div className="h-1.5 rounded-full transition-[width] duration-500"
                       style={{
                         width: `${Math.min(100, b.part * 100)}%`,
                         background: b.part > 1 ? ALERTE : BARRE,
                       }} />
                </div>
                {b.part > 1 && (
                  <p className="mt-2 text-[14px]" style={{ color: ALERTE }}>
                    {fmt(b.paye - b.plafond!)} € au-dessus du budget.
                  </p>
                )}
              </>
            )}

            <p className="mt-2.5 text-[14px] text-doux">
              {b.parPortion !== null && <>{fmt(b.parPortion)} € la part</>}
              {b.parPortion !== null && b.estimeRestant > 0 && ' · '}
              {/* On ne l'additionne PAS au payé : la moitié du chiffre serait
                  une supposition, et « dépensé » cesserait d'être vrai. */}
              {b.estimeRestant > 0 && <>{fmt(b.estimeRestant)} € encore estimés</>}
            </p>
            {b.paye === 0 && (
              <p className="mt-2 text-[13px] text-doux leading-relaxed">
                Aucun ticket enregistré sur la période. Photographie-le en sortant
                de caisse et l’app saura ce que coûte vraiment une part.
              </p>
            )}
          </section>

          {/* ── Les barquettes ───────────────────────────────────────────── */}
          <section className="mt-9 flex gap-7" aria-label="Barquettes">
            <Chiffre valeur={bilan.mangees} unite={`mangée${bilan.mangees > 1 ? 's' : ''}`} taille={26} />
            <Chiffre valeur={bilan.restantes} unite="au frais" taille={26} />
            {bilan.jetees > 0 && (
              <span style={{ color: ALERTE }}>
                <Chiffre valeur={bilan.jetees} unite={`jetée${bilan.jetees > 1 ? 's' : ''}`}
                         taille={26} couleur={ALERTE} />
              </span>
            )}
          </section>

          {/* ── Deux graphiques, jamais deux axes ────────────────────────── */}
          {bilan.personnes.map(p => (
            <Courbes key={p.userId} p={p} />
          ))}

          {bilan.recettes.length > 0 && (
            <section className="mt-10" aria-label="Ce qui est passé">
              <p className="text-[13px] text-doux uppercase tracking-[0.04em]">
                Ce qui est passé
              </p>
              <ul className="mt-3.5 space-y-2.5">
                {bilan.recettes.map(r => (
                  <li key={r.label} className="flex items-baseline gap-3">
                    <span className="grow text-[15px]">{r.label}</span>
                    <span className="text-[14px] text-doux tabular-nums">
                      {r.mangees} / {r.dressees}
                    </span>
                    {r.jetees > 0 && (
                      <span className="text-[13px]" style={{ color: ALERTE }}>
                        {r.jetees} jetée{r.jetees > 1 ? 's' : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3.5 text-[13px] text-doux leading-relaxed">
                Ce tableau nourrit le choix du mercredi : ce qu’on jette revient
                moins souvent, ce qu’on finit revient plus.
              </p>
            </section>
          )}
        </>
      )}

      {/* La clôture : elle ferme la boucle et rouvre la suivante (D54). */}
      {cycle?.state === 'semaine' && (
        <Surface className="mt-11">
          <p className="text-[15px]">Clore la semaine</p>
          <p className="text-[13px] text-doux mt-1.5">
            {bilan.restantes > 0
              ? `${bilan.restantes} barquette${bilan.restantes > 1 ? 's' : ''} restent au frais : elles ne disparaissent pas.`
              : 'Tout a été mangé.'}
            {' '}Clore permet d’ouvrir le cycle suivant.
          </p>
          <button onClick={() => change.mutate({ id: cycle.id, vers: 'cloture' })}
                  disabled={change.isPending}
                  className="mt-4 w-full h-[46px] rounded-[16px] bg-herbe text-fond text-[15px]">
            Clore et préparer la semaine prochaine
          </button>
          <Erreur de={change.error} />
        </Surface>
      )}
    </Ecran>
  )
}

/**
 * Les deux courbes d'une personne.
 *
 * Séparées et jamais superposées : une double échelle se lit de travers, et on
 * peut lui faire dire n'importe quoi en choisissant les bornes.
 */
function Courbes({ p }: { p: Personne }) {
  const s = p.serie
  if (s.renseignes === 0) {
    return (
      <section className="mt-10" aria-label={`Suivi de ${p.nom}`}>
        <h2 className="titre text-[22px]">{p.nom}</h2>
        <p className="mt-2 text-[14px] text-doux">
          Aucun repas renseigné sur la période. Rien n’est affiché plutôt qu’une
          moyenne construite sur des trous.
        </p>
      </section>
    )
  }

  return (
    <section className="mt-10" aria-label={`Suivi de ${p.nom}`}>
      <div className="flex items-baseline justify-between">
        <h2 className="titre text-[22px]">{p.nom}</h2>
        {/* D33 : toujours dire sur combien de jours on parle. */}
        <span className="text-[13px] text-doux">
          {s.renseignes} jour{s.renseignes > 1 ? 's' : ''} renseigné
          {s.renseignes > 1 ? 's' : ''} sur {s.total}
        </span>
      </div>

      <Graphe titre="Calories" unite="kcal"
              jours={s.jours} valeur={j => j.kcal}
              moyenne={s.kcalMoyen} cible={p.cibleKcal}
              tenus={s.joursKcalTenue} sens="plafond" />
      <Graphe titre="Protéines" unite="g"
              jours={s.jours} valeur={j => j.protein}
              moyenne={s.proteinMoyen} cible={p.cibleProtein}
              tenus={s.joursProteineTenue} sens="plancher" />
    </section>
  )
}

function Graphe({ titre, unite, jours, valeur, moyenne, cible, tenus, sens }: {
  titre: string
  unite: string
  jours: Jour[]
  valeur: (j: Jour) => number | null
  moyenne: number | null
  cible: number | null
  tenus: number | null
  sens: 'plafond' | 'plancher'
}) {
  const valeurs = jours.map(valeur)
  const max = Math.max(1, cible ?? 0, ...valeurs.map(v => v ?? 0))
  // Au-delà d'un mois, les jours ne tiennent plus côte à côte : on resserre.
  const serre = jours.length > 40

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-doux uppercase tracking-[0.04em]">{titre}</span>
        <span className="text-[14px]">
          {moyenne !== null && (
            <>
              <strong className="font-medium">{moyenne.toLocaleString('fr-FR')}</strong>
              {' '}{unite} en moyenne
              {cible !== null && <span className="text-doux"> · cible {cible.toLocaleString('fr-FR')}</span>}
            </>
          )}
        </span>
      </div>

      <div className={`mt-2.5 flex items-end ${serre ? 'gap-[1px]' : 'gap-[3px]'} h-[74px] relative`}
           role="img"
           aria-label={`${titre} par jour${cible !== null ? `, cible ${cible} ${unite}` : ''}`}>
        {/* La cible est un TRAIT, pas une barre : c'est un repère, pas une
            valeur mesurée (D32). */}
        {cible !== null && (
          <span aria-hidden="true"
                className="absolute left-0 right-0 border-t border-dashed border-encre/25"
                style={{ bottom: `${(cible / max) * 100}%` }} />
        )}
        {jours.map((j, i) => {
          const v = valeurs[i]
          if (v === null) {
            // Un trou se VOIT. Une barre à zéro ferait croire à un jeûne.
            return (
              <span key={j.jour} className="grow h-full flex items-end" aria-hidden="true">
                <span className="w-full h-[3px] rounded-full bg-brume" />
              </span>
            )
          }
          const tenu = cible === null ? true
            : sens === 'plafond' ? v <= cible : v >= cible
          return (
            <span key={j.jour} className="grow h-full flex items-end">
              <span className="w-full rounded-t-[3px] transition-[height] duration-500"
                    style={{
                      height: `${Math.max(2, (v / max) * 100)}%`,
                      background: tenu ? BARRE : BARRE_CLAIRE,
                    }} />
            </span>
          )
        })}
      </div>

      {tenus !== null && (
        <p className="mt-1.5 text-[13px] text-doux">
          {sens === 'plancher'
            ? `${tenus} jour${tenus > 1 ? 's' : ''} au-dessus de la cible`
            : `${tenus} jour${tenus > 1 ? 's' : ''} sous la cible`}
          {' '}sur les {jours.filter((_, i) => valeurs[i] !== null).length} renseignés.
        </p>
      )}
    </div>
  )
}

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
