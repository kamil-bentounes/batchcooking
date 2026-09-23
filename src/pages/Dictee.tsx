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
import { enCentimes, useCatalogue } from '../lib/donnees/budget.ts'

type Proposee = {
  libelle: string
  catalogue_libelle: string | null
  montant_cents: number | null
  periodicite: 'mensuel' | 'trimestriel' | 'annuel'
  portee: 'commun' | 'perso'
  variable: boolean
  confiance: number
  remarque: string | null
  /* Depuis quand elle court. Le modèle ne le dit pas — on ne le dicte pas —
     mais une charge NON MENSUELLE en dépend entièrement : une taxe foncière de
     1 450 € posée en septembre ne provisionne que quatre mois, et sa
     régularisation en réclame 1 329 € d'un coup au lieu de 362 €. */
  debut?: string
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
  /* La périodicité et la portée aussi : ce sont les deux erreurs les plus
     plausibles du modèle, et les plus chères. Un trimestriel lu mensuel fait
     ×3 ; une charge perso marquée commune fait payer l'autre. La seule issue
     était de décocher et de tout ressaisir à la main. */
  const [reglages, setReglages] = useState<Record<number, Partial<Proposee>>>({})
  const ajuste = (i: number, p: Partial<Proposee>) =>
    setReglages(m => ({ ...m, [i]: { ...m[i], ...p } }))
  /* Le 1er janvier de l'année en cours : une charge annuelle ou trimestrielle
     couvre l'année civile, pas les mois qui restent. C'est le défaut juste
     dans la quasi-totalité des cas, et il se change d'un geste. */
  const DEBUT_PAR_DEFAUT = `${new Date().getFullYear()}-01-01`
  const [envoi, setEnvoi] = useState(false)
  const [erreur, setErreur] = useState<unknown>(null)
  const catalogue = useCatalogue()

  /* Un oubli n'était qu'un mot posé sur l'écran : « Charges de copropriété »,
     et débrouille-toi. On le rend AJOUTABLE — le rythme et la portée viennent
     du catalogue, le montant reste à taper. Signaler ce qui manque sans offrir
     de le combler, c'est faire porter deux fois le travail. */
  const posteDuCatalogue = new Map(
    (catalogue.data ?? []).flatMap(s => s.lignes).map(l => [l.libelle, l]))

  function ajouteLOubli(libelle: string) {
    const l = posteDuCatalogue.get(libelle)
    setReponse(r => r && {
      ...r,
      oublis: r.oublis.filter(o => o !== libelle),
      charges: [...r.charges, {
        libelle,
        catalogue_libelle: l ? libelle : null,
        montant_cents: null,
        periodicite: (l?.periode ?? 'mensuel') as Proposee['periodicite'],
        portee: (l?.portee ?? 'commun') as Proposee['portee'],
        variable: false, confiance: 0,
        remarque: 'Ajoutée par toi — il ne manque que le montant.',
      }],
    })
    /* Cochée d'avance : on vient de la demander. Elle ne partira quand même
       pas sans montant, `pretes` filtre les lignes vides. */
    setRetenues(s => new Set(s).add(reponse!.charges.length))
  }

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
  /** Une ligne telle qu'elle est après correction — c'est elle qu'on affiche. */
  const vue = (i: number): Proposee => ({ ...reponse!.charges[i], ...reglages[i] })

  const pretes = reponse
    ? [...retenues].sort((a, b) => a - b).map(i => {
        const saisi = corriges[i]
        const cents = saisi !== undefined ? enCentimes(saisi) : vue(i).montant_cents
        const v = vue(i)
        return {
          ...v, montant_cents: cents,
          debut: v.periodicite === 'mensuel' ? undefined : (v.debut ?? DEBUT_PAR_DEFAUT),
        }
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
                  <span className="mt-1.5 flex gap-1.5 flex-wrap"
                        onClick={e => e.preventDefault()}>
                    {([['mensuel', 'mois'], ['trimestriel', 'trimestre'],
                       ['annuel', 'an']] as const).map(([v, nom]) => (
                      <button key={v} type="button" aria-pressed={vue(i).periodicite === v}
                              onClick={() => ajuste(i, { periodicite: v })}
                              className={`px-3 min-h-11 inline-flex items-center rounded-full
                                          text-[13px] transition-colors
                                ${vue(i).periodicite === v
                                  ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                        {nom}
                      </button>
                    ))}
                    {([['commun', 'en commun'], ['perso', 'à toi']] as const).map(([v, nom]) => (
                      <button key={v} type="button" aria-pressed={vue(i).portee === v}
                              onClick={() => ajuste(i, { portee: v })}
                              className={`px-3 min-h-11 inline-flex items-center rounded-full
                                          text-[13px] transition-colors
                                ${vue(i).portee === v
                                  ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
                        {nom}
                      </button>
                    ))}
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
                  {/* Une charge NON MENSUELLE se provisionne au douzième depuis
                      sa date de départ. Sans elle, une taxe foncière dictée en
                      septembre ne provisionne que quatre mois, et la
                      régularisation réclame le reste d'un coup. */}
                  {vue(i).periodicite !== 'mensuel' && (
                    <span className="mt-2 flex items-center gap-2 flex-wrap"
                          onClick={e => e.preventDefault()}>
                      <span className="text-[14px] text-doux">Elle court depuis</span>
                      <input type="month"
                             aria-label={`Depuis quand court ${c.libelle}`}
                             value={(vue(i).debut ?? DEBUT_PAR_DEFAUT).slice(0, 7)}
                             onChange={e => ajuste(i, { debut: `${e.target.value}-01` })}
                             className="min-h-11 rounded-[12px] border border-brume
                                        bg-surface px-3 text-[15px]" />
                    </span>
                  )}
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
                Tu n’en as pas parlé — tu en as ?
              </h2>
              <p className="mt-2 text-[15px] text-doux">
                Touche celles que tu paies, elles s’ajoutent en haut et il ne
                restera qu’à mettre le montant.
              </p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {reponse.oublis.map(o => (
                  <button key={o} type="button" onClick={() => ajouteLOubli(o)}
                          className="px-3.5 min-h-11 inline-flex items-center rounded-full
                                     border border-brume bg-surface text-[15px]
                                     transition-colors hover:bg-brume/40">
                    + {o}
                  </button>
                ))}
              </div>
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
