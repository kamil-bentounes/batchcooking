---
id: cuisine-semaine-peremption
titre: La semaine : la péremption, la part de chacun, le jour qui avance
ecrans: [/semaine]
questions:
  - Pourquoi la feuille dit « périme avant ce repas » ?
  - Quelle barquette l’appli pose quand je choisis un plat ?
  - Que dit la carte d’un repas sur le poids et les calories ?
  - La page change-t-elle de jour à minuit ?
sources:
  - src/ui/semaine/Carte.tsx
  - src/ui/semaine/FeuilleDeChoix.tsx
  - src/lib/choix.ts
  - src/lib/jour-local.ts
  - src/pages/Semaine.tsx
  - supabase/migrations/0125_semaine_corrections.sql
verifie_sur: 0021cf9
---
## Ce que fait l’appli

Quand tu choisis un plat, l’appli prend de préférence une barquette **encore bonne à l’heure du repas** : petit déjeuner 8 h, midi 12 h, goûter 16 h, soir 19 h. Ce n’est qu’ensuite qu’elle compte « la tienne, puis celle de personne, puis celle d’un autre », la plus pressée d’abord.

Si toutes les barquettes libres périment avant le repas, elle en pose quand même une : le choix reste le tien.

## Ce que tu lis

- **Dans la feuille**, la ligne d’un plat annonce la barquette qui sera vraiment posée : « à manger avant jeudi », ou « périme avant ce repas » en ocre quand il n’y en a pas de meilleure.
- **Sur la carte d’un repas**, sous « Du frigo, pour vous deux » : le poids, les calories et les protéines de ta part (« 784 g · 682 kcal · 56 g de protéines »), ou de la première personne de la carte, nommée, si tu n’en fais pas partie. Puis, quand il y a lieu, « périmée », « périme avant ce repas » (en ocre) ou, au frigo, « à manger aujourd’hui ».
- Un repas mangé n’affiche plus ni part ni péremption.

## Le jour qui avance

La page relit « aujourd’hui » quand l’écran se rallume et à minuit : le bandeau repart d’un jour plus loin, le jour que tu regardais reste le même s’il y est encore.

## Les règles

- La date de ton appareil ne peut différer que d’un jour de celle de Paris : au-delà, le choix est refusé (« La date de l’appareil n’est pas la bonne »).
- Pas assez de barquettes libres pour tout le monde : rien n’est écrit, la ligne est grisée.
