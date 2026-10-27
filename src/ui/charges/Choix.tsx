/**
 * Les choix des formulaires de charge : des pilules à cocher, comme la maquette. Une pilule vide a un filet
 * de brume, la choisie est en encre (ou en herbe pour « qui participe ») — et le nom est toujours écrit.
 */
import type { ReactNode } from 'react'
import { CATEGORIES, NOM_DU_MODE, type Categorie, type Mode } from '../../lib/budget/categories.ts'
import type { Rythme } from '../../lib/budget/charges.ts'

export const PILULE = 'min-h-11 px-4 rounded-full text-[14.5px] font-medium inline-flex items-center gap-2 transition-colors'
export const FILET = 'bg-surface shadow-[inset_0_0_0_1.5px_var(--color-brume)]'
export const CHOISIE = 'bg-encre text-surface'

export function Titre({ children }: { children: ReactNode }) {
  return <span className="block mb-2 text-[15px] font-semibold">{children}</span>
}

/** « Catégorie » (§ 3.7) : les huit, chacune avec sa pastille — la couleur n'est jamais seule, le nom est écrit. */
export function ChoixCategorie({ valeur, choisir, nom }: {
  valeur: Categorie; choisir: (c: Categorie) => void; nom: string
}) {
  return (
    <div>
      <Titre>Catégorie</Titre>
      <div role="radiogroup" aria-label={nom} className="flex gap-2 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.cle} type="button" role="radio" aria-checked={valeur === c.cle}
                  onClick={() => choisir(c.cle)}
                  className={`${PILULE} ${valeur === c.cle ? CHOISIE : FILET}`}>
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full"
                  style={{ background: valeur === c.cle ? c.sombre : c.clair }} />
            {c.nom}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * « Comment elle se paie » (§ 3.7). Ce choix remplace la périodicité seule et la case « variable » : les trois
 * premiers fixent le mensuel, « Mise de côté » demande tous les trois mois ou une fois par an.
 */
export function ChoixFacon({ mode, rythme, choisir, nom, bloque = false }: {
  mode: Mode; rythme: Rythme; choisir: (m: Mode, r: Rythme) => void; nom: string
  /** Une charge mise de côté qui a une histoire ne devient pas mensuelle (§ 4.5). */
  bloque?: boolean
}) {
  const carre = 'min-h-11 px-3.5 py-1.5 rounded-[14px] text-[14.5px] font-medium leading-tight text-left transition-colors disabled:opacity-40'
  return (
    <div>
      <Titre>Comment elle se paie</Titre>
      <div role="radiogroup" aria-label={nom} className="grid grid-cols-2 gap-2">
        {(['fixe', 'facture', 'au_fil', 'mis_de_cote'] as const).map(m => (
          <button key={m} type="button" role="radio" aria-checked={mode === m}
                  disabled={bloque && m !== 'mis_de_cote'} onClick={() => choisir(m, rythme)}
                  className={`${carre} ${mode === m ? CHOISIE : FILET}`}>
            {NOM_DU_MODE[m]}
          </button>
        ))}
      </div>
      {mode === 'mis_de_cote' && (
        <div role="radiogroup" aria-label="Tous les combien" className="mt-2 grid grid-cols-2 gap-2">
          {([['trimestriel', 'Tous les trois mois'], ['annuel', 'Une fois par an']] as const).map(([r, texte]) => (
            <button key={r} type="button" role="radio" aria-checked={rythme === r}
                    onClick={() => choisir('mis_de_cote', r)}
                    className={`${carre} text-center ${rythme === r ? 'bg-herbe text-fond' : FILET}`}>
              {texte}
            </button>
          ))}
        </div>
      )}
      {bloque && (
        <p className="mt-2 text-[14px] leading-snug text-doux">
          Pour la payer chaque mois, retire-la et ajoute la nouvelle. Ses factures et ses années
          soldées restent ; une année encore ouverte se soldera à la clôture de décembre.
        </p>
      )}
    </div>
  )
}

/** Un champ à la façon de la maquette : son nom au-dessus, un filet de brume, 48 px. */
export const CHAMP = 'w-full min-h-12 rounded-[14px] border-[1.5px] border-brume bg-surface px-3.5 text-[16px] text-encre placeholder:text-doux'
