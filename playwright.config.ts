/**
 * Le test de FUMÉE en navigateur.
 *
 * Il existe pour une raison précise et vérifiée : 525 tests unitaires et
 * d'intégration passaient pendant que trois écrans n'avaient jamais été rendus
 * une seule fois. `tsc` dit qu'un composant compile ; il ne dit pas qu'il
 * s'affiche, ni qu'un `Number(null)` au premier rendu ne fait pas une page
 * blanche.
 *
 * On ne teste donc PAS le pixel — une comparaison d'images casserait à chaque
 * changement d'espacement et finirait ignorée. On teste que chaque écran
 * s'ouvre, qu'il montre ce qu'il promet, et qu'aucune erreur n'est tombée dans
 * la console.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Un seul worker : les tests partagent un foyer amorcé en base.
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // Le format de référence : cette application se tient d'une main, debout,
    // dans une cuisine. Un rendu « desktop » ne dirait rien d'utile.
    ...devices['Pixel 7'],
    /* Le français, et l'heure de Paris. Sans ça, les widgets natifs du
       navigateur — `input[type=month]` en tête — s'affichent en anglais dans
       les captures : on relit « January 2026 » sur un écran français et on ne
       peut plus juger de ce que la personne verra. */
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    /* ⚠️ `locale` ne porte QUE sur ce que le JavaScript rend : les widgets
       natifs de Chromium — le sélecteur d'`input[type=month]` — suivent la
       langue de l'interface du navigateur, et `--lang=fr-FR` ne la change pas
       dans ce binaire headless. Une capture montrant « January 2026 » sous un
       « Elle court depuis » français est donc un artefact du banc, pas un
       défaut de l'écran : sur un téléphone français, le même champ dit
       « janvier 2026 ». Ne pas partir en chasse une deuxième fois. */
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    // ⚠️ `--mode development`, et ce n'est pas un détail : `vite build` prend le
    //    mode « production » par défaut, donc `.env.production`, donc la BASE DE
    //    PRODUCTION. Le test amorce son foyer en local ; sans ce drapeau, il se
    //    connecterait à une base où ce foyer n'existe pas, et l'échec dirait
    //    « e-mail ou mot de passe incorrect » — ce qui n'aurait rien appris.
    command: 'npm run build -- --mode development && npm run preview -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
