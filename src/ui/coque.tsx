/**
 * La coque des écrans du cycle.
 *
 * Quatre destinations permanentes, toujours à la même place. Tout le reste —
 * choisir, le magasin, le plan, la cuisine, le dressage — est un PASSAGE : on y
 * entre depuis l'accueil, on en ressort, la barre du bas disparaît pendant ce
 * temps pour qu'il n'y ait qu'une seule sortie.
 */
import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export type Destination = 'accueil' | 'semaine' | 'stock' | 'bilan'

const DESTINATIONS: { cle: Destination; vers: string; texte: string; dessin: ReactNode }[] = [
  {
    cle: 'accueil', vers: '/', texte: 'Accueil',
    dessin: <path d="M3 8.5 10.5 2.5 18 8.5V17a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 3 17z" />,
  },
  {
    cle: 'semaine', vers: '/semaine', texte: 'Semaine',
    dessin: <><rect x="3" y="4.5" width="15" height="14" rx="2.5" /><path d="M3 9h15M7.5 2.5v4M13.5 2.5v4" /></>,
  },
  {
    cle: 'stock', vers: '/stock', texte: 'Ce que j’ai',
    dessin: <><rect x="5" y="2.5" width="11" height="16" rx="2.5" /><path d="M5 8.5h11M8.2 5.5v1M8.2 11.5v1.5" /></>,
  },
  {
    cle: 'bilan', vers: '/bilan', texte: 'Bilan',
    dessin: <path d="M3.5 17.5v-5M8.5 17.5V6M13.5 17.5v-8M18 17.5V3.5" />,
  },
]

export function Barre({ actif, va }: { actif: Destination; va: (v: string) => void }) {
  return (
    <nav aria-label="Navigation principale"
         className="fixed inset-x-0 bottom-0 z-20 h-[78px] pt-3
                    bg-surface/95 backdrop-blur-md flex">
      {DESTINATIONS.map(d => (
        <button key={d.cle} onClick={() => va(d.vers)}
                aria-current={d.cle === actif ? 'page' : undefined}
                className={`flex-1 flex flex-col items-center gap-1.5 text-[11px]
                            ${d.cle === actif ? 'text-encre' : 'text-doux'}`}>
          <svg width="21" height="21" viewBox="0 0 21 21" fill="none" stroke="currentColor"
               strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {d.dessin}
          </svg>
          {d.texte}
        </button>
      ))}
    </nav>
  )
}

/** Un écran permanent : titre discret, barre du bas, place pour respirer. */
export function Ecran({ actif, va, children }:
  { actif: Destination; va: (v: string) => void; children: ReactNode }) {
  return (
    <>
      <main className="min-h-dvh px-6 pt-16 pb-28">
        <div className="mx-auto w-full max-w-lg">{children}</div>
      </main>
      <Barre actif={actif} va={va} />
    </>
  )
}

/** Un passage : une seule sortie, en haut à gauche, et rien en bas. */
/**
 * Une barre d'action COLLÉE en bas de l'écran.
 *
 * Elle existe pour les écrans dont la liste est longue : sur « Choisir », il
 * fallait descendre sous quatre-vingts recettes pour valider, et le compteur de
 * parts — la seule chose qui décide du choix — disparaissait dès la deuxième
 * carte. Paginer aurait été pire : on choisit EN FONCTION de ce compteur, et
 * changer de page le ferait perdre.
 *
 * Elle laisse passer le fond derrière elle, pour qu'on voie qu'il reste du
 * contenu dessous.
 */
export function BarreAction({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-brume/70
                    bg-fond/92 backdrop-blur-sm
                    pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto w-full max-w-lg px-6">{children}</div>
    </div>
  )
}

/**
 * La marque, en SVG inline.
 *
 * Inline plutôt qu'un `<img>` : elle prend la couleur du texte quand on le lui
 * demande, elle n'ajoute pas de requête, et elle ne clignote pas au premier
 * rendu. Le fichier `public/logo.svg` reste la source de l'onglet et des
 * icônes d'installation — les deux doivent rester d'accord.
 */
export function Marque({ taille = 24 }: { taille?: number }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 64 64" aria-hidden="true"
         className="shrink-0">
      <g fill="currentColor">
        <rect x="3" y="34" width="15" height="7" rx="3.5" />
        <rect x="46" y="34" width="15" height="7" rx="3.5" />
        <path d="M10 29.5h44l-3.1 18.6A8 8 0 0 1 43 54.8H21a8 8 0 0 1-7.9-6.7z" />
        <rect x="5" y="19.5" width="54" height="8" rx="4" />
      </g>
      <path fill="#E8A33D" d="M25 19.5a7 7 0 0 1 14 0z" />
    </svg>
  )
}

