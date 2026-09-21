/**
 * Accepter une invitation d'amitié entre foyers.
 *
 * L'écran est volontairement maigre : il y a une décision, et une seule. Ce
 * qu'il doit dire, en revanche, il le dit avant — devenir ami, c'est laisser
 * voir ce qu'on aura marqué « partagé », et ça se comprend avant de cliquer.
 */
import { Attente, Erreur, Principal, Secondaire, Surface, Vide } from '../ui/coque.tsx'
import { Page } from '../ui/kit'
import { useAccepteAmi } from '../lib/donnees/amis.ts'

export function AccepteAmi({ jeton, va }: { jeton: string; va: (v: string) => void }) {
  const accepte = useAccepteAmi()

  if (accepte.isSuccess) {
    return (
      <Page centre titre="C’est fait">
        <Vide titre="Vous êtes amis"
              texte="Vos recettes marquées « partagée » sont maintenant visibles de part et d’autre." />
        <Principal onClick={() => va('/choisir')}>Voir le catalogue</Principal>
      </Page>
    )
  }

  return (
    <Page centre titre="Devenir amis ?"
          chapeau="Quelqu’un t’invite à partager ses recettes.">
      <Surface className="mt-2">
        <p className="text-[15px]">Ce que ça change, dans les deux sens :</p>
        <ul className="mt-3 space-y-2 text-[14px] text-doux">
          <li>· Les recettes marquées <strong className="text-encre">« partagée »</strong> deviennent
            visibles de part et d’autre, avec le prénom de qui les a ajoutées.</li>
          <li>· Ce qui est <strong className="text-encre">privé</strong> le reste — c’est le défaut,
            et rien ne bascule tout seul.</li>
          <li>· Vos courses, vos barquettes, vos prix et vos objectifs ne bougent
            pas : ils ne sortent jamais du foyer.</li>
          <li>· Chacun peut rompre, et ça vaut pour les deux.</li>
        </ul>
      </Surface>

      <div className="mt-7">
        <Principal onClick={() => accepte.mutate(jeton)} disabled={accepte.isPending}>
          {accepte.isPending ? 'Un instant…' : 'Accepter'}
        </Principal>
        <Erreur de={accepte.error} />
        <Secondaire onClick={() => va('/')}>Non merci</Secondaire>
      </div>
      {accepte.isPending && <Attente />}
    </Page>
  )
}
