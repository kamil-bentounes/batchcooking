/**
 * Le cadre commun de Photo du frigo, du Ticket et de Peser (maquette `saisies-photo-ticket-peser.html`,
 * hors dépôt : `~/PERSO/sauvegardes-popote/maquettes-4-ecrans-2026-10-27/`).
 *
 * Un passage plus large que `Passage` (deux colonnes à partir de 900 px), des cartes, des puces, des cases à cocher
 * de 44 px, et les dessins : un cadre de frigo et un ticket SANS texte, parce qu'un ticket dessiné avec des prix
 * serait une donnée inventée.
 */
import type { ReactNode } from 'react'

/* ───── Pictos ───── */

const Trait = ({ d, taille = 20 }: { d: string; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    <path d={d} />
  </svg>
)

export const IcoFrigo = ({ taille }: { taille?: number }) =>
  <Trait taille={taille} d="M8 2.5h8a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3zM5 10.5h14M9 6v2M9 13.5v3" />
export const IcoCongel = ({ taille }: { taille?: number }) =>
  <Trait taille={taille} d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />
export const IcoPlacard = ({ taille }: { taille?: number }) =>
  <Trait taille={taille} d="M3.5 8 12 3.5 20.5 8v9L12 21.5 3.5 17zM3.5 8 12 12.5 20.5 8M12 12.5v9" />
export const IcoAppareil = ({ taille = 26 }: { taille?: number }) =>
  <Trait taille={taille} d="M4 8h3l2-3h6l2 3h3v11H4zM12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z" />
export const IcoRecu = ({ taille = 26 }: { taille?: number }) =>
  <Trait taille={taille} d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6" />
export const IcoAmpoule = ({ taille = 22 }: { taille?: number }) =>
  <Trait taille={taille} d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" />
export const IcoAlerte = ({ taille = 18 }: { taille?: number }) =>
  <Trait taille={taille} d="M12 4 2.8 19.5h18.4zM12 10v4.5M12 17.2v.1" />
export const IcoCoche = ({ taille = 18 }: { taille?: number }) => <Trait taille={taille} d="M5 12.5l4.5 4.5L19 7.5" />
export const IcoBalance = ({ taille = 24 }: { taille?: number }) =>
  <Trait taille={taille} d="M12 4v16M7 20h10M5 8h14M5 8l-3 7a3.5 3.5 0 0 0 6 0zM19 8l-3 7a3.5 3.5 0 0 0 6 0z" />

/* ───── Le passage, les colonnes, les cartes ───── */

/** Un passage : une seule sortie en haut à gauche, et jusqu'à 1180 px de large, en deux colonnes à partir de 900. */
export function PassageLarge({ retour, retourTexte = 'Accueil', children }:
  { retour: () => void; retourTexte?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh px-4 pt-14 pb-16 max-[360px]:px-3 min-[900px]:px-8 min-[900px]:pb-20">
      <div className="mx-auto w-full max-w-[1180px]">
        <button type="button" onClick={retour}
                className="-mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full pr-3.5 text-[15px] font-semibold text-doux hover:text-encre">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.5 5.5 8 12l6.5 6.5" /></svg>
          {retourTexte}
        </button>
        {children}
      </div>
    </main>
  )
}

export function Titre({ children, sous }: { children: ReactNode; sous?: ReactNode }) {
  return (
    <>
      <h1 className="titre-fort mt-3.5 text-[34px] leading-[1.05] max-[360px]:text-[30px] min-[900px]:mt-5 min-[900px]:text-[46px]">
        {children}
      </h1>
      {sous && <p className="mt-2 max-w-[46ch] text-[15.5px] leading-[1.45] text-doux">{sous}</p>}
    </>
  )
}

/** Deux colonnes à 900 px et plus ; en dessous, les deux s'empilent dans l'ordre du document. */
export function Deux({ rapport, children }: { rapport: '1-1' | '5-7'; children: ReactNode }) {
  return (
    <div className={`mt-[18px] grid grid-cols-[minmax(0,1fr)] gap-3 min-[900px]:mt-[26px] min-[900px]:items-start
                     min-[900px]:gap-5 ${rapport === '1-1'
                       ? 'min-[900px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'
                       : 'min-[900px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'}`}>
      {children}
    </div>
  )
}

export function Colonne({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-3 min-[900px]:gap-5 ${className}`}>
      {children}
    </div>
  )
}

export function Carte({ children, className = '', ...rest }:
  { children: ReactNode; className?: string } & React.ComponentProps<'section'>) {
  return (
    <section {...rest}
             className={`min-w-0 rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:rounded-[26px] min-[900px]:p-[22px] ${className}`}>
      {children}
    </section>
  )
}

export function EnteteDeCarte({ titre, droite }: { titre: ReactNode; droite?: ReactNode }) {
  return (
    <div className="mb-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h2 className="titre text-[20px] font-semibold">{titre}</h2>
      {droite}
    </div>
  )
}

/** Le conseil : un picto sable, une phrase. */
export function Astuce({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <Carte className={`flex items-start gap-3 ${className}`}>
      <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-sable text-ocre"><IcoAmpoule /></span>
      <p className="text-[14.5px] leading-[1.45] text-doux [&_b]:font-semibold [&_b]:text-encre">{children}</p>
    </Carte>
  )
}

type Ton = 'piste' | 'frais' | 'congel' | 'sable'
const TONS: Record<Ton, string> = {
  piste: 'bg-piste text-encre',
  frais: 'bg-frais-fond text-frais-encre',
  congel: 'bg-congel-fond text-congel-encre',
  sable: 'bg-sable text-ocre',
}
export function Puce({ ton = 'piste', children }: { ton?: Ton; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[13px] font-semibold ${TONS[ton]}`}>
      {children}
    </span>
  )
}

