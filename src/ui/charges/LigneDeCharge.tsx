/**
 * Une charge, sur sa ligne : son nom, qui la paie, son montant. On la touche, ses gestes s'ouvrent dessous —
 * Rattacher, Corriger, Changer qui participe, Retirer —, et « Corriger » se déplie dans la ligne.
 *
 * ⚠️ L'erreur d'un geste se montre SUR LA LIGNE qui l'a produite. Un refus affiché en tête de page, quatre
 * écrans au-dessus du bouton qu'on vient de toucher, ne se voit pas : on croit que rien ne s'est passé, et on
 * retouche.
 */
import type { ReactNode } from 'react'
import { Erreur } from '../coque.tsx'
import type { Charge, Compte } from '../../lib/donnees/budget.ts'
import { prenomDe } from '../../lib/donnees/foyer.ts'
import { debutDuChamp, enVigueur, peutCorriger, plancherDuDebut } from '../../lib/budget/charges.ts'
import { ceQuElleCouteParMois, dansLOrdreDuFoyer, sousTitreDeLaLigne } from '../../lib/budget/charges-liste.ts'
import { montant } from '../../lib/budget/mois.ts'
import { maintenant } from '../../lib/horloge.ts'
import { Avatars, SansCompte } from './Pastilles.tsx'
import { CHAMP, ChoixCategorie, ChoixFacon, FILET, PILULE } from './Choix.tsx'
import { Coche, Corbeille, Crayon, Lien, Personnes } from './icones.tsx'
import type { Gestes } from './gestes.ts'

type Membre = { id: string; display_name: string }

const GESTE = 'min-h-11 px-3.5 rounded-[14px] inline-flex items-center gap-2 text-[14.5px] font-semibold disabled:opacity-50'

function Geste({ ton, children, ...p }: { ton: 'herbe' | 'ocre' | 'encre'; children: ReactNode }
  & React.ComponentProps<'button'>) {
  const couleur = ton === 'ocre' ? 'bg-sable text-ocre' : ton === 'herbe' ? 'bg-piste text-herbe' : 'bg-piste text-encre'
  return <button type="button" {...p} className={`${GESTE} ${couleur}`}>{children}</button>
}

