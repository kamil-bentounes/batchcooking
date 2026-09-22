/**
 * Le ticket de caisse (lot 5).
 *
 * Il n'existe aucune API de prix pour un particulier. Le ticket, lui, est
 * exact, daté, à la bonne enseigne, et déjà dans la poche : c'est la seule
 * source qui donne NOS prix plutôt qu'une moyenne nationale.
 *
 * Comme la photo du frigo, cet écran fait VALIDER. Une différence près, et elle
 * compte : ici, une erreur ne se rattrape pas d'un geste. Un rapprochement faux
 * fait apprendre un prix faux, et ce prix se propage à toutes les estimations
 * qui viendront. D'où :
 *
 *  · ce que le modèle a deviné est marqué comme tel et décoché d'avance ;
 *  · chaque ligne peut être RÉ-ATTRIBUÉE à un autre article de la liste ;
 *  · l'écart entre la somme des lignes et le total imprimé est affiché en
 *    clair — c'est la façon la plus rapide de repérer une ligne manquée.
 */
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  BoutonPhoto, Chiffre, Erreur, Passage, Principal, Secondaire, Surface, Vide,
} from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { prepare } from '../lib/photo.ts'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useMagasins } from '../lib/donnees/foyer.ts'
import { useListe } from '../lib/donnees/courses.ts'
import { useEnregistreTicket } from '../lib/donnees/prix.ts'
import type { TicketLu } from '../lib/donnees/prix.ts'
import { SEUIL_SUR, poidsDuLibelle, rapproche } from '../lib/prix.ts'
import type { ArticleListe, Rapprochement } from '../lib/prix.ts'

const euros = (n: number) => `${n.toFixed(2).replace('.', ',')} €`

