---
id: cuisine-plan
titre: Le plan de dimanche
ecrans: [/plan]
questions:
  - Comment est calculée la durée de la session de cuisine ?
  - Que veut dire « les mains prises » ?
  - Comment changer l’équipement du jour ?
  - Qu’est-ce que le goulot dans le plan ?
  - Pourquoi deux recettes partagent une même action ?
  - Peut-on recalculer le plan quand la session a commencé ?
sources:
  - src/pages/Plan.tsx
  - src/lib/donnees/session.ts
  - src/lib/plan/fusion.ts
  - src/lib/plan/equipement.ts
  - src/lib/plan/types.ts
  - seed/conversions.json
  - src/lib/plan/ordonnance.ts
  - src/lib/plan/duree.ts
  - supabase/migrations/0005_policies.sql
verifie_sur: 9504cf2
---
## Ce que fait l’appli

À partir des étapes des recettes retenues, l’appli calcule un plan : quoi faire, dans quel ordre, avec quels appareils. Même plan sur les deux téléphones. Il est **enregistré** au « Commencer la session », puis ne change plus pendant que tu cuisines.

## Ce que dit l’écran

- Sous « Le plan » : « Pour la cuisine du dimanche 25 octobre, à deux » (« à 3 »… selon le foyer ; rien si tu es seul).
- En très grand : le temps **en cuisine**, puis trois chiffres : « X les mains prises » (le temps où quelqu’un a les mains occupées ; une cuisson au four dure mais n’occupe personne), « X d’attente » et « N actions pour une personne » (ou « N personnes » : les membres du foyer).
- « Puis X de repos, sans toi » : repos compté à part.
- « Au menu » : les photos des recettes retenues.
- « Dans l’ordre » : un geste par ligne, avec son heure de début, sa durée, le plat qu’il sert (« pour Chili con carne ») et sa barre. Un point (•) marque les gestes qui fixent la durée.
- « Les appareils » : quand chacun travaille.

## L’équipement du jour

En dernier, « Ce dont tu disposes » tient sur une ligne (« 8 appareils », puis « Four ×2, plaques de cuisson ×4… »). « Ce dont tu disposes aujourd’hui » s’ouvre seul avant toute validation, puis par le crayon (« Changer l’équipement du jour »), avec « Recalculer le plan ». Le nombre dit combien de plats l’appareil prend à la fois. Il part de la dernière session de ton foyer (sinon les huit appareils : four 2, plaques de cuisson 4, les autres 1). **Tant que tu n’as pas touché « Recalculer le plan », le plan compte un seul plat par appareil.** Un appareil décoché reste utilisé, à un plat à la fois.

Si un appareil retarde tout : « X est le goulot » et « S’il prenait deux plats à la fois, la session durerait X de moins. » (au-delà de 2 minutes). Le gain suppose 2 plats pour tous les appareils à 1 plat.

## Les règles de calcul

- Les durées sont celles des étapes des recettes : elles ne changent ni avec les parts retenues ni avec les quantités.
- Deux recettes ne partagent une action (« pour Chili con carne et Lasagnes ») que si le geste est le même (même verbe, même appareil, même charge) **et** que les deux quantités sont connues. Durée : la somme, moins la mise en place payée une fois (2,5 minutes au plus). Exemple : émincer 8 min + émincer 6 min = 11,5 min. Sans quantités, seul « préchauffer » se partage, avec la durée la plus longue.
- Une étape sans durée compte pour 1 minute.

## Commencer

« Commencer la session », le bouton du bas, enregistre le plan, note l’heure de début et ouvre l’écran de cuisine. Dès qu’une action est prise : « La session a commencé : le plan ne se recalcule plus. »

## Pas de plan

« Rien à ordonnancer » : les recettes choisies n’ont pas d’étapes utilisables.