export function Passage({ retour, retourTexte = 'Accueil', barre, children }:
  { retour: () => void; retourTexte?: string; barre?: ReactNode; children: ReactNode }) {
  return (
    <main className={`min-h-dvh px-6 pt-14 ${barre ? 'pb-40' : 'pb-16'}`}>
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 text-[15px] text-doux hover:text-encre">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
               strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10 3.5 5.5 8 10 12.5" />
          </svg>
          {retourTexte}
        </button>
        <div className="mt-7">{children}</div>
      </div>
      {/* La barre passe par-dessus, et la marge basse du `main` lui fait place :
          sans elle, le dernier élément de la liste resterait dessous. */}
      {barre}
    </main>
  )
}

/**
 * LE bouton. Un seul par écran, jamais deux du même poids : deux boutons de même
 * poids sont déjà une hésitation, et une hésitation par jour tue l'habitude.
 */
export function Principal({ children, ...rest }:
  React.ComponentProps<'button'>) {
  return (
    <motion.button whileTap={{ scale: 0.985 }} {...rest as object}
      className="w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px] font-medium
                 disabled:bg-brume disabled:text-doux transition-colors">
      {children}
    </motion.button>
  )
}

export function Secondaire({ children, ...rest }: React.ComponentProps<'button'>) {
  return (
    <button {...rest}
      className="w-full h-[50px] rounded-[18px] text-herbe text-[15px] hover:bg-brume/40
                 disabled:text-doux/60 transition-colors">
      {children}
    </button>
  )
}

/** Une surface, pas une boîte : on sépare par la matière, pas par un trait. */
/**
 * Le bouton qui ouvre l'appareil photo.
 *
 * Un `<input type="file">` nu affiche « Choose File / No file chosen », en
 * ANGLAIS, dans une application entièrement en français : le libellé du bouton
 * natif n'est pas modifiable, et aucun navigateur ne le traduit d'après la
 * langue du document. On masque donc l'input et on habille son `<label>`, qui
 * déclenche exactement le même geste — y compris `capture`, qui ouvre
 * l'appareil photo sur téléphone.
 */
export function BoutonPhoto({ texte, onFichier, disabled = false }: {
  texte: string
  onFichier: (f: File) => void
  disabled?: boolean
}) {
  return (
    <label className={`mt-7 w-full h-[58px] rounded-[18px] bg-herbe text-fond text-[17px]
                       font-medium grid place-items-center cursor-pointer transition-colors
                       ${disabled ? 'bg-brume text-doux cursor-default' : ''}`}>
      {texte}
      <input type="file" accept="image/*" capture="environment" className="sr-only"
             disabled={disabled}
             onChange={e => {
               const f = e.target.files?.[0]
               if (f) onFichier(f)
               // Reprendre DEUX FOIS la même photo doit marcher : sans cela, le
               // second choix du même fichier ne déclenche aucun `change`.
               e.target.value = ''
             }} />
    </label>
  )
}

export function Surface({ children, className = '' }:
  { children: ReactNode; className?: string }) {
  return <div className={`rounded-[22px] bg-surface p-[17px] ${className}`}>{children}</div>
}

/** Un grand chiffre et son unité. La forme que prend chaque mesure de l'app. */
export function Chiffre({ valeur, unite, taille = 30, couleur }:
  { valeur: string | number; unite?: string; taille?: number; couleur?: string }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="chiffre" style={{ fontSize: taille, color: couleur }}>{valeur}</span>
      {unite && <span className="text-[14px] text-doux">{unite}</span>}
    </span>
  )
}

export function Vide({ titre, texte }: { titre: string; texte?: string }) {
  return (
    <div className="py-14 text-center">
      <p className="titre text-[26px] text-encre">{titre}</p>
      {texte && <p className="mt-3 text-[15px] text-doux max-w-[34ch] mx-auto">{texte}</p>}
    </div>
  )
}

export function Attente() {
  return <p className="py-14 text-center text-doux text-[15px]">Un instant…</p>
}

export function Erreur({ de }: { de: unknown }) {
  if (!de) return null
  const texte = de instanceof Error ? de.message : String(de)
  return (
    <p role="alert" className="mt-4 text-[15px] text-groseille">{texte}</p>
  )
}

/** Minutes → « 1 h 52 » ou « 22 min ». Jamais « 112 minutes », que personne ne lit. */
export function duree(min: number): string {
  const m = Math.round(min)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, '0')}`
}

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

export function dateLongue(d: Date): string {
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

export function jourCourt(d: Date): string {
  return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()}`
}
