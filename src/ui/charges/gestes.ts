/**
 * Les gestes d'une ligne de charge : lequel est ouvert, ce qu'on tape dans « Corriger », et les écritures.
 *
 * Tenus par la PAGE (elle ne se démonte pas), pas par la ligne : une correction de catégorie fait changer la
 * ligne de section, donc de parent — la ligne se remonterait, et avec elle la promesse de fermer le panneau
 * et de dire ce qui s'est passé.
 *
 * UN SEUL panneau est ouvert à la fois : toucher une autre ligne referme la première.
 *
 * ⚠️ Chaque écriture se rend par `mutateAsync` et se range sous LA LIGNE qui l'a lancée (`erreurs`, `occupees`).
 *    Les `mutate(…, { onSuccess })` d'avant ne vivaient que tant que l'observateur n'était pas réutilisé : on
 *    enregistrait A, on touchait B, et selon l'issue l'échec de A n'allait nulle part, ou sa réussite refermait
 *    le panneau de B. Une écriture ne ferme et ne refocalise que SON panneau.
 */
import { useEffect, useRef, useState } from 'react'
import {
  useAUneHistoire, useChangeCategorie, useCorrigeCharge, useMajParticipants, useRattacheCharge,
  useRetireLaCharge, type Charge,
} from '../../lib/donnees/budget.ts'
import { infoCategorie, type Categorie, type Mode } from '../../lib/budget/categories.ts'
import { ceQuiChange, ditLaCorrection, periodiciteDeLaFacon, suiteDuRetrait, type Rythme } from '../../lib/budget/charges.ts'

export type Vue = 'gestes' | 'corriger' | 'qui'

export type Formulaire = {
  libelle: string; montant: string; mode: Mode; rythme: Rythme; categorie: Categorie; debut: string
}

const VIDE: Formulaire = { libelle: '', montant: '', mode: 'fixe', rythme: 'annuel', categorie: 'autre', debut: '' }

/** Rend le focus au premier de ces contrôles qui existe, une fois l'écran redessiné : le panneau qu'on ferme (ou
    la ligne qu'on retire) le lui prenait. */
export function rendLeFocus(...selecteurs: string[]) {
  requestAnimationFrame(() => {
    for (const s of selecteurs) {
      const el = document.querySelector<HTMLElement>(s)
      if (el) { el.focus(); return }
    }
  })
}

/** Où le focus va quand une ligne disparaît : la suivante, sinon la précédente, sinon l'en-tête de sa catégorie,
    sinon le premier filtre. Lu AVANT le retrait, tant que la ligne est encore dans la page. */
function cibleApresRetrait(id: string): string[] {
  const li = document.querySelector(`[data-charge="${id}"]`)
  const voisin = (el: Element | null | undefined) => el?.getAttribute('data-charge')
  const suivante = voisin(li?.nextElementSibling)
  const precedente = voisin(li?.previousElementSibling)
  const cle = li?.closest('[data-cle]')?.getAttribute('data-cle')
  return [
    ...(suivante ? [`[data-ligne="${suivante}"]`] : []),
    ...(precedente ? [`[data-ligne="${precedente}"]`] : []),
    ...(cle ? [`[data-cle="${cle}"] > button`] : []),
    '[aria-label="Filtrer"] button',
  ]
}

