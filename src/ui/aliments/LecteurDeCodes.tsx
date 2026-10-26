/**
 * Lire un code-barres avec l'appareil photo, quand le navigateur sait le faire (`BarcodeDetector`).
 *
 * Chromium sur Android l'a ; Safari et Firefox non : l'écran ne propose alors QUE la saisie des chiffres, qui marche
 * partout. L'image reste dans l'appareil : rien n'est envoyé — seul le code lu part, vers Open Food Facts.
 *
 * Inline plutôt qu'en fenêtre : un flux vidéo dans une modale cumule deux pièges (le focus, le flux qui continue
 * derrière) ; ici, `Annuler` coupe la caméra, et démonter le composant aussi.
 */
import { useEffect, useRef, useState } from 'react'

type Detecteur = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type FabriqueDeDetecteur = new (o?: { formats?: string[] }) => Detecteur

export function LecteurDeCodes({ surCode, annule }: { surCode: (code: string) => void; annule: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [panne, setPanne] = useState('')
  /* Les rappels changent à chaque rendu du parent : le flux ne doit pas redémarrer pour autant. */
  const rappels = useRef({ surCode, annule })
  useEffect(() => { rappels.current = { surCode, annule } })

  useEffect(() => {
    let fini = false
    let flux: MediaStream | null = null
    let boucle = 0
    const coupe = () => {
      fini = true
      cancelAnimationFrame(boucle)
      flux?.getTracks().forEach(t => t.stop())
    }

    ;(async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector: FabriqueDeDetecteur }).BarcodeDetector
        const detecteur = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a'] })
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (fini) { coupe(); return }
        const v = video.current
        if (!v) { coupe(); return }
        v.srcObject = flux
        /* Pas d'`await` : `play()` ne se résout qu'à la première image, et la lecture ne doit pas en dépendre. */
        v.play().catch(() => {})
        const regarde = async () => {
          if (fini) return
          try {
            const trouves = await detecteur.detect(v)
            if (trouves.length > 0 && !fini) { coupe(); rappels.current.surCode(trouves[0].rawValue); return }
          } catch { /* une image qui ne se lit pas : la suivante */ }
          boucle = requestAnimationFrame(regarde)
        }
        boucle = requestAnimationFrame(regarde)
      } catch (e) {
        coupe()
        setPanne(e instanceof DOMException && e.name === 'NotAllowedError'
          ? 'L’appareil photo est refusé pour Popote. Autorise-le dans les réglages du navigateur, ou tape les chiffres.'
          : 'Je n’arrive pas à ouvrir l’appareil photo. Tape les chiffres du code-barres.')
      }
    })()
    return coupe
  }, [])

  return (
    <div className="mt-3 overflow-hidden rounded-2xl bg-encre">
      {panne ? (
        <p role="alert" className="p-4 text-[14px] text-fond">{panne}</p>
      ) : (
        <div className="relative">
          <video ref={video} muted playsInline aria-label="Ce que voit l’appareil photo"
                 className="block aspect-[4/3] w-full object-cover" />
          {/* Le viseur : quatre coins safran, comme sur la maquette. */}
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-[12%] top-[28%] bottom-[28%] rounded-md"
                style={{ boxShadow: '0 0 0 2.5px #E8A33D' }} />
          <p role="status" className="absolute inset-x-0 bottom-0 bg-encre/70 px-3 py-1.5 text-center text-[13px] text-fond">
            Cadre le code-barres : je le lis tout seul.
          </p>
        </div>
      )}
      <button type="button" onClick={() => rappels.current.annule()}
              className="min-h-11 w-full text-[15px] font-semibold text-fond">
        Annuler
      </button>
    </div>
  )
}
