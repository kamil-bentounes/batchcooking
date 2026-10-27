/**
 * « Ou une par une » : le catalogue, par catégorie, avec de quoi chercher.
 *
 * L'ajout part du CATALOGUE. Un écran « ajoute tes dépenses » avec un champ vide obtient une chose : rien. On ne
 * se souvient pas de ses charges, on les reconnaît. Le catalogue fait six hauteurs d'écran de pastilles : on le
 * range par rubrique (la première ouverte, les autres repliées), et sans moyen d'y chercher on renonce et on
 * tape « Autre chose ». Une recherche ouvre toutes les rubriques qui ont une réponse.
 */
import { useState } from 'react'
import { Chevron, Loupe, Plus } from './icones.tsx'
import { FILET } from './Choix.tsx'

export type Depart = {
  libelle: string; periode: string; portee: string; precision: string | null; catalogueId: string | null
  /* La section et le rang de plafond de l'article : la catégorie et la façon s'en déduisent (§ 3.7). */
  section?: string; plafondOrdre?: number | null
}

type Article = { id: string; libelle: string; periode: string; portee: string; precision_txt: string | null
  plafond_ordre: number | null }
type Section = { nom: string; lignes: Article[] }

/** Une recherche insensible à la casse ET aux accents : personne ne tape « électricité » avec son accent sur un clavier de téléphone. */
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Catalogue({ catalogue, choisit }: { catalogue: Section[]; choisit: (d: Depart) => void }) {
  const [cherche, setCherche] = useState('')
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>({})
  const q = sansAccent(cherche.trim())
  const vues = q === '' ? catalogue
    : catalogue.map(s => ({ ...s, lignes: s.lignes.filter(l => sansAccent(l.libelle).includes(q)) }))
        .filter(s => s.lignes.length > 0)

  return (
    <section aria-labelledby="une-par-une" className="rounded-[24px] bg-surface p-4 shadow-carte min-[900px]:p-[22px]">
      <h2 id="une-par-une" className="titre text-[20px] font-semibold">Ou une par une</h2>
      <label className="mt-3 relative block">
        <span className="sr-only">Chercher une charge</span>
        <span aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 text-doux"><Loupe /></span>
        <input value={cherche} onChange={e => setCherche(e.target.value)}
               placeholder="Chercher : « assurance », « mobile »…"
               className="w-full min-h-12 rounded-[14px] border-[1.5px] border-brume bg-surface pl-11 pr-3.5
                          text-[16px] placeholder:text-doux" />
      </label>

      <div className="mt-2">
        {vues.length === 0 && cherche.trim() !== '' && (
          <p className="mt-3 text-[15px] text-doux">
            Rien sous ce nom. Prends « Autre chose » plus bas, le catalogue n’enferme personne.
          </p>
        )}
        {vues.map((section, i) => {
          const ouverte = q !== '' || (ouvertes[section.nom] ?? i === 0)
          return (
            <div key={section.nom} className={i > 0 ? 'border-t border-brume' : ''}>
              {q !== '' ? (
                <p className="min-h-11 flex items-center gap-2.5 text-[16px] font-semibold">
                  {section.nom}<span className="text-[13px] font-medium text-doux">{section.lignes.length}</span>
                </p>
              ) : (
                <button type="button" aria-expanded={ouverte}
                        onClick={() => setOuvertes(o => ({ ...o, [section.nom]: !ouverte }))}
                        className="w-full min-h-11 flex items-center gap-2.5 text-[16px] font-semibold text-left">
                  {section.nom}
                  <span className="mr-auto text-[13px] font-medium text-doux">{section.lignes.length}</span>
                  <span className="text-doux"><Chevron ouvert={ouverte} /></span>
                </button>
              )}
              {ouverte && (
                <div className="mb-2 flex gap-2 flex-wrap">
                  {section.lignes.map(l => (
                    <button key={l.id} type="button"
                            onClick={() => choisit({
                              libelle: l.libelle, periode: l.periode, portee: l.portee,
                              precision: l.precision_txt, catalogueId: l.id,
                              section: section.nom, plafondOrdre: l.plafond_ordre,
                            })}
                            className={`min-h-11 px-3.5 rounded-full text-[14.5px] font-medium inline-flex items-center ${FILET}`}>
                      {l.libelle}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ⚠️ `portee: 'perso'`, pas `'commun'`.
          « Autre chose » pré-cochait « Elle se partagera avec le foyer » : une charge inventée pour soi seul
          entrait donc automatiquement dans le budget de l'autre à son arrivée, sans que rien ne l'ait demandé.
          Le catalogue, lui, sait ce que chaque poste vaut — c'est la ligne LIBRE, celle dont on ne sait rien,
          qui doit demander. */}
      <button type="button"
              onClick={() => choisit({ libelle: '', periode: 'mensuel', portee: 'perso', precision: null, catalogueId: null })}
              className="mt-4 w-full min-h-[52px] rounded-2xl border-[1.5px] border-dashed border-[#7F9487]
                         inline-flex items-center justify-center gap-2 text-[16px] font-semibold text-herbe">
        <Plus />Autre chose
      </button>
    </section>
  )
}
