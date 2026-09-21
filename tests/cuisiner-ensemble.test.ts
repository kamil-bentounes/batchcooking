/**
 * Cuisiner à plusieurs, et ce qu'un convive n'a pas le droit de faire.
 *
 * Une session appartenait à un foyer et à lui seul. On peut désormais y convier
 * un foyer AMI : il suit l'avancement et prend des gestes. Tout l'enjeu tient
 * dans la frontière — il cuisine, il ne réécrit pas.
 *
 * Quatre choses peuvent se perdre en silence, et chacune a son test :
 *
 *  · convier quelqu'un qui n'est pas un ami, ou à la session d'un autre ;
 *  · entrer sans avoir dit oui ;
 *  · renommer, réordonner ou rallonger les gestes de son hôte ;
 *  · continuer à voir la session après avoir été retiré.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { admin, makeActor, type Actor } from './helpers/db'

let hote: Actor      // celui qui cuisine
let ami: Actor       // son ami, convié
let etranger: Actor  // ami de personne
let cycle: string
let geste: string
let recette: string

async function amis(a: Actor, b: Actor) {
  const { data } = await a.client.from('foyer_ami')
    .insert({ invite_par: a.householdId }).select().single()
  const { error } = await b.client.rpc('accepter_amitie', { p_jeton: data!.jeton })
  expect(error, `l'amitié n'a pas pris : ${error?.message}`).toBeNull()
}

beforeAll(async () => {
  hote = await makeActor('ens-hote')
  ami = await makeActor('ens-ami')
  etranger = await makeActor('ens-etranger')
  await amis(hote, ami)

  const { data: c } = await admin().from('cycle')
    .insert({ household_id: hote.householdId, week_of: '2029-03-05' }).select().single()
  cycle = c!.id

  // Une recette PRIVÉE : le convive doit pouvoir en lire le titre pendant la
  // session, et plus après.
  const { data: r } = await hote.client.from('recipe').insert({
    title: 'Le curry du dimanche', origin: 'manuelle', visibility: 'privee',
    owner_household_id: hote.householdId, yield_servings: 4, plannable: true,
  }).select().single()
  recette = r!.id
  await admin().from('cycle_recipe').insert({
    cycle_id: cycle, household_id: hote.householdId, recipe_id: recette, servings: 4,
  })

  const { data: t } = await admin().from('session_task').insert({
    cycle_id: cycle, household_id: hote.householdId, label: 'Émincer 500 g d’oignons',
    verb: 'emincer', quantity_g: 500, duration_min: 6, planned_start_min: 0,
  }).select().single()
  geste = t!.id
  await admin().from('session_task_recipe')
    .insert({ task_id: geste, recipe_id: recette, household_id: hote.householdId })
})

describe('convier à sa session', () => {
  it('ne convie qu’un ami', async () => {
    const { error } = await hote.client.from('session_convive')
      .insert({ cycle_id: cycle, invite_id: etranger.householdId, hote_id: hote.householdId })
    expect(error, 'un inconnu a été convié').not.toBeNull()
  })

  it('ne convie personne à la session d’un autre', async () => {
    const { error } = await ami.client.from('session_convive')
      .insert({ cycle_id: cycle, invite_id: etranger.householdId, hote_id: hote.householdId })
    expect(error, 'un ami a convié chez son hôte').not.toBeNull()
  })

  it('pose l’hôte d’après le cycle, quoi qu’en dise le client', async () => {
    const { data, error } = await hote.client.from('session_convive')
      .insert({ cycle_id: cycle, invite_id: ami.householdId, hote_id: ami.householdId })
      .select().single()
    expect(error, `refusé : ${error?.message}`).toBeNull()
    expect(data!.hote_id, 'le client a choisi l’hôte').toBe(hote.householdId)
    expect(data!.rejoint_le, 'l’hôte a fait entrer son ami de force').toBeNull()
  })
})

describe('tant qu’on n’a pas dit oui', () => {
  it('voit l’invitation, et rien de la session', async () => {
    const { data: invits } = await ami.client.from('session_convive').select('*')
    expect(invits ?? [], 'l’invitation ne se voit pas').toHaveLength(1)

    const { data: gestes } = await ami.client.from('session_task').select('id')
    expect(gestes ?? [], 'la session se voit sans avoir été rejointe').toHaveLength(0)
    const { data: cycles } = await ami.client.from('cycle').select('id').eq('id', cycle)
    expect(cycles ?? [], 'le cycle se voit sans avoir été rejoint').toHaveLength(0)
  })
})

describe('une fois entré', () => {
  beforeAll(async () => {
    const { error } = await ami.client.from('session_convive')
      .update({ rejoint_le: new Date().toISOString() }).eq('cycle_id', cycle)
    expect(error, `n'a pas pu rejoindre : ${error?.message}`).toBeNull()
  })

  it('voit le plan, et le titre de ce qu’on cuisine', async () => {
    const { data: gestes } = await ami.client.from('session_task').select('id, label')
    expect(gestes ?? [], 'le convive ne voit pas le plan').toHaveLength(1)

    const { data: titres } = await ami.client.from('session_task_recipe')
      .select('recipe:recipe_id(title)')
    expect((titres ?? [])[0]?.recipe, 'le convive cuisine sans savoir quoi').not.toBeNull()
  })

  it('prend un geste et le termine', async () => {
    const debut = new Date().toISOString()
    const { error: e1 } = await ami.client.from('session_task')
      .update({ assignee_id: ami.userId, started_at: debut }).eq('id', geste)
    expect(e1, `n'a pas pu prendre : ${e1?.message}`).toBeNull()

    const { error: e2 } = await ami.client.from('session_task')
      .update({ done_at: new Date(Date.now() + 60_000).toISOString() }).eq('id', geste)
    expect(e2, `n'a pas pu terminer : ${e2?.message}`).toBeNull()

    const { data } = await admin().from('session_task')
      .select('actual_min, household_id').eq('id', geste).single()
    expect(Number(data!.actual_min), 'la durée ne s’est pas mesurée').toBeGreaterThan(0)
    expect(data!.household_id, 'le geste a changé de foyer').toBe(hote.householdId)
  })

  it('la mesure reste au foyer qui cuisine', async () => {
    // D48 : l'observation nourrit les durées par défaut de la cuisine où elle a
    // eu lieu, pas de celle du convive.
    const { data: chezLHote } = await admin().from('duration_observation')
      .select('id').eq('household_id', hote.householdId)
    const { data: chezLeConvive } = await admin().from('duration_observation')
      .select('id').eq('household_id', ami.householdId)
    expect(chezLHote ?? [], 'rien n’a été observé chez l’hôte').toHaveLength(1)
    expect(chezLeConvive ?? [], 'une observation est partie chez le convive').toHaveLength(0)
  })

  it('ne réécrit ni le libellé, ni la durée, ni l’ordre', async () => {
    for (const champ of [{ label: 'Autre chose' }, { duration_min: 99 },
                         { planned_start_min: 500 }, { is_active: false }]) {
      const { error } = await ami.client.from('session_task').update(champ).eq('id', geste)
      expect(error, `le convive a réécrit ${Object.keys(champ)[0]}`).not.toBeNull()
    }
    const { data } = await admin().from('session_task')
      .select('label, duration_min').eq('id', geste).single()
    expect(data!.label).toBe('Émincer 500 g d’oignons')
  })

  it('ne supprime rien et ne fait pas avancer le cycle de son hôte', async () => {
    const { data: sup } = await ami.client.from('session_task').delete().eq('id', geste).select()
    expect(sup ?? [], 'le convive a supprimé un geste').toHaveLength(0)
    const { data: maj } = await ami.client.from('cycle')
      .update({ state: 'dressage' }).eq('id', cycle).select()
    expect(maj ?? [], 'le convive a fait avancer le cycle de son hôte').toHaveLength(0)
  })

  it('n’ouvre pas le reste du foyer qui l’accueille', async () => {
    // La session est une fenêtre, pas une porte.
    for (const table of ['shopping_item', 'portion', 'stock_item', 'meal_slot']) {
      const { data } = await ami.client.from(table).select('household_id')
      expect((data ?? []).every((l: { household_id: string }) =>
        l.household_id === ami.householdId),
        `${table} du foyer hôte est lisible`).toBe(true)
    }
  })
})

describe('quand l’invitation est retirée', () => {
  beforeAll(async () => {
    const { error } = await hote.client.from('session_convive').delete().eq('cycle_id', cycle)
    expect(error, `le retrait a échoué : ${error?.message}`).toBeNull()
  })

  it('la session disparaît, et la recette privée avec elle', async () => {
    const { data: gestes } = await ami.client.from('session_task').select('id')
    expect(gestes ?? [], 'la session se voit encore').toHaveLength(0)
    const { data: recettes } = await ami.client.from('recipe').select('id').eq('id', recette)
    expect(recettes ?? [], 'la recette privée se lit encore').toHaveLength(0)
    const { data: etapes } = await ami.client.from('recipe_step').select('id').eq('recipe_id', recette)
    expect(etapes ?? [], 'les étapes se lisent encore').toHaveLength(0)
  })
})

/**
 * Le temps réel, éprouvé pour de vrai.
 *
 * C'est le seul mécanisme de l'app qu'un test unitaire ne peut pas simuler : il
 * dépend d'une publication Postgres, d'un WebSocket et de la RLS appliquée au
 * flux. Trois choses qui se cassent en silence — et dont la panne ne se voit
 * qu'à deux, en cuisine, un dimanche.
 */
