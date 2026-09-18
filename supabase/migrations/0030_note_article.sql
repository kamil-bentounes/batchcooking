-- ═══════════════════════════════════════════════════════════════════════════
-- CE QU'ON N'A PAS SU CONVERTIR (correctif du lot 5)
--
-- « 500 g de poireaux » dans une recette et « 2 poireaux » dans une autre : on
-- ne sait pas additionner les deux. On avait choisi de le dire dans le LIBELLÉ,
-- « Poireau (+ 2 à compter) ». C'était une erreur, parce que ce libellé est une
-- CLÉ pour trois choses :
--
--  · le rapprochement du ticket de caisse — mesuré : la ressemblance entre
--    « PDT CHARLOTTE 2.5KG » et « Pomme de terre » passe de 0,95 à 0,63 avec le
--    suffixe, donc sous le seuil, donc la ligne n'est plus cochée d'avance ;
--  · `shopping_habit`, unique sur (foyer, libellé) — une habitude différente
--    par valeur de N, et aucune ne se rapproche de « Poireau » ;
--  · `stock_item.label`, écrit au cochage, qui affichait la parenthèse à
--    l'inventaire.
--
-- La note vit donc à côté du libellé, pas dedans.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.shopping_item
  add column note text;

comment on column public.shopping_item.note is
  'Ce que la génération n''a pas su convertir, à lire dans le magasin. '
  'JAMAIS dans le libellé : celui-ci sert de clé au rapprochement des tickets, '
  'aux habitudes et à l''inventaire.';
