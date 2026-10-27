/**
 * La feuille de choix d'un repas (« Lundi midi ») : une vraie modale (`<dialog>`, focus piégé, Échap, le focus
 * revient au bouton qui l'a ouverte) qui propose, dans l'ordre :
 *  · « Pour » : vous deux, ou chaque personne du foyer ;
 *  · « Au frigo » : ce qui presse d'abord, avec combien de barquettes sont libres ;
 *  · « Au congélateur » : à sortir la veille (la même heure que le frigo) ;
 *  · « Autre chose » : nos aliments (avec leurs vraies valeurs ; un appui demande « combien ? » : deux pots, 30 g), ce
 *    qu'on reprend souvent, les repères du repas — nos aliments d'abord, et un repère qu'un de nos aliments remplace
 *    (« Yaourt ») ne s'y glisse plus —, et « On saute ce repas ».
 * Choisir un plat pose une barquette libre dans la case de CHAQUE personne visée : c'est la base qui l'écrit,
 * d'un bloc (`choisir_un_repas`, 0123). Sur un jour PASSÉ, ce qu'on choisit est noté mangé (0128), et la feuille le dit.
 */
import { Fragment, useState } from 'react'
import { Feuille } from '../budget/Feuille.tsx'
import { Erreur } from '../coque.tsx'
import { PlatImage } from '../frigo/PlatImage.tsx'
import { ecartEnJours, fondDuPlat, momentDuRepas, nomCourt } from '../../lib/frigo.ts'
import type { Groupe, Part, Prevu } from '../../lib/frigo.ts'
import {
  choisirLesParts, dejaPosees, detailDuCongele, detailDuFrigo, libresPourLeChoix, ordonneLesChoix, personnesDuChoix,
  resteLibre,
} from '../../lib/choix.ts'
import type { Cible, ChoixDuFrigo, Membre } from '../../lib/choix.ts'
import { pourLeFoyer } from '../../lib/ranger.ts'
import { MOT_DU_REPAS } from '../../lib/choix.ts'
import { choixDeLaQuantite } from '../../lib/aliments/en-plus.ts'
import type { Aliment } from '../../lib/donnees/aliments.ts'
import { QuantiteDeLAliment } from '../aliments/Quantite.tsx'
import { reperesDe } from '../../lib/reperes.ts'
import { sansLesRemplaces } from '../../lib/aliments/ordre.ts'
import { Pot } from '../aliments/Pictos.tsx'
import type { Choix } from '../../lib/donnees/barquettes.ts'
import type { Ligne } from '../../lib/supabase.ts'

type Frequent = Ligne<'frequent_food'>

/** Un aliment du foyer proposé en « Autre chose » (« Nos aliments ») : une unité, avec ses vraies valeurs. */
export type NotreAliment = {
  id: string; label: string; detail: string
  /** L'aliment lui-même : le panneau « combien ? » en tire la quantité et ses valeurs. */
  aliment: Aliment
  /** Le repère que cet aliment remplace (choisi dans le formulaire), s'il en remplace un. */
  remplace_repere?: string | null
  /** « 95 kcal », à droite de la ligne. */
  reste?: string
}

const ENCRE_DOUCE = 'var(--color-doux)'
const ENCRE_OCRE = 'var(--color-ocre)'
const ENCRE_GLACE = 'var(--color-congel-encre)'

function Rang({ nom, detail, encre, reste, pastille, desactive, surChoix, deplie }: {
  nom: string; detail: string; encre: string; reste?: string; pastille: React.ReactNode
  desactive?: boolean; surChoix: () => void
  /** Une ligne qui ouvre un panneau dessous : `true` quand il est ouvert. */
  deplie?: boolean
}) {
  return (
    <button type="button" onClick={surChoix} disabled={desactive} aria-expanded={deplie}
            className="flex min-h-14 w-full items-center gap-3 rounded-[14px] bg-surface px-3 py-2 text-left disabled:opacity-55"
            style={{ boxShadow: 'inset 0 0 0 1px var(--color-brume)' }}>
      {pastille}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-[1.25] [overflow-wrap:anywhere]">{nom}</span>
        <span className="mt-0.5 block text-[12px] leading-[1.35]" style={{ color: encre }}>{detail}</span>
      </span>
      {reste && <span className="shrink-0 whitespace-nowrap text-[13px] text-doux">{reste}</span>}
    </button>
  )
}

function Vignette({ fond, photo, filtre }: { fond: string; photo?: string | null; filtre?: string }) {
  return (
    <span aria-hidden="true" className="relative block h-[30px] w-9 shrink-0 overflow-hidden rounded-lg"
          style={{ background: fond, boxShadow: 'inset 0 0 0 1.5px rgba(28, 43, 35, 0.12)' }}>
      {photo !== undefined && <PlatImage url={photo} texte={false} glyphe={14} filtre={filtre} />}
    </span>
  )
}

