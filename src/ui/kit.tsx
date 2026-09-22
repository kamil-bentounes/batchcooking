import { motion } from 'motion/react'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'
import { useRoute } from '../lib/route'

/*
 * Navigation des écrans HORS cycle : objectifs et réglages, plus la sortie vers
 * l'accueil. Les écrans du cycle ont leur propre coque (`ui/coque.tsx`).
 *
 * ⚠️ Des BOUTONS, pas des `<a href>`.
 *
 *    Ces liens rechargeaient la page. C'est ce rechargement qui a cassé le
 *    correctif de `PASSWORD_RECOVERY` — l'histoire est écrite en toutes lettres
 *    dans `src/App.tsx`. Le reste de l'app navigue en client depuis toujours ;
 *    cette barre était la seule exception, et elle a coûté un bug de sécurité.
 */
function Nav() {
  const { ici, va } = useRoute()
  const lien = (vers: string, texte: string) => (
    <button type="button" onClick={() => va(vers)}
            aria-current={ici === vers ? 'page' : undefined}
            className={`py-2 min-h-11 transition-colors
                        ${ici === vers ? 'text-encre' : 'text-doux hover:text-encre'}`}>
      {texte}
    </button>
  )
  return (
    <nav className="mx-auto w-full max-w-lg flex gap-6 text-[15px] mb-8">
      {lien('/', '← Accueil')}
      {lien('/objectifs', 'Objectifs')}
      {lien('/reglages', 'Réglages')}
    </nav>
  )
}

export function Page({ titre, chapeau, centre, nav, children }:
  { titre: string; chapeau?: string; centre?: boolean; nav?: boolean; children: ReactNode }) {
  return (
    <main className={`min-h-dvh px-5 ${centre
      ? 'grid place-items-center py-10'
      : 'py-8 sm:py-14'}`}>
      {nav && <Nav />}
      <div className="mx-auto w-full max-w-lg">
        <h1 className="titre text-4xl sm:text-5xl text-herbe">{titre}</h1>
        {chapeau && <p className="mt-3 text-doux text-[17px] max-w-[46ch]">{chapeau}</p>}
        <div className="mt-10">{children}</div>
      </div>
    </main>
  )
}

/** Groupe à filets : les séparateurs disent que ces mesures vont ensemble. */
export function Groupe({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brume bg-surface divide-y divide-brume overflow-hidden">
      {children}
    </div>
  )
}

/* motion.button redéfinit les gestionnaires d'animation et de glisser : on les
   retire du type natif pour éviter le conflit. */
type BoutonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onAnimationStart' | 'onAnimationEnd' | 'onAnimationIteration' |
  'onDrag' | 'onDragStart' | 'onDragEnd'
> & { variante?: 'plein' | 'discret' | 'danger' }

export function Bouton({ variante = 'plein', children, ...rest }: BoutonProps) {
  const base = 'w-full rounded-xl px-5 py-3.5 font-medium transition-colors ' +
    'disabled:opacity-100 disabled:cursor-not-allowed ' +
    'disabled:bg-transparent disabled:text-doux/70 disabled:border disabled:border-brume'
  const styles = {
    plein: 'bg-herbe text-fond hover:bg-encre',
    discret: 'border border-brume text-encre hover:bg-brume/40',
    danger: 'text-groseille hover:bg-groseille/10',
  }[variante]
  return (
    <motion.button whileTap={{ scale: 0.985 }} className={`${base} ${styles}`} {...rest}>
      {children}
    </motion.button>
  )
}

export function Champ({ label, ...p }:
  { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-doux text-[15px]">{label}</span>
      <input
        {...p}
        className="mt-1.5 w-full rounded-xl border border-brume bg-surface px-4 py-3
                   text-encre placeholder:text-doux/60 focus:border-herbe outline-none"
      />
    </label>
  )
}

export function Message({ texte, erreur }: { texte: string; erreur?: boolean }) {
  if (!texte) return null
  return (
    <p role="status" aria-live="polite"
       className={`mt-4 text-[15px] ${erreur ? 'text-groseille' : 'text-herbe'}`}>
      {texte}
    </p>
  )
}
