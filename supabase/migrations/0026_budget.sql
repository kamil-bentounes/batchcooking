-- ═══════════════════════════════════════════════════════════════════════════
-- LE BUDGET DES COURSES (lot 6)
--
-- Le suivi a besoin d'un repère pour dire « 187 € sur 320 ». Sans budget posé,
-- la jauge n'a rien à remplir — et l'écran affiche alors le chiffre seul, ce
-- qui reste utile mais n'aide pas à décider.
--
-- `null` est délibéré : ne PAS se fixer de budget est un choix légitime, et
-- l'application ne doit pas en inventer un.
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.household
  add column food_budget_eur numeric check (food_budget_eur > 0);

comment on column public.household.food_budget_eur is
  'Budget alimentaire mensuel, en euros. NULL = pas de budget fixé, et la jauge '
  'du suivi ne s''affiche pas.';
