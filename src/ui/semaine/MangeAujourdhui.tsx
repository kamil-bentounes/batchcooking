/**
 * Ce que j'ai déjà mangé aujourd'hui, sous la carte du repas (le hub et l'accueil de la cuisine) : c'est là que vivent
 * le bandeau « Noté : mangé. » et le lien « Pas mangé ? Annuler » quand on a coché « Je l'ai mangé » sur la carte sombre
 * (qui, elle, passe au repas suivant). Une ligne par repas de MA journée dont la case est « mangé » ; rien quand il n'y en a pas.
 */
import { NOM_REPAS } from '../../lib/donnees/barquettes.ts'
import type { Case } from '../../lib/donnees/barquettes.ts'
import { estUnRepasChoisi, MOT_DU_REPAS } from '../../lib/choix.ts'
import { nomCourt } from '../../lib/frigo.ts'
import { PlatImage } from '../frigo/PlatImage.tsx'
import { puceDuMange } from '../../lib/annuler-mange.ts'
import { BandeauNote, LienAnnuler, PuceMange } from './AnnulerLeMange.tsx'

export function MangeAujourdhui({ cases, photoDe, notee, surFerme, surAnnule, enCours }: {
  cases: Case[]
  photoDe: (c: Case) => string | null
  /** La case qu'on vient de cocher : son bandeau est affiché, les autres montrent le lien. */
  notee: string | null
  surFerme: () => void
  surAnnule: (idDeLaCase: string) => void
  enCours: boolean
}) {
  if (cases.length === 0) return null
  return (
    <section aria-label="Repas déjà notés" data-mange-aujourdhui="" className="mt-3 grid gap-2.5 min-[900px]:mt-5">
      {cases.map(c => {
        const nom = c.portion ? nomCourt(c.portion.label) : c.extras.map(e => e.label).join(' + ')
        const repas = estUnRepasChoisi(c.meal) ? MOT_DU_REPAS[c.meal].titre : NOM_REPAS[c.meal as keyof typeof NOM_REPAS] ?? c.meal
        return (
          <div key={c.id} role="group" aria-label={`${repas} : ${nom}`} data-mange-repas={c.meal}
               className="flex flex-col gap-2.5 rounded-[20px] bg-surface p-3.5" style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
            <div className="flex items-center gap-3">
              <span aria-hidden="true" className="relative block h-11 w-[52px] shrink-0 overflow-hidden rounded-[10px]"
                    style={{ background: c.portion ? 'var(--color-piste)' : 'var(--color-sable)', boxShadow: 'inset 0 0 0 1.5px rgba(28, 43, 35, 0.12)' }}>
                {c.portion && <PlatImage url={photoDe(c)} texte={false} glyphe={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-doux">{repas}</div>
                <div className="text-[15px] font-semibold leading-[1.25] [overflow-wrap:anywhere]">{nom}</div>
                <div className="mt-2"><PuceMange texte={notee === c.id ? 'Mangé' : puceDuMange(c.eaten_at, c.day)} /></div>
              </div>
            </div>
            {notee === c.id
              ? <BandeauNote surAnnule={() => surAnnule(c.id)} surFerme={surFerme} enCours={enCours} />
              : <LienAnnuler avecBarquette={c.portion !== null} surConfirme={() => surAnnule(c.id)} enCours={enCours}
                             nom={`${repas} : ${nom}`} />}
          </div>
        )
      })}
    </section>
  )
}