/** Le contenu d'une section tant que sa lecture est finie ; sinon « Je lis… » ou l'erreur, jamais un « aucune » trompeur. */
function SiLue({ lue, enCours, children }: { lue: Lecture; enCours: string; children: React.ReactNode }) {
  if (lue.erreur) return <Erreur de={lue.erreur} />
  if (lue.enCours) return <p role="status" className="text-[13px] text-doux">{enCours}</p>
  return <>{children}</>
}

function Section({ titre, aide, children }: { titre: string; aide: string; children: React.ReactNode }) {
  return (
    <section className="mt-4" aria-label={titre}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[14px] font-bold">{titre}</h3>
        <span className="text-right text-[12px] text-doux">{aide}</span>
      </div>
      <div className="mt-2 flex flex-col gap-1.5">{children}</div>
    </section>
  )
}

/** Où en est une lecture : en cours, ou en erreur. La feuille ne dit « aucune barquette » que d'une lecture finie. */
export type Lecture = { enCours: boolean; erreur: unknown }

type Proprietes = {
  /** « Lundi midi ». */
  titre: string
  repas: string
  jour: string
  membres: Membre[]
  /** « tous », ou l'identifiant de la personne : ce que « Pour » propose en premier. */
  pourInitial: 'tous' | string
  /** Ceux qui ont déjà mangé ce repas : on ne le change plus pour eux. */
  dejaMange: string[]
  /** Moi : ce sont MES quantités récentes que le panneau « combien ? » propose. */
  moi: string
  /** Les plats encore là, regroupés. */
  groupes: Groupe<Part>[]
  /** Les repas posés ; `null` tant qu'ils ne sont pas lus (on ne dit pas « libre » de ce qu'on ne sait pas). */
  prevus: Prevu[] | null
  maintenant: Date
  photoDe: (recipeId: string | null) => string | null
  frequents: Frequent[]
  /** Les trois lectures dont la feuille a besoin : « Aucune barquette au frigo » ne se dit pas d'une lecture qui a échoué. */
  lectures: { barquettes: Lecture; frequents: Lecture; prevus: Lecture }
  nosAliments?: NotreAliment[]
  /** Nos aliments n'ont pas pu être lus : ce n'est pas « il n'y en a pas ». */
  alimentsEnPanne?: boolean
  /** Ouvre l'écran « Nos aliments » (ajouter ou modifier) ; la feuille se referme avec la semaine. */
  versNosAliments?: () => void
  enCours: boolean
  erreur: unknown
  surChoix: (choix: Choix, personnes: string[]) => void
}

/**
 * La feuille. Son contenu ne vit que tant qu'elle est ouverte : « Pour » repart de `pourInitial` à chaque
 * ouverture, et le focus entre dans la modale puis revient au bouton qui l'a ouverte.
 */
export function FeuilleDeChoix({ ouverte, fermer, ...p }: Proprietes & { ouverte: boolean; fermer: () => void }) {
  return (
    <Feuille ouverte={ouverte} fermer={fermer} titre={p.titre}>
      <Contenu {...p} />
    </Feuille>
  )
}