export function LigneDeCharge({ c, mois, moi, foyerId, membres, prenoms, comptes, g, dit }: {
  /** Ce que le dernier geste de CETTE ligne a annoncé (« corrigée, 2 mois refaits »). */
  dit: string | null
  c: Charge; foyerId: string; mois: string; moi: string; membres: Membre[]; prenoms: Map<string, string>
  comptes: Compte[] | undefined; g: Gestes
}) {
  const ouvert = g.ouverte?.id === c.id
  const vue = ouvert ? g.ouverte!.vue : null
  const plusTard = !enVigueur(c, mois)
  const parMois = ceQuElleCouteParMois(c)
  const compteParDefaut = comptes?.find(x => x.genre === 'commun')?.id ?? comptes?.[0]?.id ?? null

  return (
    <li data-charge={c.id} className="py-1">
      <button type="button" data-ligne={c.id} aria-expanded={ouvert} aria-controls={`gestes-${c.id}`}
              onClick={() => g.touche(c)}
              className="w-full min-h-11 py-2.5 flex items-start gap-2.5 text-left rounded-[10px]">
        <span className="grow min-w-0 block">
          <span className={`block text-[16px] font-semibold leading-tight ${plusTard ? 'text-doux' : ''}`}>
            {c.libelle}
          </span>
          <span className="block mt-0.5 text-[13.5px] leading-snug text-doux">
            {sousTitreDeLaLigne(c, { prenoms, mois, moi })}
          </span>
          {(c.participants.length > 0 || !c.compte_id) && (
            <span className="mt-2 flex items-center gap-2.5 flex-wrap">
              <Avatars ids={dansLOrdreDuFoyer(c.participants, membres.map(m => m.id))} membres={membres} />
              {!c.compte_id && <SansCompte />}
            </span>
          )}
        </span>
        <span className="shrink-0 block text-right">
          <span className={`chiffre block text-[19px] leading-[1.1] whitespace-nowrap max-[360px]:text-[17px]
                            ${plusTard ? 'text-doux' : ''}`}>
            {montant(c.montant_cents)}
          </span>
          {parMois && <span className="block mt-[3px] text-[12px] text-doux">{parMois}</span>}
        </span>
      </button>

      {ouvert && vue === 'gestes' && (
        <div id={`gestes-${c.id}`} role="group" aria-label={`Les gestes de ${c.libelle}`}
             className="mb-2 flex flex-wrap gap-1.5">
          {/* Rattacher après coup : une charge née de la dictée, ou d'avant que le formulaire ne demande le
              compte, n'avait aucun moyen d'en recevoir un — et sans compte, elle ne produit pas de virement. */}
          {!c.compte_id && compteParDefaut && (
            <Geste ton="ocre" disabled={g.rattache.isPending}
                   onClick={() => g.rattache.mutate({ id: c.id, compteId: compteParDefaut })}>
              <Lien />Rattacher
            </Geste>
          )}
          {/* Corriger. Sans lui, 11 200 € tapés au lieu de 1 120 € restaient dans le mois pour toujours :
              « Retirer » échoue sur la clé étrangère et retombe sur l'archivage, et reposer la charge juste
              ajoutait la bonne par-dessus la fausse. */}
          <Geste ton="herbe" data-geste={`corriger-${c.id}`} aria-label={`Corriger ${c.libelle}`}
                 onClick={() => g.ouvreLeFormulaire(c)}>
            <Crayon />Corriger
          </Geste>
          {/* Qui participe se change APRÈS COUP. Sans lui, inviter quelqu'un une fois les charges posées
              obligeait à toutes les refaire. */}
          {membres.length > 1 && (
            <Geste ton="herbe" data-geste={`qui-${c.id}`} onClick={() => g.ouvreQui(c)}>
              <Personnes />Changer qui participe
            </Geste>
          )}
          <Geste ton="encre" aria-label={`Retirer ${c.libelle}`} disabled={g.retire.isPending}
                 onClick={() => {
                   if (!confirm(`Retirer « ${c.libelle} » ? Elle disparaîtra de tous les mois.`)) return
                   g.retirer(c)
                 }}>
            <Corbeille />Retirer
          </Geste>
        </div>
      )}

      {ouvert && vue === 'corriger' && <Correction c={c} g={g} />}

      {ouvert && vue === 'qui' && (
        <div id={`gestes-${c.id}`} role="group" aria-label={`Qui participe à ${c.libelle}`}
             className="mb-2 rounded-[18px] bg-fond p-3.5">
          <p className="text-[13.5px] font-medium text-doux">Changer qui participe</p>
          <div className="mt-2 flex gap-2 flex-wrap items-center">
            {membres.map(m => {
              const dedans = c.participants.includes(m.id)
              return (
                <button key={m.id} type="button" role="checkbox" aria-checked={dedans}
                        disabled={g.majQui.isPending}
                        onClick={() => g.majQui.mutate({
                          chargeId: c.id, foyerId,
                          participants: dedans ? c.participants.filter(x => x !== m.id) : [...c.participants, m.id],
                        })}
                        className={`${PILULE} ${dedans ? 'bg-herbe text-fond' : FILET} disabled:opacity-60`}>
                  {dedans && <Coche />}{prenomDe(m.display_name)}
                </button>
              )
            })}
            <button type="button" onClick={() => g.reviens(c, 'qui')}
                    className="min-h-11 px-2 text-[15px] font-semibold text-herbe">Fermer</button>
          </div>
        </div>
      )}

      <Erreur de={g.erreurDe(c.id)} />
      {dit && (
        <p role="status" className="my-2 rounded-xl bg-frais-fond px-3 py-2 text-[14px] text-frais-encre">{dit}</p>
      )}
    </li>
  )
}

