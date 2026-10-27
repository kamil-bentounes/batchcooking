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
import { BoutonPhoto, Chiffre, Erreur, Principal } from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { prepare } from '../lib/photo.ts'
import { useCycle } from '../lib/donnees/cycle.ts'
import { useMagasins } from '../lib/donnees/foyer.ts'
import { useListe } from '../lib/donnees/courses.ts'
import { useEnregistreTicket } from '../lib/donnees/prix.ts'
import type { TicketLu } from '../lib/donnees/prix.ts'
import { SEUIL_SUR, poidsDuLibelle, rapproche } from '../lib/prix.ts'
import type { ArticleListe, Rapprochement } from '../lib/prix.ts'
import {
  Astuce, BoutonDoux, Carte, CaseACocher, Colonne, Deux, Echec, EnteteDeCarte, IcoAlerte,
  IcoRecu, Lecture, PassageLarge, Pilule, Puce, TicketDessine, TicketPhotographie, Titre,
} from '../ui/saisies/Cadre.tsx'
import { dateFr, ecartDit, euros, pluriel, quotaDit } from '../ui/saisies/lecture.ts'

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
      setOuvert(null)
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

  function reprend() {
    setLu(null)
    setApercu(null)
    setRetenus(new Set())
    setAttribue(new Map())
    setOuvert(null)
    lit.reset()
    enregistre.reset()
  }

  async function valide() {
    if (enregistre.isPending) return
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

  const illisible = lu !== null && !lu.lisible
  const lisible = lu?.lisible ? lu : null
  const nomEnseigne = lisible
    ? lisible.enseigne ?? magasins.find(m => m.id === magasinId)?.name ?? 'Enseigne inconnue'
    : ''
  const ecart = lisible ? ecartDit(lisible.ecart) : null

  return (
    <PassageLarge retour={retour} retourTexte="La liste">
      {lisible ? (
        <Titre>Le ticket lu</Titre>
      ) : (
        <Titre sous="Photographie-le et l’app apprend ce que coûte chaque produit, chez cette enseigne. La liste suivante s’estimera toute seule.">
          Le ticket
        </Titre>
      )}

      {!lisible && (
        <Deux rapport="1-1">
          <Colonne>
            {!illisible && (
              <Carte className="grid gap-3.5">
                {magasins.length > 0 && (
                  <>
                    <span id="enseigne-du-ticket" className="text-[13.5px] font-medium text-doux">Enseigne</span>
                    <div role="group" aria-labelledby="enseigne-du-ticket" className="flex flex-wrap gap-2">
                      {magasins.map(m => (
                        <Pilule key={m.id} choisie={magasinId === m.id} surAppui={() => setMagasin(m.id)}>
                          {m.name}
                        </Pilule>
                      ))}
                    </div>
                  </>
                )}

                <BoutonPhoto
                  texte={<span className="inline-flex items-center gap-3"><IcoRecu />{lit.isPending ? 'Je lis…' : 'Photographier le ticket'}</span>}
                  disabled={lit.isPending}
                  onFichier={f => lit.mutate(f)}
                  className={`min-h-[60px] w-full rounded-[20px] text-[18px] font-semibold min-[900px]:max-w-[420px]
                              has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-herbe
                              ${lit.isPending ? '' : 'bg-herbe text-fond'}`} />
                <Erreur de={lit.error} />
              </Carte>
            )}

            {!illisible && (
              <Astuce>
                <b>À plat, bien éclairé, de haut.</b> Si le ticket est long, photographie-le en deux fois : deux tickets
                valent mieux qu’un dont le bas est coupé.
              </Astuce>
            )}

            <div aria-live="polite">
              {lit.isPending && <Lecture texte="Je lis… une vingtaine de secondes." />}
              {illisible && (
                <Echec texte={lu.commentaire ?? 'La photo ne montre pas un ticket lisible.'} surReprise={reprend} />
              )}
            </div>
          </Colonne>

          <Colonne>
            {apercu ? <TicketPhotographie src={apercu} /> : <TicketDessine />}
          </Colonne>
        </Deux>
      )}

      {lisible && (
        <Deux rapport="5-7">
          <Colonne>
            <Carte>
              <div className="flex items-center gap-3.5">
                <span className="grid size-[52px] shrink-0 place-items-center rounded-2xl bg-sable text-ocre"><IcoRecu taille={28} /></span>
                <div className="min-w-0 flex-1">
                  <b className="block text-[17px] font-semibold [overflow-wrap:anywhere]">{nomEnseigne}</b>
                  {lisible.date && <span className="text-[13.5px] text-doux">{dateFr(lisible.date)}</span>}
                </div>
                {total !== null && (
                  <span className="whitespace-nowrap">
                    <Chiffre valeur={euros(total)} taille={32} />
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Puce>{lignes.length} {pluriel(lignes.length, 'ligne')} {pluriel(lignes.length, 'lue')}</Puce>
                <Puce ton="frais">{rattaches} {pluriel(rattaches, 'rattachée')} à la liste</Puce>
                {/* L'écart est LA mesure de qualité de la lecture : une ligne manquée se voit ici avant de se voir
                    en relisant le papier. */}
                {ecart && <Puce ton="sable"><IcoAlerte taille={15} />{ecart}</Puce>}
                {/* On le dit plutôt que de corriger en silence : une correction invisible est une correction qu'on
                    ne peut pas démentir. */}
                {lisible.remisesDeduites && <Puce>remises déduites</Puce>}
              </div>
              {ecart && (
                <p className="mt-2.5 text-[13.5px] leading-[1.4] text-doux">
                  L’écart est la mesure de la lecture : une ligne manquée se voit ici avant de se voir sur le papier.
                </p>
              )}
              {lisible.commentaire && (
                <p className="mt-2.5 text-[13.5px] leading-[1.4] text-doux">{lisible.commentaire}</p>
              )}
            </Carte>

            {apercu && <TicketPhotographie src={apercu} />}

            <div className="grid gap-2">
              <Principal onClick={valide} disabled={enregistre.isPending || retenus.size === 0}>
                {enregistre.isPending
                  ? 'J’enregistre…'
                  : `Enregistrer ${retenus.size} ${pluriel(retenus.size, 'ligne')} · ${euros(sommeRetenue)}`}
              </Principal>
              <Erreur de={enregistre.error} />
              <BoutonDoux onClick={reprend} disabled={enregistre.isPending}>Reprendre une photo</BoutonDoux>
              {quotaDit(lisible.restantes, 'ticket') && (
                <p className="text-center text-[13.5px] text-doux">{quotaDit(lisible.restantes, 'ticket')}</p>
              )}
            </div>
          </Colonne>

          <Colonne>
            <Carte aria-label="Les lignes">
              <EnteteDeCarte titre="Les lignes"
                             droite={<span className="text-[13.5px] text-doux">Touche une ligne pour la rattacher ailleurs</span>} />
              <ul className="grid">
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
            </Carte>
          </Colonne>
        </Deux>
      )}
    </PassageLarge>
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
    <li className="border-t border-brume first:border-t-0">
      <div className="grid grid-cols-[44px_minmax(0,1fr)] items-start gap-1.5 py-1 max-[360px]:grid-cols-[40px_minmax(0,1fr)]">
        <CaseACocher coche={retenu} nom={r.ligne.label} surBascule={surRetient} />

        <button type="button" onClick={surOuvre} aria-expanded={ouvert}
                className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2.5 py-1 text-left">
          <span className="min-w-0">
            {/* Le libellé de caisse, tel qu'imprimé : c'est lui qui permettra
                de reconnaître le produit au ticket suivant. */}
            <b className={`block text-[16px] font-semibold leading-[1.25] [overflow-wrap:anywhere] ${retenu ? '' : 'text-doux'}`}>
              {r.ligne.label}
            </b>
            <span className="mt-0.5 block text-[13px] leading-[1.35] text-doux">
              {poids && `${poids.quantite} ${poids.unite} · `}
              {r.article
                ? <>sur la liste : {r.article.label}</>
                : <i>pas sur la liste : le prix s’apprend quand même</i>}
              {devine && <span className="whitespace-nowrap font-semibold text-ocre">{' · '}deviné, à vérifier</span>}
            </span>
          </span>
          <span className="chiffre whitespace-nowrap text-[18px] font-semibold">{euros(r.ligne.price_eur)}</span>
        </button>
      </div>

      {ouvert && (
        <div className="grid gap-2 pb-3 pl-[50px] max-[360px]:pl-[46px]">
          <p className="text-[13.5px] text-doux">Rattacher à :</p>
          <div className="flex flex-wrap gap-2">
            <Pilule choisie={r.article === null} surAppui={() => surAttribue(null)}>rien</Pilule>
            {candidats.map(a => (
              <Pilule key={a.id} choisie={r.article?.id === a.id} surAppui={() => surAttribue(a.id)}>
                {a.label}
              </Pilule>
            ))}
          </div>
        </div>
      )}
    </li>
  )
}
