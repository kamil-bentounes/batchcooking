---
id: cuisine-fiche-plat-gestes
titre: Les gestes d’une fiche : manger, congeler, sortir, jeter, retirer
ecrans: [/frigo]
questions:
  - Comment manger une barquette maintenant ?
  - Quelle part est prise quand j’en mange une ?
  - Quelle différence entre jeter et retirer une barquette ?
  - Comment congeler ou sortir une barquette du congélateur ?
  - Pourquoi je ne peux pas sortir les parts de demain ce matin ?
  - Pourquoi un repas n’a plus de barquette ?
sources:
  - src/ui/frigo/FichePlat.tsx
  - src/ui/frigo/Combien.tsx
  - src/lib/frigo.ts
  - src/lib/donnees/frigo.ts
  - src/lib/peremption.ts
  - supabase/migrations/0047_peremption_donnee.sql
  - supabase/migrations/0122_frigo_corrections.sql
verifie_sur: 7a0673e
---
## Ce que fait l’appli

Les gestes de la fiche d’un plat (« cuisine-fiche-plat » dit ce qu’elle affiche) : manger une part, congeler, sortir du congélateur, jeter, retirer. Quand il y a plusieurs parts, la fiche demande « Combien tu en … ? » (un compteur − et +) ; les parts non posées sur un repas partent d’abord.

## Au frigo

- **« En manger une maintenant »** : ton repas du moment (matin avant 10 h, midi avant 16 h, sinon soir) devient mangé ; refusé s’il l’est déjà. L’appli prend **ta** part d’abord, puis une part pour tout le monde, celle d’un autre en dernier recours ; une part non posée avant une posée, la plus pressée d’abord. Si une part posée est prise, son repas la perd et la fiche le dit (« Le dîner de dimanche n’a plus de barquette. »). Deux personnes qui en mangent en même temps ne prennent jamais la même.
- **« Congeler »** : la part tient trois mois à partir de maintenant.
- **« Jeter »** compte la part comme jetée. **« Retirer du frigo »** la supprime : ni mangée ni jetée, pour une barquette mangée en douce, donnée ou perdue. Dans les deux cas, le repas qui l’attendait la perd.

## Au congélateur

- **« Je les sors du congélateur »** sort les parts posées aujourd’hui ; celles de demain seulement à partir de l’heure du repas moins 24 heures (petit déjeuner 8 h, déjeuner 12 h, collation 16 h, dîner 19 h), car une part décongelée ne tient que 24 heures. Sinon, la fiche demande combien.
- Une note le dit : « C’est pour ce soir : sors-les maintenant… » ou « C’est pour demain soir : sors-les à partir de 19 h… » (« sors-la », « passe-la » quand une seule barquette est posée sur ce repas).
- « Changer le repas » mène à « La semaine ». « Jeter » et « Retirer du congélateur » font comme au frigo.
