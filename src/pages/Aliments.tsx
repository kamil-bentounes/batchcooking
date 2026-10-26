/**
 * Nos aliments (maquette `Aliment.dc.html`, hors dépôt : `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/`).
 *
 * « Là je vois Yaourt mais les calories et le protéine ne vont pas du tout. On ne peut pas enregistrer nos propres
 * Yaourt ? » Ici, le foyer range ce qu'il mange avec les VRAIES valeurs de l'étiquette — à la main, en photographiant
 * le tableau nutritionnel, ou par son code-barres — et la semaine les propose avant les repères, en un geste : un pot.
 *
 * On y arrive depuis les Réglages, et depuis la feuille de choix de la semaine (`?depuis=semaine&jour=…&repas=…` : le
 * retour rouvre la feuille là où on l'a laissée ; `?nouveau=1` ouvre directement la création).
 */
import { useMemo, useState } from 'react'
import { Attente, Erreur, Passage, Principal } from '../ui/coque.tsx'
import { Formulaire } from '../ui/aliments/Formulaire.tsx'
import { Pot, Provenance } from '../ui/aliments/Pictos.tsx'
import { useAliments } from '../lib/donnees/aliments.ts'
import type { Aliment } from '../lib/donnees/aliments.ts'
import { ecrit, uniteEtPoids, valeursDeLUnite } from '../lib/aliments/calcul.ts'
import type { Source } from '../lib/aliments/brouillon.ts'
import { ouvreLaCreation, retourDe } from '../lib/aliments/retour.ts'

function Carte({ a, surOuvre }: { a: Aliment; surOuvre: () => void }) {
  const v = valeursDeLUnite(a)
  return (
    <li>
      <button type="button" onClick={surOuvre} aria-label={`Modifier ${a.label}`}
              className="flex min-h-[76px] w-full items-center gap-3 rounded-[18px] bg-surface px-3.5 py-3 text-left"
              style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
        <Pot largeur={28} />
        <span className="min-w-0 flex-1">
          <span className="titre block text-[19px] font-semibold leading-[1.15] [overflow-wrap:anywhere]">{a.label}</span>
          <span className="mt-0.5 block text-[12px] text-doux">{uniteEtPoids(a)}</span>
          <Provenance source={(a.source as Source)} />
        </span>
        <span className="shrink-0 text-right leading-tight">
          <span className="block"><span className="chiffre text-[24px] font-semibold">{ecrit(v.kcal)}</span><span className="text-[12px] text-doux"> kcal</span></span>
          <span className="block"><span className="chiffre text-[17px] font-semibold text-herbe">{ecrit(v.protein)}</span><span className="text-[12px] text-doux"> g prot.</span></span>
        </span>
      </button>
    </li>
  )
}

export function Aliments({ va }: { va: (v: string) => void }) {
  const retour = useMemo(() => retourDe(window.location.search), [])
  const { data: aliments = [], isPending, error } = useAliments()
  /** `null` : la liste ; `'nouveau'` : la création ; sinon l'identifiant de l'aliment qu'on modifie. */
  const [edition, setEdition] = useState<null | 'nouveau' | string>(
    () => (ouvreLaCreation(window.location.search) ? 'nouveau' : null))
  const [message, setMessage] = useState('')

  if (edition !== null) {
    const a = edition === 'nouveau' ? undefined : aliments.find(x => x.id === edition)
    /* Un aliment retiré entre-temps (par l'autre téléphone) n'a plus de formulaire : on retombe sur la liste. */
    if (edition === 'nouveau' || a) {
      return <Formulaire key={edition} aliment={a} surRetour={() => setEdition(null)}
                         surFini={m => { setMessage(m); setEdition(null); window.scrollTo(0, 0) }} />
    }
    if (isPending) return <Passage retour={() => setEdition(null)} retourTexte="Nos aliments"><Attente /></Passage>
  }

  return (
    <Passage retour={() => va(retour.vers)} retourTexte={retour.texte}>
      <h1 className="titre text-[34px] font-semibold leading-none">Nos aliments</h1>
      <p className="mt-2 text-[14px] text-doux">
        Ce que vous mangez, avec ses vrais chiffres. La semaine les propose avant les repères, en un geste.
      </p>

      <div role="status" aria-live="polite">
        {message && <p className="mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{message}</p>}
      </div>

      <div className="mt-4"><Principal type="button" onClick={() => { setMessage(''); setEdition('nouveau') }}>Ajouter un aliment</Principal></div>
      <Erreur de={error} />

      {isPending ? <Attente /> : aliments.length === 0 ? (
        <div className="mt-8 flex flex-col items-center text-center">
          <Pot largeur={44} />
          <p className="titre mt-4 text-[24px] font-semibold">Rien pour l’instant</p>
          <p className="mt-2 max-w-[34ch] text-[15px] text-doux">
            Un yaourt, un skyr, un pain : ce que vous mangez souvent, avec les chiffres de l’étiquette. Photo du tableau, code-barres, ou à la main.
          </p>
        </div>
      ) : (
        <ul className="mt-5 flex flex-col gap-2.5" aria-label="Nos aliments">
          {aliments.map(a => <Carte key={a.id} a={a} surOuvre={() => { setMessage(''); setEdition(a.id) }} />)}
        </ul>
      )}
    </Passage>
  )
}
