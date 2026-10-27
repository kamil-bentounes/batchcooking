/** Les pictos de l'épargne, en SVG inline : ils prennent la couleur du texte. */
const Trait = ({ d, taille = 20, children }: { d?: string; taille?: number; children?: React.ReactNode }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
    {d ? <path d={d} /> : children}
  </svg>
)
/** La tirelire : le fonds d'urgence. */
export const Tirelire = ({ taille }: { taille?: number }) => (
  <Trait taille={taille}>
    <path d="M5 11a7 7 0 0 1 7-6h3.5a4 4 0 0 1 3.5 2l1.5.5V12l-1.8 1v3.5H16V15h-5v1.5H7.5V14A6.5 6.5 0 0 1 5 11z" />
    <path d="M14 5V3M9.5 9.5h.1" />
  </Trait>
)
/** La valise : un projet. */
export const Valise = ({ taille }: { taille?: number }) => (
  <Trait taille={taille}>
    <rect x="4" y="7.5" width="16" height="12" rx="2.5" />
    <path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2M4 13h16" />
  </Trait>
)
export const Verser = () => <Trait d="M12 3v12M7 10l5 5 5-5M4 20h16" />
export const Retirer = () => <Trait d="M12 16V4M7 9l5-5 5 5M4 20h16" />
export const Cible = () => (
  <Trait><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r=".6" /></Trait>
)
export const Plus = () => <Trait d="M12 5v14M5 12h14" />
export const Information = () => (
  <Trait><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.1" /></Trait>
)
