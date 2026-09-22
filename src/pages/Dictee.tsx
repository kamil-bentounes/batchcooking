/**
 * « Dicte tout, je range. »
 *
 * Le modèle est un ACCÉLÉRATEUR, jamais une autorité (D28, D57) : il propose
 * des lignes, l'écran les fait valider une par une, et rien ne part en base
 * sans un geste.
 *
 * Ce qui décide du résultat n'est pas le modèle, c'est la CONSIGNE. Devant un
 * micro sans rien à quoi se raccrocher, on ne dit rien — ou on dit « bah, les
 * courses ». Chaque section porte donc sa liste de ce qu'il faut mentionner et
 * un exemple entier, dicté comme on parle.
 *
 * Et le vocal n'est pas codé ici : le bouton micro du clavier du téléphone
 * écrit dans cette zone de texte, gratuitement, mieux que ce qu'on câblerait —
 * l'API du navigateur est moins bonne en pièce bruyante et inégale selon les
 * appareils. Il n'y a qu'à laisser la place.
 */
import { useState } from 'react'
import { Surface, Principal, Erreur, BarreAction } from '../ui/coque.tsx'
import { callFunction } from '../lib/supabase.ts'
import { enCentimes } from '../lib/donnees/budget.ts'

type Proposee = {
  libelle: string
  catalogue_libelle: string | null
  montant_cents: number | null
  periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  portee: 'commun' | 'perso'
  variable: boolean
  confiance: number
  remarque: string | null
}

type Reponse = {
  charges: Proposee[]
  oublis: string[]
  questions: string[]
  restantes: number
}

/** Ce qu'il faut dire, section par section. Sans ça, on ne dit rien. */
const CONSIGNE: { section: string | null; titre: string; quoi: string; exemple: string }[] = [
  {
    section: 'Logement', titre: 'Le logement',
    quoi: 'Loyer ou mensualité de prêt, charges de copropriété, taxe foncière, '
        + 'assurance habitation, électricité, gaz, eau, internet.',
    exemple: 'La copro c’est 300 euros par trimestre, la taxe foncière 1450 à l’année, '
           + 'l’assurance habitation 10,70 par mois, l’électricité autour de 50 à la '
           + 'consommation, et internet 37.',
  },
  {
    section: 'Auto', titre: 'La voiture',
    quoi: 'Essence, assurance, entretien, contrôle technique, péages, stationnement, '
        + 'crédit ou location.',
    exemple: 'Mon assurance auto c’est 48 par mois, je mets à peu près 120 d’essence, '
           + 'et le contrôle technique 90 tous les deux ans.',
  },
  {
    section: 'Abonnements', titre: 'Les abonnements',
    quoi: 'Forfaits mobiles, streaming, musique, stockage en ligne, salle de sport.',
    exemple: 'Mon forfait c’est 15, Netflix 14 on partage, Spotify duo 15 aussi en commun.',
  },
  {
    section: 'Crédits', titre: 'Les crédits',
    quoi: 'Immobilier, auto, consommation, prêt étudiant. Et dis si c’est à toi seul.',
    exemple: 'J’ai mon crédit immobilier à 580 par mois, c’est pour moi tout seul.',
  },
  {
    section: null, titre: 'Tout le reste, d’un coup',
    quoi: 'Santé, impôts, courses, restaurants, sorties, vêtements, cadeaux, animaux. '
        + 'Dis « on » pour ce qui se partage, « je » pour ce qui est à toi.',
    exemple: 'On met 800 de courses par mois, 400 de restaurant, 100 de sorties. '
           + 'Ma mutuelle c’est 42. Et on compte 60 par mois de cadeaux.',
  },
]