/* ───── Les boutons ───── */

export function BoutonDoux({ children, ...rest }: React.ComponentProps<'button'>) {
  return (
    <button type="button" {...rest}
            className="min-h-[50px] w-full rounded-[18px] bg-piste px-[18px] text-[16px] font-semibold text-encre
                       hover:bg-brume disabled:text-doux">
      {children}
    </button>
  )
}

export function BoutonContour({ children, ...rest }: React.ComponentProps<'button'>) {
  return (
    <button type="button" {...rest}
            className="min-h-12 w-full rounded-[16px] bg-surface px-[18px] text-[16px] font-semibold text-herbe
                       shadow-[inset_0_0_0_1.5px_var(--color-herbe)] hover:bg-fond">
      {children}
    </button>
  )
}

/** La case à cocher : 44 px à toucher, 24 à voir. Le nom accessible est celui de la ligne. */
export function CaseACocher({ coche, nom, surBascule }:
  { coche: boolean; nom: string; surBascule: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={coche} aria-label={nom} onClick={surBascule}
            className="grid size-11 shrink-0 place-items-center">
      <span className={`grid size-6 place-items-center rounded-lg border-2 ${coche ? 'border-herbe bg-herbe text-fond' : 'border-doux'}`}>
        {coche && <IcoCoche taille={14} />}
      </span>
    </button>
  )
}

