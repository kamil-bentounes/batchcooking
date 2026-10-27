/**
 * Ce qu'on sait d'une erreur d'envoi, et ce qui part vraiment sur le fil. Pur : aucune API de Deno.
 *
 * LA question : l'erreur est-elle arrivée AVANT que les données du mail soient parties ? Si oui, le mail n'est sûrement
 * pas parti, et on peut rendre la réservation pour que l'heure suivante réessaie. Sinon, ou dans le doute, il est
 * peut-être parti : la réservation reste. Un mail perdu vaut mieux qu'un doublon.
 *
 * `nodemailer` marque presque toutes ses erreurs de socket de la commande « CONN », quelle que soit l'étape
 * (« Connection closed unexpectedly » et « Timeout » peuvent tomber pendant ou après DATA) : le code seul ne dit rien.
 * On ne reconnaît donc comme « avant les données » que ce qui l'est SÛREMENT :
 *   · l'authentification refusée (`EAUTH`) et la résolution du nom (`EDNS`) ;
 *   · un destinataire, un expéditeur ou une enveloppe refusés (`EENVELOPE`) avant `DATA` ;
 *   · une connexion qui n'a jamais abouti : refusée, injoignable, « Connection timeout », « Greeting never received » ;
 *   · un serveur qui coupe dès l'accueil (`EHLO`).
 * « Connection closed unexpectedly », « Socket timeout », `EMESSAGE`, `EPROTOCOL`, `ESTREAM` et tout ce qui n'est pas
 * reconnu : ambigu, la réservation reste.
 */
import { lien } from './liens.ts'
import type { Mail } from './types.ts'

type ErreurSmtp = { code?: unknown; command?: unknown; message?: unknown }

const DEJA_PERDU = /connect (ECONNREFUSED|ENETUNREACH|EHOSTUNREACH)|getaddrinfo|Connection timeout|Greeting never received/i

export function avantLesDonnees(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false
  const { code, command, message } = e as ErreurSmtp
  const cmd = typeof command === 'string' ? command : ''
  const msg = typeof message === 'string' ? message : ''
  if (code === 'EAUTH' || code === 'EDNS') return true
  if (code === 'EENVELOPE') return cmd !== 'DATA'
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ESOCKET') {
    if (cmd === 'EHLO') return true
    return cmd === 'CONN' && DEJA_PERDU.test(msg)
  }
  return false
}

export type OptionsDuMail = {
  from: { name: string; address: string }
  to: string
  subject: string
  text: string
  html: string
  headers: Record<string, string>
}

/**
 * Ce qui part sur le fil. Le destinataire est celui qu'on donne, jamais autre chose ; l'en-tête `List-Unsubscribe` mène
 * à l'écran des rappels, pour les messageries qui montrent un moyen de se retirer.
 */
export function optionsDuMail(m: Mail & { a: string }, expediteur: string, base: string): OptionsDuMail {
  return {
    from: { name: 'Popote', address: expediteur },
    to: m.a,
    subject: m.sujet,
    text: m.texte,
    html: m.html,
    headers: { 'List-Unsubscribe': `<${lien(base, '/rappels')}>` },
  }
}
