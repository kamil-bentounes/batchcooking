-- ═══════════════════════════════════════════════════════════════════════════
-- 0087 · Ce qu'un poste EXCLUT
--
-- La revue des charges proposait « Loyer » à quelqu'un qui rembourse un prêt,
-- « Eau » à un foyer qui paie des charges de copropriété, et « Assurance
-- emprunteur » à qui a déjà sa mensualité. Le prompt l'interdit ; un prompt
-- n'est pas une garantie, et le banc l'a mesuré deux fois sur quatre cas.
--
-- Or le catalogue le SAIT déjà — il le dit en prose dans `precision_txt` :
-- « Souvent déjà comprise dans les charges de copropriété », « Souvent déjà
-- comprise dans la mensualité ». Une phrase qu'un humain lit ne se filtre pas.
-- On en fait une donnée, et le serveur l'applique.
--
-- Deux cas dans la même colonne, parce qu'ils produisent la même décision :
--   · l'EXCLUSION — on ne paie pas un loyer ET un prêt pour le même logement ;
--   · l'INCLUSION — l'eau est déjà dans les charges, la proposer fait payer
--     deux fois ou chercher une facture qui n'existe pas.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.catalogue_charge
  add column exclu_par text[] not null default '{}';

comment on column public.catalogue_charge.exclu_par is
  'Les libellés du catalogue dont la PRÉSENCE chez un foyer rend cette ligne '
  'sans objet — parce qu''elle les contredit (loyer / prêt) ou qu''elle y est '
  'déjà comprise (eau / charges de copropriété). La revue ne la propose alors '
  'pas en oubli.';

update public.catalogue_charge c set exclu_par = v.exclut
from (values
  ('Loyer',                        array['Mensualité de prêt', 'Crédit immobilier — résidence']),
  ('Mensualité de prêt',           array['Loyer']),
  ('Crédit immobilier — résidence', array['Loyer']),
  ('Eau',                          array['Charges de copropriété']),
  ('Assurance emprunteur',         array['Mensualité de prêt', 'Crédit immobilier — résidence'])
) as v(libelle, exclut)
where c.libelle = v.libelle;

/* Une migration qui ne marque rien a raté sa cible en silence. */
do $$
declare n integer;
begin
  select count(*) into n from public.catalogue_charge where exclu_par <> '{}';
  if n <> 5 then
    raise exception 'exclu_par : % lignes marquées au lieu de 5 — le catalogue a changé de libellés.', n;
  end if;
end $$;
