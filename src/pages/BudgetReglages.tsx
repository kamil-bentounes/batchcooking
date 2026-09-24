/**
 * Les prérequis du budget : les revenus, les comptes, les enveloppes.
 *
 * Cet écran existe parce qu'il manquait, et que son absence rendait tout le
 * reste faux sans le dire :
 *
 *  · sans REVENU, `parts_du_foyer` bascule tout le monde à poids égal — le
 *    formulaire proposait « Au prorata » et ne l'honorait pas ;
 *  · sans COMPTE, les virements ne pouvaient annoncer qu'une ligne « à
 *    répartir », c'est-à-dire rien sur quoi agir ;
 *  · sans ENVELOPPE, aucun plafond ne s'affichait nulle part.
 *
 * L'ordre des trois sections est celui de leur nécessité, pas de leur
 * complexité : on ne peut rien calculer sans les revenus.
 */
import { useState } from 'react'
import { useRoute } from '../lib/route.ts'
import { Surface, Erreur, Attente } from '../ui/coque.tsx'
import { Champ } from '../ui/kit.tsx'
import { useFoyer } from '../lib/donnees/foyer.ts'
import {
  useRevenus, usePoseRevenu, useComptes, usePoseCompte, useRegle, usePoseRegle, useRangeCompte, useRangeEnveloppe,
  useEnveloppesPosees, usePoseEnveloppe, useSuggestionsEnveloppe, euros, enCentimes,
} from '../lib/donnees/budget.ts'

/**
 * Ce qu'on propose, plutôt qu'un champ vide.
 *
 * 0050 l'avait écrit pour les charges et jamais appliqué ici : « on ne se
 * souvient pas de ses charges, on les RECONNAÎT ». Kamil, qui a pourtant écrit
 * l'application, a dû demander ce qu'il fallait mettre dans « Les comptes et
 * les enveloppes » — et s'attendait à ce qu'on lui propose les catégories.
 *
 * Une suggestion REMPLIT le formulaire, elle ne crée rien : le montant reste à
 * poser, et c'est le seul chiffre que nous n'avons pas le droit d'inventer.
 * Ce qui existe déjà disparaît de la liste — proposer « Courses » à quelqu'un
 * qui vient de créer « Courses » est une façon de ne pas le regarder.
 */
function Suggestions({ amorce, de, sur }:
  { amorce: string; de: string[]; sur: (x: string) => void }) {
  if (de.length === 0) return null
  return (
    <div className="mt-4">
      <p className="text-[14px] text-doux">{amorce}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {de.map(x => (
          <button key={x} onClick={() => sur(x)}
                  className="min-h-11 px-3.5 rounded-[12px] bg-brume/50 text-encre text-[14px]">
            {x}
          </button>
        ))}
      </div>
    </div>
  )
}

/* Les comptes ne sont pas un référentiel : ce sont QUATRE noms que presque tout
   foyer reconnaît, et le genre qui va avec — c'est lui qu'on se trompe à
   choisir, pas le nom. « Le mien » appartient à qui le crée, donc on ne
   propose pas celui de l'autre. */
const COMPTES_SUGGERES = [
  { nom: 'Compte joint', genre: 'commun' },
  { nom: 'Mon compte courant', genre: 'perso' },
  { nom: 'Livret A', genre: 'epargne' },
  { nom: 'LDDS', genre: 'epargne' },
] as const

function Section({ titre, aide, children }:
  { titre: string; aide: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="titre text-[24px]">{titre}</h2>
      <p className="mt-1.5 text-[15px] leading-[23px] text-doux">{aide}</p>
      {children}
    </section>
  )
}

