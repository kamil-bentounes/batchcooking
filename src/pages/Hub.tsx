/**
 * Le hub.
 *
 * Popote a cessé d'être une application de cuisine : elle gère aussi ce que le
 * foyer dépense. Deux univers, donc — et un écran qui ne sert qu'à choisir
 * lequel.
 *
 * Trois partis pris, tous discutables et tous tenus :
 *
 *  · PAS de barre du bas. C'est l'écran qu'on quitte immédiatement ; lui donner
 *    une navigation reviendrait à en faire une destination.
 *  · Les deux cartes ne sont PAS symétriques. La cuisine mène par une phrase —
 *    son état est qualitatif, « Tout est là » dit plus que n'importe quel
 *    nombre — et le budget par un chiffre. Deux grosses cartes jumelles à gros
 *    chiffre feraient tableau de bord, ce que ceci n'est pas.
 *  · Le reste de l'écran reste VIDE. On le remplirait volontiers ; ce serait
 *    une faute.
 */
import { Marque, Surface } from '../ui/coque.tsx'
import { useCycle, GESTE } from '../lib/donnees/cycle.ts'
import { useBarquettes } from '../lib/donnees/barquettes.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { useMois, useEnveloppes, useComptes, virements, moisDe, eurosRonds, euros }
  from '../lib/donnees/budget.ts'

function Carte({ titre, onClick, children }:
  { titre: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
            className="block w-full text-left bg-surface border border-brume
                       rounded-[22px] p-5 transition-colors hover:bg-brume/20">
      <span className="flex items-center justify-between">
        <span className="text-[15px] font-semibold text-herbe">{titre}</span>
        <span aria-hidden="true" className="text-[20px] text-doux">›</span>
      </span>
      {children}
    </button>
  )
}

export function Hub({ userId, va }: { userId: string; va: (v: string) => void }) {
  const mois = moisDe()
  const { data: cycle } = useCycle()
  const { data: barquettes = [] } = useBarquettes()
  const { data: foyer } = useFoyer()
  const { data: depenses = [] } = useMois(mois)
  const { data: enveloppes = [] } = useEnveloppes(mois)
  const { data: comptes = [] } = useComptes()

  const moi = foyer?.membres.find(m => m.id === userId)
  const prenoms = new Map((foyer?.membres ?? []).map(m => [m.id, m.display_name]))
  const aVerser = virements(depenses, userId, comptes, prenoms)
    .reduce((s, v) => s + v.cents, 0)

  /* L'enveloppe la plus TENDUE, pas la première : c'est celle-là qui peut
     changer ce qu'on fait dans l'heure, et c'est le seul critère qui vaille
     pour mériter sa place ici. */
  const tendue = [...enveloppes].sort((a, b) => a.reste_cents - b.reste_cents)[0]
  const geste = GESTE[cycle?.state ?? 'vide']

  return (
    <main className="min-h-dvh px-6 pt-4 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <header className="h-14 flex items-center justify-between">
          <span className="flex items-center gap-2.5">
            <Marque taille={26} />
            {/* Le nom, écrit une fois. L'app ne l'affichait nulle part, alors
                qu'il est ce qu'elle a de meilleur. WONK à 1 ici et NULLE PART
                ailleurs : c'est le seul endroit où la bizarrerie de la fonte
                sert à quelque chose. */}
            <h1 className="titre text-[28px] text-herbe"
                style={{ fontVariationSettings: '"opsz" 96, "SOFT" 40, "WONK" 1',
                         letterSpacing: '-0.02em' }}>
              Popote
            </h1>
          </span>
          <button onClick={() => va('/reglages')} aria-label="Réglages"
                  className="w-11 h-11 -mr-2 grid place-items-center">
            <span className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px]
                             grid place-items-center">
              {(moi?.display_name ?? '?').slice(0, 1).toUpperCase()}
            </span>
          </button>
        </header>

        <div className="mt-5 flex flex-col gap-3.5">
          <Carte titre="Cuisine" onClick={() => va('/cuisine-accueil')}>
            <p className="titre text-[28px] mt-5">{geste.titre}</p>
            <p className="mt-2.5 text-[15px] text-doux">
              {barquettes.length === 0
                ? 'Aucune barquette au frais'
                : `${barquettes.length} barquette${barquettes.length > 1 ? 's' : ''}`}
            </p>
          </Carte>

          <Carte titre="Budget" onClick={() => va('/budget')}>
            {depenses.length === 0 ? (
              <>
                <p className="titre text-[28px] mt-5">Rien de posé</p>
                <p className="mt-2.5 text-[15px] text-doux">
                  Les charges du foyer, et ce que chacun verse.
                </p>
              </>
            ) : (
              <>
                <p className="mt-4 flex items-baseline gap-2.5">
                  <span className="chiffre text-[40px] text-herbe">{eurosRonds(aVerser)}</span>
                  <span className="text-[15px]">à verser ce mois</span>
                </p>
                <p className="mt-2.5 text-[15px] text-doux">
                  {tendue
                    ? tendue.reste_cents >= 0
                      ? `${tendue.libelle} : il reste ${euros(tendue.reste_cents)}`
                      : `${tendue.libelle} : dépassé de ${euros(-tendue.reste_cents)}`
                    : 'Aucune enveloppe posée'}
                </p>
              </>
            )}
          </Carte>
        </div>

        {!moi?.display_name && (
          <Surface className="mt-4">
            <p className="text-[15px] text-doux">
              Complète ton profil pour que le partage se calcule.
            </p>
          </Surface>
        )}
      </div>
    </main>
  )
}
