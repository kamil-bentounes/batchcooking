/**
 * Compléter son profil.
 *
 * Deux champs, pas douze. Demander à quelqu'un d'énumérer ses charges pour
 * finir son inscription, c'est la meilleure façon de ne jamais le voir revenir
 * (D70) — la troisième étape est donc offerte, jamais exigée, et l'app entière
 * reste utilisable sans elle. Seul le BUDGET exige les deux revenus, et là
 * c'est légitime : le prorata est incalculable sans.
 *
 * La date d'entrée porte sa conséquence écrite juste en dessous, pas dans une
 * aide qu'on ne lit pas : c'est elle, et rien d'autre, qui décide des mois
 * qu'on partage.
 */
import { useState } from 'react'
import { Page, Champ, Bouton, Message } from '../ui/kit.tsx'
import { supabase, ou } from '../lib/supabase.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { usePoseRevenu, enCentimes, euros, moisDe } from '../lib/donnees/budget.ts'

/** Aujourd'hui en heure LOCALE : `toISOString()` recule d'un jour avant 2 h. */
function aujourdhui(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
    String(d.getDate()).padStart(2, '0')}`
}

export function Profil({ userId, onFini }: { userId: string; onFini: () => void }) {
  const { data: foyer } = useFoyer()
  const poseRevenu = usePoseRevenu()
  const moi = foyer?.membres.find(m => m.id === userId)

  const [prenom, setPrenom] = useState(moi?.display_name ?? '')
  const [revenu, setRevenu] = useState('')
  const [entree, setEntree] = useState(moi?.entre_le ?? aujourdhui())
  const [msg, setMsg] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const cents = enCentimes(revenu)
  const autre = (foyer?.membres ?? []).find(m => m.id !== userId)
  const pret = prenom.trim() !== '' && cents !== null && cents > 0 && entree !== ''

  async function enregistre() {
    setEnvoi(true); setMsg('')
    try {
      ou(await supabase.from('user_profile')
        .update({ display_name: prenom.trim(), entre_le: entree })
        .eq('id', userId).select())
      await poseRevenu.mutateAsync({ foyerId: foyer!.id, userId, cents: cents! })
      onFini()
    } catch (e) { setMsg(String((e as Error).message)) } finally { setEnvoi(false) }
  }

  return (
    <Page titre="Deux choses, et c’est fini."
          chapeau="Le reste s’ajoute quand tu veux.">
      <div className="space-y-5">
        <Champ label="Ton prénom" value={prenom} onChange={e => setPrenom(e.target.value)} />

        <div>
          <Champ label="Ton revenu net mensuel (€)" type="text" inputMode="decimal"
                 value={revenu} onChange={e => setRevenu(e.target.value)} />
          <p className="mt-1.5 text-[14px] leading-[21px] text-doux">
            Après impôt. Il ne sert qu’à calculer votre partage
            {autre ? <> — aujourd’hui avec {autre.display_name}</> : null}, et le foyer
            le voit : vous partagez un compte, pas des secrets.
          </p>
        </div>

        <div>
          <Champ label="Ton arrivée dans le foyer" type="date" value={entree}
                 onChange={e => setEntree(e.target.value)} />
          <p className="mt-1.5 text-[14px] leading-[21px] text-doux">
            La date à partir de laquelle tu habites là. C’est elle qui décide des
            mois que tu partages — <strong style={{ color: 'var(--color-ocre)' }}>
            vérifie-la</strong>.
          </p>
          {entree > moisDe() && (
            <p className="mt-1.5 text-[14px] leading-[21px]"
               style={{ color: 'var(--color-ocre)' }}>
              Tu arrives plus tard : tu ne participeras à aucune charge d’ici là.
            </p>
          )}
        </div>

        {cents !== null && cents > 0 && (
          <p className="text-[15px] text-doux">
            {euros(cents)} par mois, noté.
          </p>
        )}

        <Message texte={msg} erreur />
        <Bouton onClick={enregistre} disabled={!pret || envoi}>
          {envoi ? 'J’enregistre…' : 'Entrer dans le foyer'}
        </Bouton>
      </div>
    </Page>
  )
}
