/**
 * Préparer une photo avant de l'envoyer.
 *
 * Un téléphone récent sort des JPEG de 4 à 8 Mo. Les envoyer entiers coûterait
 * du temps, de la donnée mobile — dans une cuisine, pas toujours en wifi — et
 * n'améliorerait rien : un modèle de vision travaille sur une image réduite de
 * toute façon.
 *
 * On réduit donc côté client, AVANT l'envoi. 1 400 px de côté long suffisent à
 * lire une étiquette de yaourt ; au-delà, on paie sans rien gagner.
 */

const COTE_MAX = 1400
const QUALITE = 0.82

/** Au-delà, l'Edge Function refuse : autant le savoir avant d'envoyer. */
export const POIDS_MAX = 6 * 1024 * 1024

export type PhotoPrete = {
  /** `data:image/jpeg;base64,…`, prêt pour l'API. */
  dataUrl: string
  largeur: number
  hauteur: number
  octets: number
}

/**
 * Réduit et réencode en JPEG.
 *
 * Passe par `createImageBitmap`, qui applique l'orientation EXIF : sans cela,
 * une photo prise en portrait arrive couchée, et le modèle lit des étiquettes
 * de travers.
 */
export async function prepare(fichier: File): Promise<PhotoPrete> {
  const source = await createImageBitmap(fichier, { imageOrientation: 'from-image' })

  const echelle = Math.min(1, COTE_MAX / Math.max(source.width, source.height))
  const largeur = Math.round(source.width * echelle)
  const hauteur = Math.round(source.height * echelle)

  const toile = document.createElement('canvas')
  toile.width = largeur
  toile.height = hauteur
  const ctx = toile.getContext('2d')
  if (!ctx) throw new Error('Impossible de préparer la photo.')
  ctx.drawImage(source, 0, 0, largeur, hauteur)
  source.close()

  const dataUrl = toile.toDataURL('image/jpeg', QUALITE)
  // Une data URL pèse ~4/3 de l'image : on mesure ce qui part vraiment.
  const octets = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75)

  if (octets > POIDS_MAX) {
    throw new Error('Photo trop lourde même après réduction. Réessaie de plus loin.')
  }
  return { dataUrl, largeur, hauteur, octets }
}
