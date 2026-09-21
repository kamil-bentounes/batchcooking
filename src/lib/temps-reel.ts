/**
 * Être prévenu, et pas seulement avoir le droit de lire.
 *
 * D50 dit que deux téléphones doivent voir la même chose. C'était vrai du
 * CALCUL — le plan est persisté une fois, jamais recalculé — et faux de
 * l'ÉCRAN : rien ne disait au second téléphone qu'un geste venait d'être pris.
 * Deux personnes prenaient la même action, et l'une des deux la refaisait.
 *
 * Trois précautions qui ont chacune leur raison :
 *
 *  · on n'invalide QUE la requête du plan concerné. Tout invalider ferait
 *    recharger le catalogue à chaque « c'est fait » ;
 *  · on se désabonne au démontage, sinon quitter et revenir en cuisine empile
 *    les canaux et multiplie les rechargements ;
 *  · la RLS s'applique au flux comme au reste : on ne reçoit que ce que l'on
 *    aurait pu lire. Le filtre par cycle est là pour le bruit, pas pour le
 *    droit.
 *
 * ⚠️ UNE EXCEPTION, et elle vient de Supabase, pas de nous : les événements
 *    DELETE ne passent PAS par la RLS. N'importe quel compte abonné à la table
 *    sans filtre reçoit la suppression d'une tâche — la charge ne porte que
 *    l'identifiant, mais le rythme des sessions de tous les foyers s'y lit.
 *    Rien côté client n'y change quoi que ce soit ; c'est dit ici pour que
 *    personne ne croie la barrière plus étanche qu'elle ne l'est.
 */
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from './supabase.ts'
import { CLE } from './donnees/session.ts'
import { CLE as CLE_CONVIVES } from './donnees/convives.ts'

export function useTempsReel(cycleId: string | undefined) {
  const qc = useQueryClient()

  useEffect(() => {
    if (!cycleId) return
    const canal = supabase
      .channel(`session:${cycleId}`)
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'session_task',
            filter: `cycle_id=eq.${cycleId}` },
          () => { qc.invalidateQueries({ queryKey: CLE.plan(cycleId) }) })
      // Qui entre et qui s'en va. Sans cela l'hôte ne savait pas qu'on l'avait
      // rejoint, et le convive retiré restait devant un écran qui mentait.
      .on('postgres_changes',
          { event: '*', schema: 'public', table: 'session_convive',
            filter: `cycle_id=eq.${cycleId}` },
          () => {
            qc.invalidateQueries({ queryKey: CLE_CONVIVES.convives(cycleId) })
            qc.invalidateQueries({ queryKey: CLE_CONVIVES.invitations })
          })
      .subscribe()

    return () => { supabase.removeChannel(canal) }
  }, [cycleId, qc])
}
