/** « 1 part », « 4 parts » : le mot que l'écran écrit partout où il compte des parts. */
export function parts(n: number): string {
  return `${n} part${n >= 2 ? 's' : ''}`
}
