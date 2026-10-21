/** Les petites icônes du budget, en SVG inline : elles prennent la couleur du texte. */
const Trait = ({ d, taille = 20 }: { d: string; taille?: number }) => (
  <svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
)
export const Corbeille = () =>
  <Trait d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
export const Croix = () => <Trait d="M6 6l12 12M18 6L6 18" />
export const Chevron = ({ ouvert }: { ouvert: boolean }) =>
  <Trait d={ouvert ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
export const Info = () => <Trait d="M12 8h.01M11 12h1v5h1M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" />
