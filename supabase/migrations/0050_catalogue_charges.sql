-- ═══════════════════════════════════════════════════════════════════════════
-- LE CATALOGUE DES CHARGES
--
-- Un écran « ajoute tes dépenses » avec un champ vide obtient une chose : rien.
-- On ne se souvient pas de ses charges, on les RECONNAÎT — c'est pour ça que
-- ce catalogue existe. Il propose des sections et des lignes à cocher, et
-- l'utilisateur ne tape qu'un montant.
--
-- Classe A : référentiel partagé par toute l'instance, en lecture pour tout
-- authentifié, écrit par le seul rôle de service. Personne n'a besoin de
-- modifier « Assurance auto » ; ce qui appartient au foyer, c'est le montant,
-- et il vivra dans `charge`.
--
-- `periode` et `portee` ne sont que des SUGGESTIONS : le contrôle technique est
-- annuel chez presque tout le monde, l'essence est personnelle chez ce foyer-ci
-- et commune chez un autre. La ligne créée peut toujours en décider autrement.
-- ═══════════════════════════════════════════════════════════════════════════

create table public.catalogue_charge (
  id       uuid primary key default gen_random_uuid(),
  /* La section de l'écran. L'ordre d'affichage suit `ordre`, pas l'alphabet :
     on veut le logement en haut et les cadeaux en bas, pas l'inverse. */
  section  text not null,
  libelle  text not null,
  /* La périodicité la plus fréquente pour cette ligne. Un abonnement annuel
     saisi comme mensuel fait une erreur d'un facteur douze — autant proposer
     le bon défaut. */
  periode  text not null check (periode in ('mensuel', 'trimestriel', 'annuel')),
  /* `commun` : ça se partage d'ordinaire. `perso` : ça ne se partage pas.
     Le loyer est commun, le crédit auto ne l'est pas — chez ce foyer-ci. */
  portee   text not null check (portee in ('commun', 'perso')),
  /* Une note courte quand le libellé seul induirait en erreur. */
  precision_txt text,
  ordre    integer not null,
  unique (section, libelle)
);

alter table public.catalogue_charge enable row level security;
create policy catalogue_charge_read on public.catalogue_charge
  for select to authenticated using (true);

comment on table public.catalogue_charge is
  'Référentiel des charges proposées à la saisie, par section. Classe A : '
  'lecture pour tous, écriture par le seul rôle de service.';

