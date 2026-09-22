/**
 * Les charges du foyer.
 *
 * Il n'y a qu'UNE liste. Pas « les communes » d'un côté et « les perso » de
 * l'autre qu'il faudrait synchroniser : chaque ligne dit qui participe, et
 * « perso » n'est que le cas où il n'y a qu'une personne dedans. C'est ici, sur
 * la ligne, que se décide ce qui est partagé — nulle part ailleurs.
 *
 * L'ajout part du CATALOGUE. Un écran « ajoute tes dépenses » avec un champ
 * vide obtient une chose : rien. On ne se souvient pas de ses charges, on les
 * reconnaît — d'où cinquante-deux lignes à cocher, chacune avec la périodicité
 * la plus probable, parce qu'un contrôle technique saisi comme mensuel fait une
 * erreur d'un facteur douze.
 */
import { useState } from 'react'
import { Dictee } from './Dictee.tsx'
import { Surface, Vide, Attente, Erreur, Principal, BarreAction } from '../ui/coque.tsx'
import { Champ } from '../ui/kit.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  useCharges, useCatalogue, useAjouteCharge, useArchiveCharge, useComptes,
  useEnveloppesPosees, useRattacheCharge, euros, enCentimes, type Charge,
} from '../lib/donnees/budget.ts'

const PERIODE: Record<string, string> = {
  mensuel: 'par mois', trimestriel: 'par trimestre', annuel: 'par an',
}

type Filtre = 'tout' | 'commun' | 'moi'

