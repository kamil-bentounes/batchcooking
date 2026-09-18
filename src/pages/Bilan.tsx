/**
 * Le bilan (D54).
 *
 * Il se remplit tout seul — c'est la contrepartie de la barquette : on n'a rien
 * saisi de la semaine, donc on peut tout mesurer. Et il ne sert pas à se
 * féliciter, il sert à décider du cycle suivant : ce qu'on a jeté, ce qui est
 * resté, ce qui a coûté plus cher que prévu.
 */
import { useMemo, useState } from 'react'
import { Attente, Chiffre, Ecran, Erreur, Surface, Vide } from '../ui/coque.tsx'
import { useBilan } from '../lib/donnees/bilan.ts'
import { useChangeEtat, useCycle } from '../lib/donnees/cycle.ts'

/** Les deux verts validés en contraste pour les aplats de graphique. */
const BARRE = '#1E6B41'
const BARRE_CLAIRE = '#9CB5A6'

export function Bilan({ va }: { va: (v: string) => void }) {
  const [periode, setPeriode] = useState<'semaine' | 'mois'>('semaine')
  const { data: cycle } = useCycle()
  const change = useChangeEtat()

  const [depuis, jusqu] = useMemo(() => {
    const fin = new Date()
    const debut = new Date()
    if (periode === 'semaine') debut.setDate(debut.getDate() - 6)
    else debut.setDate(1)
    return [debut, fin]
  }, [periode])

  const { data: bilan, isPending } = useBilan(depuis, jusqu)

  if (isPending) return <Ecran actif="bilan" va={va}><Attente /></Ecran>
  if (!bilan) return <Ecran actif="bilan" va={va}><Vide titre="Rien à mesurer" /></Ecran>

  const rien = bilan.dressees === 0 && bilan.estimeEur === 0
  const max = Math.max(1, ...bilan.courbe.map(c => c.kcal ?? 0))

  return (
    <Ecran actif="bilan" va={va}>
      <h1 className="titre text-[38px]">Le bilan</h1>

      <div className="mt-5 flex gap-2">
        {(['semaine', 'mois'] as const).map(p => (
          <button key={p} onClick={() => setPeriode(p)} aria-pressed={periode === p}
                  className={`px-4 py-2 rounded-full text-[14px] transition-colors
                    ${periode === p ? 'bg-encre text-fond' : 'bg-brume/50 hover:bg-brume'}`}>
            {p === 'semaine' ? 'Cette semaine' : 'Ce mois'}
          </button>
        ))}
      </div>

      {rien ? (
        <Vide titre="Pas encore de quoi mesurer"
              texte="Le bilan se remplit tout seul, à mesure que les barquettes se cochent." />
      ) : (
        <>
          <section className="mt-9" aria-label="Le budget">
            <p className="text-[13px] text-doux uppercase tracking-[0.04em]">Courses</p>
            <p className="mt-2.5">
              <Chiffre valeur={fmt(bilan.payeEur ?? bilan.estimeEur)} unite="€" taille={34} />
            </p>
            <p className="mt-1.5 text-[14px] text-doux">
              {bilan.payeEur === null
                ? 'estimés — saisis les prix payés pour comparer'
                : `payés, pour ${fmt(bilan.estimeEur)} € estimés`}
            </p>
            {bilan.payeEur !== null && bilan.estimeEur > 0 && (
              <p className="mt-1 text-[14px]"
                 style={{ color: bilan.payeEur > bilan.estimeEur ? '#8F5A0D' : '#2F5D45' }}>
                {bilan.payeEur > bilan.estimeEur ? '+' : ''}
                {Math.round(((bilan.payeEur - bilan.estimeEur) / bilan.estimeEur) * 100)} %
                par rapport à l’estimation
              </p>
            )}
          </section>

          <section className="mt-9" aria-label="Les barquettes">
            <p className="text-[13px] text-doux uppercase tracking-[0.04em]">Barquettes</p>
            <div className="mt-3 flex gap-7">
              <div>
                <Chiffre valeur={bilan.mangees} taille={28} />
                <p className="text-[13px] text-doux mt-0.5">mangées</p>
              </div>
              <div>
                <Chiffre valeur={bilan.restantes} taille={28} />
                <p className="text-[13px] text-doux mt-0.5">encore là</p>
              </div>
              <div>
                <Chiffre valeur={bilan.jetees} taille={28}
                         couleur={bilan.jetees > 0 ? '#9A3526' : undefined} />
                <p className="text-[13px] text-doux mt-0.5">jetées</p>
              </div>
            </div>
            {bilan.jetees > 0 && (
              <p className="mt-3 text-[14px]" style={{ color: '#8F5A0D' }}>
                {bilan.jetees} part{bilan.jetees > 1 ? 's' : ''} perdue
                {bilan.jetees > 1 ? 's' : ''} : vise moins de parts au prochain cycle.
              </p>
            )}
          </section>

          <section className="mt-9" aria-label="Les calories, jour par jour">
            <p className="text-[13px] text-doux uppercase tracking-[0.04em]">
              Calories, jour par jour
            </p>
            <div className="mt-4 flex items-end gap-1.5" style={{ height: 110 }}>
              {bilan.courbe.map(c => (
                <div key={c.jour} className="flex-1 flex flex-col justify-end items-center gap-1.5">
                  <div className="w-full rounded-t-[4px] transition-[height] duration-500"
                       style={{
                         height: c.kcal === null ? 3 : Math.max(3, (c.kcal / max) * 88),
                         background: c.kcal === null ? BARRE_CLAIRE : BARRE,
                         opacity: c.kcal === null ? 0.4 : 1,
                       }}
                       title={c.kcal === null ? 'Non renseigné' : `${c.kcal} kcal`} />
                  <span className="text-[10px] text-doux tabular-nums">
                    {c.jour.slice(8)}
                  </span>
                </div>
              ))}
            </div>
            {/* D33 : un jour vide n'est pas un jour à zéro, et le graphe le dit. */}
            {bilan.courbe.some(c => c.kcal === null) && (
              <p className="mt-3 text-[13px] text-doux">
                Les barres pâles sont des jours non renseignés, pas des jours à zéro.
              </p>
            )}
          </section>

          <section className="mt-9" aria-label="Les objectifs">
            <p className="text-[13px] text-doux uppercase tracking-[0.04em]">Par personne</p>
            <div className="mt-3.5 space-y-5">
              {bilan.parPersonne.map(p => (
                <div key={p.userId}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[15px] grow">{p.nom}</span>
                    <span className="text-[13px] text-doux">
                      {p.joursRenseignes} jour{p.joursRenseignes > 1 ? 's' : ''} renseigné
                      {p.joursRenseignes > 1 ? 's' : ''}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[14px] text-doux">
                    <Chiffre valeur={p.kcalMoyen.toLocaleString('fr-FR')} taille={20} /> kcal
                    {p.cibleKcal && ` sur ${p.cibleKcal.toLocaleString('fr-FR')}`}
                    {' · '}
                    <Chiffre valeur={p.proteinMoyen} taille={20} /> g de protéines
                    {p.cibleProtein && ` sur ${p.cibleProtein}`}
                    {' '}en moyenne
                  </p>
                </div>
              ))}
            </div>
          </section>

          {bilan.recettes.length > 0 && (
            <section className="mt-9" aria-label="Ce qui est passé">
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
                      <span className="text-[13px]" style={{ color: '#8F5A0D' }}>
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

function fmt(n: number): string {
  return n.toFixed(2).replace('.', ',')
}