export function useGestes(o: {
  charges: Charge[]
  /** `dis(texte, id)` : ce que le geste annonce — sur la ligne `id` tant qu'elle est rendue, sinon en tête de liste ;
      `dis(null)` l'efface. */
  dis: (texte: string | null, id?: string) => void
  /** Rouvre une catégorie repliée : la ligne corrigée y est rangée, et son annonce doit se voir. */
  ouvreLaCategorie?: (cle: Categorie) => void
}) {
  const retire = useRetireLaCharge()
  const rattache = useRattacheCharge()
  const majQui = useMajParticipants()
  const corrige = useCorrigeCharge()
  const changeCategorie = useChangeCategorie()
  const [ouverte, setOuverte] = useState<{ id: string; vue: Vue } | null>(null)
  /* Ce que l'écran montre À CET INSTANT, lisible par une écriture qui finit plus tard (son panneau a pu changer
     entre-temps). Posé avec chaque changement, jamais pendant le rendu. */
  const courante = useRef<{ id: string; vue: Vue } | null>(null)
  const pose = (v: { id: string; vue: Vue } | null) => { courante.current = v; setOuverte(v) }
  useEffect(() => { courante.current = ouverte }, [ouverte])

  const [f, setF] = useState<Formulaire>(VIDE)
  const change = (p: Partial<Formulaire>) => setF(v => ({ ...v, ...p }))
  /* L'échec d'une écriture, rangé sous sa ligne — même quand son panneau est refermé — et les lignes dont une
     écriture est en cours (double appui). */
  const [erreurs, setErreurs] = useState<Record<string, unknown>>({})
  const [occupees, setOccupees] = useState<ReadonlySet<string>>(new Set())

  /* Une charge mise de côté qui a une histoire ne devient pas mensuelle : on le sait AVANT, pour griser les
     trois autres façons (§ 3.7). Un seul panneau de correction est ouvert à la fois : une seule lecture. */
  const enCorrection = ouverte?.vue === 'corriger' ? o.charges.find(c => c.id === ouverte.id) : undefined
  const histoire = useAUneHistoire(enCorrection?.id ?? '', enCorrection?.mode === 'mis_de_cote')
  const bloque = enCorrection?.mode === 'mis_de_cote' && histoire.data === true

  /** Ne ferme que SON panneau, et ne déplace le focus que dans ce cas. */
  const ferme = (id: string) => {
    if (courante.current?.id !== id) return
    pose(null)
    rendLeFocus(`[data-ligne="${id}"]`)
  }

  const efface = (id: string) => setErreurs(m => {
    if (!(id in m)) return m
    const suite = { ...m }
    delete suite[id]
    return suite
  })

  /** Lance l'écriture d'une ligne : son échec va sous elle, son encours la verrouille, et rien d'autre n'en dépend. */
  async function lance(id: string, ecriture: () => Promise<void>) {
    efface(id)
    setOccupees(s => new Set(s).add(id))
    try { await ecriture() }
    catch (e) { setErreurs(m => ({ ...m, [id]: e })) }
    finally { setOccupees(s => { const n = new Set(s); n.delete(id); return n }) }
  }

  /* « Retirer » (0111). Une saisie ne part pas sans qu'on l'ait vue : la base refuse d'abord avec le total,
     l'écran le demande, puis rappelle. */
  const retirer = (c: Charge) => {
    const cible = cibleApresRetrait(c.id)
    const retire1 = async (avecLesSaisies: boolean): Promise<void> => {
      const r = await retire.mutateAsync({ id: c.id, avecLesSaisies })
      const suite = suiteDuRetrait(r, c.libelle, confirm)
      if ('rappeler' in suite) return retire1(true)
      if ('dit' in suite) {
        /* Sa ligne s'en va : le focus passe à la suivante, pas au corps de la page. Seulement si c'était SON panneau
           qui était ouvert — sinon la personne est déjà ailleurs. */
        const sienne = courante.current?.id === c.id
        if (sienne) pose(null)
        o.dis(suite.dit)
        if (sienne) rendLeFocus(...cible)
      }
    }
    return lance(c.id, () => retire1(false))
  }

  /* Enregistrer une correction. L'argent passe par `corrige_la_charge`, qui refait les mois ; la catégorie, par
     un simple `update`, qui ne touche aucun montant (§ 4.1). Une catégorie seule n'appelle pas la première :
     « 0 mois refait » aurait laissé croire qu'on avait corrigé l'argent. */
  const enregistre = (c: Charge, cents: number) => {
    const periodicite = periodiciteDeLaFacon(f.mode, f.rythme)
    const debut = f.debut || c.debut
    const { argent, categorie } = ceQuiChange(c, {
      libelle: f.libelle, cents, mode: f.mode, periodicite, debut, categorie: f.categorie })
    if (!argent && !categorie) { ferme(c.id); return Promise.resolve() }
    const libelle = f.libelle.trim()
    const nouvelle = f.categorie
    const mode = f.mode
    return lance(c.id, async () => {
      let texte = `« ${c.libelle} » rangée dans ${infoCategorie(nouvelle).nom}.`
      if (argent) {
        const n = await corrige.mutateAsync({ id: c.id, libelle, montantCents: cents, periodicite, debut, mode })
        texte = ditLaCorrection(libelle, n)
      }
      if (categorie) {
        await changeCategorie.mutateAsync({ id: c.id, categorie: nouvelle })
        /* La ligne change de section : si celle-ci est repliée, on la rouvre, sinon l'annonce n'aurait aucune ligne. */
        o.ouvreLaCategorie?.(nouvelle)
      }
      ferme(c.id)
      o.dis(texte, c.id)
    })
  }

  const rattacher = (c: Charge, compteId: string) => lance(c.id, async () => {
    await rattache.mutateAsync({ id: c.id, compteId })
    /* Le bouton qui vient d'être touché disparaît : le focus revient à la ligne, si c'est encore elle qui est ouverte. */
    if (courante.current?.id === c.id) rendLeFocus(`[data-ligne="${c.id}"]`)
  })

  const majParticipants = (c: Charge, foyerId: string, participants: string[]) =>
    lance(c.id, () => majQui.mutateAsync({ chargeId: c.id, foyerId, participants }))

  return {
    ouverte, f, change, bloque,
    /** L'échec de la dernière écriture de cette ligne, ou null. */
    erreurDe: (id: string): unknown => erreurs[id] ?? null,
    /** Une écriture de cette ligne est en cours : ses gestes se grisent, un second appui ne part pas. */
    occupee: (id: string) => occupees.has(id),
    /** Toucher une ligne : elle s'ouvre sur ses gestes, ou se referme si elle l'était. */
    touche: (c: Charge) => {
      o.dis(null)
      const ouvre = courante.current?.id !== c.id
      if (ouvre) efface(c.id)
      pose(ouvre ? { id: c.id, vue: 'gestes' } : null)
    },
    ouvreLeFormulaire: (c: Charge) => {
      setF({
        libelle: c.libelle, montant: String(c.montant_cents / 100).replace('.', ','), mode: c.mode,
        rythme: c.periodicite === 'trimestriel' ? 'trimestriel' : 'annuel', categorie: c.categorie, debut: c.debut,
      })
      efface(c.id)
      pose({ id: c.id, vue: 'corriger' })
      rendLeFocus(`[data-champ-nom="${c.id}"]`)
    },
    ouvreQui: (c: Charge) => {
      efface(c.id)
      pose({ id: c.id, vue: 'qui' })
      rendLeFocus(`[data-qui-premier="${c.id}"]`)
    },
    /** Annuler, Fermer : on revient aux gestes de la ligne, et le focus à celui qui avait ouvert le panneau. */
    reviens: (c: Charge, geste: 'corriger' | 'qui') => {
      if (courante.current?.id !== c.id) return
      pose({ id: c.id, vue: 'gestes' })
      rendLeFocus(`[data-geste="${geste}-${c.id}"]`)
    },
    ferme, retirer, enregistre, rattacher, majParticipants,
  }
}

export type Gestes = ReturnType<typeof useGestes>
