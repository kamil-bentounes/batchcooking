/**
 * L'heure du front.
 *
 * En production, c'est `new Date()`, et rien d'autre : Vite remplace
 * `import.meta.env.MODE` par sa valeur, et la branche du banc disparaît du
 * paquet.
 *
 * Le banc e2e de la clôture doit jouer un 1er novembre. `page.clock` le ferait,
 * mais il avance aussi l'horloge de supabase-js : le jeton, émis pour une heure,
 * y paraît expiré, et chaque requête relance un rafraîchissement jusqu'à la
 * limite de débit de l'authentification. Le banc pose donc
 * `popote.maintenant` dans le `localStorage`, que SEUL un paquet construit en
 * mode `development` lit (celui de `playwright.config.ts`).
 */
export function maintenant(): Date {
  if (import.meta.env.MODE === 'development') {
    try {
      const reglee = globalThis.localStorage?.getItem('popote.maintenant')
      if (reglee) return new Date(reglee)
    } catch { /* stockage bloqué : l'heure vraie */ }
  }
  return new Date()
}

/** « 2026-10-03 », en heure LOCALE : `toISOString` dirait la veille entre minuit et 2 h. */
export function aujourdhui(d: Date = maintenant()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${
    String(d.getDate()).padStart(2, '0')}`
}