insert into public.catalogue_charge (section, libelle, periode, portee, precision_txt, ordre) values
  -- ── Logement ─────────────────────────────────────────────────────────────
  ('Logement', 'Loyer',                      'mensuel',     'commun', null, 10),
  ('Logement', 'Mensualité de prêt',         'mensuel',     'perso',
   'Le capital enrichit le propriétaire : à lui de dire s''il la partage.', 11),
  ('Logement', 'Charges de copropriété',     'trimestriel', 'commun', null, 12),
  ('Logement', 'Taxe foncière',              'annuel',      'commun',
   'Connue en septembre. L''app provisionne au douzième et régularise.', 13),
  ('Logement', 'Assurance habitation',       'mensuel',     'commun', null, 14),
  ('Logement', 'Électricité',                'mensuel',     'commun',
   'Variable si tu paies à la consommation : l''app te demandera le réel.', 15),
  ('Logement', 'Gaz',                        'mensuel',     'commun', null, 16),
  ('Logement', 'Eau',                        'trimestriel', 'commun',
   'Souvent déjà comprise dans les charges de copropriété.', 17),
  ('Logement', 'Internet',                   'mensuel',     'commun', null, 18),
  ('Logement', 'Entretien et petits travaux','mensuel',     'commun', null, 19),

  -- ── Auto ─────────────────────────────────────────────────────────────────
  ('Auto', 'Essence ou recharge',            'mensuel',     'perso', null, 30),
  ('Auto', 'Assurance auto',                 'mensuel',     'perso', null, 31),
  ('Auto', 'Second conducteur',              'mensuel',     'perso',
   'Le SURCOÛT facturé par l''assureur, pas une part de la prime entière.', 32),
  ('Auto', 'Entretien et révision',          'annuel',      'perso', null, 33),
  ('Auto', 'Contrôle technique',             'annuel',      'perso', null, 34),
  ('Auto', 'Péages',                         'mensuel',     'perso', null, 35),
  ('Auto', 'Stationnement',                  'mensuel',     'perso', null, 36),
  ('Auto', 'Crédit auto ou LOA',             'mensuel',     'perso', null, 37),
  ('Auto', 'Carte grise, malus',             'annuel',      'perso', null, 38),
  ('Auto', 'Transports en commun',           'mensuel',     'perso', null, 39),

  -- ── Mobile et abonnements ────────────────────────────────────────────────
  ('Abonnements', 'Forfait mobile',          'mensuel',     'perso', null, 50),
  ('Abonnements', 'Streaming vidéo',         'mensuel',     'commun', null, 51),
  ('Abonnements', 'Musique',                 'mensuel',     'commun', null, 52),
  ('Abonnements', 'Stockage en ligne',       'mensuel',     'perso', null, 53),
  ('Abonnements', 'Assistant IA',            'mensuel',     'perso', null, 54),
  ('Abonnements', 'Presse et livres',        'mensuel',     'perso', null, 55),
  ('Abonnements', 'Jeux vidéo',              'mensuel',     'perso', null, 56),
  ('Abonnements', 'Salle de sport',          'mensuel',     'perso', null, 57),

  -- ── Santé ────────────────────────────────────────────────────────────────
  ('Santé', 'Mutuelle',                      'mensuel',     'perso', null, 70),
  ('Santé', 'Prévoyance',                    'mensuel',     'perso', null, 71),
  ('Santé', 'Consultations non remboursées', 'mensuel',     'perso', null, 72),
  ('Santé', 'Dentiste et optique',           'annuel',      'perso', null, 73),
  ('Santé', 'Pharmacie',                     'mensuel',     'perso', null, 74),

  -- ── Crédits ──────────────────────────────────────────────────────────────
  ('Crédits', 'Crédit immobilier — résidence', 'mensuel',   'perso', null, 90),
  ('Crédits', 'Crédit immobilier — locatif',   'mensuel',   'perso',
   'Un investissement n''est pas une charge subie : il ne se partage pas, et il '
   'ne se déduit pas du revenu avant le prorata.', 91),
  ('Crédits', 'Crédit à la consommation',      'mensuel',   'perso', null, 92),
  ('Crédits', 'Prêt étudiant',                 'mensuel',   'perso', null, 93),
  ('Crédits', 'Assurance emprunteur',          'mensuel',   'perso',
   'Souvent déjà comprise dans la mensualité.', 94),

  -- ── Impôts ───────────────────────────────────────────────────────────────
  ('Impôts', 'Impôt sur le revenu',          'mensuel',     'perso',
   'Prélevé à la source. Personnel : le prorata se calcule APRÈS lui.', 110),
  ('Impôts', 'Taxe foncière — locatif',      'annuel',      'perso', null, 111),
  ('Impôts', 'Frais de comptable',           'annuel',      'perso', null, 112),
  ('Impôts', 'CFE',                          'annuel',      'perso', null, 113),

  -- ── Vie courante ─────────────────────────────────────────────────────────
  ('Vie courante', 'Courses',                'mensuel',     'commun',
   'L''app la connaît déjà par les tickets : tu n''auras qu''à poser le plafond.', 130),
  ('Vie courante', 'Restaurants',            'mensuel',     'commun', null, 131),
  ('Vie courante', 'Sorties et culture',     'mensuel',     'commun', null, 132),
  ('Vie courante', 'Droguerie et hygiène',   'mensuel',     'commun', null, 133),
  ('Vie courante', 'Vêtements',              'mensuel',     'perso', null, 134),
  ('Vie courante', 'Coiffeur et soins',      'mensuel',     'perso', null, 135),
  ('Vie courante', 'Cadeaux et anniversaires','annuel',     'commun',
   'Le poste que tout le monde oublie, et qui arrive toujours en décembre.', 136),
  ('Vie courante', 'Animaux',                'mensuel',     'commun', null, 137),
  ('Vie courante', 'Dons et associations',   'mensuel',     'perso', null, 138),
  ('Vie courante', 'Frais bancaires',        'mensuel',     'perso', null, 139);