/** Le formulaire d'ajout, qu'il vienne du catalogue ou d'une ligne inventée. */
function Ajout({ depart, membres, moi, foyerId, comptes, enveloppes, surFini }: {
  depart: { libelle: string; periode: string; portee: string; precision: string | null
            catalogueId: string | null } | null
  membres: { id: string; display_name: string }[]
  moi: string
  foyerId: string
  comptes: { id: string; nom: string; genre: string }[]
  enveloppes: { id: string; libelle: string }[]
  surFini: () => void
}) {
  const [libelle, setLibelle] = useState(depart?.libelle ?? '')
  const [montant, setMontant] = useState('')
  const [periode, setPeriode] = useState(depart?.periode ?? 'mensuel')
  const [variable, setVariable] = useState(false)
  const [cle, setCle] = useState<'defaut' | 'prorata' | 'moitie'>('defaut')
  /* Le compte débité et l'enveloppe. Sans eux, l'app ne peut annoncer qu'un
     montant à répartir — jamais un virement, qui est la seule chose sur
     laquelle on agit.

     Le COMMUN d'office, pas le premier de la liste : `useComptes` trie par nom,
     si bien qu'un livret ou le compte de l'autre pouvait être proposé. */
  const [compteId, setCompteId] = useState<string>(
    comptes.find(c => c.genre === 'commun')?.id ?? comptes[0]?.id ?? '')
  const [enveloppeId, setEnveloppeId] = useState<string>('')
  /* Le catalogue PRÉ-COCHE : les deux pour l'électricité, une seule personne
     pour un forfait mobile. Ce n'est qu'une suggestion — la case reste ouverte. */
  const [qui, setQui] = useState<string[]>(
    depart?.portee === 'perso' ? [moi] : membres.map(m => m.id))
  const ajoute = useAjouteCharge()

  const cents = enCentimes(montant)
  const saisiFaux = montant.trim() !== '' && cents === null
  const pret = libelle.trim() !== '' && cents !== null && cents > 0 && qui.length > 0

  return (
    <>
      <div className="mt-5 space-y-4">
        <Champ label="Quoi" value={libelle} onChange={e => setLibelle(e.target.value)} />
        {depart?.precision && (
          <p className="-mt-1 text-[14px] leading-[22px] text-doux">{depart.precision}</p>
        )}
        <Champ label="Combien (€)" type="text" inputMode="decimal" value={montant}
               onChange={e => setMontant(e.target.value)} />
        {saisiFaux && (
          <p className="-mt-1 text-[14px]" style={{ color: 'var(--color-ocre)' }}>
            Un montant, avec au plus deux décimales : 37 ou 10,70.
          </p>
        )}

        <div>
          <span className="block text-[15px] font-semibold">À quel rythme</span>
          <div role="radiogroup" aria-label="Périodicité" className="mt-2 flex gap-2">
            {(['mensuel', 'trimestriel', 'annuel'] as const).map(p => (
              <button key={p} role="radio" aria-checked={periode === p}
                      onClick={() => setPeriode(p)}
                      className={`flex-1 min-h-11 rounded-[12px] text-[14px] transition-colors
                        ${periode === p ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                {p === 'mensuel' ? 'Mois' : p === 'trimestriel' ? 'Trimestre' : 'An'}
              </button>
            ))}
          </div>
          {periode !== 'mensuel' && (
            <p className="mt-2 text-[14px] text-doux">
              Provisionnée au {periode === 'annuel' ? 'douzième' : 'tiers'} chaque mois :
              {' '}{euros(Math.round((cents ?? 0) / (periode === 'annuel' ? 12 : 3)))} par mois.
            </p>
          )}
        </div>

        <div>
          <span className="block text-[15px] font-semibold">Qui participe</span>
          <div className="mt-2 flex gap-2 flex-wrap">
            {membres.map(m => {
              const dedans = qui.includes(m.id)
              return (
                <button key={m.id} role="checkbox" aria-checked={dedans}
                        onClick={() => setQui(l =>
                          dedans ? l.filter(x => x !== m.id) : [...l, m.id])}
                        className={`px-4 min-h-11 inline-flex items-center rounded-full
                                    text-[14px] transition-colors
                          ${dedans ? 'bg-herbe text-fond' : 'bg-brume/50 text-encre'}`}>
                  {m.display_name}
                </button>
              )
            })}
          </div>
          {qui.length === 1 && (
            <p className="mt-2 text-[14px] text-doux">
              Payée par une seule personne : elle n’entrera dans aucun partage.
            </p>
          )}
        </div>

        {qui.length > 1 && (
          <div>
            <span className="block text-[15px] font-semibold">Comment la partager</span>
            <div role="radiogroup" aria-label="Clé de répartition" className="mt-2 flex gap-2">
              {([['defaut', 'Comme le foyer'], ['prorata', 'Au prorata'],
                 ['moitie', 'Moitié-moitié']] as const).map(([v, nom]) => (
                <button key={v} role="radio" aria-checked={cle === v} onClick={() => setCle(v)}
                        className={`flex-1 min-h-11 rounded-[12px] text-[13px] transition-colors
                          ${cle === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {comptes.length > 0 && (
          <div>
            <span className="block text-[15px] font-semibold">Payée depuis</span>
            <div role="radiogroup" aria-label="Compte débité" className="mt-2 flex gap-2 flex-wrap">
              {comptes.map(c => (
                <button key={c.id} role="radio" aria-checked={compteId === c.id}
                        onClick={() => setCompteId(c.id)}
                        className={`px-4 min-h-11 inline-flex items-center rounded-full
                                    text-[14px] transition-colors
                          ${compteId === c.id ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {c.nom}
                </button>
              ))}
            </div>
          </div>
        )}

        {enveloppes.length > 0 && (
          <div>
            <span className="block text-[15px] font-semibold">Dans quelle enveloppe</span>
            <div role="radiogroup" aria-label="Enveloppe" className="mt-2 flex gap-2 flex-wrap">
              <button role="radio" aria-checked={enveloppeId === ''}
                      onClick={() => setEnveloppeId('')}
                      className={`px-4 min-h-11 inline-flex items-center rounded-full
                                  text-[14px] transition-colors
                        ${enveloppeId === '' ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                Aucune
              </button>
              {enveloppes.map(e => (
                <button key={e.id} role="radio" aria-checked={enveloppeId === e.id}
                        onClick={() => setEnveloppeId(e.id)}
                        className={`px-4 min-h-11 inline-flex items-center rounded-full
                                    text-[14px] transition-colors
                          ${enveloppeId === e.id ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {e.libelle}
                </button>
              ))}
            </div>
          </div>
        )}

        {comptes.length === 0 && (
          <p className="text-[15px]" style={{ color: 'var(--color-ocre)' }}>
            Aucun compte déclaré : cette charge apparaîtra sous « à répartir »
            au lieu d’un virement. Pose-les dans les réglages du budget.
          </p>
        )}

        <button role="checkbox" aria-checked={variable} onClick={() => setVariable(v => !v)}
                className="flex items-center gap-3 min-h-11 text-left">
          <span className={`w-[22px] h-[22px] rounded-[7px] border-2 shrink-0
                            ${variable ? 'bg-herbe border-herbe' : 'border-brume'}`} />
          <span className="text-[15px]">
            Le montant change — l’app demandera le vrai en fin de mois
          </span>
        </button>

        <Erreur de={ajoute.error} />
      </div>

      <BarreAction>
        <Principal disabled={!pret || ajoute.isPending}
                   onClick={() => ajoute.mutate({
                     libelle: libelle.trim(), montantCents: cents ?? 0, periodicite: periode,
                     participants: qui, cle: cle === 'defaut' ? null : cle,
                     catalogueId: depart?.catalogueId ?? null, variable, foyerId,
                     compteId: compteId || null, enveloppeId: enveloppeId || null,
                   }, { onSuccess: surFini })}>
          {ajoute.isPending ? 'J’ajoute…' : 'Ajouter cette charge'}
        </Principal>
      </BarreAction>
    </>
  )
}

export function Charges({ userId, retour }: { userId: string; retour: () => void }) {
  const [filtre, setFiltre] = useState<Filtre>('tout')
  const [dictee, setDictee] = useState(false)
  const [dit, setDit] = useState('')
  /* Le catalogue fait six hauteurs d'écran de pastilles. Sans moyen d'y
     chercher, on ne le parcourt pas — on renonce et on tape « Autre chose ». */
  const [cherche, setCherche] = useState('')
  const [ajout, setAjout] = useState<Parameters<typeof Ajout>[0]['depart'] | undefined>()
  const { data: foyer } = useFoyer()
  const charges = useCharges()
  const { data: catalogue = [] } = useCatalogue()
  const archive = useArchiveCharge()
  const ajouteUne = useAjouteCharge()
  const comptes = useComptes()
  const enveloppes = useEnveloppesPosees()
  const rattache = useRattacheCharge()
  /* Le compte commun, pour la dictée : elle ne demande pas où débiter, et une
     charge sans compte ne produit pas de virement. */
  const compteParDefaut = (comptes.data ?? [])
    .find(c => c.genre === 'commun')?.id ?? (comptes.data ?? [])[0]?.id ?? null

  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name }))
  const prenoms = new Map(membres.map(m => [m.id, m.display_name]))

  /* La dictée pose les lignes une à une, par la même mutation que le
     formulaire : elle n'a aucun chemin d'écriture à elle. Ce qu'un modèle
     propose entre par la même porte que ce qu'on tape. */
  if (dictee) {
    return (
      <Dictee retour={() => setDictee(false)} surRetenues={async lignes => {
        /* Une ligne sans montant n'entre PAS à zéro : le formulaire manuel
           refuse zéro, et il n'y a aucune raison qu'une dictée l'accepte. Elles
           sont écartées avant l'écriture, et l'écran de revue les montre
           décochées. */
        for (const l of lignes.filter(x => x.montant_cents && x.montant_cents > 0)) {
          await ajouteUne.mutateAsync({
            libelle: l.libelle,
            montantCents: l.montant_cents!,
            periodicite: l.periodicite,
            participants: l.portee === 'commun' ? membres.map(m => m.id) : [userId],
            variable: l.variable,
            compteId: compteParDefaut,
            /* Si une enveloppe porte déjà ce nom — « Restaurant », « Culture » —
               la charge s'y range d'elle-même : sinon la jauge resterait vide
               alors que la ligne existe. */
            enveloppeId: (enveloppes.data ?? []).find(
              e => e.libelle.toLowerCase() === l.libelle.toLowerCase())?.id ?? null,
            foyerId: foyer?.id ?? '',
          })
        }
        setDictee(false)
      }} />
    )
  }

  if (ajout !== undefined) {
    return (
      <main className="min-h-dvh px-6 pt-14 pb-40">
        <div className="mx-auto w-full max-w-lg">
          <button onClick={() => setAjout(undefined)}
                  className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
            <span aria-hidden="true">‹</span> Les charges
          </button>
          <h1 className="titre text-[32px] mt-6">
            {ajout?.libelle || 'Une charge de plus'}
          </h1>
          <Ajout depart={ajout} membres={membres} moi={userId}
                 foyerId={foyer?.id ?? ''}
                 comptes={comptes.data ?? []} enveloppes={enveloppes.data ?? []}
                 surFini={() => setAjout(undefined)} />
        </div>
      </main>
    )
  }

  const vivantes = (charges.data ?? []).filter(c => !c.archive_le)
  const vues = vivantes.filter(c =>
    filtre === 'tout' ? true
    : filtre === 'commun' ? c.participants.length > 1
    : c.participants.length === 1 && c.participants[0] === userId)

  /* Une recherche insensible à la casse ET aux accents : personne ne tape
     « électricité » avec son accent sur un clavier de téléphone. */
  const sansAccent = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const q = sansAccent(cherche.trim())
  const vuesCatalogue = q === ''
    ? catalogue
    : catalogue
        .map(s => ({ ...s, lignes: s.lignes.filter(l => sansAccent(l.libelle).includes(q)) }))
        .filter(s => s.lignes.length > 0)

  const parMois = (c: Charge) =>
    c.periodicite === 'mensuel' ? c.montant_cents
    : c.periodicite === 'annuel' ? Math.round(c.montant_cents / 12)
    : Math.round(c.montant_cents / 3)
  const total = vues.reduce((s, c) => s + parMois(c), 0)

  return (
    <main className="min-h-dvh px-6 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Le mois
        </button>

        <h1 className="titre text-[34px] mt-6">Les charges</h1>

        <div role="group" aria-label="Filtrer" className="mt-5 flex gap-2">
          {([['tout', 'Tout'], ['commun', 'En commun'], ['moi', 'À moi']] as const).map(([v, nom]) => (
            <button key={v} aria-pressed={filtre === v} onClick={() => setFiltre(v)}
                    className={`px-4 min-h-11 inline-flex items-center rounded-full text-[14px]
                                transition-colors
                      ${filtre === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
              {nom}
            </button>
          ))}
        </div>

        <p className="mt-4 text-[15px] text-doux">
          {euros(total)} par mois {filtre === 'moi' ? 'pour toi' : 'pour le foyer'},
          {' '}une fois tout ramené au mois.
        </p>

        <Erreur de={charges.error ?? archive.error} />
        {dit && <p className="mt-3 text-[15px] text-doux">{dit}</p>}
        {charges.isPending ? <Attente /> : vues.length === 0 ? (
          <Vide titre="Rien encore"
                texte="Ajoute-les depuis le catalogue : on ne se souvient pas de ses charges, on les reconnaît." />
        ) : (
          <Surface className="mt-4">
            {vues.map((c, i) => (
              <div key={c.id}
                   className={`py-4 flex items-start gap-3
                               ${i < vues.length - 1 ? 'border-b border-brume' : ''}`}>
                <span className="grow">
                  <span className="block text-[16px]">{c.libelle}</span>
                  <span className="block mt-0.5 text-[14px] text-doux">
                    {euros(c.montant_cents)} {PERIODE[c.periodicite]}
                    {' · '}
                    {c.participants.length > 1
                      ? c.participants.map(u => prenoms.get(u) ?? '?').join(' et ')
                      : (prenoms.get(c.participants[0]) ?? 'personne') + ' seul'}
                    {c.cle === 'moitie' && ' · moitié-moitié'}
                    {c.cle === 'prorata' && ' · au prorata'}
                    {c.variable && ' · variable'}
                    {!c.compte_id && ' · sans compte'}
                  </span>
                </span>
                {/* Une charge sans histoire est réellement SUPPRIMÉE, une autre
                    archivée — et les deux disparaissaient de la liste sans un
                    mot. Un pouce qui glisse ne doit pas effacer une ligne. */}
                {/* Rattacher après coup : une charge née de la dictée, ou
                    d'avant que le formulaire ne demande le compte, n'avait
                    aucun moyen d'en recevoir un — et sans compte, elle ne
                    produit pas de virement. */}
                {!c.compte_id && comptes.data && comptes.data.length > 0 && (
                  <button onClick={() => rattache.mutate({
                            id: c.id,
                            compteId: comptes.data!.find(x => x.genre === 'commun')?.id
                              ?? comptes.data![0].id,
                          })}
                          className="min-h-11 px-2 text-[14px]"
                          style={{ color: 'var(--color-ocre)' }}>
                    Rattacher
                  </button>
                )}
                <button onClick={() => {
                          if (!confirm(`Retirer « ${c.libelle} » ? Les mois déjà ouverts la gardent.`)) return
                          archive.mutate(c.id, {
                            onSuccess: sort => setDit(sort === 'supprimee'
                              ? `« ${c.libelle} » supprimée.`
                              : `« ${c.libelle} » archivée : elle n’engendrera plus rien.`),
                          })
                        }}
                        disabled={archive.isPending}
                        aria-label={`Retirer ${c.libelle}`}
                        className="text-doux min-h-11 px-2 text-[14px]">Retirer</button>
              </div>
            ))}
          </Surface>
        )}

        <button onClick={() => setDictee(true)}
                className="mt-8 w-full min-h-[58px] rounded-[18px] bg-encre text-fond
                           text-[16px] font-medium">
          Dicte tout, je range
        </button>
        <p className="mt-2 text-center text-[14px] text-doux">
          Plus rapide que cocher cinquante lignes — et ça te dit ce que tu as oublié.
        </p>

        <h2 className="mt-10 text-[13px] font-semibold uppercase tracking-[0.06em] text-doux">
          Ou une par une
        </h2>
        <label className="mt-3 block">
          <span className="sr-only">Chercher une charge</span>
          <input value={cherche} onChange={e => setCherche(e.target.value)}
                 placeholder="Chercher — « assurance », « mobile »…"
                 className="w-full min-h-11 rounded-[14px] border border-brume bg-surface
                            px-4 text-[16px] placeholder:text-doux" />
        </label>
        <div className="mt-4 space-y-6">
          {vuesCatalogue.length === 0 && cherche.trim() !== '' && (
            <p className="text-[15px] text-doux">
              Rien sous ce nom. Prends « Autre chose » plus bas, le catalogue
              n’enferme personne.
            </p>
          )}
          {vuesCatalogue.map(section => (
            <div key={section.nom}>
              <p className="text-[15px] font-semibold">{section.nom}</p>
              <div className="mt-2 flex gap-2 flex-wrap">
                {section.lignes.map(l => (
                  <button key={l.id}
                          onClick={() => setAjout({
                            libelle: l.libelle, periode: l.periode, portee: l.portee,
                            precision: l.precision_txt, catalogueId: l.id,
                          })}
                          className="px-3.5 min-h-11 inline-flex items-center rounded-full
                                     border border-brume text-[14px] hover:bg-brume/40
                                     transition-colors">
                    {l.libelle}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => setAjout({
                    libelle: '', periode: 'mensuel', portee: 'commun',
                    precision: null, catalogueId: null })}
                  className="w-full min-h-11 rounded-[14px] border border-dashed border-brume
                             text-[15px] text-doux">
            Autre chose
          </button>
        </div>
      </div>
    </main>
  )
}