/** Une pastille de choix : l'enseigne, un rattachement. */
export function Pilule({ choisie, children, surAppui }:
  { choisie: boolean; children: ReactNode; surAppui: () => void }) {
  return (
    <button type="button" aria-pressed={choisie} onClick={surAppui}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[15px] font-medium
                        ${choisie ? 'bg-herbe text-fond' : 'bg-piste text-encre hover:bg-brume'}`}>
      {choisie && <IcoCoche taille={16} />}
      {children}
    </button>
  )
}

/* ───── L'attente et l'échec d'une lecture ───── */

export function Lecture({ texte }: { texte: string }) {
  return (
    <Carte className="grid gap-2.5">
      <p className="text-[16px] font-semibold">{texte}</p>
      {/* La barre pulse tant que le modèle lit ; `motion-safe` la fige pour qui l'a demandé. */}
      <div className="h-2 overflow-hidden rounded-[5px] bg-piste" aria-hidden="true">
        <div className="h-full w-[55%] rounded-[5px] bg-safran motion-safe:animate-pulse" />
      </div>
    </Carte>
  )
}

export function Echec({ texte, surReprise }: { texte: string; surReprise: () => void }) {
  return (
    <Carte className="grid gap-2.5">
      <h2 className="titre text-[19px] font-semibold">Je n’ai rien su lire</h2>
      <p className="text-[13.5px] leading-[1.4] text-doux">{texte}</p>
      <BoutonContour onClick={surReprise}>Reprendre une photo</BoutonContour>
    </Carte>
  )
}

/* ───── Les dessins ───── */

/** Le cadre à viser : quatre coins safran sur un fond sombre. La photo prise vient prendre sa place. */
export function Viseur({ photo, alt, etiquette, coins = true, children }:
  { photo?: string | null; alt?: string; etiquette?: string; coins?: boolean; children?: ReactNode }) {
  const coin = 'pointer-events-none absolute size-[34px] border-[3px] border-safran'
  return (
    <div className={`relative overflow-hidden rounded-[26px] bg-[#26302B] shadow-carte ${photo ? '' : 'aspect-[4/3]'}`}>
      {photo
        ? <img src={photo} alt={alt ?? ''} className="block max-h-[min(560px,75dvh)] w-full object-contain" />
        : children}
      {coins && (
        <>
          <i aria-hidden="true" className={`${coin} left-3.5 top-3.5 rounded-tl-[10px] border-b-0 border-r-0`} />
          <i aria-hidden="true" className={`${coin} right-3.5 top-3.5 rounded-tr-[10px] border-b-0 border-l-0`} />
          <i aria-hidden="true" className={`${coin} bottom-3.5 left-3.5 rounded-bl-[10px] border-r-0 border-t-0`} />
          <i aria-hidden="true" className={`${coin} bottom-3.5 right-3.5 rounded-br-[10px] border-l-0 border-t-0`} />
        </>
      )}
      {etiquette && !photo && (
        <span className="absolute bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-safran px-2.5 py-1 text-[12.5px] font-bold text-encre">
          {etiquette}
        </span>
      )}
    </div>
  )
}

/** Un frigo dessiné : trois clayettes, des pots. Ce n'est la photo de personne. */
export function SceneFrigo() {
  return (
    <svg className="absolute inset-0 size-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="scene-frigo-fond" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#EAF0F1" /><stop offset="1" stopColor="#C9D6D9" />
        </linearGradient>
      </defs>
      <rect width="400" height="300" fill="url(#scene-frigo-fond)" />
      <rect x="0" y="108" width="400" height="7" fill="#AEC0C5" /><rect x="0" y="206" width="400" height="7" fill="#AEC0C5" />
      <rect x="0" y="288" width="400" height="12" fill="#B7C7CB" />
      <g>
        {[22, 66, 110, 154].map(x => (
          <g key={x}><rect x={x} y="62" width="40" height="46" rx="6" fill="#FFFFFF" /><rect x={x} y="62" width="40" height="11" rx="4" fill="#3B82C4" /></g>
        ))}
      </g>
      <g>
        {[236, 284].map(x => (
          <g key={x}><rect x={x} y="58" width="42" height="50" rx="6" fill="#F6EAD2" /><rect x={x} y="58" width="42" height="12" rx="4" fill="#E8A33D" /></g>
        ))}
      </g>
      <g><rect x="338" y="40" width="38" height="68" rx="8" fill="#F4F7F8" /><rect x="342" y="32" width="30" height="12" rx="4" fill="#2F5D45" /></g>
      <g>
        <rect x="30" y="160" width="120" height="46" rx="10" fill="#E9D9B7" />
        {[[55, 178], [85, 178], [115, 178], [55, 196], [85, 196], [115, 196]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="9" fill="#F8F1E2" />
        ))}
      </g>
      <g><rect x="176" y="172" width="64" height="34" rx="6" fill="#F3D250" /><rect x="180" y="150" width="56" height="26" rx="5" fill="#FBFCFA" /></g>
      <g>
        <rect x="262" y="166" width="82" height="40" rx="8" fill="#C94B3A" />
        {[[282, 182], [306, 186], [328, 182]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="#E46B55" />)}
      </g>
      <g><ellipse cx="42" cy="258" rx="20" ry="15" fill="#F2D44B" /><ellipse cx="76" cy="262" rx="20" ry="15" fill="#F5DD6A" /></g>
      <g><rect x="130" y="240" width="64" height="48" rx="8" fill="#E8F1EA" /><rect x="130" y="240" width="64" height="12" rx="4" fill="#7FB08E" /></g>
      <g>
        <rect x="230" y="236" width="150" height="52" rx="10" fill="#E9EFEA" />
        {[238, 284, 330].map(x => <rect key={x} x={x} y="246" width="40" height="34" rx="6" fill="#D6C9B0" />)}
      </g>
    </svg>
  )
}

