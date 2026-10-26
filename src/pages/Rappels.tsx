/**
 * Les rappels par mail : une carte par rappel, avec son picto, son moment, ce qui le déclenche, un interrupteur et
 * « M'envoyer un exemple ».
 *
 * Trois règles, dites à l'écran :
 *  · CHACUN RÈGLE LES SIENS. On ne voit ni ne règle ceux d'un autre membre du foyer (la base le garantit : la RLS
 *    ne rend que les lignes à son nom) ;
 *  · COUPÉ PAR DÉFAUT. Rien n'est envoyé à qui n'a rien activé ;
 *  · les mails arrivent à l'adresse de connexion, de la part de « Popote ».
 *
 * La maquette est `Rappels.dc.html` (hors dépôt, `~/PERSO/sauvegardes-popote/maquettes-2026-10-26-frigo/`). Elle
 * montrait un onglet « Ceux de Thauba » : il n'y est pas, par décision de Kamil (« chacun ne règle que les siens »).
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase.ts'
import { prenomDe, useFoyer } from '../lib/donnees/foyer.ts'
import { useBasculeRappel, useEssaiRappel, useReglagesRappels } from '../lib/donnees/rappels.ts'
import { RAPPELS } from '../lib/rappels.ts'
import type { Famille, RappelDecrit, TypeDeRappel } from '../lib/rappels.ts'
import { enFrancais } from '../lib/reseau.ts'
import { Attente, Erreur } from '../ui/coque.tsx'

/** Les pictos, au trait, en `currentColor` : ils prennent la couleur de leur pastille. */
const DESSINS: Record<TypeDeRappel, ReactNode> = {
  sortir_du_congelateur: <>
    <path d="M12 3v18" /><path d="M4.2 7.5l15.6 9" /><path d="M19.8 7.5l-15.6 9" />
    <path d="M9.5 4.5 12 6.5l2.5-2" /><path d="M9.5 19.5 12 17.5l2.5 2" />
  </>,
  barquette_perime: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  choisir_les_repas: <>
    <rect x="3.5" y="4.5" width="17" height="16" rx="3" /><path d="M3.5 9.5h17" /><path d="M8 2.5v4" /><path d="M16 2.5v4" />
    <path d="M8 14h.01" /><path d="M12 14h.01" /><path d="M16 14h.01" /><path d="M8 17.5h.01" /><path d="M12 17.5h.01" />
  </>,
  noter_les_depenses: <>
    <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" /><path d="M9 8h6" /><path d="M9 12h6" />
  </>,
  confirmer_les_charges: <>
    <path d="M9.5 6.5h10" /><path d="M9.5 12h10" /><path d="M9.5 17.5h10" />
    <path d="m3.8 6.6 1.3 1.3 2.3-2.5" /><path d="m3.8 12.1 1.3 1.3 2.3-2.5" /><path d="m3.8 17.6 1.3 1.3 2.3-2.5" />
  </>,
  cloturer_le_mois: <><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><path d="M12 14.5v2.5" /></>,
  facture_annuelle: <>
    <path d="M6 3h8.5L19 7.5V21H6Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h4" />
  </>,
}

/** La couleur de chaque famille : la pastille pleine, la pastille pâle, l'encre qui se lit dessus. */
const COULEURS: Record<Famille, { plein: string; pale: string; encre: string }> = {
  bleu: { plein: 'bg-congel text-white', pale: 'bg-congel-fond text-congel-encre', encre: 'text-congel-encre' },
  encre: { plein: 'bg-encre text-fond', pale: 'bg-piste text-encre', encre: 'text-encre' },
  herbe: { plein: 'bg-herbe text-white', pale: 'bg-frais-fond text-frais-encre', encre: 'text-frais-encre' },
  sable: { plein: 'bg-safran text-encre', pale: 'bg-sable text-ocre', encre: 'text-ocre' },
}

function Pastille({ r, actif }: { r: RappelDecrit; actif: boolean }) {
  const c = COULEURS[r.famille]
  return (
    <span aria-hidden="true"
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors ${actif ? c.plein : c.pale}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
           strokeLinecap="round" strokeLinejoin="round" className="block">
        {DESSINS[r.type]}
      </svg>
    </span>
  )
}

/** Un interrupteur : 44 px de haut, annoncé comme tel (`role="switch"`), avec son nom. */
function Interrupteur({ nom, actif, surBascule }: { nom: string; actif: boolean; surBascule: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={actif} aria-label={nom} onClick={surBascule}
            className="flex h-11 w-[52px] shrink-0 items-center justify-center">
      <span className={`relative block h-7 w-[46px] rounded-full transition-colors ${actif ? 'bg-herbe' : 'bg-[#C9D1C4]'}`}>
        <span className="absolute top-[3px] block h-[22px] w-[22px] rounded-full bg-white transition-[left] duration-150"
              style={{ left: actif ? 21 : 3, boxShadow: '0 1px 3px rgba(28, 43, 35, 0.3)' }} />
      </span>
    </button>
  )
}

