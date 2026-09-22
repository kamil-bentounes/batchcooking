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
  useCharges, useCatalogue, useAjouteCharge, useArchiveCharge, euros, enCentimes,
  type Charge,
} from '../lib/donnees/budget.ts'

const PERIODE: Record<string, string> = {
  mensuel: 'par mois', trimestriel: 'par trimestre', annuel: 'par an',
}

type Filtre = 'tout' | 'commun' | 'moi'

/** Le formulaire d'ajout, qu'il vienne du catalogue ou d'une ligne inventée. */
function Ajout({ depart, membres, moi, foyerId, surFini }: {
  depart: { libelle: string; periode: string; portee: string; precision: string | null
            catalogueId: string | null } | null
  membres: { id: string; display_name: string }[]
  moi: string
  foyerId: string
  surFini: () => void
}) {
  const [libelle, setLibelle] = useState(depart?.libelle ?? '')
  const [montant, setMontant] = useState('')
  const [periode, setPeriode] = useState(depart?.periode ?? 'mensuel')
  const [variable, setVariable] = useState(false)
  const [cle, setCle] = useState<'defaut' | 'prorata' | 'moitie'>('defaut')
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
  const [ajout, setAjout] = useState<Parameters<typeof Ajout>[0]['depart'] | undefined>()
  const { data: foyer } = useFoyer()
  const charges = useCharges()
  const { data: catalogue = [] } = useCatalogue()
  const archive = useArchiveCharge()
  const ajouteUne = useAjouteCharge()

  const membres = (foyer?.membres ?? []).map(m => ({ id: m.id, display_name: m.display_name }))
  const prenoms = new Map(membres.map(m => [m.id, m.display_name]))

  /* La dictée pose les lignes une à une, par la même mutation que le
     formulaire : elle n'a aucun chemin d'écriture à elle. Ce qu'un modèle
     propose entre par la même porte que ce qu'on tape. */
  if (dictee) {
    return (
      <Dictee retour={() => setDictee(false)} surRetenues={async lignes => {
        for (const l of lignes) {
          await ajouteUne.mutateAsync({
            libelle: l.libelle,
            montantCents: l.montant_cents ?? 0,
            periodicite: l.periodicite,
            participants: l.portee === 'commun' ? membres.map(m => m.id) : [userId],
            variable: l.variable,
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
                 foyerId={foyer?.id ?? ''} surFini={() => setAjout(undefined)} />
        </div>
      </main>
    )
  }

  const vivantes = (charges.data ?? []).filter(c => !c.archive_le)
  const vues = vivantes.filter(c =>
    filtre === 'tout' ? true
    : filtre === 'commun' ? c.participants.length > 1
    : c.participants.length === 1 && c.participants[0] === userId)

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
                    {c.variable && ' · variable'}
                  </span>
                </span>
                {/* Une charge sans histoire est réellement SUPPRIMÉE, une autre
                    archivée — et les deux disparaissaient de la liste sans un
                    mot. Un pouce qui glisse ne doit pas effacer une ligne. */}
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
        <div className="mt-3 space-y-6">
          {catalogue.map(section => (
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
