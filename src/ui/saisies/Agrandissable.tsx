/**
 * Une photo qui s'ouvre en grand au toucher : un ticket long ne se relit pas dans une vignette.
 *
 * L'image ouverte garde toute sa largeur (jusqu'à 900 px) et DÉFILE dans la fenêtre au lieu d'être réduite. C'est un
 * `<dialog>` modal : le clavier reste dedans, Échap le ferme, et le focus revient sur la vignette.
 */
import { useEffect, useRef, useState } from 'react'

export function Agrandissable({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  const [ouvert, setOuvert] = useState(false)
  const dialogue = useRef<HTMLDialogElement>(null)
  const vignette = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const d = dialogue.current
    if (!d) return
    if (ouvert && !d.open) d.showModal?.()
    if (!ouvert && d.open) d.close()
  }, [ouvert])

  function ferme() {
    setOuvert(false)
    vignette.current?.focus()
  }

  return (
    <>
      <button ref={vignette} type="button" onClick={() => setOuvert(true)} aria-haspopup="dialog"
              aria-label={`Agrandir : ${alt}`} className="block w-full cursor-zoom-in">
        <img src={src} alt={alt} className={className} />
      </button>
      {/* `onClose` couvre Échap : le navigateur ferme le dialogue, l'état le suit. */}
      <dialog ref={dialogue} aria-label={alt} onClose={ferme}
              onClick={e => { if (e.target === e.currentTarget) setOuvert(false) }}
              className="m-0 h-dvh max-h-none w-dvw max-w-none bg-transparent p-0 backdrop:bg-encre/90">
        {ouvert && (
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 justify-end px-3 pt-3">
              <button type="button" onClick={() => setOuvert(false)}
                      className="min-h-11 rounded-full bg-surface px-5 text-[15px] font-semibold text-encre">
                Fermer
              </button>
            </div>
            <div className="min-h-0 grow overflow-auto overscroll-contain px-3 pb-6 pt-3" tabIndex={0}
                 aria-label={`${alt}, défile pour la lire en entier`} role="region">
              <img src={src} alt={alt} className="mx-auto block h-auto w-full max-w-[900px] rounded-md bg-surface" />
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
