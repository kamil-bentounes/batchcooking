import { useEffect, useState } from 'react'
import { supabase, callFunction } from '../lib/supabase'
import { lienDeploye } from '../lib/route.ts'
import { useCreeMagasin, useFoyer, useMagasins, useSupprimeMagasin } from '../lib/donnees/foyer.ts'
import { useAmis, useInviteAmi, useRompAmitie } from '../lib/donnees/amis.ts'
import { Attente, Erreur } from '../ui/coque.tsx'
import { Page, Groupe, Bouton, Champ, Message } from '../ui/kit'

export function Settings({ va }: { va: (v: string) => void }) {
  const [plafond, setPlafond] = useState(5)
  /** Vide = pas de budget fixé. Ne pas s'en fixer est un choix légitime. */
  const [courses, setCourses] = useState('')
  const [reste, setReste] = useState<number | null>(null)
  const [invite, setInvite] = useState('')
  const [lien, setLien] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)

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

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }

  async function enregistrerPlafond() {
    const { data: hh } = await supabase.rpc('current_household')
    if (!hh) return dire('Aucun foyer.', true)
    const { error } = await supabase.from('household')
      .update({ llm_monthly_cap_eur: plafond }).eq('id', hh)
    dire(error ? error.message : 'Plafond enregistré.', !!error)
    if (!error) charger()
  }

  async function enregistrerCourses() {
    const { data: hh } = await supabase.rpc('current_household')
    if (!hh) return dire('Aucun foyer.', true)
    const v = courses.trim() === '' ? null : Number(courses.replace(',', '.'))
    if (v !== null && !(v > 0)) return dire('Un budget se compte en euros, au-dessus de zéro.', true)
    const { error } = await supabase.from('household').update({ food_budget_eur: v }).eq('id', hh)
    dire(error ? error.message : v === null ? 'Budget retiré.' : 'Budget enregistré.', !!error)
    if (!error) charger()
  }

  async function inviter() {
    try {
      const r = await callFunction<{ token: string }>('invite', { email: invite })
      // Le lien est le vrai livrable : sans clé Resend aucun e-mail ne part, et
      // même avec, le destinataire peut l'avoir classé en indésirable.
      // ⚠️ `origin` seul perd le préfixe de déploiement : sur GitHub Pages le
      //    site est servi sous /batchcooking/, et le lien tombait sur une 404.
      //    `lienDeploye` fait le calcul, et il existait déjà sans appelant.
      setLien(lienDeploye(`/invite/${r.token}`))
      dire(`Invitation créée pour ${invite}. Envoie-lui le lien ci-dessous.`)
    }
    catch (e) { dire(String((e as Error).message), true) }
  }

  async function exporter() {
    const { data, error } = await supabase.rpc('export_my_data')
    if (error) return dire(error.message, true)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    a.download = 'mes-donnees.json'; a.click()
  }

  async function supprimer() {
    if (!confirm('Supprimer ton compte et tes données ? C’est définitif.')) return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) return dire(error.message, true)
    await supabase.auth.signOut(); window.location.href = '/'
  }

  return (
    <Page nav titre="Réglages">
      <section>
        <h2 className="titre text-xl text-herbe">Budget IA</h2>
        <p className="mt-1 text-doux text-[15px]">
          Ce qu’on s’autorise à dépenser par mois pour lire une photo du frigo ou un ticket.
        </p>
        <div className="mt-4"><Groupe>
          <div className="px-5 py-4 flex items-baseline gap-2.5">
            <span className="chiffre text-[2.25rem] leading-none">
              {reste === null ? '—' : reste.toFixed(2)}
            </span>
            <span className="text-doux text-[15px]">€</span>
            <span className="ml-auto text-doux text-[15px]">restants ce mois-ci</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <Champ label="Plafond mensuel (€)" type="number" step="0.5" min="0" value={plafond}
                   onChange={e => setPlafond(Number(e.target.value))} />
            <Bouton variante="discret" onClick={enregistrerPlafond}>Enregistrer le plafond</Bouton>
          </div>
        </Groupe></div>
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Budget des courses</h2>
        <p className="mt-1 text-doux text-[15px]">
          Le repère du bilan. Laisse vide si tu n’en veux pas : l’app affichera
          ce qui est sorti du compte, sans jauge et sans jugement.
        </p>
        <div className="mt-4 space-y-4">
          <Champ label="Par mois (€)" type="number" step="10" min="0" value={courses}
                 placeholder="320"
                 onChange={e => setCourses(e.target.value)} />
          <Bouton variante="discret" onClick={enregistrerCourses}>
            Enregistrer le budget
          </Bouton>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Inviter</h2>
        <p className="mt-1 text-doux text-[15px]">
          Tu obtiens un lien à lui transmettre. Elle rejoint le foyer et garde ses propres objectifs.
        </p>
        <div className="mt-4 space-y-4">
          <Champ label="Son e-mail" type="email" value={invite} placeholder="elle@exemple.fr"
                 onChange={e => setInvite(e.target.value)} />
          <Bouton onClick={inviter} disabled={!invite}>Créer l’invitation</Bouton>
          {lien && (
            <div className="rounded-xl border border-brume bg-surface p-4">
              <p className="text-doux text-[15px]">Son lien, valable 7 jours :</p>
              <p className="mt-2 break-all text-[15px] text-encre">{lien}</p>
              <button
                onClick={() => { navigator.clipboard.writeText(lien); dire('Lien copié.') }}
                className="mt-3 text-herbe underline underline-offset-4">
                Copier le lien
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Vos amis</h2>
        <p className="mt-1 text-doux text-[15px]">
          D’autres foyers, avec qui échanger des recettes. Seules celles que
          vous marquez « partagée » circulent — vos courses, vos barquettes et
          vos objectifs ne sortent jamais d’ici.
        </p>
        <Amis />
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Tes magasins</h2>
        <p className="mt-1 text-doux text-[15px]">
          Chaque article porte son enseigne, et la liste se scinde par magasin.
        </p>
        <Magasins />
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Ton mot de passe</h2>
        <p className="mt-1 text-doux text-[15px]">
          Celui qui te fait entrer. Le changer prend dix secondes.
        </p>
        <div className="mt-4">
          <Bouton variante="discret" onClick={() => va('/motdepasse')}>
            Changer mon mot de passe
          </Bouton>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="titre text-xl text-herbe">Tes données</h2>
        <p className="mt-1 text-doux text-[15px]">
          Tout ce que le foyer a enregistré, dans un fichier. Ou plus rien du tout.
        </p>
        <div className="mt-4 space-y-3">
          <Bouton variante="discret" onClick={exporter}>Exporter mes données</Bouton>
          <Bouton variante="danger" onClick={supprimer}>Supprimer mon compte</Bouton>
        </div>
      </section>

      <Message texte={msg} erreur={err} />
    </Page>
  )
}

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

  return (
    <div className="mt-4">
      {magasins.length > 0 && (
        <ul className="divide-y divide-brume/70">
          {magasins.map(m => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <span className="grow text-[15px]">
                {m.name}
                {m.is_default && <span className="text-doux text-[13px]"> · par défaut</span>}
              </span>
              <button onClick={() => {
                        if (confirm(`Retirer ${m.name} ? Les articles qui le portent`
                                  + ` deviennent « sans magasin ».`)) supprime.mutate(m.id)
                      }}
                      className="h-11 px-3 text-[14px] underline underline-offset-2">
                retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="mt-3 flex gap-2" onSubmit={e => {
        e.preventDefault()
        if (nom.trim()) {
          cree.mutate({ nom, parDefaut: magasins.length === 0 },
            { onSuccess: () => setNom('') })
        }
      }}>
        <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Lidl"
               className="grow rounded-xl border border-brume bg-fond px-4 py-2.5
                          outline-none focus:border-herbe" />
        <button className="px-5 rounded-xl bg-herbe text-fond text-[15px]">Ajouter</button>
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
    <div className="mt-4">
      {isPending ? <Attente /> : (
        <>
          {amis.length > 0 && (
            <ul className="divide-y divide-brume/70">
              {amis.map(l => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <span className="grow text-[15px]">{l.nom}</span>
                  <button onClick={() => {
                            if (confirm(`Ne plus partager avec ${l.nom} ? `
                                      + `Vos recettes partagées cessent d’être visibles `
                                      + `des deux côtés.`)) romp.mutate(l.id)
                          }}
                          className="h-11 px-3 text-[14px] underline underline-offset-2">
                    rompre
                  </button>
                </li>
              ))}
            </ul>
          )}

          {attente.length > 0 && (
            <div className="mt-3 space-y-3">
              {attente.map(l => (
                <div key={l.id} className="rounded-xl border border-brume bg-surface p-4">
                  <p className="text-doux text-[14px]">
                    Invitation en attente, valable jusqu’au{' '}
                    {new Date(l.expire_le).toLocaleDateString('fr-FR')}
                  </p>
                  <p className="mt-2 break-all text-[14px] text-encre">{l.lien}</p>
                  <div className="mt-3 flex gap-4">
                    <button onClick={() => {
                              navigator.clipboard.writeText(l.lien)
                              setCopie(l.id)
                            }}
                            className="text-herbe underline underline-offset-4 text-[14px]">
                      {copie === l.id ? 'Lien copié' : 'Copier le lien'}
                    </button>
                    <button onClick={() => romp.mutate(l.id)}
                            className="text-doux underline underline-offset-4 text-[14px]">
                      Annuler
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {amis.length === 0 && attente.length === 0 && (
            <p className="text-doux text-[15px]">Aucun ami pour l’instant.</p>
          )}

          <div className="mt-4">
            <Bouton variante="discret" onClick={() => invite.mutate()}
                    disabled={invite.isPending}>
              {invite.isPending ? 'Un instant…' : 'Inviter un foyer'}
            </Bouton>
            <Erreur de={invite.error ?? romp.error} />
          </div>
        </>
      )}
    </div>
  )
}
