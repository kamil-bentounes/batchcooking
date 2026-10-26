-- ═══════════════════════════════════════════════════════════════════════════
-- LA PHOTO D'UN PLAT
--
-- Trois des recettes de Kamil sont manuelles et n'ont pas de photo : le frigo
-- dessiné (écran /frigo) montre alors « pas encore de photo ». Il peut
-- désormais photographier le plat — et la photo devient `recipe.image_url`.
--
-- Un seau de stockage PUBLIC EN LECTURE : une photo de plat n'a rien de secret,
-- et une adresse publique se charge dans un `<img>` sans jeton ni URL signée
-- qui expirerait (la page est aussi servie hors ligne, depuis le cache).
--
-- Les ÉCRITURES, elles, sont bornées :
--  · par le foyer : le premier segment du chemin est l'identifiant du foyer de
--    l'appelant (`<foyer>/<recette>-<horodatage>.jpg`), jamais celui d'un autre ;
--  · par la taille (2 Mo — le client réduit déjà à 1 400 px) et par le type
--    (JPEG, PNG, WebP : pas de SVG, qui peut porter du script).
-- Quant à `recipe.image_url`, la garde `tg_recipe_photo` (0092) la réservait au
-- rôle de service : une adresse posée par un compte ferait charger à tous les
-- foyers qui voient la recette une image de son choix, et lui dirait qui
-- regarde. Elle s'ouvre ICI, et à une seule adresse : celle d'une photo de SON
-- foyer dans CE projet — `<projet>/storage/v1/object/public/photos-des-plats/
-- <foyer>/<fichier>` —, sur une recette qui appartient à son foyer. Le projet
-- n'est pas deviné : c'est l'émetteur (`iss`) du jeton, que PostgREST a vérifié.
-- ═══════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos-des-plats', 'photos-des-plats', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lire la liste des objets de SON dossier (la suppression de l'ancienne photo en a besoin) ; la lecture
-- par adresse publique, elle, ne passe pas par une policy.
create policy photos_des_plats_lecture on storage.objects
  for select to authenticated
  using (bucket_id = 'photos-des-plats'
         and (storage.foldername(name))[1] = public.current_household()::text);

create policy photos_des_plats_ecriture on storage.objects
  for insert to authenticated
  with check (bucket_id = 'photos-des-plats'
              and (storage.foldername(name))[1] = public.current_household()::text);

create policy photos_des_plats_remplace on storage.objects
  for update to authenticated
  using (bucket_id = 'photos-des-plats'
         and (storage.foldername(name))[1] = public.current_household()::text)
  with check (bucket_id = 'photos-des-plats'
              and (storage.foldername(name))[1] = public.current_household()::text);

create policy photos_des_plats_retire on storage.objects
  for delete to authenticated
  using (bucket_id = 'photos-des-plats'
         and (storage.foldername(name))[1] = public.current_household()::text);

-- ── L'adresse de la photo ───────────────────────────────────────────────────
-- `https://` seulement, comme avant ; en local, l'API de développement est en
-- `http://127.0.0.1` et ne peut pas faire autrement.
alter table public.recipe drop constraint if exists recipe_image_url_check;
alter table public.recipe add constraint recipe_image_url_check
  check (image_url is null
         or (length(image_url) <= 2048
             and (image_url ~ '^https://'
                  or image_url ~ '^http://(127\.0\.0\.1|localhost)(:[0-9]+)?/storage/v1/')));

create or replace function public.tg_recipe_photo()
returns trigger language plpgsql as $$
declare
  foyer  uuid := public.current_household();
  projet text := regexp_replace(
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'iss', ''),
    '/auth/v1/?$', '');
  prefixe text;
begin
  if public.is_service_role() then return new; end if;
  if tg_op = 'INSERT' then
    if new.image_url is not null then
      raise exception 'la photo d''une recette vient de sa page, pas d''une saisie'
        using errcode = 'check_violation';
    end if;
  elsif new.image_url is distinct from old.image_url then
    prefixe := projet || '/storage/v1/object/public/photos-des-plats/' || foyer::text || '/';
    -- Une photo de plat : la sienne, sur sa recette. Un nom de fichier simple (pas de sous-dossier,
    -- pas de requête), ou rien (retirer SA photo : jamais celle du catalogue).
    if foyer is not null and old.owner_household_id is not distinct from foyer
       and (new.image_url is null
            or (projet <> ''
                and starts_with(new.image_url, prefixe)
                and substr(new.image_url, length(prefixe) + 1) ~ '^[A-Za-z0-9._-]+$')) then
      return new;
    end if;
    raise exception 'la photo d''une recette vient de sa page, pas d''une saisie'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
