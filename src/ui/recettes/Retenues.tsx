/**
 * Ce qu'il reste à couvrir, et ce qui est déjà retenu (§ 3.2 de la spec).
 *
 * Refaite le 26/10/2026 d'après `choisir.html` : le chiffre qui décide en grand,
 * une piste des parts, puis une BANDE de photos — une petite carte par recette
 * retenue, avec « − 4 + » pour ses parts et « ✕ » pour la retirer. Toutes les
 * recettes y sont : la bande défile de côté, elle ne repousse plus le catalogue
 * hors de l'écran (c'est pour ça que les trois dernières seulement se montraient).
 * Le champ de parts reste un vrai champ, entre « − » et « + » : on peut y taper.
 */
import { useState } from 'react'
import type { RecetteChoisie } from '../../lib/donnees/cycle.ts'
import { PARTS_MAX_CYCLE, PARTS_MAX_RECETTE, parts } from '../../lib/recettes/parts.ts'
import { ChampParts } from './ChampParts.tsx'
import { Photo } from './Photo.tsx'
import { Icone } from './pictos.tsx'

/** « 6 parts » en grand : l'espace insécable garde le chiffre et le mot sur une ligne. */
const enGrand = (texte: string) => texte.replace(' ', ' ')

export function Retenues({
  cible, choisies, reprise = 0, surRefus, surCible, surParts, surRetire,
}: {
  cible: number
  choisies: RecetteChoisie[]
  /** Change quand un réglage a raté : les champs repartent de la base. */
  reprise?: number
  /** Le motif d'un refus de saisie (« 2.5 », « 21 »), ou `null` quand elle est valide. */
  surRefus: (message: string | null) => void
  surCible: (parts: number) => void
  surParts: (recipeId: string, parts: number) => void
  surRetire: (id: string) => void
}) {
  const [regle, setRegle] = useState(false)
  const prises = choisies.reduce((s, c) => s + c.servings, 0)
  const manque = cible - prises
  const pas = 'size-11 grid place-items-center rounded-full text-fond disabled:opacity-40'

  return (
    <section aria-label="Ce qu’on cuisine"
             className="sur-encre mt-5 rounded-[28px] bg-encre text-fond pt-5 pb-[18px] overflow-hidden
                        shadow-carte">
      <div className="px-5">
        <p className="text-[15px] text-fond/70">
          {manque > 0 ? 'Il manque' : manque === 0 ? 'C’est couvert' : 'Au-delà du prévu'}
        </p>
        <p className="chiffre font-semibold mt-0.5 text-safran text-[60px] leading-[1.05]">
          {enGrand(manque > 0 ? parts(manque) : manque === 0 ? parts(cible) : `+${parts(-manque)}`)}
        </p>
        <p className="mt-1 text-[14px] text-fond/70">
          {manque > 0
            ? `${prises === 0 ? 'Rien de retenu pour l’instant.'
                : `${prises} déjà retenue${prises > 1 ? 's' : ''}.`} On fait les courses samedi.`
            : manque === 0
              ? 'Il ne reste qu’à faire la liste.'
              : `${prises} parts retenues pour ${cible} prévues.`}
        </p>

        {/* La cible fait 44 px, transparente ; le dessin garde les 30 px de la maquette. */}
        <button type="button" onClick={() => setRegle(r => !r)} aria-expanded={regle}
                className="mt-1.5 -mb-1 inline-flex items-center min-h-11 whitespace-nowrap">
          <span className="inline-flex items-center gap-2 h-[30px] rounded-full bg-fond/12 px-3
                           text-[13px] text-brume">
            <Icone nom="pot" taille={17} />
            {cible} repas à couvrir
          </span>
        </button>

        <div role="img" aria-label={`${prises} parts retenues sur ${cible} prévues`}
             className="mt-2.5 flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-fond/15">
          {prises > 0 && (
            <span className="rounded-full bg-fond" style={{ flex: Math.min(prises, cible) }} />
          )}
          {prises > cible && (
            <span className="rounded-full bg-safran" style={{ flex: prises - cible }} />
          )}
        </div>

        {regle && (
          <label className="mt-3.5 flex items-center justify-between gap-3 text-[14px] text-brume">
            Parts visées cette semaine
            <ChampParts key={reprise} valeur={cible} max={PARTS_MAX_CYCLE}
                        surValeur={surCible} surRefus={surRefus}
                        className="w-20 h-11 rounded-[14px] bg-fond/10 px-3 text-right text-fond
                                   outline-none focus:bg-fond/15" />
          </label>
        )}
      </div>

      {choisies.length > 0 && (
        <ul aria-label="Recettes retenues"
            className="mt-4 flex gap-2.5 overflow-x-auto px-5 pb-0.5 snap-x snap-mandatory
                       scroll-pl-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {choisies.map(c => (c.recipe === null ? (
            /*
             * La recette d'un ami, retenue puis devenue illisible — amitié rompue,
             * ou partage retiré. La ligne du cycle survit ; sans ce cas, elle
             * s'affichait « Recette » et la liste de courses perdait ses
             * ingrédients en silence.
             */
            <li key={c.id} className="snap-start shrink-0 w-[168px] rounded-[18px] bg-fond/8 p-3">
              <span className="text-[14px] text-brume">Recette devenue inaccessible</span>
              <span className="block mt-1 text-[13px] text-fond/70">
                Son foyer ne la partage plus. Elle n’apporte plus rien aux courses.
              </span>
              {/* « Retirer » garde la même couleur partout : le rouge est réservé
                  à ce qui ne se défait pas. */}
              <button type="button" onClick={() => surRetire(c.id)}
                      className="mt-1 min-h-11 px-2 -ml-2 text-[13px] text-fond/70">Retirer</button>
            </li>
          ) : (
            <li key={c.id} className="snap-start shrink-0 w-[138px] relative rounded-[18px] bg-fond/8
                                      overflow-hidden flex flex-col">
              <Photo url={c.recipe.image_url} glyphe={36} className="block h-[84px] w-full" />
              {/* 44 px de cible, 32 de dessin. */}
              <button type="button" onClick={() => surRetire(c.id)}
                      aria-label={`Retirer ${c.recipe.title}`}
                      className="absolute top-0 right-0 size-11 grid place-items-center">
                <span className="size-8 grid place-items-center rounded-full bg-encre/70 text-surface">
                  <Icone nom="fermer" taille={16} />
                </span>
              </button>
              {/* Le titre se lit en entier (quatre lignes au plus) : la carte grandit avec lui. */}
              <p className="min-h-[42px] px-2.5 pt-2 text-[13px] leading-[1.2] font-semibold line-clamp-4
                            text-fond [overflow-wrap:anywhere]">
                {c.recipe.title}
              </p>
              <div className="mt-auto flex items-center justify-between px-0.5 pb-1.5">
                <button type="button" aria-label={`Une part de moins, ${c.recipe.title}`}
                        disabled={c.servings <= 1} className={`${pas} bg-fond/14`}
                        onClick={() => surParts(c.recipe_id, c.servings - 1)}>
                  <Icone nom="moins" taille={18} />
                </button>
                <span className="text-center leading-none">
                  <ChampParts key={reprise} valeur={c.servings} max={PARTS_MAX_RECETTE}
                              libelle={`Parts de ${c.recipe.title}`}
                              surValeur={n => surParts(c.recipe_id, n)} surRefus={surRefus}
                              className="chiffre block w-9 h-11 bg-transparent text-center text-[20px]
                                         font-semibold text-fond outline-none focus-visible:bg-fond/10
                                         rounded-[10px]" />
                  <span className="-mt-2.5 block text-[11px] text-fond/70">
                    {c.servings > 1 ? 'parts' : 'part'}
                  </span>
                </span>
                <button type="button" aria-label={`Une part de plus, ${c.recipe.title}`}
                        disabled={c.servings >= PARTS_MAX_RECETTE} className={`${pas} bg-fond/14`}
                        onClick={() => surParts(c.recipe_id, c.servings + 1)}>
                  <Icone nom="plus" taille={18} />
                </button>
              </div>
            </li>
          )))}
        </ul>
      )}
      {/* Le message d'un réglage refusé ou raté n'est PAS ici : sous six recettes il tombait hors
          de l'écran, loin du champ qu'on venait de toucher. Il s'affiche dans la barre du bas
          (`Choisir`), qui reste sous les yeux. */}
    </section>
  )
}
