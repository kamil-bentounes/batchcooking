/**
 * Les rappels par mail : le branchement seulement. La logique (le secret, le JWT, la limite des essais, l'ordre
 * réserver-envoyer-libérer, les codes de réponse) vit dans `_shared/rappels/service.ts`, sans Deno, et se teste avec
 * Vitest.
 *
 * Ici : le client de la base (clé de service), le transport SMTP Gmail en TLS implicite (port 465, mot de passe
 * d'application, UN `pool` par appel, fermé à la fin), l'horloge, le journal et l'environnement.
 * Secrets de la fonction : `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `APP_BASE_URL`, `RAPPELS_SECRET`.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import { sert } from '../_shared/rappels/service.ts'
import type { ClientAdmin, Transport } from '../_shared/rappels/service.ts'

Deno.serve((req) => sert(req, {
  env: (nom) => Deno.env.get(nom),
  creeClient: (url, cle) => createClient(url, cle) as unknown as ClientAdmin,
  creeTransport: (user, pass): Transport => {
    const smtp = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      pool: true, maxConnections: 1, maxMessages: 100,
      auth: { user, pass },
      connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
    })
    return {
      envoie: (options) => smtp.sendMail(options),
      verifie: () => smtp.verify(),
      ferme: () => smtp.close(),
    }
  },
  maintenant: () => new Date(),
  /* Ni adresse, ni secret, ni contenu : seulement ce que `service.ts` y met. */
  journal: (ligne) => console.log(ligne),
}))