describe('être prévenu', () => {
  let cycleBis: string
  let gesteBis: string
  let hoteBis: Actor    // un foyer n'a qu'un cycle vivant : il en faut un autre
  let convive: Actor

  beforeAll(async () => {
    hoteBis = await makeActor('ens-tr-hote')
    convive = await makeActor('ens-tr')
    await amis(hoteBis, convive)

    const { data: c, error } = await admin().from('cycle')
      .insert({ household_id: hoteBis.householdId, week_of: '2029-04-02' }).select().single()
    expect(error, `l'amorce a échoué : ${error?.message}`).toBeNull()
    cycleBis = c!.id
    const { data: t } = await admin().from('session_task').insert({
      cycle_id: cycleBis, household_id: hoteBis.householdId, label: 'Préchauffer le four',
      duration_min: 10, planned_start_min: 0,
    }).select().single()
    gesteBis = t!.id

    const { error: ei } = await hoteBis.client.from('session_convive')
      .insert({ cycle_id: cycleBis, hote_id: hoteBis.householdId, invite_id: convive.householdId })
    expect(ei, `l'invitation a échoué : ${ei?.message}`).toBeNull()
    const { error: er } = await convive.client.from('session_convive')
      .update({ rejoint_le: new Date().toISOString() }).eq('cycle_id', cycleBis)
    expect(er, `rejoindre a échoué : ${er?.message}`).toBeNull()
  })

  it('pousse au convive le geste que l’hôte vient de prendre', async () => {
    /*
     * ⚠️ Deux pièges, et chacun a fait passer ce test pour cassé ou pour vert.
     *
     *    · `SUBSCRIBED` dit que le canal est joint, pas que le serveur a fini
     *      de poser le filtre sur le flux. Une écriture unique juste après
     *      tombait parfois dans ce trou : on réécrit donc jusqu'à réception.
     *    · le flux rejoue les écritures récentes à l'abonnement. Avec
     *      `event: '*'`, le premier reçu était l'INSERT de l'amorce et le test
     *      concluait sur lui, sans rien prouver du geste.
     */
    let repete: ReturnType<typeof setInterval> | undefined
    let minuteur: ReturnType<typeof setTimeout> | undefined
    const canal = convive.client.channel(`test:${cycleBis}`)

    try {
      const charge = await new Promise<Record<string, unknown>>((resolve, rejeter) => {
        minuteur = setTimeout(() => rejeter(new Error('rien n’est arrivé en 10 s')), 10_000)
        canal
          .on('postgres_changes',
              { event: 'UPDATE', schema: 'public', table: 'session_task',
                filter: `cycle_id=eq.${cycleBis}` },
              charge => resolve(charge.new))
          .subscribe(statut => {
            if (statut !== 'SUBSCRIBED') return
            // ⚠️ `async` n'est pas décoratif : une requête PostgREST ne part
            //    qu'au premier `then`. Rendre le constructeur sans l'attendre
            //    n'envoyait rien du tout, et la relance ne relançait rien.
            const ecrit = async () => {
              await hoteBis.client.from('session_task')
                .update({ assignee_id: hoteBis.userId, started_at: new Date().toISOString() })
                .eq('id', gesteBis)
            }
            void ecrit()
            repete = setInterval(ecrit, 1_500)
          })
      })

      expect(charge.id, 'ce n’est pas le bon geste').toBe(gesteBis)
      expect(charge.started_at, 'le geste arrive sans avoir été pris').not.toBeNull()
    } finally {
      clearTimeout(minuteur); clearInterval(repete)
      await convive.client.removeChannel(canal)
    }
  }, 20_000)

  it('ne pousse rien à un foyer qui n’est pas convié', async () => {
    // La RLS s'applique au flux comme au reste : c'est ce qui empêche un canal
    // nommé au hasard de servir de fenêtre chez les autres.
    const rien = await new Promise<string>(resolve => {
      const minuteur = setTimeout(() => resolve('silence'), 4_000)
      etranger.client
        .channel(`intrus:${cycleBis}`)
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'session_task',
              filter: `cycle_id=eq.${cycleBis}` },
            () => { clearTimeout(minuteur); resolve('reçu') })
        .subscribe(async statut => {
          if (statut !== 'SUBSCRIBED') return
          await hoteBis.client.from('session_task')
            .update({ done_at: new Date().toISOString() }).eq('id', gesteBis)
        })
    })
    expect(rien, 'un étranger a reçu la session').toBe('silence')
  }, 20_000)
})
