/**
 * Le bas de la liste (R1) : on ne fait que descendre, et les boutons sont là.
 *
 * `pagination()` dans la maquette. « Les 10 suivantes » est le geste qu'on fait
 * neuf fois sur dix ; les numéros servent à revenir.
 */
import { PAR_PAGE, bornesDeLaPage, nombreDePages, numeros } from '../../lib/recettes/pages.ts'
import { Icone } from './pictos.tsx'

const fr = (n: number) => n.toLocaleString('fr-FR')

export function Pagination({ page, total, surPage }:
  { page: number; total: number; surPage: (p: number) => void }) {
  if (total <= PAR_PAGE) return null
  const { de, a } = bornesDeLaPage(page, total)
  const restantes = total - a
  return (
    <nav aria-label="Pages de recettes" className="mt-[22px] flex flex-col gap-3">
      <p className="text-center text-[14px] text-doux tabular-nums">
        Recettes {fr(de)} à {fr(a)} sur {fr(total)}
      </p>
      {restantes > 0 && (
        <button type="button" onClick={() => surPage(page + 1)}
                className="min-h-[54px] rounded-[18px] bg-safran text-encre text-[16px] font-semibold
                           inline-flex items-center justify-center gap-1.5">
          {restantes === 1 ? 'La suivante' : `Les ${Math.min(PAR_PAGE, restantes)} suivantes`}
          <Icone nom="droite" taille={18} epaisseur={2.4} />
        </button>
      )}
      {/* Ils passent à la ligne : sept ronds de 44 px débordent sous 390 px. */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {numeros(page, nombreDePages(total)).map((n, i) => n === '…' ? (
          <span key={`trou-${i}`} aria-hidden="true"
                className="min-w-11 h-11 grid place-items-center text-doux">…</span>
        ) : (
          <button key={n} type="button" onClick={() => surPage(n)}
                  aria-label={`Page ${n}`} aria-current={n === page ? 'page' : undefined}
                  className={`min-w-11 h-11 px-2 rounded-full text-[15px] font-medium tabular-nums
                    ${n === page ? 'bg-encre text-fond' : 'bg-piste text-encre'}`}>
            {n}
          </button>
        ))}
      </div>
    </nav>
  )
}
