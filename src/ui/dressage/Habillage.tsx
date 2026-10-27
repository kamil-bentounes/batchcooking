/**
 * L'habillage du dressage et de « On range », refait le 27/10/2026 d'après la maquette `dressage.html`.
 *
 * Une page claire (la sortie à gauche, l'aide et soi à droite), une carte encre qui porte le repère
 * d'étapes « 1 Dresser · 2 Ranger » et le chiffre qui compte, des cartes de recette avec leur photo.
 * Au téléphone tout s'empile ; à partir de 900 px la carte encre et son bouton restent à gauche, les
 * recettes à droite (`Colonnes`).
 *
 * Rien ici ne calcule : les parts, les grammes et le frigo viennent de `lib/nutrition/portions.ts` et
 * de `lib/ranger.ts`.
 */
import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { BoutonAide } from '../Aide.tsx'
import { initialeDe, useFoyer } from '../../lib/donnees/foyer.ts'
import { Photo } from '../recettes/Photo.tsx'

/* ── Les pictos, tracés de la maquette ─────────────────────────────────────── */
const TRACES = {
  retour: <path d="M14.5 5.5 8 12l6.5 6.5" />,
  gens: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14c2.5 0 4.5 2 4.5 5" /></>,
  etincelle: <><path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" /><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  alerte: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  frigo: <><rect x="5" y="2.5" width="14" height="19" rx="3" /><path d="M5 10.5h14M9 6v2M9 13.5v3" /></>,
  flocon: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  horloge: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  coche: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></>,
  bol: <><path d="M3 10h18l-1.8 8.2a2 2 0 0 1-2 1.6H6.8a2 2 0 0 1-2-1.6z" /><path d="M5 10V8.5A1.5 1.5 0 0 1 6.5 7h11A1.5 1.5 0 0 1 19 8.5V10" /></>,
  moins: <path d="M5 12h14" />,
  plus: <path d="M12 5v14M5 12h14" />,
}

export type NomPicto = keyof typeof TRACES

export function Picto({ nom, taille = 20, className = '' }: { nom: NomPicto; taille?: number; className?: string }) {
  return (
    <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`block shrink-0 ${className}`}>
      {TRACES[nom]}
    </svg>
  )
}

/* ── La page ───────────────────────────────────────────────────────────────── */

/**
 * La sortie à gauche (« Accueil » ou « Dressage »), l'aide et son profil à droite. `userId` donne
 * l'initiale de l'avatar ; sans lui (jamais en pratique), « ? » tient lieu d'initiale.
 */
export function Page({ retour, retourTexte, va, userId, children }: {
  retour: () => void; retourTexte: string; va: (v: string) => void; userId?: string; children: ReactNode
}) {
  const { data: foyer } = useFoyer()
  const moi = foyer?.membres.find(m => m.id === userId)
  return (
    <main className="min-h-dvh px-4 pb-16 max-[360px]:px-3 min-[900px]:px-8">
      <div className="mx-auto w-full max-w-[1180px]">
        <header className="flex h-[54px] items-center justify-between gap-2.5 pt-2 min-[900px]:h-[62px]">
          <button type="button" onClick={retour}
                  className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full pl-2 pr-3.5 text-[15px] font-semibold text-doux hover:text-encre">
            <Picto nom="retour" taille={20} />
            {retourTexte}
          </button>
          <span className="flex items-center">
            <BoutonAide />
            <button type="button" onClick={() => va('/profil')} aria-label="Mon profil"
                    className="-mr-2 grid h-11 w-11 place-items-center">
              <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-herbe text-[13px] font-bold text-fond">
                {initialeDe(moi?.display_name)}
              </span>
            </button>
          </span>
        </header>
        <div className="mt-2 min-[900px]:mt-5">{children}</div>
      </div>
    </main>
  )
}

/**
 * Les colonnes. Au téléphone : le résumé, l'avis éventuel, les recettes, puis le bouton, dans l'ordre du DOM.
 * À partir de 900 px : le résumé, le bouton et l'avis à gauche, les recettes à droite sur toute la hauteur.
 * Un seul bouton dans le DOM (un test, un lecteur d'écran n'en voient jamais deux).
 */
