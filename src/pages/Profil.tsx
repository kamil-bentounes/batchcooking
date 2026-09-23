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
import { Champ, Bouton, Message } from '../ui/kit.tsx'
import { supabase, ou } from '../lib/supabase.ts'
import { useFoyer } from '../lib/donnees/foyer.ts'
import { usePoseRevenu, useRevenus, enCentimes, euros } from '../lib/donnees/budget.ts'

/** Aujourd'hui en heure LOCALE : `toISOString()` recule d'un jour avant 2 h. */
function aujourdhui(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
    String(d.getDate()).padStart(2, '0')}`
}

export function Profil({ userId, onFini, retour }: {
  userId: string; onFini: () => void; retour: () => void
}) {
  const { data: foyer } = useFoyer()
  const poseRevenu = usePoseRevenu()
  const moi = foyer?.membres.find(m => m.id === userId)

  /* ⚠️ `useState` ne lit son argument QU'AU PREMIER RENDU, et `useFoyer` n'a
     encore rien répondu à ce moment-là. Sur cet écran rechargé à froid — un F5,
     un lien direct, le retour d'un onglet — le prénom s'affichait VIDE et la
     date d'entrée AUJOURD'HUI, alors que la base dit autre chose. Enregistrer
     écrasait alors la vraie date d'arrivée, celle dont dépend tout le partage.

     On garde donc l'état à null tant que la réponse n'est pas là, et ce qui
     s'affiche vient de la base jusqu'à la première frappe. */
  const [prenomSaisi, setPrenomSaisi] = useState<string | null>(null)
  const [revenuSaisi, setRevenuSaisi] = useState<string | null>(null)
  const [entreeSaisie, setEntreeSaisie] = useState<string | null>(null)
  const [msg, setMsg] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const prenom = prenomSaisi ?? moi?.display_name ?? ''
  const entree = entreeSaisie ?? moi?.entre_le ?? aujourdhui()
  const setPrenom = setPrenomSaisi
  const setEntree = setEntreeSaisie

  /* ⚠️ Le revenu DÉJÀ POSÉ s'affiche.
     Le champ partait vide à chaque ouverture : on rouvre son profil, on lit
     « Ton revenu net mensuel (€) » sans rien dedans, et on croit qu'il n'est
     pas enregistré — alors que les réglages du budget l'affichent deux écrans
     plus loin. Un champ vide dit « il n'y a rien » ; ici il y avait quelque
     chose. */
  const revenus = useRevenus()
  const mien = (revenus.data ?? [])
    .filter(r => r.user_profile_id === userId)
    .sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1))[0]
  const revenu = revenuSaisi ?? (mien ? String(mien.net_mensuel_cents / 100).replace('.', ',') : '')
  const setRevenu = setRevenuSaisi
  const dejaPose = mien !== undefined

  const cents = enCentimes(revenu)
  const autre = (foyer?.membres ?? []).find(m => m.id !== userId)
  /* Et on n'enregistre PAS tant que le foyer n'est pas chargé : sans lui, on
     ne sait pas ce qu'on est en train de remplacer. */
  const pret = foyer !== undefined && moi !== undefined
    && prenom.trim() !== '' && cents !== null && cents > 0 && entree !== ''

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
    /* On n'en sortait PAS : cet écran n'a ni barre du bas ni bouton de retour, et
       `Page` n'en fournit aucun. On y arrivait par le bandeau du hub et on y
       restait — un cul-de-sac de plus, trouvé à l'usage et pas par un test. */
    <main className="min-h-dvh px-6 pt-14 pb-16">
      <div className="mx-auto w-full max-w-lg">
        <button onClick={retour}
                className="inline-flex items-center gap-2 min-h-11 -mt-3 text-[15px] text-doux
                           hover:text-encre transition-colors">
          <span aria-hidden="true">‹</span> Popote
        </button>

        {/* Le titre d'ARRIVÉE ne vaut qu'à l'arrivée. Il s'affichait aussi à
            quelqu'un qui rouvre son profil trois mois plus tard, et lui
            annonçait qu'il lui restait deux choses à faire. */}
        <h1 className="titre text-[34px] mt-6">
          {dejaPose ? 'Toi, dans le foyer' : 'Deux choses, et c’est fini.'}
        </h1>
        <p className="mt-2 text-[15px] text-doux">
          {dejaPose
            ? 'Ce que l’application sait de toi. Tout se change ici.'
            : 'Le reste s’ajoute quand tu veux.'}
        </p>

        <div className="mt-6 space-y-5">
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
          {/* Comparé à AUJOURD'HUI, pas au premier du mois : `moisDe()` vaut le
              1er, si bien que du 2 au 31 la date par défaut — aujourd'hui —
              déclenchait l'alerte. Le premier écran du budget annonçait donc une
              conséquence fausse et inquiétante à tout le monde. */}
          {entree > aujourdhui() && (
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
          {envoi ? 'J’enregistre…' : 'Enregistrer'}
        </Bouton>
        </div>
      </div>
    </main>
  )
}
