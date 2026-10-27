import { useEffect, useId, useState } from 'react'
import { supabase, callFunction, deconnecte } from '../lib/supabase'
import { lienDeploye } from '../lib/route.ts'
import { initialeDe, prenomDe, useCreeMagasin, useFoyer, useMagasins, useSupprimeMagasin } from '../lib/donnees/foyer.ts'
import { useAmis, useInviteAmi, useRompAmitie } from '../lib/donnees/amis.ts'
import { Attente, Erreur } from '../ui/coque.tsx'
import { Message } from '../ui/kit'
import { PageReglages } from '../ui/reglages/coque.tsx'
import { BoutonCarte, Carte, Ligne, Picto, Rubrique, Saisie } from '../ui/reglages/cartes.tsx'
import { DESSINS } from '../ui/reglages/dessins.tsx'

/** La section sous laquelle le dernier message s'affiche. */
type Zone = 'plafond' | 'courses' | 'inviter' | 'deconnexion' | 'donnees'

export function Settings({ va }: { va: (v: string) => void }) {
  const { data: foyer } = useFoyer()
  const [plafond, setPlafond] = useState(5)
  /** Vide = pas de budget fixé. Ne pas s'en fixer est un choix légitime. */
  const [courses, setCourses] = useState('')
  const [reste, setReste] = useState<number | null>(null)
  const [invite, setInvite] = useState('')
  const [lien, setLien] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)
  const [zone, setZone] = useState<Zone>('plafond')
  const [sortie, setSortie] = useState(false)
  /** Une invitation part : un second clic n'en lance pas une deuxième. */
  const [invitant, setInvitant] = useState(false)

  async function charger() {
    const { data: h } = await supabase.from('household')
      .select('llm_monthly_cap_eur, food_budget_eur').maybeSingle()
    if (h) {
      setPlafond(Number(h.llm_monthly_cap_eur))
      setCourses(h.food_budget_eur === null ? '' : String(Number(h.food_budget_eur)))
    }
    const { data: r } = await supabase.rpc('llm_budget_remaining')
    setReste(r === null ? null : Number(r))
  }
  useEffect(() => { charger() }, [])
  /* Arrivé par « Inviter quelqu'un » de l'accueil (`/reglages#inviter`) : la section est à mi-page,
     sous deux autres. Le `#` n'entre pas dans le routage (il ne lit que le chemin). */
  useEffect(() => {
    if (window.location.hash === '#inviter') document.getElementById('inviter')?.scrollIntoView?.()
  }, [])

  /* ⚠️ Le message s'affiche SOUS la section qui l'a fait naître.
     Il tombait tout en bas de la page, sous « Supprimer mon compte » : sur un
     téléphone, « Invitation créée » — ou l'erreur qui disait pourquoi elle ne
     l'était pas — restait hors de l'écran, et le bouton semblait sans effet. */
  const dire = (z: Zone, t: string, e = false) => { setZone(z); setErr(e); setMsg(t) }
  const ici = (z: Zone) => (zone === z ? <Message texte={msg} erreur={err} /> : null)

  async function enregistrerPlafond() {
    const { data: hh } = await supabase.rpc('current_household')
    if (!hh) return dire('plafond', 'Aucun foyer.', true)
    const { error } = await supabase.from('household')
      .update({ llm_monthly_cap_eur: plafond }).eq('id', hh)
    dire('plafond', error ? error.message : 'Plafond enregistré.', !!error)
    if (!error) charger()
  }

  async function enregistrerCourses() {
    const { data: hh } = await supabase.rpc('current_household')
    if (!hh) return dire('courses', 'Aucun foyer.', true)
    const v = courses.trim() === '' ? null : Number(courses.replace(',', '.'))
    if (v !== null && !(v > 0)) return dire('courses', 'Un budget se compte en euros, au-dessus de zéro.', true)
    const { error } = await supabase.from('household').update({ food_budget_eur: v }).eq('id', hh)
    dire('courses', error ? error.message : v === null ? 'Budget retiré.' : 'Budget enregistré.', !!error)
    if (!error) charger()
  }

  async function inviter() {
    if (invitant) return
    setInvitant(true)
    const adresse = invite.trim()
    try {
      const r = await callFunction<{ token: string }>('invite', { email: adresse })

      /* ⚠️ Aucun mail ne part (décision du 19/10/2026) : c'est TOI qui envoies
         le lien. Le mail de Supabase portait un lien mort au bout d'une heure,
         et cinq invitées n'ont jamais dépassé la création de compte. Un
         message qu'on envoie soi-même arrive, lui.

         ⚠️ `origin` seul perd le préfixe de déploiement : sur GitHub Pages le
            site est servi sous un sous-chemin, et le lien tombait sur une 404. */
      setLien(lienDeploye(`/invite/${r.token}`))
      dire('inviter', `Invitation créée pour ${adresse}. Envoie-lui ce lien.`)
    }
    catch (e) { setLien(''); dire('inviter', String((e as Error).message), true) }
    finally { setInvitant(false) }
  }

  async function exporter() {
    const { data, error } = await supabase.rpc('export_my_data')
    if (error) return dire('donnees', error.message, true)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'mes-donnees.json'; a.click()
  }

  /* Sans réseau, supabase-js réessaie trente secondes avant de rendre la
     main : le bouton le montre, sinon on croit qu'il ne fait rien. */
  async function deconnecter() {
    setSortie(true)
    const echec = await deconnecte()
    if (echec) { setSortie(false); dire('deconnexion', echec, true) }
  }

  async function supprimer() {
    if (!confirm('Supprimer ton compte et tes données ? C’est définitif.')) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return dire('donnees', error.message, true)
    /* `BASE_URL` et pas `'/'` : sous un sous-chemin, la racine du domaine est
       une 404. Même défaut que celui corrigé dans `AcceptInvite`. */
    await supabase.auth.signOut(); window.location.href = import.meta.env.BASE_URL
  }

  const montant = (n: number | null) =>
    n === null ? '—' : n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const idMembres = useId()

  return (
    <PageReglages titre="Réglages" actif="reglages">
      {/* « Inviter » d'abord : c'est le geste du premier soir, et le seul qui engage quelqu'un d'autre. */}
      <Carte id="inviter">
        <Rubrique titre="Inviter" picto={<Picto teinte="frais">{DESSINS.foyer}</Picto>}>
          {(foyer?.membres.length ?? 0) > 0 && (
            <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
              <ul aria-labelledby={idMembres} className="contents">
                {foyer!.membres.map((m, rang) => (
                  <li key={m.id} className="inline-flex h-10 items-center gap-2 rounded-full bg-piste pl-1.5 pr-3.5 font-semibold">
                    <span aria-hidden="true"
                          className={`grid h-7 w-7 place-items-center rounded-full text-[14px] text-white ${AVATARS[rang % AVATARS.length]}`}>
                      {initialeDe(m.display_name)}
                    </span>
                    {prenomDe(m.display_name)}
                  </li>
                ))}
              </ul>
              <span id={idMembres} className="text-[13px] text-doux">dans le foyer</span>
            </div>
          )}
          <p className="mb-3.5 text-[14px] leading-[1.45] text-doux">
            Tu obtiens un lien à lui envoyer, par SMS, WhatsApp ou mail. Il vaut
            trente jours et sert une fois : elle y choisit son mot de passe et
            rejoint le foyer, avec ses propres objectifs.
          </p>
          <div className="space-y-3">
            <Saisie label="Son e-mail" type="email" value={invite} placeholder="elle@exemple.fr"
                    picto={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
                                strokeLinecap="round" strokeLinejoin="round">{DESSINS.courriel}</svg>}
                    onChange={e => setInvite(e.target.value)} />
            <BoutonCarte variante={invite.trim() && !invitant ? 'plein' : 'calme'} onClick={inviter}
                         disabled={!invite.trim() || invitant}>
              {invitant ? 'Un instant…' : 'Créer l’invitation'}
            </BoutonCarte>
          </div>
          {ici('inviter')}
          {lien && (
            <div className="mt-4 rounded-2xl bg-fond p-4">
              <p className="text-[14px] text-doux">Son lien, valable 30 jours :</p>
              <p className="mt-2 break-all text-[15px] text-encre">{lien}</p>
              <div className="mt-2 flex gap-2">
                {/* Le partage du téléphone : SMS, WhatsApp, mail, en un geste. */}
                {typeof navigator.share === 'function' && (
                  <button type="button"
                    onClick={() => navigator.share({ title: 'Popote',
                      text: 'Rejoins notre foyer sur Popote :', url: lien }).catch(() => {})}
                    className="min-h-11 px-2 font-semibold text-herbe underline underline-offset-4">
                    Partager
                  </button>
                )}
                <button type="button"
                  onClick={() => { navigator.clipboard.writeText(lien); dire('inviter', 'Lien copié.') }}
                  className="min-h-11 px-2 font-semibold text-herbe underline underline-offset-4">
                  Copier le lien
                </button>
              </div>
            </div>
          )}
        </Rubrique>
      </Carte>

      {/* Le budget des courses et les magasins : deux réglages de la liste, une seule carte. */}
      <Carte>
        <Rubrique titre="Budget des courses" picto={<Picto teinte="sable">{DESSINS.euro}</Picto>}
                  texte={<>Le repère du bilan. Laisse vide si tu n’en veux pas : l’app affichera
                    ce qui est sorti du compte, sans jauge et sans jugement.</>}>
          <div className="flex items-end gap-2.5">
            <Saisie label="Par mois (€)" unite="€" type="number" step="10" min="0" value={courses}
                    placeholder="320" onChange={e => setCourses(e.target.value)} />
            <BoutonCarte court onClick={enregistrerCourses} aria-label="Enregistrer le budget" className="h-14">
              Enregistrer
            </BoutonCarte>
          </div>
          {ici('courses')}
        </Rubrique>
        <Rubrique titre="Tes magasins" picto={<Picto teinte="congel">{DESSINS.magasin}</Picto>}
                  texte="Chaque article porte son enseigne, et la liste se scinde par magasin.">
          <Magasins />
        </Rubrique>
      </Carte>

      <Carte>
        <Rubrique titre="Nos aliments" picto={<Picto teinte="sable">{DESSINS.aliments}</Picto>}
                  texte="Notre yaourt, notre skyr, notre pain, avec les vraies valeurs de l’étiquette. La semaine les propose avant les repères, en un geste.">
          <BoutonCarte variante="contour" onClick={() => va('/aliments')}>Ouvrir nos aliments</BoutonCarte>
        </Rubrique>
      </Carte>

      <Carte>
        {/* Le plafond ne bloque rien (voir `limites`) : il dit ce qu'on s'autorise. */}
        <Rubrique titre="Ce que coûtent les photos" picto={<Picto>{DESSINS.photo}</Picto>}
                  texte="Ce qu’on s’autorise à dépenser par mois pour lire une photo du frigo ou un ticket.">
          <p className="mb-3.5 flex flex-wrap items-baseline gap-x-2">
            <span className="chiffre text-[44px] font-semibold leading-none">{montant(reste)} €</span>
            <span className="text-[14px] text-doux">restants ce mois-ci</span>
          </p>
          <div className="flex items-end gap-2.5">
            <Saisie label="Plafond mensuel (€)" unite="€" type="number" step="0.5" min="0" value={plafond}
                    onChange={e => setPlafond(Number(e.target.value))} />
            <BoutonCarte court onClick={enregistrerPlafond} aria-label="Enregistrer le plafond" className="h-14">
              Enregistrer
            </BoutonCarte>
          </div>
          {ici('plafond')}
        </Rubrique>
      </Carte>

      <Carte>
        <Rubrique titre="Vos amis" picto={<Picto teinte="frais">{DESSINS.amis}</Picto>}
                  texte="D’autres foyers, avec qui échanger des recettes. Seules celles que vous marquez « partagée » circulent : vos courses, vos barquettes et vos objectifs ne sortent jamais d’ici.">
          <Amis />
        </Rubrique>
      </Carte>

      <Carte>
        <Rubrique titre="Les rappels par mail" picto={<Picto>{DESSINS.rappels}</Picto>}
                  texte="Décongeler, une barquette qui va périmer, noter les dépenses, clôturer le mois : un mail quand il y a quelque chose à faire. Chacun règle les siens, et tout est coupé tant que tu n’as rien activé.">
          <BoutonCarte variante="contour" onClick={() => va('/rappels')}>Régler mes rappels</BoutonCarte>
        </Rubrique>
      </Carte>

      {/* Les gestes rares : trois lignes d'une même carte. Le mot de passe ouvre son écran ; l'export et la
          déconnexion agissent sur place, et leur message se lit juste dessous. On ne POUVAIT pas se déconnecter
          avant : aucun bouton, nulle part, une fois dans un foyer. Qui s'était connecté sur le téléphone de
          l'autre y restait. */}
      <Carte label="Ton compte">
        <div className="divide-y divide-brume">
          <Ligne picto={<Picto>{DESSINS.cle}</Picto>} texte="Changer mon mot de passe"
                 onClick={() => va('/motdepasse')} />
          <Ligne picto={<Picto>{DESSINS.telecharger}</Picto>} texte="Exporter mes données" onClick={exporter} />
          <Ligne picto={<Picto>{DESSINS.sortie}</Picto>} chevron={false}
                 texte={sortie ? 'Un instant…' : 'Me déconnecter'} onClick={deconnecter} disabled={sortie} />
        </div>
        {(zone === 'deconnexion' || zone === 'donnees') && msg && (
          <div className="px-[18px] pb-4">{ici(zone)}</div>
        )}
      </Carte>

      <p className="mt-2 text-center">
        <button type="button" onClick={supprimer}
                className="inline-flex min-h-11 items-center px-4 font-semibold text-groseille hover:underline">
          Supprimer mon compte
        </button>
      </p>
    </PageReglages>
  )
}