export function Colonnes({ resume, avis, recettes, action }: {
  resume: ReactNode; avis?: ReactNode; recettes: ReactNode; action: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 items-start gap-3
                    min-[900px]:grid-cols-[4fr_8fr] min-[900px]:grid-rows-[auto_auto_1fr] min-[900px]:gap-x-5 min-[900px]:gap-y-0">
      <div className="min-[900px]:col-start-1 min-[900px]:row-start-1">{resume}</div>
      {avis && <div className="flex flex-col gap-3 min-[900px]:col-start-1 min-[900px]:row-start-3 min-[900px]:mt-5">{avis}</div>}
      <div className="min-w-0 min-[900px]:col-start-2 min-[900px]:row-span-3 min-[900px]:row-start-1">{recettes}</div>
      <div className="min-[900px]:col-start-1 min-[900px]:row-start-2">{action}</div>
    </div>
  )
}

/** La carte encre : le repère d'étapes, puis ce qu'on y met. À partir de 900 px elle se prolonge dans son bouton. */
export function Resume({ etape, children }: { etape: 'dresser' | 'ranger'; children: ReactNode }) {
  return (
    <section className="sur-encre rounded-[26px] bg-encre p-[18px] text-surface
                        min-[900px]:rounded-[28px] min-[900px]:mb-[-1px] min-[900px]:rounded-b-none min-[900px]:p-6 min-[900px]:pb-0">
      <Etapes etape={etape} />
      {children}
    </section>
  )
}

function Etapes({ etape }: { etape: 'dresser' | 'ranger' }) {
  const une = (n: 1 | 2, texte: string, cle: 'dresser' | 'ranger') => {
    const on = etape === cle
    return (
      <li aria-current={on ? 'step' : undefined}
          className={`inline-flex min-h-[34px] items-center gap-2 rounded-full pl-1.5 pr-3.5 text-[13.5px] font-semibold
                      ${on ? 'bg-safran text-encre' : 'bg-white/10 text-surface/70'}`}>
        <b aria-hidden="true"
           className={`grid h-6 w-6 place-items-center rounded-full text-[13px] ${on ? 'bg-encre text-safran' : 'bg-white/15'}`}>{n}</b>
        {texte}
      </li>
    )
  }
  return (
    <ol aria-label="Étapes du dressage" className="flex flex-wrap gap-2">
      {une(1, 'Dresser', 'dresser')}
      {une(2, 'Ranger', 'ranger')}
    </ol>
  )
}

/** Le bouton et sa phrase. Vert sur la page claire ; safran sur la carte encre dès 900 px. */
export function Action({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="sur-encre-large mt-1 min-[900px]:mt-0 min-[900px]:rounded-b-[28px] min-[900px]:bg-encre min-[900px]:px-6 min-[900px]:pb-6 min-[900px]:pt-4">
      {children}
      {note && <p className="mt-2.5 px-1 text-center text-[13.5px] leading-snug text-doux min-[900px]:text-surface/65">{note}</p>}
    </div>
  )
}

export function BoutonAction({ children, ...rest }: React.ComponentProps<'button'>) {
  return (
    <motion.button whileTap={{ scale: 0.985 }} {...rest as object}
      className="min-h-[54px] w-full rounded-[18px] bg-herbe px-[18px] text-[17px] font-semibold text-fond
                 transition-colors disabled:bg-brume disabled:text-doux
                 min-[900px]:bg-safran min-[900px]:text-encre min-[900px]:disabled:bg-surface/15 min-[900px]:disabled:text-surface/70">
      {children}
    </motion.button>
  )
}