function Contenu({
  titre, repas, jour, membres, pourInitial, dejaMange, moi, groupes, prevus, maintenant, photoDe, frequents, lectures,
  nosAliments = [], alimentsEnPanne = false, versNosAliments, enCours, erreur, surChoix,
}: Proprietes) {
  const [pour, setPour] = useState<'tous' | string>(pourInitial)
  /* L'aliment dont le panneau « combien ? » est ouvert. */
  const [choisiAliment, setChoisiAliment] = useState<string | null>(null)
  /* Un jour passé : le repas a eu lieu, ce qu'on choisit est noté mangé. */
  const passe = ecartEnJours(jour, maintenant) < 0
  const peutManger = membres.filter(m => !dejaMange.includes(m.id))
  /* « Vous deux » n'a de sens que pour tout le foyer, et personne n'en a encore mangé ce repas. */
  const tousPossible = membres.length > 1 && dejaMange.length === 0
  const choisi = pour === 'tous' && !tousPossible ? (peutManger[0]?.id ?? 'tous') : pour
  const personnes = personnesDuChoix(choisi, membres).filter(id => !dejaMange.includes(id))
  const cible: Cible = { jour, repas, personnes }

  const lu = prevus !== null
  /* Un choix est en train de s'écrire : aucune ligne ne part une seconde fois (le deuxième toucher d'un double clic). */
  const occupe = enCours
  const avecLibres = (lieu: 'frigo' | 'congelateur'): ChoixDuFrigo[] =>
    groupes.filter(g => g.location === lieu).map(g => ({
      groupe: g,
      libres: prevus ? libresPourLeChoix(g, prevus, cible, maintenant) : [],
    }))
  const frigo = ordonneLesChoix(avecLibres('frigo'))
  const congelo = ordonneLesChoix(avecLibres('congelateur'))
  /* Nos aliments d'abord ; un repère (ou une habitude) qu'un de nos aliments remplace n'est plus proposé. */
  const reperes = sansLesRemplaces(reperesDe(repas), nosAliments)
  const habitudes = sansLesRemplaces(frequents, nosAliments)

  const plat = (g: Groupe<Part>): Choix =>
    ({ type: 'plat', recipe_id: g.recipeId, label: g.label, location: g.location, state: g.state })
  const fait = (choix: Choix) => { if (personnes.length > 0) surChoix(choix, personnes) }

  const moment = momentDuRepas(jour, repas)
  const deja = prevus ? dejaPosees(prevus, cible) : {}
  /* Ce que la base posera VRAIMENT : les parts qui seront encore bonnes à l'heure du repas d'abord (`choisirLesParts`,
     miroir de `choisir_un_repas`). Dire « périme avant ce repas » d'une part que la base ne posera pas serait faux. */
  const aPoser = (c: ChoixDuFrigo) => {
    const parts = personnes.length > 0 ? choisirLesParts(c.libres, personnes, deja, moment) : null
    return parts ? [...parts.values()] : c.libres
  }

  const manque = (c: ChoixDuFrigo): string | null => {
    if (!lu) return lectures.prevus.erreur ? 'les repas prévus ne se lisent pas' : 'les repas prévus se lisent…'
    if (personnes.length === 0) return 'personne à servir'
    if (c.libres.length === 0) return null
    if (choisirLesParts(c.libres, personnes) === null) return `il en faut ${personnes.length}, ${c.libres.length} libre${c.libres.length > 1 ? 's' : ''}`
    return null
  }

  const pourDit = (id: string) => id === 'tous' ? pourLeFoyer(membres.length) : (membres.find(m => m.id === id)?.prenom ?? '')
  const grandes = (t: string) => `${t[0].toUpperCase()}${t.slice(1)}`

  return (
    <>
      <h2 className="titre mx-1 text-[24px] font-semibold">{titre}</h2>
      {passe && (
        <p data-passe="" className="mx-1 mt-1 text-[13px] leading-[1.45] text-doux">
          Un jour passé : ce que tu choisis est noté mangé, et la barquette sort du frigo ou du congélateur.
        </p>
      )}

      {membres.length > 1 && (
        <div role="group" aria-label="Pour qui" className="mx-1 mt-3 flex flex-wrap gap-1 rounded-[14px] bg-piste p-1">
          {[...(tousPossible ? ['tous'] : []), ...membres.map(m => m.id)].map(id => {
            const actif = choisi === id
            const mange = id !== 'tous' && dejaMange.includes(id)
            return (
              <button key={id} type="button" onClick={() => setPour(id)} aria-pressed={actif} disabled={mange}
                      className={`min-h-11 flex-1 rounded-[10px] px-2 text-[14px] font-semibold disabled:opacity-45
                                  ${actif ? 'bg-encre text-fond' : 'bg-transparent text-encre'}`}>
                {id === 'tous' ? grandes(pourDit('tous')) : pourDit(id)}
                {mange && <span className="block text-[11px] font-normal">a mangé</span>}
              </button>
            )
          })}
        </div>
      )}

      <Section titre="Au frigo" aide="ce qui presse d’abord">
        <SiLue lue={lectures.barquettes} enCours="Je lis le frigo…">
          {frigo.length === 0 && <p className="text-[13px] text-doux">Aucune barquette au frigo pour l’instant.</p>}
          {frigo.map(c => {
            const d = detailDuFrigo(aPoser(c), cible, maintenant)
            const pasAssez = manque(c)
            const desactive = occupe || !lu || c.libres.length === 0 || pasAssez !== null
            return (
              <Rang key={c.groupe.cle} nom={nomCourt(c.groupe.label)} desactive={desactive}
                    detail={pasAssez ?? d.texte} encre={pasAssez ? ENCRE_OCRE : d.urgent ? ENCRE_OCRE : ENCRE_DOUCE}
                    reste={resteLibre(c.libres.length)} surChoix={() => fait(plat(c.groupe))}
                    pastille={<Vignette fond={fondDuPlat(c.groupe.label)} photo={photoDe(c.groupe.recipeId)} />} />
            )
          })}
        </SiLue>
      </Section>

      <Section titre="Au congélateur" aide={passe ? 'sort du congélateur' : 'à sortir la veille'}>
        <SiLue lue={lectures.barquettes} enCours="Je lis le congélateur…">
          {congelo.length === 0 && <p className="text-[13px] text-doux">Rien au congélateur pour l’instant.</p>}
          {congelo.map(c => {
            const pasAssez = manque(c)
            const desactive = occupe || !lu || c.libres.length === 0 || pasAssez !== null
            return (
              <Rang key={c.groupe.cle} nom={nomCourt(c.groupe.label)} desactive={desactive}
                    detail={pasAssez ?? (c.libres.length === 0 ? 'déjà choisi pour d’autres repas' : detailDuCongele(cible, maintenant))}
                    encre={pasAssez ? ENCRE_OCRE : ENCRE_GLACE}
                    reste={resteLibre(c.libres.length)} surChoix={() => fait(plat(c.groupe))}
                    pastille={<Vignette fond="var(--color-congel-fond)" photo={photoDe(c.groupe.recipeId)} filtre="saturate(0.75)" />} />
            )
          })}
        </SiLue>
      </Section>

      <Section titre="Autre chose" aide="sans barquette">
        {alimentsEnPanne && (
          <p role="alert" className="text-[13px] leading-[1.4] text-groseille">
            Je n’ai pas pu lire nos aliments : les repères sont proposés à leur place.
          </p>
        )}
        {/* Nos aliments : AVANT les repères, un geste = une unité, avec les vraies valeurs. */}
        {nosAliments.map(a => (
          <Fragment key={a.id}>
            <Rang nom={a.label} detail={a.detail} encre={ENCRE_DOUCE} deplie={choisiAliment === a.id}
                  surChoix={() => setChoisiAliment(c => (c === a.id ? null : a.id))}
                  desactive={occupe || personnes.length === 0} reste={a.reste}
                  pastille={<span aria-hidden="true" className="grid h-[30px] w-9 shrink-0 place-items-center rounded-lg bg-sable"><Pot largeur={16} /></span>} />
            {choisiAliment === a.id && (
              <QuantiteDeLAliment aliment={a.aliment} moi={moi} enCours={occupe}
                                  bouton={`${passe ? 'Noter' : 'Choisir'} pour le ${MOT_DU_REPAS[repas as keyof typeof MOT_DU_REPAS]?.minuscule ?? 'repas'}`}
                                  surAjoute={q => fait(choixDeLaQuantite(a.aliment, q))} />
            )}
          </Fragment>
        ))}
        {versNosAliments && (
          <button type="button" onClick={versNosAliments}
                  className="flex min-h-11 w-full items-center gap-2 rounded-[14px] px-3 text-left text-[14px] font-semibold text-herbe">
            <span aria-hidden="true" className="text-[18px] leading-none">+</span>
            {nosAliments.length === 0 && !alimentsEnPanne ? 'Ajouter un aliment à nous, avec ses vraies valeurs' : 'Ajouter ou modifier nos aliments'}
          </button>
        )}
        {habitudes.slice(0, 6).map(f => (
          <Rang key={f.id} nom={f.label} detail="ce que vous reprenez souvent" encre={ENCRE_DOUCE}
                desactive={occupe || personnes.length === 0}
                reste={`${Math.round(Number(f.kcal))} kcal`}
                surChoix={() => fait({
                  type: 'repere', label: f.label, kcal: Number(f.kcal), protein_g: Number(f.protein_g), grams: Number(f.grams),
                  fiber_g: Number(f.fiber_g), carb_g: Number(f.carb_g), fat_g: Number(f.fat_g), food_id: f.food_id,
                })}
                pastille={<Vignette fond="var(--color-surface)" />} />
        ))}
        {reperes.map(r => (
          <Rang key={r.label} nom={r.label} detail="un repère, pas une pesée" encre={ENCRE_DOUCE}
                desactive={occupe || personnes.length === 0} reste={`${r.kcal} kcal`}
                surChoix={() => fait({ type: 'repere', label: r.label, kcal: r.kcal, protein_g: r.proteinG })}
                pastille={<Vignette fond="var(--color-sable)" />} />
        ))}
        <Rang nom="On saute ce repas" detail="rien de mangé" encre={ENCRE_DOUCE} desactive={occupe || personnes.length === 0}
              surChoix={() => fait({ type: 'saute' })}
              pastille={<Vignette fond="var(--color-piste)" />} />
        {/* Ce que le foyer reprend souvent ne se lit pas : on le dit, les repères restent. */}
        {!lectures.frequents.enCours && <Erreur de={lectures.frequents.erreur} />}
      </Section>

      {enCours && <p role="status" className="mx-1 mt-3 text-[13px] text-doux">J’écris le repas…</p>}
      <div className="mx-1"><Erreur de={erreur} /></div>
    </>
  )
}

