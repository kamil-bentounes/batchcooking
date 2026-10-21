/**
 * Ce que « Mes charges » décide, sans écran : les phrases, les filtres et les
 * comparaisons qui touchent à l'argent. Tenus ici pour qu'un test puisse les
 * figer — l'écran, lui, n'a pas de banc de composants.
 */
import { infoCategorie, NOM_DU_MODE, type Categorie, type Mode } from './categories.ts'
import { montant, nomDuMois } from './mois.ts'
import { lisLeMontant } from './feuilles.ts'
import type { Retrait } from '../donnees/budget.ts'

export type Rythme = 'trimestriel' | 'annuel'

/**
 * Que faire de la réponse de « Retirer » (0111). Une saisie ne part pas sans
 * qu'on l'ait vue : la base refuse d'abord avec le total, on le demande, puis on
 * rappelle. Un refus de l'utilisateur ne rappelle JAMAIS — sinon les dépenses
 * déclarées partiraient sans son accord.
 */
export function suiteDuRetrait(r: Retrait, libelle: string, confirmer: (question: string) => boolean):
  { dit: string } | { rappeler: true } | { rien: true } {
  if ('aConfirmer' in r) {
    return confirmer(`Retirer ${libelle} et ses ${montant(r.aConfirmer.cents)} déclarés ?`)
      ? { rappeler: true } : { rien: true }
  }
  return { dit: r.sort === 'supprimee'
    ? `« ${libelle} » retirée.`
    : `« ${libelle} » retirée. Les mois que tu as confirmés ou réglés la gardent : c’est de l’argent sorti.` }
}

/** Les mises de côté retirées qui attendent encore une facture : elles gardent leur
    feuille jusqu'au 31 décembre de l'année qui suit leur retrait (§ 3.7). Sans cela,
    la régularisation de copropriété votée en avril n'aurait plus d'endroit où entrer. */
export function retireesEncoreAReg<C extends { archive_le: string | null; mode: Mode }>(
  charges: C[], annee: number): C[] {
  return charges.filter(c => c.archive_le && c.mode === 'mis_de_cote'
    && Number(c.archive_le.slice(0, 4)) + 1 >= annee)
}

/** Sous le nom d'une retirée : l'année de son retrait. `soldee` inconnu (pas encore lu)
    ne prétend pas qu'elle l'est : mieux vaut un « reste à régler » de trop qu'une
    facture oubliée. */
export function texteDeLaRetiree(soldee: boolean | undefined, annee: number): string {
  return soldee ? `Retirée en ${annee}` : `${annee} reste à régler`
}

/** La périodicité qui sort d'une façon : seule la mise de côté n'est pas mensuelle.
    Le rythme resté en mémoire (« annuel ») ne doit pas fuir sur une charge fixe. */
export function periodiciteDeLaFacon(mode: Mode, rythme: Rythme): 'mensuel' | Rythme {
  return mode === 'mis_de_cote' ? rythme : 'mensuel'
}

/** Le bout de sous-titre d'une charge : sa catégorie, et sa façon quand elle n'est
    pas « Fixe » (qui est le cas ordinaire, donc muet). */
export function sousTitreDeLaFacon(c: { categorie: Categorie | string; mode: Mode }): string {
  return ` · ${infoCategorie(c.categorie).nom}`
    + (c.mode !== 'fixe' ? ` · ${NOM_DU_MODE[c.mode].toLowerCase()}` : '')
}

/**
 * Ce qu'une correction change. L'argent passe par `corrige_la_charge`, qui refait
 * les mois ; la catégorie, par un simple `update`. Une catégorie seule n'appelle pas
 * la première : « 0 mois refait » aurait laissé croire qu'on avait corrigé l'argent.
 */
export function ceQuiChange(
  c: { libelle: string; montant_cents: number; mode: Mode; periodicite: string; debut: string
       categorie: string },
  s: { libelle: string; cents: number; mode: Mode; periodicite: string; debut: string
       categorie: string },
): { argent: boolean; categorie: boolean } {
  return {
    argent: s.libelle.trim() !== c.libelle || s.cents !== c.montant_cents || s.mode !== c.mode
      || s.periodicite !== c.periodicite || s.debut !== c.debut,
    categorie: s.categorie !== c.categorie,
  }
}

export function ditLaCorrection(libelle: string, moisRefaits: number): string {
  return moisRefaits === 0
    ? `« ${libelle} » corrigée.`
    : `« ${libelle} » corrigée, ${moisRefaits} mois refait${moisRefaits > 1 ? 's' : ''}.`
}

/**
 * Le champ « Elle court depuis » (`<input type="month">`) rend « 2026-09 » — ou « » quand
 * on l'efface, ou qu'on n'a tapé qu'une partie. L'écran écrivait `${''}-01`, soit « -01 »,
 * et l'envoyait à la base : on ne garde que ce qui est un mois entier.
 */
export function debutDuChamp(valeur: string): string {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(valeur) ? `${valeur}-01` : ''
}

/** Le plus ancien départ que la base accepte (0096) : janvier de l'année précédente. */
export function plancherDuDebut(maintenant: Date): string {
  return `${maintenant.getFullYear() - 1}-01-01`
}

/**
 * Un départ est-il acceptable ? `garde` : celui que la charge a déjà. Il reste accepté même
 * avant le plancher — corriger un libellé ne doit pas obliger à réécrire une date que la
 * base a posée —, mais tout AUTRE départ passe le plancher.
 */
export function lisLeDebut(debut: string, o: { plancher: string; garde?: string }):
  { valide: boolean; refus: string | null } {
  if (!/^\d{4}-\d{2}-01$/.test(debut)) return { valide: false, refus: 'Choisis le mois où elle commence.' }
  if (debut !== o.garde && debut < o.plancher) {
    return { valide: false,
             refus: `Pas avant ${nomDuMois(o.plancher)} ${o.plancher.slice(0, 4)}.` }
  }
  return { valide: true, refus: null }
}

/**
 * Ce que le formulaire d'ajout permet d'envoyer. Le montant passe par `lisLeMontant`, comme
 * les feuilles : 0 € et plus de 1 000 000 € se refusent AVANT l'envoi, avec leur phrase.
 */
export function peutPoser(o: { libelle: string; montant: string; qui: number; debut: string; plancher: string }):
  { pret: boolean; cents: number | null; refusMontant: string | null; refusDebut: string | null } {
  const m = lisLeMontant(o.montant, { zeroOk: false })
  const d = lisLeDebut(o.debut, { plancher: o.plancher })
  return { pret: o.libelle.trim() !== '' && m.valide && o.qui > 0 && d.valide,
           cents: m.cents, refusMontant: m.refus, refusDebut: d.refus }
}

/**
 * Ce que le panneau « Corriger » permet d'enregistrer. Le départ ne se lit que pour une mise
 * de côté : c'est la seule façon dont le champ est montré, et les autres envoient celui que
 * la charge a déjà.
 */
export function peutCorriger(o: {
  libelle: string; montant: string; mode: Mode; debut: string; garde: string; plancher: string
}): { pret: boolean; cents: number | null; refusMontant: string | null; refusDebut: string | null } {
  const m = lisLeMontant(o.montant, { zeroOk: false })
  const d = o.mode === 'mis_de_cote'
    ? lisLeDebut(o.debut, { plancher: o.plancher, garde: o.garde })
    : { valide: true, refus: null }
  return { pret: o.libelle.trim() !== '' && m.valide && d.valide,
           cents: m.cents, refusMontant: m.refus, refusDebut: d.refus }
}
