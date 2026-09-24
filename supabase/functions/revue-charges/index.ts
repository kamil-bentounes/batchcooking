/**
 * Relire les charges d'un foyer, et dire ce qui cloche.
 *
 * La dictée (`charges`) remplit ; celle-ci RELIT. Ce sont deux moments
 * différents : on dicte une fois, on se relit chaque fois qu'on a touché
 * quelque chose — d'où un compteur à part, sans quoi relire mangerait le quota
 * de dicter.
 *
 * Ce qui part au modèle : les libellés, montants, rythmes, portées, comptes et
 * enveloppes des charges du foyer, et le catalogue comme liste de contrôle. Ni
 * les revenus, ni les noms des membres, ni les parts de chacun : une revue de
 * charges n'a pas besoin de savoir qui gagne quoi.
 *
 * Rien n'est écrit. La réponse est une liste de constats que l'écran affiche ;
 * les gestes de correction sont ceux qui existaient déjà.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { preflight, reply } from '../_shared/cors.ts'
import { demande, fournisseurs } from '../_shared/llm.ts'
import { SCHEMA, SYSTEME, filtre, sansObjet, type Revue } from './prompt.ts'

/** On se relit plus souvent qu'on ne dicte, mais pas trente fois par jour. */
const QUOTA_MENSUEL = 30

/** Au-delà, ce n'est plus un foyer, c'est une comptabilité. */
const CHARGES_MAX = 120

