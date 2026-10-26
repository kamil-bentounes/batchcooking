/**
 * La fiche d'un ingrédient : combien il en reste, où il est, jusqu'à quand il se garde — et « Fini », qui le
 * retire sans question (une ligne mangée en douce ne doit pas rester une semaine à l'écran).
 */
import { useState } from 'react'
import { Erreur } from '../coque.tsx'
import { LigneDate } from './ChampDate.tsx'
import { urgence } from '../../lib/peremption.ts'
import { lireQuantite, uniteAccordee } from '../../lib/quantite.ts'
import { jour } from '../../lib/semaine.ts'
import { jourAbrege } from '../../lib/ranger.ts'
import { maintenant } from '../../lib/horloge.ts'
import { useModifieIngredient } from '../../lib/donnees/frigo.ts'
import { useSupprimeStock } from '../../lib/donnees/barquettes.ts'
import type { Ligne } from '../../lib/supabase.ts'

type Lieu = 'frigo' | 'congelateur' | 'placard'
const NOM: Record<Lieu, string> = { frigo: 'Frigo', congelateur: 'Congélateur', placard: 'Placard' }

export function FicheIngredient({ item, surAnnonce }: { item: Ligne<'stock_item'>; surAnnonce: (m: string) => void }) {
  const modifie = useModifieIngredient()
  const supprime = useSupprimeStock()
  const [quantite, setQuantite] = useState(item.quantity === null ? '' : String(Number(item.quantity)).replace('.', ','))
  const [refus, setRefus] = useState<string | null>(null)
  const [dit, setDit] = useState<string | null>(null)
  /* Voir `FichePlat` : `mutateAsync().then`, car la fiche peut se démonter avant la réponse. */
  const fait = (p: Promise<unknown>, message: string) => { p.then(() => { setDit(message); surAnnonce(message) }, () => {}) }
  const lieu = item.location as Lieu
  const fin = item.expires_at ? new Date(item.expires_at) : null

  function enregistreLaQuantite() {
    const q = lireQuantite(quantite)
    if (q.etat === 'refus') { setRefus(q.message); return }
    setRefus(null)
    fait(modifie.mutateAsync({ id: item.id, quantity: q.etat === 'vide' ? null : q.valeur }), 'Quantité corrigée.')
  }

  return (
    <div>
      <p className="mx-1 text-[12px] font-bold">
        <span className={`rounded-full px-2.5 py-1.5 ${lieu === 'congelateur' ? 'bg-congel-fond text-congel-encre' : 'bg-frais-fond text-frais-encre'}`}>
          {lieu === 'placard' ? 'Au placard' : lieu === 'congelateur' ? 'Au congélateur' : 'Au frigo'}
        </span>
      </p>
      <h2 className="titre mx-1 mt-3 text-[25px] font-semibold leading-[1.12] [overflow-wrap:anywhere]">{item.label}</h2>

      <form className="mx-1 mt-4" onSubmit={e => { e.preventDefault(); enregistreLaQuantite() }}>
        <label htmlFor="quantite-ingredient" className="block text-[12px] text-doux">Ce qu’il en reste</label>
        <div className="mt-1 flex items-center gap-2.5">
          <input id="quantite-ingredient" inputMode="decimal" value={quantite}
                 onChange={e => setQuantite(e.target.value)} placeholder="pas de quantité"
                 className="min-h-11 w-32 rounded-xl bg-surface px-3 text-[16px] shadow-[inset_0_0_0_1px_var(--color-brume)]" />
          <span className="text-[15px] text-doux">
            {uniteAccordee(item.unit, (() => { const q = lireQuantite(quantite); return q.etat === 'ok' ? q.valeur : 0 })())}
          </span>
          <button type="submit" disabled={modifie.isPending}
                  className="ml-auto min-h-11 rounded-[14px] bg-herbe px-4 text-[15px] font-medium text-fond disabled:opacity-60">
            Enregistrer
          </button>
        </div>
        {refus && <p role="alert" className="mt-1.5 text-[13px] text-groseille">{refus}</p>}
      </form>

      <fieldset className="mx-1 mt-4">
        <legend className="text-[12px] text-doux">Où il est</legend>
        <div role="radiogroup" aria-label="Où il est" className="mt-1.5 flex flex-wrap gap-2">
          {(['frigo', 'congelateur', 'placard'] as Lieu[]).map(l => (
            <button key={l} type="button" role="radio" aria-checked={lieu === l}
                    onClick={() => lieu !== l && fait(modifie.mutateAsync({ id: item.id, location: l }),
                      `${item.label} : ${l === 'placard' ? 'au placard' : l === 'frigo' ? 'au frigo' : 'au congélateur'}.`)}
                    className={`inline-flex min-h-11 items-center rounded-full px-4 text-[14px] transition-colors
                      ${lieu === l ? 'bg-encre text-fond' : 'bg-piste'}`}>
              {NOM[l]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mx-1 mt-3 border-t border-piste">
        <LigneDate nom="À manger avant"
                   valeur={fin
                     ? `${jourAbrege(fin)}${item.location === 'placard' ? '' : `, ${urgence(fin, lieu === 'congelateur' ? 'congelateur' : 'frigo', maintenant()).mot}`}`
                     : 'pas de date'}
                   type="date" initiale={fin ? jour(fin) : jour(maintenant())}
                   surEnregistre={saisie => {
                     const d = /^\d{4}-\d{2}-\d{2}$/.test(saisie) ? new Date(`${saisie}T23:59:00`) : null
                     if (!d || Number.isNaN(d.getTime())) return 'Cette date ne se lit pas.'
                     fait(modifie.mutateAsync({ id: item.id, expires_at: d.toISOString() }), 'Date corrigée.')
                     return null
                   }} enCours={modifie.isPending} />
      </div>

      <Erreur de={modifie.error ?? supprime.error} />
      {dit && <p role="status" className="mx-1 mt-3 rounded-[14px] bg-frais-fond px-3.5 py-2.5 text-[14px] text-frais-encre">{dit}</p>}

      <div className="mx-1 mt-4 flex flex-col gap-2.5">
        <button type="button" disabled={supprime.isPending}
                onClick={() => fait(supprime.mutateAsync(item.id), `${item.label} : fini.`)}
                className="h-[52px] rounded-2xl bg-herbe text-[16px] font-semibold text-fond disabled:opacity-60">
          Fini
        </button>
        {item.expires_at && (
          <button type="button" disabled={modifie.isPending}
                  onClick={() => fait(modifie.mutateAsync({ id: item.id, expires_at: null }), 'Date retirée.')}
                  className="h-12 rounded-2xl bg-piste text-[15px] font-semibold">
            Retirer la date
          </button>
        )}
      </div>
    </div>
  )
}