export function Dictee({ retour, surRetenues }: {
  retour: () => void
  surRetenues: (lignes: Proposee[]) => void
}) {
  const [etape, setEtape] = useState(0)
  const [texte, setTexte] = useState('')
  const [reponse, setReponse] = useState<Reponse | null>(null)
  const [retenues, setRetenues] = useState<Set<number>>(new Set())
  /* Les montants corrigés, par indice. L'écran promettait « corrige les
     montants » sans offrir le moindre champ, et une ligne sans montant entrait
     en base à zéro euro. */
  const [corriges, setCorriges] = useState<Record<number, string>>({})
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<unknown>(null)

  const consigne = CONSIGNE[etape]

  async function range() {
    setEnvoi(true); setErreur(null)
    try {
      const r = await callFunction<Reponse>('charges', {
        texte, section: consigne.section,
      })
      setReponse(r)
      // On coche d'avance ce qui est sûr, et seulement ça. Une ligne devinée
      // qu'on décoche est agaçante ; une ligne fausse qu'on n'a pas vue passer
      // est pire.
      setRetenues(new Set(r.charges
        .map((c, i) => (c.confiance >= 0.7 && c.montant_cents !== null ? i : -1))
        .filter(i => i >= 0)))
    } catch (e) { setErreur(e) } finally { setEnvoi(false) }
  }

  /* Le montant retenu est celui qu'on a corrigé, sinon celui du modèle. Une
     ligne sans montant n'est pas ajoutable : elle reste cochée sans compter. */
  const pretes = reponse
    ? [...retenues].sort((a, b) => a - b).map(i => {
        const saisi = corriges[i]
        const cents = saisi !== undefined ? enCentimes(saisi) : reponse.charges[i].montant_cents
        return { ...reponse.charges[i], montant_cents: cents }
      }).filter(c => c.montant_cents !== null && c.montant_cents > 0)
    : []

  if (reponse) {
    return (
      <main className="min-h-dvh px-6 pt-14 pb-40">
        <div className="mx-auto w-full max-w-lg">
          <button onClick={() => setReponse(null)}
                  className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
            <span aria-hidden="true">‹</span> Redire autrement
          </button>
          <h1 className="titre text-[32px] mt-6">Ce que j’ai compris</h1>
          <p className="mt-2 text-[15px] text-doux">
            Décoche ce qui est faux, complète les montants manquants. Rien n’est
            enregistré tant que tu n’as pas validé — et une ligne sans montant ne
            part pas.
          </p>

          <Surface className="mt-5">
            {reponse.charges.map((c, i) => (
              <label key={i}
                     className={`flex items-start gap-3 py-4 cursor-pointer
                       ${i < reponse.charges.length - 1 ? 'border-b border-brume' : ''}`}>
                <input type="checkbox" checked={retenues.has(i)}
                       onChange={() => setRetenues(s => {
                         const n = new Set(s)
                         n.has(i) ? n.delete(i) : n.add(i)
                         return n
                       })}
                       className="mt-1 w-[22px] h-[22px] accent-[#2F5D45] shrink-0" />
                <span className="grow">
                  <span className="block text-[16px]">{c.libelle}</span>
                  <span className="block mt-0.5 text-[14px] text-doux">
                    {c.periodicite === 'mensuel' ? 'par mois'
                      : c.periodicite === 'trimestriel' ? 'par trimestre' : 'par an'}
                    {c.portee === 'commun' ? ' · en commun' : ' · à toi'}
                    {c.variable && ' · variable'}
                  </span>
                  <span className="mt-2 flex items-center gap-2"
                        onClick={e => e.preventDefault()}>
                    <input type="text" inputMode="decimal"
                           aria-label={`Montant de ${c.libelle}`}
                           value={corriges[i] ?? (c.montant_cents === null
                             ? '' : String(c.montant_cents / 100).replace('.', ','))}
                           onChange={e => setCorriges(m => ({ ...m, [i]: e.target.value }))}
                           placeholder="à compléter"
                           className="w-28 min-h-11 rounded-[12px] border border-brume
                                      bg-surface px-3 text-[16px] placeholder:text-doux" />
                    <span className="text-[15px] text-doux">€</span>
                  </span>
                  {c.remarque && (
                    <span className="block mt-1.5 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
                      {c.remarque}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </Surface>

          {reponse.questions.length > 0 && (
            <>
              <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
                Il me manque ça
              </h2>
              <Surface className="mt-3">
                {reponse.questions.map((q, i) => (
                  <p key={i} className="py-2 text-[15px]">{q}</p>
                ))}
                <p className="mt-2 text-[14px] text-doux">
                  Reviens en arrière et complète ta phrase, ou règle-les à la main après.
                </p>
              </Surface>
            </>
          )}

          {reponse.oublis.length > 0 && (
            <>
              <h2 className="mt-8 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
                Tu n’en as pas parlé
              </h2>
              <p className="mt-2 text-[15px] text-doux">
                {reponse.oublis.join(' · ')}
              </p>
            </>
          )}

          <BarreAction>
            <Principal disabled={pretes.length === 0}
                       onClick={() => surRetenues(pretes)}>
              Ajouter {pretes.length} charge{pretes.length > 1 ? 's' : ''}
            </Principal>
          </BarreAction>
        </div>
      </main>
    )
  }

  return (
    /* `pb-48` et non `pb-40` : la barre d'action flottante recouvrait le bas de
       la zone de dictée, qui est justement l'endroit où l'on écrit. */
    <main className="min-h-dvh px-6 pt-14 pb-48">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Les charges
        </button>

        <h1 className="titre text-[32px] mt-6">{consigne.titre}</h1>

        <div role="tablist" aria-label="Section" className="mt-5 flex gap-2 flex-wrap">
          {CONSIGNE.map((c, i) => (
            <button key={c.titre} role="tab" aria-selected={etape === i}
                    onClick={() => { setEtape(i); setTexte('') }}
                    className={`px-3.5 min-h-11 inline-flex items-center rounded-full text-[13px]
                                transition-colors
                      ${etape === i ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
              {c.titre}
            </button>
          ))}
        </div>

        <Surface className="mt-5">
          <p className="text-[15px] leading-[24px]">
            <span className="font-semibold">Dis-moi :</span> {consigne.quoi}
          </p>
          <p className="mt-3 text-[15px] leading-[24px] text-doux italic">
            « {consigne.exemple} »
          </p>
        </Surface>

        <label className="block mt-5">
          <span className="text-[15px] font-semibold">Ta dictée</span>
          <p className="mt-1 text-[14px] text-doux">
            Appuie sur le micro de ton clavier et parle. Tu peux relire et corriger
            avant d’envoyer.
          </p>
          <textarea value={texte} onChange={e => setTexte(e.target.value)}
                    rows={7} placeholder="Appuie sur le micro, ou écris…"
                    className="mt-2.5 w-full rounded-[14px] border border-brume bg-surface
                               p-4 text-[16px] leading-[26px] resize-none
                               placeholder:text-doux" />
        </label>

        <Erreur de={erreur} />
      </div>

      <BarreAction>
        <Principal disabled={texte.trim().length < 10 || envoi} onClick={range}>
          {envoi ? 'Je range…' : 'Range tout ça'}
        </Principal>
      </BarreAction>
    </main>
  )
}
