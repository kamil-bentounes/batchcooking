-- `portion.expires_at` est posée par le trigger `portion_peremption` (0017), qui
-- connaît les seuils par lieu. Le client n'a donc pas à la fournir — mais la
-- colonne est NOT NULL, ce que ni le code ni les types générés ne devinent.
--
-- On lui donne le défaut le PLUS COURT des trois (celui du frigo). Si le trigger
-- disparaissait un jour, une barquette hériterait d'une date prudente plutôt
-- que d'une date absurde : on préfère qu'elle soit mangée trop tôt.
alter table public.portion
  alter column expires_at set default (now() + interval '4 days');