/** « Corriger », déplié dans la ligne : les mêmes champs que l'ajout, et les mêmes règles. */
function Correction({ c, g }: { c: Charge; g: Gestes }) {
  const { f, change } = g
  /* Les mêmes règles que l'ajout : le plafond de 1 000 000 €, et un départ vidé ne part pas comme « -01 ». */
  const { pret, cents, refusMontant, refusDebut, refusLibelle } = peutCorriger({
    libelle: f.libelle, montant: f.montant, mode: f.mode, debut: f.debut,
    garde: c.debut, plancher: plancherDuDebut(maintenant()) })
  const occupe = g.corrige.isPending || g.changeCategorie.isPending
  return (
    <div id={`gestes-${c.id}`} role="group" aria-label={`Corriger ${c.libelle}`}
         className="mb-2 rounded-[18px] bg-fond p-3.5 grid grid-cols-[minmax(0,1fr)] gap-4">
      <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <span className="text-[14px] font-semibold">Son nom</span>
        <input value={f.libelle} onChange={e => change({ libelle: e.target.value })} className={CHAMP} />
        {refusLibelle && <span role="alert" className="text-[14px] font-semibold text-groseille">{refusLibelle}</span>}
      </label>
      <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
        <span className="text-[14px] font-semibold">Son montant</span>
        <span className="flex items-center gap-2">
          <input value={f.montant} inputMode="decimal" onChange={e => change({ montant: e.target.value })}
                 aria-label={`Montant de ${c.libelle}`}
                 className={`${CHAMP} max-w-[150px] font-titre text-[20px] font-semibold`} />
          <span className="text-[15px] text-doux">€</span>
        </span>
        {refusMontant && f.montant.trim() !== '' && (
          <span role="alert" className="text-[14px] font-semibold text-groseille">{refusMontant}</span>
        )}
      </label>
      <ChoixCategorie valeur={f.categorie} choisir={categorie => change({ categorie })}
                      nom={`Catégorie de ${c.libelle}`} />
      <ChoixFacon mode={f.mode} rythme={f.rythme} bloque={g.bloque}
                  nom={`Comment se paie ${c.libelle}`}
                  choisir={(mode, rythme) => change({ mode, rythme })} />
      {f.mode === 'mis_de_cote' && (
        <label className="grid grid-cols-[minmax(0,1fr)] gap-1.5">
          <span className="text-[14px] font-semibold">Elle court depuis</span>
          <input type="month" value={f.debut.slice(0, 7)} aria-label={`Depuis quand court ${c.libelle}`}
                 onChange={e => change({ debut: debutDuChamp(e.target.value) })} className={CHAMP} />
          {refusDebut && <span role="alert" className="text-[14px] font-semibold text-groseille">{refusDebut}</span>}
          <span className="text-[13.5px] text-doux">C’est elle qui décide sur combien de mois le montant se répartit.</span>
        </label>
      )}
      {/* Ce que ça touche, dit AVANT : un mois confirmé garde ce qu'on a réellement payé, il ne se réécrit pas. */}
      <p className="text-[13.5px] text-doux">Les mois déjà confirmés gardent leur montant. Les autres se refont.</p>
      <Erreur de={g.erreurDuFormulaire(c.id)} />
      <div className="flex items-center gap-2.5 flex-wrap">
        <button type="button" disabled={!pret || occupe} onClick={() => g.enregistre(c, cents ?? 0)}
                className="min-h-12 px-[18px] rounded-2xl bg-herbe text-fond text-[16px] font-semibold
                           disabled:bg-brume disabled:text-encre">
          {g.corrige.isPending ? 'Je corrige…' : 'Enregistrer'}
        </button>
        <button type="button" onClick={() => g.reviens(c, 'corriger')}
                className="min-h-11 px-3 text-[15px] font-semibold text-herbe">Annuler</button>
      </div>
    </div>
  )
}
