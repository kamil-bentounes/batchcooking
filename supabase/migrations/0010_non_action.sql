-- Phrases de recette qui ne décrivent aucun geste : « bon appétit », « et voilà »,
-- « à déguster chaud », « astuce : ». Elles ne reçoivent pas de durée et sortent de
-- l'ordonnancement. Mesuré : 9 phrases sur 308 dans le corpus échantillonné — sans ce
-- filtre, le plan gagne des minutes fantômes et affiche des étapes vides.
create table public.non_action_pattern (
  pattern text primary key,
  note    text
);

alter table public.non_action_pattern enable row level security;
create policy non_action_pattern_read on public.non_action_pattern
  for select to authenticated using (true);
