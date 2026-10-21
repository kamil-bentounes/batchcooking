-- ═══════════════════════════════════════════════════════════════════════════
-- 0094 · Les mots que la base écrit
--
-- Les refus du budget s'affichent tels quels à l'écran. Écrits à la main dans
-- chaque fonction, « d'août » finissait en « de août » dans l'une et en
-- « d'aout » dans l'autre. Quatre fonctions, une fois.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.nom_du_mois(d date)
returns text language sql immutable set search_path = public, pg_temp as $$
  select (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
                'août', 'septembre', 'octobre', 'novembre', 'décembre'])
         [extract(month from d)::integer]
$$;

/* « d'août », « de mars » : l'élision devant une voyelle. */
create or replace function public.de_mois(d date)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when public.nom_du_mois(d) ~ '^[aeiouyàâéèêîôû]' then 'd''' else 'de ' end
         || public.nom_du_mois(d)
$$;

/* Comme `euros()` à l'écran, mais sans « ,00 » : « 430 € », « 1 234,56 € ».
   L'espace des milliers est l'espace fine insécable (U+202F) que
   `toLocaleString('fr-FR')` produit lui-même. */
create or replace function public.en_euros(cents bigint)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when cents < 0 then '−' else '' end
      || regexp_replace((abs(cents) / 100)::text, '(\d)(?=(\d{3})+$)', '\1' || chr(8239), 'g')
      || case when abs(cents) % 100 = 0 then ''
              else ',' || lpad((abs(cents) % 100)::text, 2, '0') end
      || ' €'
$$;

/* Le prénom de qui manque. Un nom vide se lisait « n'a pas encore posé son
   revenu » sans sujet. */
create or replace function public.prenom_de(nom text)
returns text language sql immutable set search_path = public, pg_temp as $$
  select coalesce(nullif(split_part(btrim(coalesce(nom, '')), ' ', 1), ''), 'Quelqu''un')
$$;

/* Les triggers `security invoker` les appellent sous `authenticated`. */
revoke execute on function public.nom_du_mois(date), public.de_mois(date),
  public.en_euros(bigint), public.prenom_de(text) from public, anon;
grant execute on function public.nom_du_mois(date), public.de_mois(date),
  public.en_euros(bigint), public.prenom_de(text) to authenticated, service_role;
