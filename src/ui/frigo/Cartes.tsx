/**
 * Les cartes de l'intérieur : un plat dans son bac de verre (frigo), un plat givré dans son panier
 * (congélateur), un ingrédient posé sur l'étagère. Chacune est un bouton qui ouvre la fiche.
 */
import { PlatImage } from './PlatImage.tsx'
import type { Groupe, Quand } from '../../lib/frigo.ts'
import { ariaDeCarte } from '../../lib/frigo.ts'
import { ecritQuantite } from '../../lib/quantite.ts'
import { urgence } from '../../lib/peremption.ts'
import type { Ligne } from '../../lib/supabase.ts'

/** Un plat au frigo : un bac de verre, une bande verte pour le couvercle, le nombre de parts en pastille. */
export function CartePlat({ groupe, photo, quand, fond, surOuvre }: {
  groupe: Groupe; photo: string | null; quand: Quand; fond: string; surOuvre: () => void
}) {
  return (
    <button type="button" onClick={surOuvre} aria-label={ariaDeCarte(groupe, quand)} data-plat={groupe.cle}
            className="flex flex-col gap-[7px] p-0 text-left">
      <span className="relative block h-[112px] w-full">
        <span aria-hidden="true" className="absolute inset-x-1.5 -top-[7px] bottom-[7px] rounded-[14px]"
              style={{ background: 'rgba(255, 255, 255, 0.7)', boxShadow: '0 0 0 1.5px rgba(160, 180, 172, 0.7)' }} />
        <span className="absolute inset-0 overflow-hidden rounded-[14px]"
              style={{ background: fond, boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.95), 0 8px 16px rgba(28, 43, 35, 0.16)' }}>
          <PlatImage url={photo} />
          <span aria-hidden="true" className="absolute inset-x-0 top-0 h-[9px]" style={{ background: 'rgba(47, 93, 69, 0.92)' }} />
        </span>
        <span aria-hidden="true"
              className="absolute -right-1.5 -top-3 flex h-8 min-w-8 items-center justify-center rounded-2xl bg-encre px-[7px] text-[14px] font-bold text-fond shadow-[0_2px_6px_rgba(0,0,0,0.2)]">
          ×{groupe.parts.length}
        </span>
      </span>
      <span className="text-[14px] font-bold leading-[1.2] [overflow-wrap:anywhere]">{groupe.nom}</span>
      <span className="-mt-[3px] text-[12px] font-semibold" style={{ color: quand.encre }}>{quand.texte}</span>
    </button>
  )
}

/** Un plat au congélateur : posé dans un panier de fil, la photo givrée. */
export function CarteCongelee({ groupe, photo, quand, fond, surOuvre }: {
  groupe: Groupe; photo: string | null; quand: Quand; fond: string; surOuvre: () => void
}) {
  return (
    <div className="rounded-2xl p-3.5"
         style={{
           background: 'repeating-linear-gradient(90deg, rgba(150, 175, 186, 0.28) 0 1.5px, transparent 1.5px 12px), rgba(255, 255, 255, 0.45)',
           boxShadow: 'inset 0 0 0 2px #B9CBD3',
         }}>
      <button type="button" onClick={surOuvre} aria-label={ariaDeCarte(groupe, quand)} data-plat={groupe.cle}
              className="flex w-full items-center gap-3.5 p-0 text-left">
        <span className="relative block h-24 w-[132px] shrink-0">
          <span className="absolute inset-0 overflow-hidden rounded-xl text-congel-encre"
                style={{ background: fond, boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.95), 0 6px 14px rgba(44, 74, 88, 0.18)' }}>
            <PlatImage url={photo} filtre="saturate(0.75)" glyphe={24} />
            <span aria-hidden="true" className="absolute inset-0"
                  style={{ background: 'linear-gradient(160deg, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0.05) 45%, rgba(220, 235, 242, 0.45) 100%)' }} />
          </span>
          <span aria-hidden="true"
                className="absolute -right-2 -top-2.5 flex h-8 min-w-8 items-center justify-center rounded-2xl bg-encre px-[7px] text-[14px] font-bold text-fond">
            ×{groupe.parts.length}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-[1.25] [overflow-wrap:anywhere]">{groupe.nom}</span>
          <span className="mt-1 block text-[13px] font-semibold leading-[1.35]" style={{ color: quand.encre }}>{quand.texte}</span>
        </span>
      </button>
    </div>
  )
}

/** Le petit pot : un yaourt, une conserve — ce qui n'a pas de photo. */
function Pot() {
  return (
    <span aria-hidden="true" className="block h-[22px] w-[18px] shrink-0 rounded-[3px_3px_8px_8px] bg-white"
          style={{ boxShadow: 'inset 0 0 0 1.5px #B7C3BA', borderTop: '5px solid #E8A33D' }} />
  )
}

/** Un ingrédient posé sur une étagère : son nom, ce qu'il en reste, son mot d'urgence s'il a une date. */
export function TuileIngredient({ item, surOuvre, froid = false }: {
  item: Ligne<'stock_item'>; surOuvre: () => void; froid?: boolean
}) {
  const reste = item.quantity !== null ? `${ecritQuantite(Number(item.quantity))} ${item.unit ?? ''}`.trim() : null
  const u = item.expires_at
    ? urgence(item.expires_at, item.location === 'congelateur' ? 'congelateur' : 'frigo')
    : null
  return (
    <button type="button" onClick={surOuvre} data-ingredient={item.id}
            className="flex min-h-11 items-center gap-2.5 rounded-[14px] px-2.5 py-1.5 text-left"
            style={{
              background: froid ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.7)',
              boxShadow: froid ? 'inset 0 0 0 1.5px #B9CBD3' : 'inset 0 0 0 1.5px rgba(160, 180, 172, 0.7)',
            }}>
      <Pot />
      <span className="min-w-0">
        <span className="block text-[14px] font-bold leading-[1.2] [overflow-wrap:anywhere]">{item.label}</span>
        {(reste || u) && (
          <span className="mt-0.5 block text-[12px] font-semibold"
                style={{ color: u && u.niveau !== 'ok' ? u.encre : 'var(--color-doux)' }}>
            {[reste, u && u.niveau !== 'ok' ? u.mot : null].filter(Boolean).join(' · ')}
          </span>
        )}
      </span>
    </button>
  )
}
