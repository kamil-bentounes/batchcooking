/**
 * Comparer un secret reçu à celui qu'on attend, SANS que le temps de la réponse dise combien de caractères étaient
 * justes. On compare les empreintes (SHA-256 : toujours 32 octets, quelle que soit la longueur reçue), octet par
 * octet, sans s'arrêter au premier écart.
 */
export async function secretValide(recu: string | null | undefined, attendu: string | null | undefined): Promise<boolean> {
  if (!attendu) return false   // pas de secret posé : personne n'entre
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(recu ?? '')),
    crypto.subtle.digest('SHA-256', enc.encode(attendu)),
  ])
  const x = new Uint8Array(a), y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
