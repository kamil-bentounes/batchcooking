---
id: donnees-et-vie-privee
titre: Tes données et ta vie privée
ecrans: [/reglages]
questions:
  - Thauba voit-elle mon revenu ?
  - Que voit l’intelligence artificielle de mes données ?
  - L’IA voit-elle mes revenus ?
  - Comment exporter mes données ?
  - Comment supprimer mon compte ?
sources:
  - src/pages/Settings.tsx
  - src/pages/Profil.tsx
  - src/pages/BudgetReglages.tsx
  - src/pages/AccepteAmi.tsx
  - src/pages/Dictee.tsx
  - src/lib/photo.ts
  - supabase/functions/frigo/index.ts
  - supabase/functions/ticket/index.ts
  - supabase/functions/etiquette/index.ts
  - supabase/functions/charges/index.ts
  - supabase/functions/revue-charges/index.ts
  - supabase/functions/inventer/index.ts
  - supabase/functions/importer/index.ts
  - supabase/functions/_shared/llm.ts
  - supabase/functions/aide/index.ts
  - supabase/migrations/0118_aide_signalement.sql
  - supabase/migrations/0005_policies.sql
  - supabase/migrations/0035_amis.sql
  - supabase/migrations/0037_cuisiner_ensemble.sql
  - supabase/migrations/0038_convive_frontiere.sql
  - supabase/migrations/0043_amitie_pas_transitive.sql
  - supabase/migrations/0049_budget_fondations.sql
  - supabase/migrations/0051_budget_socle_corrige.sql
  - supabase/migrations/0097_budget_tables.sql
  - supabase/migrations/0112_budget_depart.sql
verifie_sur: e4c18ef
---
## Ce que le foyer voit de l’autre

Dans le foyer, tout se partage, c’est voulu. **Le revenu de chacun est visible des deux** (« Réglages du budget » liste le net de chacun). Les objectifs nutritionnels, les charges (même celles marquées perso), les comptes, les courses et le stock aussi. Chacun ne modifie que son propre profil, son propre revenu et ses propres objectifs.

Un **foyer ami** voit les prénoms et les recettes marquées « partagée ». S’il a rejoint une de tes sessions de cuisine, il voit aussi cette session tant qu’elle est prête, en cuisine ou au dressage : étapes, appareils et recettes de l’hôte, même non partagées. Rien d’autre : ni budget, ni objectifs, ni courses.

## Ce que voient les modèles de langage

Ces appels partent vers un service d’IA extérieur. Voici ce qui part :

- **photo du frigo** : la photo (réduite avant l’envoi, comme le ticket et l’étiquette) et le lieu ;
- **ticket** : la photo et l’enseigne si tu l’as choisie ; **étiquette** : jusqu’à trois photos ;
- **dictée de charges** : le texte, avec la liste type des charges (la voix est transcrite par ton clavier : aucun son n’est envoyé) ;
- **relecture des charges** : libellés, montants, rythmes, commun ou perso, comptes (nom écrit par toi), enveloppes, date de début ; ni revenus, ni parts, ni prénoms ;
- **recette inventée** : ton envie (300 caractères), les aliments du stock, des limites chiffrées ; jamais de prénom, de poids ni d’objectif ;
- **import de recette** : le texte collé et tes précisions ;
- **aide « Demande à Popote »** : ta question, la précédente avec sa réponse, et quelques pages du manuel de l’appli ; jamais tes chiffres.

Aucun appel à un modèle ne lit les revenus ou les prénoms. Rien n’est enregistré sans que tu valides à l’écran. Aucun code ne garde les photos ; ce que le service extérieur en fait, le code ne le dit pas.

## Exporter

Réglages, « Tes données », « Exporter mes données » : un fichier « mes-donnees.json » avec **tout ce que le foyer a enregistré**, y compris les données de l’autre (son revenu, par exemple) et les réponses de l’aide que tu as signalées comme fausses.

## Supprimer

« Supprimer mon compte » demande « Supprimer ton compte et tes données ? C’est définitif. » Partent ton profil, ton revenu, tes objectifs et tes comptes perso. Tes charges à toi seul s’arrêtent ou disparaissent. Le foyer reste pour l’autre : les mois ouverts se repartagent entre ceux qui restent, les mois clôturés ne bougent pas. Il n’est supprimé que s’il ne reste personne.
