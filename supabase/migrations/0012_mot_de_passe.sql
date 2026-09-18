-- Le lien par e-mail ne sert qu'à la PREMIÈRE connexion : on y pose un mot de
-- passe, et ensuite on se connecte normalement. Le mail ne resservira que pour
-- un oubli. Cela supprime aussi la limite d'envoi de Supabase du quotidien.
alter table public.user_profile
  add column password_set boolean not null default false;

comment on column public.user_profile.password_set is
  'Faux tant que la personne ne s''est connectée que par lien magique. L''application la conduit alors à choisir un mot de passe.';

-- Le compte créé par create_household() vient forcément d'un lien magique.
-- Rien à changer : le défaut est faux.