export function Rappels({ userId, retour }: { userId: string; retour: () => void }) {
  const { data: reglages, isPending, error } = useReglagesRappels()
  const bascule = useBasculeRappel(userId)
  const essai = useEssaiRappel()
  const { data: foyer } = useFoyer()
  const [adresse, setAdresse] = useState<string | null>(null)
  /** Le rappel dont l'exemple part, et ce que l'envoi a dit. */
  const [envoi, setEnvoi] = useState<TypeDeRappel | null>(null)
  const [dit, setDit] = useState<{ type: TypeDeRappel; texte: string; erreur: boolean } | null>(null)

  useEffect(() => {
    let vivant = true
    supabase.auth.getSession().then(({ data }) => { if (vivant) setAdresse(data.session?.user.email ?? null) })
      .catch(() => { /* l'adresse n'est qu'une précision */ })
    return () => { vivant = false }
  }, [])

  const autres = (foyer?.membres ?? []).filter(m => m.id !== userId).map(m => prenomDe(m.display_name))

  async function envoyeUnExemple(r: RappelDecrit) {
    if (envoi) return
    setEnvoi(r.type); setDit(null)
    try {
      await essai.mutateAsync(r.type)
      setDit({ type: r.type, erreur: false, texte: adresse ? `Un exemple vient de partir pour ${adresse}.` : 'Un exemple vient de partir.' })
    } catch (e) {
      setDit({
        type: r.type, erreur: true,
        texte: enFrancais(e instanceof Error ? e.message : 'Le mail n’a pas pu partir. Réessaie dans un instant.'),
      })
    } finally {
      setEnvoi(null)
    }
  }

  const groupe = (nom: RappelDecrit['groupe']) => RAPPELS.filter(r => r.groupe === nom)

  return (
    <main className="min-h-dvh px-5 pt-5 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button type="button" onClick={retour}
                className="-ml-1 inline-flex min-h-11 items-center gap-1 pr-2 text-[15px] font-semibold text-herbe">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
               strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          Réglages
        </button>

        <h1 className="titre mt-2.5 text-[32px] font-semibold leading-[1.05]">Les rappels par mail</h1>
        <p className="mt-2 text-[14px] leading-[1.45] text-doux">
          Un mail seulement quand il y a quelque chose à faire. Tous sont coupés tant que tu ne les actives pas.
        </p>

        {/* Chacun règle les siens : dit en clair, avec le nom de l'autre quand il y en a un. */}
        <div className="mt-4 flex gap-3 rounded-[18px] bg-sable p-3.5 text-[14px] leading-[1.45]" data-regle="chacun-les-siens">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
               strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-ocre" aria-hidden="true">
            <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
          </svg>
          <p>
            <strong className="font-semibold">Ce sont tes rappels, et seulement les tiens.</strong>{' '}
            {autres.length > 0
              ? `${autres.join(' et ')} ${autres.length > 1 ? 'règlent' : 'règle'} les siens de son côté. Tu ne vois pas les siens, et personne ne voit les tiens.`
              : 'Quand quelqu’un te rejoindra dans le foyer, il règlera les siens : personne ne verra les tiens.'}
            {' '}Les mails arrivent {adresse ? <>à <span className="font-semibold [overflow-wrap:anywhere]">{adresse}</span></> : 'à ton adresse de connexion'}, de la part de « Popote ».
          </p>
        </div>

        {isPending && <Attente />}
        <Erreur de={error} />
        <Erreur de={bascule.error} />

        {reglages && (['Cuisine', 'Budget'] as const).map(nomDuGroupe => (
          <section key={nomDuGroupe} aria-label={nomDuGroupe} className="mt-7">
            <h2 className="mb-2 ml-0.5 text-[15px] font-bold">{nomDuGroupe}</h2>
            <ul className="flex flex-col gap-3">
              {groupe(nomDuGroupe).map(r => {
                const actif = reglages[r.type]
                const c = COULEURS[r.famille]
                const message = dit?.type === r.type ? dit : null
                return (
                  <li key={r.type} data-rappel={r.type}
                      className="rounded-[22px] bg-surface p-4"
                      style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
                    <div className="flex items-center gap-3">
                      <Pastille r={r} actif={actif} />
                      <div className="min-w-0 flex-1">
                        <h3 className="text-[16px] font-semibold leading-[1.25]">{r.nom}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${c.pale}`}>{r.moment}</span>
                          <span className={`text-[12px] font-semibold ${actif ? 'text-herbe' : 'text-doux'}`}>
                            {actif ? 'Activé' : 'Coupé'}
                          </span>
                        </div>
                      </div>
                      <Interrupteur nom={r.nom} actif={actif}
                                    surBascule={() => bascule.mutate({ type: r.type, actif: !actif })} />
                    </div>
                    <p className="mt-3 text-[13px] leading-[1.45] text-doux">{r.quand}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3">
                      <button type="button" onClick={() => envoyeUnExemple(r)} disabled={envoi !== null}
                              aria-label={`M’envoyer un exemple : ${r.nom}`}
                              className={`-ml-1 min-h-11 px-1 text-[14px] font-semibold underline underline-offset-[3px] disabled:opacity-60 ${c.encre}`}>
                        {envoi === r.type ? 'Envoi…' : 'M’envoyer un exemple'}
                      </button>
                    </div>
                    <div role="status" aria-live="polite">
                      {message && (
                        <p className={`text-[13px] leading-[1.4] ${message.erreur ? 'text-groseille' : 'text-herbe'}`}>
                          {message.texte}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}

        <p className="mt-8 text-[13px] leading-[1.45] text-doux">
          Coupe un rappel et il ne part plus, tout de suite. Un exemple est un faux mail : il ne compte pour rien et ne
          touche à rien.
        </p>
      </div>
    </main>
  )
}