/** Un ticket dessiné : des barres à la place des lignes. Aucun produit ni prix, rien qui ressemble à une lecture. */
export function TicketDessine() {
  const lignes = [78, 64, 70, 58, 74, 62, 68]
  const barre = 'h-2.5 rounded bg-[#C9CCC4]'
  return (
    <div aria-hidden="true" className="py-[18px]">
      <div className="mx-auto max-w-[330px] rotate-[-1.2deg] rounded-md bg-[#FAFAF6] px-[18px] pb-[22px] pt-[18px] shadow-[0_14px_34px_rgba(28,43,35,.2)]">
        <div className="grid justify-items-center gap-1.5">
          <div className={`${barre} w-[38%]`} /><div className={`${barre} w-[52%]`} />
        </div>
        <hr className="my-3 border-0 border-t-[1.5px] border-dashed border-[#888]" />
        <div className="grid gap-2.5">
          {lignes.map((l, i) => (
            <div key={i} className="flex items-center justify-between gap-3">
              <div className={barre} style={{ width: `${l}%` }} /><div className={`${barre} w-[11%]`} />
            </div>
          ))}
        </div>
        <hr className="my-3 border-0 border-t-[1.5px] border-dashed border-[#888]" />
        <div className="flex items-center justify-between gap-3">
          <div className={`${barre} w-[30%] !bg-[#8E918A]`} /><div className={`${barre} w-[14%] !bg-[#8E918A]`} />
        </div>
      </div>
    </div>
  )
}

/** Le ticket photographié, dans le cadre du papier. */
export function TicketPhotographie({ src }: { src: string }) {
  return (
    <div className="py-1.5">
      <img src={src} alt="Le ticket photographié"
           className="mx-auto block h-auto max-h-[560px] w-full max-w-[330px] rounded-md bg-[#FAFAF6] object-contain shadow-[0_14px_34px_rgba(28,43,35,.2)]" />
    </div>
  )
}

/** Une balance dessinée, pour le haut de la carte sombre. Son écran reste vide : aucun poids n'y est écrit. */
export function BalanceDessinee() {
  return (
    <svg className="mx-auto mt-1.5 block w-full max-w-[300px] max-[899px]:hidden" viewBox="0 0 300 190" aria-hidden="true">
      <rect x="30" y="118" width="240" height="56" rx="22" fill="#FBFCFA" opacity=".12" />
      <rect x="44" y="132" width="212" height="30" rx="14" fill="#FBFCFA" opacity=".9" />
      <rect x="118" y="138" width="64" height="18" rx="6" fill="#1C2B23" />
      <rect x="134" y="145" width="32" height="4" rx="2" fill="#E8A33D" />
      <path d="M70 118c0-30 20-44 80-44s80 14 80 44z" fill="#E8A33D" />
      <path d="M106 96c10-34 34-56 70-52 10 22 6 42-6 52z" fill="#2F5D45" />
      <path d="M158 94c-2-22 8-42 30-54 10 22 4 44-6 54z" fill="#4F8A6A" />
    </svg>
  )
}
