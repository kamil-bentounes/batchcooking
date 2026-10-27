/**
 * Le haut de la carte sombre du hub : « Aujourd'hui » à gauche, la porte vers la cuisine à droite.
 *
 * Le hub répond aux questions du jour ; la cuisine, elle, a son propre accueil (`/cuisine-accueil`) avec le frigo,
 * les bilans et la barre du bas. Cette porte est l'unique entrée vers lui : un seul bouton nommé « Cuisine ».
 */
export function PorteCuisine({ va }: { va: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[13px] text-[#B9C7BD]">Aujourd’hui</span>
      <button type="button" onClick={() => va('/cuisine-accueil')}
              className="-my-2 -mr-2 inline-flex min-h-11 items-center gap-1 rounded-[12px] px-2 text-[14px] font-semibold text-fond">
        Cuisine<span aria-hidden="true" className="text-[18px] leading-none text-[#B9C7BD]">›</span>
      </button>
    </div>
  )
}
