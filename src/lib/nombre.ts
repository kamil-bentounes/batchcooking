/**
 * Un nombre tel qu'on l'écrit en français : « 0,4 », « 1 250 », jamais « 0.4 ».
 *
 * Les valeurs arrondies à la décimale (`Math.round(x * 10) / 10`) arrivent à l'écran comme des
 * `number` : interpolées telles quelles dans le JSX, elles s'affichaient avec un point (« 0.4 g »,
 * défaut relevé sur Dressage le 26/10/2026).
 */
export const nb = (n: number, decimales = 1): string =>
  n.toLocaleString('fr-FR', { maximumFractionDigits: decimales })
