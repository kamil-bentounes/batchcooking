-- ═══════════════════════════════════════════════════════════════════════════
-- 0085 · Les enveloppes aussi se RECONNAISSENT
--
-- 0050 l'a écrit noir sur blanc pour les charges : « Un écran "ajoute tes
-- dépenses" avec un champ vide obtient une chose : rien. On ne se souvient pas
-- de ses charges, on les RECONNAÎT. » L'écran des comptes et des enveloppes,
-- lui, est resté un champ vide. Kamil, qui a écrit l'application, a dû
-- demander ce qu'il fallait y mettre — et s'attendait, à juste titre, à ce
-- qu'on lui propose les catégories plutôt qu'à les taper une par une.
--
-- Le référentiel existait déjà : il lui manquait de dire QUELLES lignes se
-- plafonnent. Une facture qu'on reçoit — le crédit, la taxe foncière, la copro
-- — n'a pas de plafond : son montant n'est pas une décision. Un poste qui
-- varie et dont on choisit soi-même la limite — les courses, le restaurant,
-- les sorties — en a un. C'est exactement la ligne de partage entre une charge
-- et une enveloppe, et elle se marque ici, une fois, au lieu d'être devinée
-- par le nom d'une section dans du TypeScript.
--
-- ⚠️ UN ENTIER, PAS UN BOOLÉEN.
--    Premier essai : `plafonnable boolean`, et la liste rendue dans l'ordre du
--    catalogue. Mais `ordre` range les charges par SECTION — Logement, Auto,
--    Abonnements, Santé… — et les enveloppes sortaient « Essence ou recharge,
--    Pharmacie, Courses, Restaurants… ». Les deux qu'on propose en premier
--    étaient les deux dont presque personne ne fait une enveloppe, et les
--    trois qu'on nous a citées (courses, restaurant, culture) arrivaient
--    après. Une suggestion mal classée est une suggestion qu'on ne lit pas.
--    L'ordre EST l'information : il vit donc dans la même colonne.
--
-- ⚠️ Le LIBELLÉ compte. `Charges.tsx` rattache une charge à l'enveloppe qui
--    porte le même nom (comparaison en casse basse). Proposer les libellés du
--    catalogue comme noms d'enveloppe n'est donc pas cosmétique : c'est ce qui
--    fait que la jauge se remplit toute seule ensuite.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.catalogue_charge
  add column plafond_ordre integer;

comment on column public.catalogue_charge.plafond_ordre is
  'Non nul : ce poste varie et sa limite est une DÉCISION du foyer, il mérite '
  'une enveloppe. La valeur est son rang parmi les enveloppes proposées — le '
  'rang du catalogue range par section, ce qui n''a pas de sens ici. Une '
  'facture reçue ne se plafonne pas : elle reste à null.';

update public.catalogue_charge c set plafond_ordre = v.rang
from (values
  ('Vie courante', 'Courses',              1),
  ('Vie courante', 'Restaurants',          2),
  ('Vie courante', 'Sorties et culture',   3),
  ('Vie courante', 'Droguerie et hygiène', 4),
  ('Vie courante', 'Vêtements',            5),
  ('Vie courante', 'Coiffeur et soins',    6),
  ('Vie courante', 'Animaux',              7),
  ('Auto',         'Essence ou recharge',  8),
  ('Santé',        'Pharmacie',            9)
) as v(section, libelle, rang)
where c.section = v.section and c.libelle = v.libelle;

/* Une migration qui ne marque rien a raté sa cible en silence : le référentiel
   a pu être renommé entre-temps. On le dit tout de suite. */
do $$
declare n integer;
begin
  select count(*) into n from public.catalogue_charge where plafond_ordre is not null;
  if n <> 9 then
    raise exception 'plafond_ordre : % lignes marquées au lieu de 9 — le catalogue a changé de libellés.', n;
  end if;
end $$;
