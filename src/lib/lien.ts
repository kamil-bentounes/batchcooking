/**
 * Ce qu'un lien par e-mail laisse dans l'URL quand il n'ouvre pas de session.
 *
 * Supabase renvoie vers l'adresse de retour avec `error`, `error_code` et
 * `error_description` — dans le fragment en flux implicite, dans la requête en
 * PKCE. L'écran de connexion s'affichait alors tel quel, sans un mot : le 30
 * septembre, l'invitée a ouvert un lien mort, puis redemandé trois liens sans
 * jamais savoir pourquoi le premier n'avait rien fait.
 *
 * Rend la phrase à afficher, ou `null` quand l'URL ne porte aucune erreur.
 */
export function erreurDeLien(url: string): string | null {
  const u = new URL(url)
  const p = new URLSearchParams(u.hash.replace(/^#/, ''))
  u.searchParams.forEach((v, k) => p.set(k, v))
  if (!p.has('error') && !p.has('error_code') && !p.has('error_description')) return null

  /* `otp_expired` couvre les deux cas que Supabase ne distingue pas dans
     l'URL : le lien trop vieux, et celui qui a déjà servi. */
  if (p.get('error_code') === 'otp_expired') {
    return 'Ce lien a expiré ou a déjà servi : un lien ne dure qu’une heure, et ne '
      + 'sert qu’une fois. Redemandes-en un ci-dessous.'
  }
  return 'Ce lien n’a pas pu t’ouvrir de session. Redemandes-en un ci-dessous.'
}

/**
 * Le fragment d'un lien EMPOISONNÉ, réparé — ou `null` s'il n'y a rien à faire.
 *
 * Supabase colle `#access_token=…` derrière l'adresse de retour sans regarder
 * si elle porte déjà un fragment. Une adresse de retour qui traînait
 * `#error=…` donne donc `#error=…&sb=#access_token=…` : supabase-js lit le
 * premier fragment, y trouve l'erreur, et jette une session pourtant valide.
 *
 * L'application n'émet plus de telles adresses (`App.tsx`), mais les liens
 * déjà partis en portent — et le premier chargement après un déploiement
 * tourne encore sur l'ancien code, que le service worker sert depuis son
 * cache. On garde donc le DERNIER fragment quand il porte un jeton : c'est
 * celui que Supabase a ajouté, et le seul qui dise quelque chose de vrai.
 */
export function fragmentRepare(hash: string): string | null {
  const morceaux = hash.split('#')
  if (morceaux.length < 3) return null
  const dernier = morceaux[morceaux.length - 1]
  return new URLSearchParams(dernier).has('access_token') ? `#${dernier}` : null
}