export function Ticket({ retour, va }: { retour: () => void; va: (v: string) => void }) {
  const { data: cycle } = useCycle()
  const { data: magasins = [] } = useMagasins()
  const { data: articles = [] } = useListe(cycle?.id)
  const enregistre = useEnregistreTicket()

  const [magasin, setMagasin] = useState<string | null>(null)
  const [apercu, setApercu] = useState<string | null>(null)
  const [lu, setLu] = useState<TicketLu | null>(null)
  const [attribue, setAttribue] = useState<Map<number, string | null>>(new Map())
  const [retenus, setRetenus] = useState<Set<number>>(new Set())
  const [ouvert, setOuvert] = useState<number | null>(null)

  // Le magasin choisi, ou celui par défaut : on ne fait pas cliquer pour
  // confirmer ce qui est vrai neuf fois sur dix.
  const magasinId = magasin ?? magasins.find(m => m.is_default)?.id ?? magasins[0]?.id ?? null

  /** Les articles de CE magasin d'abord : c'est chez eux que le ticket a été fait. */
  const candidats: ArticleListe[] = useMemo(() => articles
    .filter(a => magasinId === null || a.store_id === magasinId || a.store_id === null)
    .map(a => ({ id: a.id, label: a.label, food_id: a.food_id,
                 paid_price_eur: a.paid_price_eur })),
    [articles, magasinId])

  const base = useMemo(
    () => (lu ? rapproche(lu.lignes, candidats) : []), [lu, candidats])

  // Le rapprochement proposé, corrigé de ce que la personne a ré-attribué.
  const lignes: Rapprochement[] = useMemo(() => base.map((r, i) => {
    if (!attribue.has(i)) return r
    const id = attribue.get(i)
    const article = id === null ? null : candidats.find(a => a.id === id) ?? null
    return { ...r, article, score: article ? 1 : 0, sur: !!article }
  }), [base, attribue, candidats])

  const lit = useMutation({
    mutationFn: async (fichier: File) => {
      const p = await prepare(fichier)
      setApercu(p.dataUrl)
      const nom = magasins.find(m => m.id === magasinId)?.name
      return callFunction('ticket', { image: p.dataUrl, enseigne: nom }) as Promise<TicketLu>
    },
    onSuccess: t => {
      setLu(t)
      setAttribue(new Map())
      // On coche d'avance tout ce que le modèle a lu nettement — y compris ce
      // qui n'est pas sur la liste : un prix de sacs poubelle vaut d'être
      // appris même si personne ne les avait notés.
      // Une ligne sans confiance déclarée est une ligne que le modèle n'a pas
      // jugée : on la retient plutôt que de la perdre en silence.
      setRetenus(new Set(t.lignes
        .map((l, i) => ((l.confiance ?? 1) >= 0.5 ? i : -1)).filter(i => i >= 0)))
    },
  })

  const total = lu?.total_eur ?? null
  const retenu = lignes.filter((_, i) => retenus.has(i))
  const sommeRetenue = Math.round(retenu.reduce((s, r) => s + r.ligne.price_eur, 0) * 100) / 100
  const rattaches = retenu.filter(r => r.article !== null).length

  async function valide() {
    await enregistre.mutateAsync({
      cycleId: cycle?.id ?? null,
      storeId: magasinId,
      date: lu?.date ?? null,
      total,
      brut: lu,
      rapprochements: lignes,
      retenus,
    })
    va('/magasin')
  }

  return (
    <Passage retour={retour} retourTexte="La liste">
      <h1 className="titre text-[40px]">Le ticket</h1>
      <p className="mt-3.5 text-[15px] text-doux max-w-[36ch]">
        Photographie-le et l’app apprend ce que coûte chaque produit, chez cette
        enseigne. La liste suivante s’estimera toute seule.
      </p>

      {!lu && (
        <>
          {magasins.length > 1 && (
            <div className="mt-7">
              <h2 className="text-[13px] text-doux uppercase tracking-[0.04em]">Enseigne</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {magasins.map(m => (
                  <button key={m.id} onClick={() => setMagasin(m.id)}
                          aria-pressed={magasinId === m.id}
                          className={`h-[42px] px-4 rounded-[14px] text-[15px] transition-colors
                            ${magasinId === m.id ? 'bg-herbe text-fond' : 'bg-brume/50'}`}>
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <BoutonPhoto texte={lit.isPending ? 'Je lis…' : 'Photographier le ticket'}
                       disabled={lit.isPending}
                       onFichier={f => lit.mutate(f)} />

          {lit.isPending && (
            <p className="mt-6 text-[15px] text-doux">Je lis… une vingtaine de secondes.</p>
          )}
          <Erreur de={lit.error} />

          <p className="mt-8 text-[13px] text-doux leading-relaxed">
            À plat, bien éclairé, de haut. Si le ticket est long, photographie-le
            en deux fois : deux tickets valent mieux qu’un dont le bas est coupé.
          </p>
        </>
      )}

      {lu && !lu.lisible && (
        <>
          <Vide titre="Je n’ai rien su lire"
                texte={lu.commentaire ?? 'La photo ne montre pas un ticket lisible.'} />
          <Secondaire onClick={() => { setLu(null); setApercu(null) }}>
            Reprendre une photo
          </Secondaire>
        </>
      )}

      {lu?.lisible && (
        <>
          <Surface className="mt-6">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px]">
                {lu.enseigne ?? magasins.find(m => m.id === magasinId)?.name ?? 'Enseigne inconnue'}
                {lu.date && <span className="text-doux"> · {lu.date}</span>}
              </span>
              {total !== null && <Chiffre valeur={total} unite="€" taille={22} />}
            </div>
            <p className="mt-2 text-[13px] text-doux leading-relaxed">
              {lignes.length} ligne{lignes.length > 1 ? 's' : ''} lue
              {lignes.length > 1 ? 's' : ''} · {rattaches} rattachée
              {rattaches > 1 ? 's' : ''} à la liste
              {/* L'écart est LA mesure de qualité de la lecture : une ligne
                  manquée se voit ici avant de se voir en relisant le papier. */}
              {lu.ecart !== null && Math.abs(lu.ecart) >= 0.01 && (
                <span style={{ color: 'var(--color-ocre)' }}>
                  {' · '}écart de {euros(Math.abs(lu.ecart))} avec le total imprimé
                </span>
              )}
              {/* On le dit plutôt que de corriger en silence : une correction
                  invisible est une correction qu'on ne peut pas démentir. */}
              {lu.remisesDeduites && ' · remises déduites'}
            </p>
          </Surface>

          <ul className="mt-5 divide-y divide-brume/70">
            {lignes.map((r, i) => (
              <LigneTicketVue
                key={i}
                r={r}
                retenu={retenus.has(i)}
                ouvert={ouvert === i}
                candidats={candidats}
                surRetient={() => setRetenus(s => {
                  const n = new Set(s)
                  if (n.has(i)) n.delete(i); else n.add(i)
                  return n
                })}
                surOuvre={() => setOuvert(ouvert === i ? null : i)}
                surAttribue={id => {
                  setAttribue(m => new Map(m).set(i, id))
                  setOuvert(null)
                }} />
            ))}
          </ul>

          {apercu && (
            <img src={apercu} alt="Le ticket photographié"
                 className="mt-6 w-full rounded-[18px]" />
          )}

          <div className="mt-8">
            <Principal onClick={valide}
                       disabled={enregistre.isPending || retenus.size === 0}>
              {enregistre.isPending
                ? 'J’enregistre…'
                : `Enregistrer ${retenus.size} ligne${retenus.size > 1 ? 's' : ''} · ${euros(sommeRetenue)}`}
            </Principal>
            <Erreur de={enregistre.error} />
            <Secondaire onClick={() => { setLu(null); setApercu(null) }}>
              Reprendre une photo
            </Secondaire>
            <p className="mt-2 text-center text-[13px] text-doux">
              {lu.restantes} ticket{lu.restantes > 1 ? 's' : ''} restant
              {lu.restantes > 1 ? 's' : ''} ce mois-ci.
            </p>
          </div>
        </>
      )}
    </Passage>
  )
}

function LigneTicketVue({ r, retenu, ouvert, candidats, surRetient, surOuvre, surAttribue }: {
  r: Rapprochement
  retenu: boolean
  ouvert: boolean
  candidats: ArticleListe[]
  surRetient: () => void
  surOuvre: () => void
  surAttribue: (id: string | null) => void
}) {
  const devine = r.article !== null && r.score < SEUIL_SUR
  const poids = r.ligne.quantity === null || r.ligne.quantity === undefined
    ? poidsDuLibelle(r.ligne.label)
    : { quantite: Number(r.ligne.quantity), unite: r.ligne.unit ?? 'u' }

  return (
    <li>
      <div className="flex items-start gap-3 py-1">
        <button role="checkbox" aria-checked={retenu} aria-label={r.ligne.label}
                onClick={surRetient}
                className="w-11 h-11 grid place-items-center shrink-0">
          <span className={`w-[22px] h-[22px] rounded-[7px] border-2 grid place-items-center
                            ${retenu ? 'bg-herbe border-herbe' : 'border-brume'}`}>
            {retenu && (
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="#F2F4EF"
                   strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M2.5 7.5 5.5 10.5 11.5 3.5" />
              </svg>
            )}
          </span>
        </button>

        <button onClick={surOuvre} className="grow py-2.5 text-left">
          <span className="flex items-baseline justify-between gap-3">
            {/* Le libellé de caisse, tel qu'imprimé : c'est lui qui permettra
                de reconnaître le produit au ticket suivant. */}
            <span className="text-[15px]">{r.ligne.label}</span>
            <span className="text-[15px] font-medium shrink-0">{euros(r.ligne.price_eur)}</span>
          </span>
          <span className="block text-[13px] text-doux mt-0.5">
            {poids && `${poids.quantite} ${poids.unite} · `}
            {r.article
              ? <>→ {r.article.label}</>
              : <span className="italic">pas sur la liste — le prix s’apprend quand même</span>}
            {devine && (
              <span style={{ color: 'var(--color-ocre)' }}>{' · '}deviné, à vérifier</span>
            )}
          </span>
        </button>
      </div>

      {ouvert && (
        <div className="pb-4 pl-11">
          <p className="text-[13px] text-doux">Rattacher à :</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={() => surAttribue(null)}
                    className={`h-11 px-3 rounded-[12px] text-[14px]
                      ${r.article === null ? 'bg-herbe text-fond' : 'bg-brume/50'}`}>
              rien
            </button>
            {candidats.map(a => (
              <button key={a.id} onClick={() => surAttribue(a.id)}
                      className={`h-11 px-3 rounded-[12px] text-[14px]
                        ${r.article?.id === a.id ? 'bg-herbe text-fond' : 'bg-brume/50'}`}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}
