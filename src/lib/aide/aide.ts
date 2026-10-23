/**
 * L'aide intégrée côté écran : poser une question, signaler une réponse fausse, dire d'où elle vient.
 *
 * L'écran ne décide rien de ce qui est vrai : la fonction rend la réponse, les pages dont elle vient et ce qu'elle
 * n'a pas pu confirmer (`a_verifier`). Ici on ne fait que présenter — et ne jamais présenter une réponse non
 * confirmée comme une certitude.
 */
import { callFunction, ou, supabase } from '../supabase.ts'
import type { PorteId } from './portes.ts'

export type Savoir = 'oui' | 'partiel' | 'non'

export type Reponse = {
  reponse: string
  savoir: Savoir
  sources: { id: string; titre: string; verifie_le: string }[]
  ouvrir: { id: PorteId; chemin: string; bouton: string } | null
  a_verifier: string[]
  restantes: number
}

export type Echange = { question: string; reponse: string }

export const QUESTION_MAX = 500

/** Les boutons « ? » des en-têtes n'ouvrent pas la feuille eux-mêmes : ils le disent à `Aide`, monté une fois dans l'appli. */
export const OUVRE_L_AIDE = 'popote:aide'

/** Une question, avec le dernier échange (pour « et si… ? ») et l'écran où l'on est (pour départager les pages). */
export function demande(question: string, precedent: Echange | null, ecran: string): Promise<Reponse> {
  return callFunction<Reponse>('aide', { question, precedent, ecran })
}

/** « Cette réponse est fausse » : la question, ce qu'il a répondu, les pages dont il s'est servi. */
export async function signale(o: {
  foyerId: string; userId: string; question: string; reponse: string; pages: string[]
}): Promise<void> {
  ou(await supabase.from('aide_signalement').insert({
    household_id: o.foyerId, user_profile_id: o.userId,
    question: o.question.slice(0, 600), reponse: o.reponse.slice(0, 2000), pages: o.pages.slice(0, 8),
  }).select())
}

/**
 * La typographie française à l'affichage : une espace insécable DANS les guillemets et avant « ? ! : ; ». Le modèle
 * écrit des espaces ordinaires, et la ligne se coupait avant le guillemet fermant : « Créer l'invitation / ». ».
 */
export function typographie(t: string): string {
  return t.replace(/«[ \t]+/g, '«\u00A0').replace(/[ \t]+»/g, '\u00A0»').replace(/[ \t]+([?!:;])/g, '\u00A0$1')
}

/** « 23 octobre », ou « 23 octobre 2025 » quand ce n'est pas l'année en cours. */
export function dateDeSource(iso: string, maintenant: Date = new Date()): string {
  const d = new Date(`${iso}T12:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long',
    ...(d.getFullYear() === maintenant.getFullYear() ? {} : { year: 'numeric' }),
  })
}

/** « Source : manuel « Inviter », vérifié le 23 octobre. » — plusieurs pages, plusieurs dates : on les dit toutes. */
export function ligneDeSource(sources: Reponse['sources'], maintenant: Date = new Date()): string | null {
  if (sources.length === 0) return null
  const pages = sources.map(s => `« ${s.titre} »`)
  const dates = [...new Set(sources.map(s => dateDeSource(s.verifie_le, maintenant)))]
  const les = sources.length === 1 ? 'manuel' : 'manuel, pages'
  return `Source : ${les} ${pages.join(', ')}, vérifié${sources.length === 1 ? '' : 'es'} le ${dates.join(' et le ')}.`
}

/** Ce que l'écran dit sous une réponse qui n'est pas pleinement confirmée — ou rien. */
export function miseEnGarde(r: Pick<Reponse, 'savoir' | 'a_verifier' | 'sources'>): string | null {
  if (r.a_verifier.length > 0) {
    return `Je n’ai pas pu confirmer dans le manuel : ${r.a_verifier.join(', ')}. Vérifie avant de t’y fier.`
  }
  if (r.savoir === 'partiel') {
    return r.sources.length === 0
      ? 'Cette réponse ne s’appuie sur aucune page du manuel : à vérifier.'
      : 'Réponse partielle : le manuel n’en dit pas davantage.'
  }
  return null
}
