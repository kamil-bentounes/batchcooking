import { motion } from 'motion/react'
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from 'react'

/* Navigation : deux liens, discrets. Le courant est en encre, l'autre en doux. */
function Nav() {
  const b = import.meta.env.BASE_URL
  const ici = '/' + window.location.pathname.slice(b.length).replace(/^\/+/, '')
  const lien = (href: string, texte: string) => {
    const actif = href === '/' ? ici === '/' : ici.startsWith(href)
    return (
      <a href={(b + href.slice(1)).replace(/\/\//g, '/')}
         className={`py-2 transition-colors ${actif ? 'text-encre' : 'text-doux hover:text-encre'}`}>
        {texte}
      </a>
    )
  }
  return (
    <nav className="mx-auto w-full max-w-lg flex gap-6 text-[15px] mb-8">
      {lien('/', 'Objectifs')}
      {lien('/settings', 'Réglages')}
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
