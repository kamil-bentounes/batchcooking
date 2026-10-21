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
import { Marque } from '../ui/coque.tsx'
import { useCycle, GESTE } from '../lib/donnees/cycle.ts'
import { useBarquettes } from '../lib/donnees/barquettes.ts'
import { useFoyer, initialeDe } from '../lib/donnees/foyer.ts'
import { useMois, useRevenus, useSaisies, moisDe, eurosRonds } from '../lib/donnees/budget.ts'
import { aDire, ligneDuHub, montant, nomDuMois, resteDuMois, sousLEuro } from '../lib/budget/mois.ts'
import { etatDeLEcran, messageDeLecture } from '../lib/budget/ecran.ts'

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
  /* ⚠️ `isPending`, pas seulement `data`. Avec `= []` en défaut, le hub
     annonçait « Rien de posé » et « Aucune barquette au frais » à CHAQUE
     ouverture à froid — le cas le plus fréquent — avant de tout corriger une
     seconde plus tard. C'est le premier écran de l'app : il ne peut pas
     commencer par un mensonge. */
  const budget = useMois(mois)
  const depenses = budget.data ?? []
  const saisies = useSaisies(mois)
  const lecteurRevenus = useRevenus()
  const revenus = lecteurRevenus.data ?? []
  const revenuPose = revenus.some(r => r.user_profile_id === userId)
  const moi = foyer?.membres.find(m => m.id === userId)
  /* ⚠️ Les trois lectures du chiffre, comme l'écran du mois (`etatDeLEcran`). `= []`
     sans `isPending` disait « Ajoute ton revenu » à qui l'avait posé ; une panne du mois
     se lisait « Rien de posé » ; une panne des saisies comptait le PRÉVU pour du déclaré,
     sans un mot. Un faux chiffre est pire qu'un « … ». */
  const lectures = [budget, saisies, lecteurRevenus]
  const etat = etatDeLEcran(lectures)
  const enPanne = lectures.find(q => q.data === undefined && q.error)
  /* Le bandeau ne dit « complète ton profil » que sur ce qu'on a LU : un revenu ou un
     foyer pas encore revenus ne sont pas des revenus ou un profil absents. */
  const profilLu = foyer !== undefined && lecteurRevenus.data !== undefined

  /* Le chiffre de l'écran du mois, au même calcul (§ 3.1.1). Le mois courant
     n'est jamais clôturé (D78) : `clos` vaut faux. */
  const reste = resteDuMois({ lignes: depenses, saisies: saisies.data ?? [], moi: userId,
                             revenus, mois, clos: false })
  const suite = ligneDuHub({ aCloturer: null, aDire: aDire(depenses, saisies.data ?? [], false) })
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
          {/* Vers SON profil, pas vers les réglages de la cuisine : l'avatar
              porte son initiale, un tap dessus doit mener à soi. C'était aussi
              le seul chemin manquant — une fois le profil rempli, le bandeau
              disparaissait et la date d'arrivée devenait incorrigeable. */}
          <button onClick={() => va('/profil')} aria-label="Mon profil"
                  className="w-11 h-11 -mr-2 grid place-items-center">
            <span className="w-[34px] h-[34px] rounded-full bg-herbe text-fond text-[13px]
                             grid place-items-center">
              {initialeDe(moi?.display_name)}
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
            {/* Les saisies aussi : sans elles, un mois au fil passait pour « à dire »
                et son reste pour plein, le temps d'une seconde. */}
            {etat === 'chargement' ? (
              <p className="titre text-[28px] mt-5 opacity-50">…</p>
            ) : etat === 'erreur' ? (
              <p role="alert" className="mt-4 text-[15px] leading-snug text-doux">
                {messageDeLecture(enPanne?.error)}
              </p>
            ) : depenses.length === 0 ? (
              <>
                <p className="titre text-[28px] mt-5">Rien de posé</p>
                <p className="mt-2.5 text-[15px] text-doux">
                  Les charges du foyer, et ce que chacun verse.
                </p>
              </>
            ) : (
              <>
                {/* Ce qui reste, en euros ronds (§ 3.6). « 0 € à verser » et
                    « Courses : dépassé de 500 € » disaient l'état d'une enveloppe ;
                    ceci dit ce qu'on peut encore dépenser. */}
                {reste.reste === null ? (
                  <p className="titre text-[28px] mt-5">Ajoute ton revenu</p>
                ) : (
                  <p className="mt-4 flex items-baseline gap-2.5 flex-wrap">
                    <span className="text-[15px]">{reste.reste < 0 ? 'Il te manque' : 'Il te reste'}</span>
                    <span className="chiffre text-[40px]"
                          style={{ color: reste.reste < 0 ? 'var(--color-ocre)' : 'var(--color-herbe)' }}>
                      {/* Sous l'euro, l'arrondi dirait « 0 € » d'un manque de 0,30 €. */}
                      {sousLEuro(reste.reste) ? montant(Math.abs(reste.reste))
                                              : eurosRonds(Math.abs(reste.reste))}
                    </span>
                    <span className="text-[15px]">en {nomDuMois(mois)}</span>
                  </p>
                )}
                <p className="mt-2.5 text-[15px] text-doux">{suite}</p>
              </>
            )}
          </Carte>
        </div>

        {/* Le bandeau n'est pas un reproche : il MÈNE quelque part. Tant que le
            revenu manque, `parts_du_foyer` partage à parts égales — autant le
            dire, et offrir le chemin dans la même phrase. */}
        {profilLu && (!moi?.display_name || !revenuPose) && (
          <button onClick={() => va('/profil')}
                  className="mt-4 w-full text-left bg-surface border border-dashed
                             border-brume rounded-[18px] p-4 transition-colors
                             hover:bg-brume/20 hover:border-doux/40">
            <p className="text-[15px] leading-[23px] text-doux">
              <strong className="text-encre font-semibold">Complète ton profil.</strong>{' '}
              Sans ton revenu, le partage se fait à parts égales.
            </p>
          </button>
        )}
      </div>
    </main>
  )
}