export function BudgetReglages({ userId, retour }: { userId: string; retour: () => void }) {
  const { va } = useRoute()
  const { data: foyer, isPending } = useFoyer()
  const revenus = useRevenus()
  const comptes = useComptes()
  const enveloppes = useEnveloppesPosees()
  const suggestions = useSuggestionsEnveloppe()
  const poseRevenu = usePoseRevenu()
  const poseCompte = usePoseCompte()
  const poseEnveloppe = usePoseEnveloppe()
  const regle = useRegle()
  const poseRegle = usePoseRegle()
  const rangeCompte = useRangeCompte()
  const rangeEnveloppe = useRangeEnveloppe()

  const [monRevenu, setMonRevenu] = useState('')
  const [nomCompte, setNomCompte] = useState('')
  const [genreCompte, setGenreCompte] = useState<'commun' | 'perso' | 'epargne'>('commun')
  const [nomEnveloppe, setNomEnveloppe] = useState('')
  const [plafond, setPlafond] = useState('')

  if (isPending) return <main className="min-h-dvh grid place-items-center"><Attente /></main>

  const foyerId = foyer?.id ?? ''
  const membres = foyer?.membres ?? []
  const parPersonne = new Map((revenus.data ?? []).map(r => [r.user_profile_id, r]))
  const manquants = membres.filter(m => !parPersonne.has(m.id))

  const cRevenu = enCentimes(monRevenu)
  const cPlafond = enCentimes(plafond)

  return (
    <main className="min-h-dvh px-6 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux">
          <span aria-hidden="true">‹</span> Le mois
        </button>
        <h1 className="titre text-[34px] mt-6">Réglages du budget</h1>

        {/* ⚠️ « Inviter » ne vivait QUE dans les réglages de la cuisine.
            Depuis l'univers budget — celui où l'on découvre qu'on est seul et
            que le prorata ne sert à rien — aucun écran ne contenait le mot :
            il fallait repasser par le hub, la cuisine, ses réglages. C'est le
            geste fondateur du partage, il se pose là où le partage se règle. */}
        {membres.length < 2 && (
          <Section titre="Ton foyer"
                   aide="Un partage à deux commence par quelqu'un d'autre. Tant que tu es
                         seul, tout t'est attribué et la règle de partage ne change rien.">
            <button onClick={() => va('/reglages')}
                    className="mt-4 w-full min-h-[52px] rounded-[14px] bg-herbe text-fond
                               text-[16px] font-medium">
              Inviter quelqu’un
            </button>
          </Section>
        )}

        <Section titre="Les revenus"
                 aide="Ton net mensuel après impôt. Il ne sert qu'à calculer votre partage,
                       et le foyer le voit — vous partagez un compte, pas des secrets.">
          <Surface className="mt-4">
            {membres.map((m, i) => {
              const r = parPersonne.get(m.id)
              return (
                <div key={m.id}
                     className={`py-3.5 flex items-baseline justify-between
                                 ${i < membres.length - 1 ? 'border-b border-brume' : ''}`}>
                  <span className="text-[16px]">{m.display_name}</span>
                  <span className="text-[15px]"
                        style={{ color: r ? undefined : 'var(--color-ocre)' }}>
                    {r ? `${euros(r.net_mensuel_cents)} / mois` : 'pas encore renseigné'}
                  </span>
                </div>
              )
            })}
          </Surface>

          {manquants.length > 0 && (
            <p className="mt-3 text-[15px]" style={{ color: 'var(--color-ocre)' }}>
              Tant qu’il en manque un, le partage se fait à parts égales — même si
              tu as choisi le prorata.
            </p>
          )}

          <div className="mt-4 space-y-3">
            <Champ label="Mon net mensuel (€)" type="text" inputMode="decimal"
                   value={monRevenu} onChange={e => setMonRevenu(e.target.value)} />
            <button disabled={!cRevenu || cRevenu <= 0 || poseRevenu.isPending}
                    onClick={() => poseRevenu.mutate(
                      { foyerId, userId, cents: cRevenu! },
                      { onSuccess: () => setMonRevenu('') })}
                    className="w-full min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                               font-medium disabled:bg-brume disabled:text-encre">
              {parPersonne.has(userId) ? 'Mettre à jour mon revenu' : 'Enregistrer mon revenu'}
            </button>
            {parPersonne.has(userId) && (
              <p className="text-[14px] text-doux">
                Le précédent est gardé : les mois déjà partagés ne bougent pas.
              </p>
            )}
          </div>
          <Erreur de={revenus.error ?? poseRevenu.error} />
        </Section>

        <Section titre="Comment vous partagez"
                 aide="La règle par défaut du foyer. Chaque charge peut imposer la sienne,
                       et « pour une seule personne » se dit en ne mettant qu'elle dans les
                       participants.">
          <div role="radiogroup" aria-label="Règle de partage" className="mt-4 flex gap-2">
            {([['prorata', 'Au prorata'], ['moitie', 'Moitié-moitié']] as const)
              .map(([v, nom]) => (
                <button key={v} role="radio" aria-checked={regle.data === v}
                        disabled={poseRegle.isPending}
                        onClick={() => poseRegle.mutate({ foyerId, cle: v })}
                        className={`flex-1 min-h-11 rounded-[12px] text-[15px] transition-colors
                          ${regle.data === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                  {nom}
                </button>
              ))}
          </div>
          <p className="mt-2 text-[14px] text-doux">
            Le changement vaut à partir de ce mois : les mois déjà partagés ne bougent pas.
          </p>
          <Erreur de={regle.error ?? poseRegle.error} />
        </Section>

        <Erreur de={rangeCompte.error ?? rangeEnveloppe.error} />

        <Section titre="Les comptes"
                 aide="Un par vrai compte bancaire. Sans eux, l'app ne peut annoncer qu'un
                       montant ; avec eux, elle dit où virer.">
          <Surface className="mt-4">
            {(comptes.data ?? []).length === 0
              ? <p className="py-3 text-[15px] text-doux">Aucun compte. Commence par le commun.</p>
              : (comptes.data ?? []).map((c, i) => (
                  <div key={c.id}
                       className={`py-3.5 flex items-baseline justify-between
                                   ${i < (comptes.data ?? []).length - 1 ? 'border-b border-brume' : ''}`}>
                    <span className="text-[16px]">{c.nom}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] text-doux">
                        {c.genre === 'commun' ? 'commun'
                          : c.genre === 'epargne' ? 'épargne'
                          : membres.find(m => m.id === c.titulaire_id)?.display_name ?? 'perso'}
                      </span>
                      {/* On pouvait ajouter, jamais retirer : « Compte commn »
                          restait pour toujours, dans la liste ET dans le menu
                          « où débiter » de chaque charge. On ARCHIVE — il a
                          débité des mois qu'on relit. */}
                      <button onClick={() => rangeCompte.mutate({ id: c.id, ranger: true })}
                              disabled={rangeCompte.isPending}
                              aria-label={`Ranger ${c.nom}`}
                              className="min-h-11 px-2 text-[14px] text-doux">Ranger</button>
                    </span>
                  </div>
                ))}
          </Surface>

          {/* AVANT le formulaire : on pioche, puis on ajuste. Sous le bouton
              « Ajouter », les pastilles ne se découvraient qu'après avoir tapé
              le nom à la main — c'est-à-dire trop tard. Le genre se pose AVEC
              le nom, parce que c'est lui qu'on se trompe à choisir. */}
          <Suggestions amorce="Les plus courants :"
            de={COMPTES_SUGGERES
              .filter(c => !(comptes.data ?? []).some(
                x => x.nom.toLowerCase() === c.nom.toLowerCase()))
              .map(c => c.nom)}
            sur={nom => {
              setNomCompte(nom)
              const c = COMPTES_SUGGERES.find(x => x.nom === nom)
              if (c) setGenreCompte(c.genre)
            }} />
          <div className="mt-4 space-y-3">
            <Champ label="Nom du compte" value={nomCompte}
                   onChange={e => setNomCompte(e.target.value)} />
            <div role="radiogroup" aria-label="Genre de compte" className="flex gap-2">
              {([['commun', 'Commun'], ['perso', 'Le mien'], ['epargne', 'Épargne']] as const)
                .map(([v, nom]) => (
                  <button key={v} role="radio" aria-checked={genreCompte === v}
                          onClick={() => setGenreCompte(v)}
                          className={`flex-1 min-h-11 rounded-[12px] text-[14px] transition-colors
                            ${genreCompte === v ? 'bg-encre text-fond' : 'bg-brume/50 text-encre'}`}>
                    {nom}
                  </button>
                ))}
            </div>
            <button disabled={nomCompte.trim() === '' || poseCompte.isPending}
                    onClick={() => poseCompte.mutate({
                      foyerId, nom: nomCompte.trim(), genre: genreCompte,
                      titulaireId: userId, matelasCents: 0,
                    }, { onSuccess: () => setNomCompte('') })}
                    className="w-full min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                               font-medium disabled:bg-brume disabled:text-encre">
              Ajouter ce compte
            </button>
          </div>
          <Erreur de={comptes.error ?? poseCompte.error} />
        </Section>

        <Section titre="Les enveloppes"
                 aide="Un plafond mensuel : restaurant, sorties, culture. Aucun argent ne
                       bouge — c'est une limite, et elle repart à zéro chaque mois.">
          <Surface className="mt-4">
            {(enveloppes.data ?? []).length === 0
              ? <p className="py-3 text-[15px] text-doux">Aucune enveloppe.</p>
              : (enveloppes.data ?? []).map((e, i) => (
                  <div key={e.id}
                       className={`py-3.5 flex items-baseline justify-between
                                   ${i < (enveloppes.data ?? []).length - 1 ? 'border-b border-brume' : ''}`}>
                    <span className="text-[16px]">{e.libelle}</span>
                    <span className="flex items-baseline gap-2">
                      <span className="text-[15px] text-doux">{euros(e.plafond_cents)} / mois</span>
                      <button onClick={() => rangeEnveloppe.mutate({ id: e.id, ranger: true })}
                              disabled={rangeEnveloppe.isPending}
                              aria-label={`Ranger ${e.libelle}`}
                              className="min-h-11 px-2 text-[14px] text-doux">Ranger</button>
                    </span>
                  </div>
                ))}
          </Surface>

          {/* Le libellé part du catalogue TEL QUEL : une charge « Restaurants »
              se range d'elle-même dans l'enveloppe qui porte le même nom, et
              « Restaurant » au singulier casserait ce rattachement. */}
          <Suggestions amorce="Les postes qui se plafonnent :"
            de={(suggestions.data ?? [])
              .map(c => c.libelle)
              .filter(l => !(enveloppes.data ?? []).some(
                e => e.libelle.toLowerCase() === l.toLowerCase()))}
            sur={setNomEnveloppe} />
          <div className="mt-4 space-y-3">
            <Champ label="Nom de l’enveloppe" value={nomEnveloppe}
                   onChange={e => setNomEnveloppe(e.target.value)} />
            <Champ label="Plafond mensuel (€)" type="text" inputMode="decimal"
                   value={plafond} onChange={e => setPlafond(e.target.value)} />
            <button disabled={nomEnveloppe.trim() === '' || !cPlafond || poseEnveloppe.isPending}
                    onClick={() => poseEnveloppe.mutate({
                      foyerId, libelle: nomEnveloppe.trim(), plafondCents: cPlafond!,
                    }, { onSuccess: () => { setNomEnveloppe(''); setPlafond('') } })}
                    className="w-full min-h-11 rounded-[14px] bg-herbe text-fond text-[15px]
                               font-medium disabled:bg-brume disabled:text-encre">
              Ajouter cette enveloppe
            </button>
          </div>
          <Erreur de={enveloppes.error ?? poseEnveloppe.error ?? suggestions.error} />
        </Section>
      </div>
    </main>
  )
}