/** La couleur de l'avatar suit l'ORDRE DU FOYER, comme dans le bilan : Thauba reste ocre où qu'elle ouvre l'écran. */
const AVATARS = ['bg-herbe', 'bg-ocre', 'bg-congel-encre', 'bg-encre']

/**
 * Les magasins du foyer.
 *
 * `useSupprimeMagasin` existait sans aucun appelant : en retirer un était
 * simplement impossible, et une enseigne où l'on ne va plus restait à
 * encombrer la liste et le sélecteur du ticket.
 */
function Magasins() {
  const { data: magasins = [] } = useMagasins()
  const cree = useCreeMagasin()
  const supprime = useSupprimeMagasin()
  const [nom, setNom] = useState('')
  const [refus, setRefus] = useState<string | null>(null)

  return (
    <div>
      {magasins.length > 0 && (
        <ul>
          {magasins.map(m => (
            <li key={m.id} className="flex min-h-12 flex-wrap items-center gap-x-3">
              <span className="text-[17px] font-semibold">{m.name}</span>
              {m.is_default && (
                <span className="whitespace-nowrap rounded-xl bg-frais-fond px-2.5 py-[3px] text-[13px] font-semibold text-frais-encre">
                  par défaut
                </span>
              )}
              <button type="button" aria-label={`Retirer ${m.name}`} onClick={() => {
                        if (confirm(`Retirer ${m.name} ? Les articles qui le portent`
                                  + ` deviennent « sans magasin ».`)) {
                          setRefus(null)
                          /* Une sortie de courses y a eu lieu : la base refuse (clé étrangère) — on le dit, au lieu de se taire. */
                          supprime.mutate(m.id, {
                            onError: e => setRefus(/foreign key/i.test(e instanceof Error ? e.message : '')
                              ? `${m.name} a déjà servi pour une sortie de courses : il ne peut plus être retiré.`
                              : `${m.name} n’a pas pu être retiré. Réessaie dans un instant.`),
                          })
                        }
                      }}
                      className="ml-auto min-h-11 px-2 text-[15px] font-semibold text-herbe hover:underline">
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      {refus && <p role="alert" className="mt-2 text-[14px] text-groseille">{refus}</p>}
      <form className="mt-1.5 flex gap-2.5" onSubmit={e => {
        e.preventDefault()
        if (nom.trim()) {
          cree.mutate({ nom, parDefaut: magasins.length === 0 },
            { onSuccess: () => setNom('') })
        }
      }}>
        <Saisie aria-label="Nom du nouveau magasin" value={nom} onChange={e => setNom(e.target.value)} placeholder="Lidl" />
        <BoutonCarte type="submit" variante="plein" court className="h-14">Ajouter</BoutonCarte>
      </form>
    </div>
  )
}

/**
 * Les foyers amis.
 *
 * Une invitation rend un LIEN, comme celle qui fait entrer dans un foyer : sans
 * envoi d'e-mail à configurer, et transmissible par n'importe quel moyen. Il
 * vaut sept jours et ne sert qu'une fois.
 */
function Amis() {
  const { data: foyer } = useFoyer()
  const { data: liens = [], isPending } = useAmis(foyer?.id)
  const invite = useInviteAmi()
  const romp = useRompAmitie()
  const [copie, setCopie] = useState<string | null>(null)

  const amis = liens.filter(l => !l.enAttente)
  const attente = liens.filter(l => l.enAttente && !l.expire)

  return (
    <div>
      {isPending ? <Attente /> : (
        <>
          {amis.length > 0 && (
            <ul className="divide-y divide-brume/70">
              {amis.map(l => (
                <li key={l.id} className="flex min-h-12 items-center gap-3">
                  <span className="grow text-[17px] font-semibold">{l.nom}</span>
                  <button type="button" aria-label={`Rompre avec ${l.nom}`} onClick={() => {
                            if (confirm(`Ne plus partager avec ${l.nom} ? `
                                      + `Vos recettes partagées cessent d’être visibles `
                                      + `des deux côtés.`)) romp.mutate(l.id)
                          }}
                          className="min-h-11 px-2 text-[15px] font-semibold text-herbe hover:underline">
                    Rompre
                  </button>
                </li>
              ))}
            </ul>
          )}

          {attente.length > 0 && (
            <div className="mb-3 space-y-3">
              {attente.map(l => (
                <div key={l.id} className="rounded-2xl bg-fond p-4">
                  <p className="text-[14px] text-doux">
                    Invitation en attente, valable jusqu’au{' '}
                    {new Date(l.expire_le).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="mt-2 break-all text-[14px] text-encre">{l.lien}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => {
                              navigator.clipboard.writeText(l.lien)
                              setCopie(l.id)
                            }}
                            className="min-h-11 px-2 text-[14px] font-semibold text-herbe underline underline-offset-4">
                      {copie === l.id ? 'Lien copié' : 'Copier le lien'}
                    </button>
                    <button type="button" onClick={() => romp.mutate(l.id)}
                            className="min-h-11 px-2 text-[14px] text-doux underline underline-offset-4">
                      Annuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {amis.length === 0 && attente.length === 0 && (
            <p className="mb-3 text-[14px] text-doux">Aucun ami pour l’instant.</p>
          )}

          <div className={amis.length > 0 ? 'mt-3' : ''}>
            <BoutonCarte variante="contour" onClick={() => invite.mutate()}
                         disabled={invite.isPending}>
              {invite.isPending ? 'Un instant…' : 'Inviter un foyer'}
            </BoutonCarte>
            <Erreur de={invite.error ?? romp.error} />
          </div>
        </>
      )}
    </div>
  )
}
