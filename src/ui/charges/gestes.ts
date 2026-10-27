/**
 * Les gestes d'une ligne de charge : lequel est ouvert, ce qu'on tape dans « Corriger », et les écritures.
 *
 * Tenus par la PAGE (elle ne se démonte pas), pas par la ligne : une correction de catégorie fait changer la
 * ligne de section, donc de parent — la ligne se remonterait, et avec elle la promesse de fermer le panneau
 * et de dire ce qui s'est passé.
 *
 * UN SEUL panneau est ouvert à la fois : toucher une autre ligne referme la première.
 */
import { useState } from 'react'
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

/** Rend le focus à un contrôle qui vient d'apparaître (ou de revenir) : le panneau qu'on ferme le lui prenait. */
function rendLeFocus(selecteur: string) {
  requestAnimationFrame(() => document.querySelector<HTMLElement>(selecteur)?.focus())
}

/** `dis(texte, id)` : ce que le geste annonce — sur la ligne `id` tant qu'elle existe, sinon en tête de liste ; `dis(null)` l'efface. */
export function useGestes(o: { charges: Charge[]; dis: (texte: string | null, id?: string) => void }) {
  const retire = useRetireLaCharge()
  const rattache = useRattacheCharge()
  const majQui = useMajParticipants()
  const corrige = useCorrigeCharge()
  const changeCategorie = useChangeCategorie()
  const [ouverte, setOuverte] = useState<{ id: string; vue: Vue } | null>(null)
  const [f, setF] = useState<Formulaire>(VIDE)
  const change = (p: Partial<Formulaire>) => setF(v => ({ ...v, ...p }))

  /* Une charge mise de côté qui a une histoire ne devient pas mensuelle : on le sait AVANT, pour griser les
     trois autres façons (§ 3.7). Un seul panneau de correction est ouvert à la fois : une seule lecture. */
  const enCorrection = ouverte?.vue === 'corriger' ? o.charges.find(c => c.id === ouverte.id) : undefined
  const histoire = useAUneHistoire(enCorrection?.id ?? '', enCorrection?.mode === 'mis_de_cote')
  const bloque = enCorrection?.mode === 'mis_de_cote' && histoire.data === true

  const ferme = (id?: string) => {
    setOuverte(null)
    if (id) rendLeFocus(`[data-ligne="${id}"]`)
  }

  /* « Retirer » (0111). Une saisie ne part pas sans qu'on l'ait vue : la base refuse d'abord avec le total,
     l'écran le demande, puis rappelle. */
  const retirer = (c: Charge, avecLesSaisies = false) => retire.mutate({ id: c.id, avecLesSaisies }, {
    onSuccess: r => {
      const suite = suiteDuRetrait(r, c.libelle, confirm)
      if ('rappeler' in suite) retirer(c, true)
      else if ('dit' in suite) { setOuverte(null); o.dis(suite.dit) }
    },
  })

  /* Enregistrer une correction. L'argent passe par `corrige_la_charge`, qui refait les mois ; la catégorie, par
     un simple `update`, qui ne touche aucun montant (§ 4.1). Une catégorie seule n'appelle pas la première :
     « 0 mois refait » aurait laissé croire qu'on avait corrigé l'argent. */
  const enregistre = (c: Charge, cents: number) => {
    const periodicite = periodiciteDeLaFacon(f.mode, f.rythme)
    const debut = f.debut || c.debut
    const { argent, categorie } = ceQuiChange(c, {
      libelle: f.libelle, cents, mode: f.mode, periodicite, debut, categorie: f.categorie })
    if (!argent && !categorie) { ferme(c.id); return }
    const range = (texte: string) => {
      const fini = () => { ferme(c.id); o.dis(texte, c.id) }
      if (!categorie) fini()
      else changeCategorie.mutate({ id: c.id, categorie: f.categorie }, { onSuccess: fini })
    }
    if (!argent) { range(`« ${c.libelle} » rangée dans ${infoCategorie(f.categorie).nom}.`); return }
    corrige.mutate({ id: c.id, libelle: f.libelle.trim(), montantCents: cents, periodicite, debut, mode: f.mode }, {
      onSuccess: n => range(ditLaCorrection(f.libelle.trim(), n)),
    })
  }

  /* Chaque mutation ne montre son échec QUE sur sa propre ligne : `variables` dit laquelle l'a déclenchée.
     Sans ce filtre, un refus sur une charge s'afficherait sous les trente-cinq autres. */
  const erreurDe = (id: string): unknown =>
    (retire.error && retire.variables?.id === id && retire.error)
    || (rattache.error && rattache.variables?.id === id && rattache.error)
    || (majQui.error && majQui.variables?.chargeId === id && majQui.error)
    || null
  const erreurDuFormulaire = (id: string): unknown =>
    (corrige.variables?.id === id ? corrige.error : null)
    ?? (changeCategorie.variables?.id === id ? changeCategorie.error : null)

  return {
    ouverte, f, change, bloque, retire, rattache, majQui, corrige, changeCategorie,
    erreurDe, erreurDuFormulaire,
    /** Toucher une ligne : elle s'ouvre sur ses gestes, ou se referme si elle l'était. */
    touche: (c: Charge) => { o.dis(null); setOuverte(v => (v?.id === c.id ? null : { id: c.id, vue: 'gestes' })) },
    ouvreLeFormulaire: (c: Charge) => {
      setF({
        libelle: c.libelle, montant: String(c.montant_cents / 100).replace('.', ','), mode: c.mode,
        rythme: c.periodicite === 'trimestriel' ? 'trimestriel' : 'annuel', categorie: c.categorie, debut: c.debut,
      })
      setOuverte({ id: c.id, vue: 'corriger' })
    },
    ouvreQui: (c: Charge) => setOuverte({ id: c.id, vue: 'qui' }),
    /** Annuler, Fermer : on revient aux gestes de la ligne, et le focus à celui qui avait ouvert le panneau. */
    reviens: (c: Charge, geste: 'corriger' | 'qui') => {
      setOuverte({ id: c.id, vue: 'gestes' })
      rendLeFocus(`[data-geste="${geste}-${c.id}"]`)
    },
    ferme, retirer, enregistre,
  }
}

export type Gestes = ReturnType<typeof useGestes>
