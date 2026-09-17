import { useEffect, useState } from 'react'
import { supabase, callFunction } from '../lib/supabase'
import { Page, Groupe, Bouton, Champ, Message } from '../ui/kit'

export function Settings() {
  const [plafond, setPlafond] = useState(5)
  const [reste, setReste] = useState<number | null>(null)
  const [invite, setInvite] = useState('')
  const [lien, setLien] = useState('')
  const [msg, setMsg] = useState(''); const [err, setErr] = useState(false)

  async function charger() {
    const { data: h } = await supabase.from('household')
      .select('llm_monthly_cap_eur').maybeSingle()
    if (h) setPlafond(Number(h.llm_monthly_cap_eur))
    const { data: r } = await supabase.rpc('llm_budget_remaining')
    setReste(r === null ? null : Number(r))
  }
  useEffect(() => { charger() }, [])

  const dire = (t: string, e = false) => { setErr(e); setMsg(t) }

  async function enregistrerPlafond() {
    const { data: hh } = await supabase.rpc('current_household')
    const { error } = await supabase.from('household')
      .update({ llm_monthly_cap_eur: plafond }).eq('id', hh)
    dire(error ? error.message : 'Plafond enregistré.', !!error)
    if (!error) charger()
  }

  async function inviter() {
    try {
      const r = await callFunction('invite', { email: invite })
      // Le lien est le vrai livrable : sans clé Resend aucun e-mail ne part, et
      // même avec, le destinataire peut l'avoir classé en indésirable.
      setLien(`${window.location.origin}/invite/${r.token}`)
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