const euros = (c: number) => (c / 100).toFixed(2).replace('.', ',')

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return reply('Method not allowed', 405)

  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return reply('Non authentifié', 401)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: userRes } = await admin.auth.getUser(jwt)
  if (!userRes?.user) return reply('Non authentifié', 401)

  const { data: profil } = await admin.from('user_profile')
    .select('household_id').eq('id', userRes.user.id).maybeSingle()
  if (!profil) return reply('Aucun foyer', 403)
  const foyer = profil.household_id

  /* ⚠️ On LIT les charges AVANT de consommer le jeton.
     Un foyer sans charge n'a rien à relire : lui prendre une unité de quota
     pour lui répondre « il n'y a rien » serait le punir d'avoir cliqué. Le
     portillon vient juste après, une fois qu'on sait qu'il y a du travail. */
  /* ⚠️ Le `select` tient sur UNE chaîne littérale, sans concaténation.
     supabase-js analyse cette chaîne au niveau des TYPES pour savoir ce qu'il
     rend ; coupée par un `+`, elle n'est plus littérale, l'analyse échoue et
     tout revient en `GenericStringError` — neuf erreurs de compilation pour
     une histoire de mise en page. */
  type Ligne = {
    libelle: string; montant_cents: number
    periodicite: string; commun: boolean; variable: boolean; debut: string
    compte: { nom: string; genre: string } | null
    enveloppe: { libelle: string } | null
    catalogue: { libelle: string } | null
  }
  const { data: chargesBrutes, error: eCharges } = await admin.from('charge')
    .select('libelle, montant_cents, periodicite, commun, variable, debut, compte:compte_id(nom, genre), enveloppe:enveloppe_id(libelle), catalogue:catalogue_id(libelle)')
    .eq('household_id', foyer).is('archive_le', null)
    .order('libelle')
  const charges = (chargesBrutes ?? []) as unknown as Ligne[]
  if (eCharges) return reply({ erreur: 'Impossible de relire tes charges.' }, 503)
  if (charges.length === 0) {
    return reply({ erreur: 'Tu n’as encore aucune charge à relire.' }, 400)
  }
  if (charges.length > CHARGES_MAX) {
    return reply({ erreur: 'Trop de charges d’un coup pour une relecture.' }, 413)
  }

  /* ⚠️ On CONSOMME d'abord, on regarde ensuite : `llm_consomme` est atomique et
     rend le compteur à jour. Lire puis incrémenter laisse passer N appels
     simultanés — même raisonnement que dans `charges`. */
  const { data: consomme, error: eQuota } = await admin
    .rpc('llm_consomme', { p_household: foyer, p_kind: 'revue-charges' })
  if (eQuota) return reply({ erreur: 'Le compteur d’usage est indisponible.' }, 503)
  const deja = (consomme ?? 1) - 1
  if (deja >= QUOTA_MENSUEL) {
    return reply({
      erreur: `Quota atteint : ${QUOTA_MENSUEL} relectures par mois. Il repart le 1er.`,
      restantes: 0,
    }, 429)
  }

  const fs = fournisseurs()
  if (fs.length === 0) {
    return reply({ erreur: 'Aucun modèle configuré.', restantes: QUOTA_MENSUEL - deja }, 503)
  }

  /* Une ligne par charge, dans un format que le modèle relit sans se tromper de
     colonne. Le montant est rendu EN EUROS avec son rythme : c'est la paire
     qu'on lui demande de juger, et lui donner des centimes bruts l'obligerait à
     diviser — donc à se tromper. */
  const lignes = charges.map(c => {
    const compte = c.compte
    const env = c.enveloppe
    return [
      c.libelle,
      `${euros(c.montant_cents)} € ${c.periodicite}`,
      c.commun ? 'commun' : 'perso',
      c.variable ? 'montant variable' : 'montant fixe',
      compte ? `compte ${compte.nom} (${compte.genre})` : 'AUCUN COMPTE',
      env ? `enveloppe ${env.libelle}` : 'aucune enveloppe',
      `depuis ${c.debut}`,
    ].join(' | ')
  }).join('\n')

  /* Le catalogue vient de la BASE, jamais du prompt : il est la liste de
     contrôle du modèle, et le figer ici le ferait dériver à la première ligne
     ajoutée. */
  const { data: catalogue } = await admin.from('catalogue_charge')
    .select('section, libelle, periode, portee, exclu_par').order('ordre')
  const liste = (catalogue ?? [])
    .map(l => `${l.section} | ${l.libelle} | ${l.periode} | ${l.portee}`)
    .join('\n')

  const r = await demande<Revue>(
    fs,
    [
      { role: 'system', content: SYSTEME },
      {
        role: 'user',
        content: `<catalogue>\n${liste}\n</catalogue>\n\n`
          + `<charges>\n${lignes}\n</charges>\n\n`
          + 'Relis ces charges.',
      },
    ],
    SCHEMA,
    'revue-charges',
  )

  if (!r.ok) return reply({ erreur: r.erreur, restantes: QUOTA_MENSUEL - deja - 1 }, 502)

  /* ⚠️ ON FILTRE LES LIBELLÉS INVENTÉS, côté serveur.
     Le prompt interdit de citer une ligne qui n'existe pas ; un prompt n'est
     pas une garantie. Un libellé qu'on ne retrouve pas dans le foyer désigne
     une charge que la personne va chercher dans le vide — et c'est exactement
     le genre de constat qui fait cesser de lire la revue. Ce qui ne se
     rattache à rien est jeté ici, pas affiché avec un point d'interrogation. */
  const postes = [
    ...charges.map(c => c.libelle),
    ...charges.map(c => c.catalogue?.libelle).filter((x): x is string => !!x),
  ]
  /* ⚠️ On regarde les POSTES DU CATALOGUE réellement posés, pas seulement les
     libellés libres : une charge renommée « Copro » reste rattachée à
     « Charges de copropriété » par `catalogue_id`, et c'est ce rattachement
     qui fait foi pour savoir ce qui est déjà couvert. */
  const revue: Revue = filtre(r.valeur, {
    postes,
    exclus: sansObjet(catalogue ?? [], postes),
  })

  return reply({
    ...revue,
    par: r.par,
    ms: r.ms,
    restantes: QUOTA_MENSUEL - deja - 1,
    quota: QUOTA_MENSUEL,
  })
})
