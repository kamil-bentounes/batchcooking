/**
 * D'où l'on arrive sur « Nos aliments », et où l'on revient : la semaine (sa feuille de choix rouverte là où on l'a
 * laissée) quand on vient d'elle, sinon les réglages.
 *
 * `/aliments?depuis=semaine&jour=2026-10-27&repas=diner` → retour `/semaine?jour=2026-10-27&repas=diner`.
 */
import { estUnRepasChoisi } from '../choix.ts'

export function retourDe(recherche: string): { vers: string; texte: string } {
  const q = new URLSearchParams(recherche)
  if (q.get('depuis') !== 'semaine') return { vers: '/reglages', texte: 'Réglages' }
  const jour = q.get('jour')
  const repas = q.get('repas')
  const rouvre = jour !== null && /^\d{4}-\d{2}-\d{2}$/.test(jour) && estUnRepasChoisi(repas)
  return { vers: rouvre ? `/semaine?jour=${jour}&repas=${repas}` : '/semaine', texte: 'La semaine' }
}

/** `?nouveau=1` : la création s'ouvre d'emblée (le lien « Ajouter un aliment » de la feuille de choix). */
export const ouvreLaCreation = (recherche: string) => new URLSearchParams(recherche).get('nouveau') === '1'