/** Le geste d'à côté (« Voir le frigo ») : du texte, vert sur la page claire, clair sur la carte encre. */
export function BoutonDiscret({ children, ...rest }: React.ComponentProps<'button'>) {
  return (
    <button {...rest}
      className="mt-2 min-h-12 w-full rounded-[18px] text-[15px] font-semibold text-herbe hover:bg-brume/40
                 min-[900px]:text-surface min-[900px]:hover:bg-white/10">
      {children}
    </button>
  )
}

/* ── Les cartes ────────────────────────────────────────────────────────────── */

export function Carte({ children, label, className = '' }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <section aria-label={label}
             className={`min-w-0 rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:rounded-[26px] min-[900px]:p-[22px] ${className}`}>
      {children}
    </section>
  )
}

/** La photo de la recette, ou la pastille neutre de Popote. */
export function Vignette({ photo, taille = 64 }: { photo: string | null | undefined; taille?: 56 | 64 }) {
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden bg-piste
                      ${taille === 64 ? 'size-16 rounded-[18px] max-[360px]:size-14' : 'size-14 rounded-2xl'}`}>
      <Photo url={photo ?? null} glyphe={taille === 64 ? 30 : 26} className="size-full" />
    </span>
  )
}

type Ton = 'sable' | 'frais' | 'erreur'
const TONS: Record<Ton, string> = {
  sable: 'bg-sable text-encre [&>svg]:text-ocre',
  frais: 'bg-frais-fond text-frais-encre [&>svg]:text-frais-encre',
  erreur: 'bg-erreur-fond text-erreur-encre [&>svg]:text-groseille',
}

/** Un avis : un picto et une phrase, sur sable (ça demande ses mains), vert (c'est bon) ou rouge (c'est bloqué). */
export function Avis({ ton, picto, role, children, className = '' }: {
  ton: Ton; picto: NomPicto; role?: 'status' | 'alert'; children: ReactNode; className?: string
}) {
  return (
    <div role={role} className={`flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-[14.5px] leading-[1.4] ${TONS[ton]} ${className}`}>
      <Picto nom={picto} taille={20} className="mt-px" />
      <span className="min-w-0">{children}</span>
    </div>
  )
}

/** Une carte seule, au milieu de la page : « Rien à dresser », « Aucune session ». */
export function EtatVide({ titre, texte }: { titre: string; texte?: string }) {
  return (
    <Carte className="mx-auto mt-2 max-w-[560px]">
      <span className="grid size-14 place-items-center rounded-[18px] bg-piste text-doux">
        <Picto nom="bol" taille={28} />
      </span>
      <h1 className="titre mt-3 text-[22px] font-semibold">{titre}</h1>
      {texte && <p className="mt-1.5 text-[14.5px] leading-[1.45] text-doux">{texte}</p>}
    </Carte>
  )
}

/** Le chargement, dans l'habillage. */
export function Chargement() {
  return <p role="status" className="py-14 text-center text-[15px] text-doux">Un instant…</p>
}

/** La lecture a échoué : on le dit, et on propose de recommencer. */
export function EnPanne({ reessayer }: { reessayer: () => void }) {
  return (
    <Carte className="mx-auto mt-2 max-w-[560px]">
      <Avis ton="erreur" picto="alerte" role="alert">
        Je n’ai pas pu lire la session. Vérifie ta connexion, puis réessaie.
      </Avis>
      <button type="button" onClick={reessayer}
              className="mt-3 min-h-12 w-full rounded-2xl bg-herbe px-[18px] text-[16px] font-semibold text-fond">
        Réessayer
      </button>
    </Carte>
  )
}

/** L'initiale d'une personne, en pastille : la première en herbe, la deuxième en safran, puis le froid et l'ocre. */
const PASTILLES = ['bg-herbe text-fond', 'bg-safran text-encre', 'bg-congel text-white', 'bg-ocre text-white']
export function Pastille({ nom, rang }: { nom: string; rang: number }) {
  return (
    <span aria-hidden="true"
          className={`grid size-[30px] shrink-0 place-items-center rounded-full text-[13px] font-bold ${PASTILLES[rang % PASTILLES.length]}`}>
      {initialeDe(nom)}
    </span>
  )
}
