# Doutes : foyer et compte (domaine de cet agent), relus par un vérificateur adverse sur 15b4fbf

Une ligne par doute : page | phrase | ce que je n’ai pas pu confirmer.

Doutes qui restent (le code ne les tranche pas) :

- foyer-creer | « tant qu’un foyer existe, un nouveau compte sans lien voit « Il te faut une invitation » » | Le code ferme la création de foyer dès qu’un foyer existe (migration 0070, rejoué en local) ; l’état réel du réglage en prod n’est pas connu (interdit d’y regarder). La page ne l’affirme plus pour la prod.
- compte-connexion | « Première connexion » | Le code envoie un lien pour toute adresse saisie ; si le projet hébergé accepte ou non l’inscription d’une adresse inconnue par ce chemin, la config du dépôt est celle du local (enable_signup = true) : non confirmé.
- compte-connexion | durée de la session | Non écrit : jwt_expiry = 3600 en local, mais la config hébergée et la durée des jetons de renouvellement ne sont pas dans le dépôt.
- compte-connexion, foyer-inviter | l’envoi réel des mails « Recevoir le lien » / « Réinitialiser mon mot de passe » | Non vérifié que l’envoi de la prod est configuré (un commentaire du code parle d’un serveur limité à deux mails par heure). « Valable une heure » est ce que dit l’écran ; la valeur hébergée n’est pas dans le dépôt.
- installation-hors-ligne | installation par le menu du navigateur | Le nom exact du menu dépend du navigateur : aucun libellé cité.
- installation-hors-ligne | « une requête automatique chaque matin » | Le workflow .github/workflows/reveil.yml existe (cron 06:17 UTC) ; non vérifié qu’il tourne. La page le dit.
- donnees-et-vie-privee | fournisseur réel des modèles d’IA en prod | Défauts du code : Google (vision) et OpenAI (texte), mais ils viennent de variables d’environnement du serveur. Conservation des données chez eux : inconnue.
- donnees-et-vie-privee | « Je n’ai pas trouvé de code qui garde les photos » | Aucune écriture de fichier ni de stockage dans les fonctions et l’appli ; la base de prod n’a pas été inspectée.
- donnees-et-vie-privee | « Tes charges à toi seul s’arrêtent ou disparaissent » | Lu dans delete_my_account (0112) : charges dont il est le seul participant ; le détail (supprimée si sans histoire, sinon archivée) n’est pas rejoué. Les recettes créées par la personne restent au foyer (non écrit).
- limites | « Je n’ai pas trouvé de connexion avec une banque » | Rien dans le code ne crée de saisie « banque » ; le schéma (colonne source) prévoit pourtant cette valeur : non écrit dans la page.
- foyer-inviter | nombre de membres d’un foyer | Rien dans le code ne limite à deux ; rien d’écrit sur un maximum.
- reglages | « restants ce mois-ci » | Calculé comme plafond moins la somme des coûts enregistrés ; aucun code ne les enregistre (cherché dans supabase/functions, src, migrations, worker/src) : le montant reste donc au plafond. À confirmer si un script hors dépôt écrit ces coûts.
- limites, donnees-et-vie-privee | quota de l’assistant « Demande à Popote » (300 par mois) | Hors périmètre demandé (fonctionnalité d’aide) : non cité.
- donnees-et-vie-privee | page périmée tant que supabase/functions/_shared/llm.ts porte une modification non commitée (reasoning_effort, sans effet sur ce que les modèles reçoivent) : à re-dater après le commit.

Doutes tranchés par le vérificateur :

- « Rien n’est mis en attente hors ligne » : confirmé (networkMode 'always', aucun stockage local de données) ; le cache du service worker ne garde que le code, les icônes et les photos du budget (vérifié sur une construction locale).
- Exemple « arrive le 15 novembre, revenu posé le 2 décembre » : rejoué (tests/budget-arrivees.test.ts, vert) : il vaut dès novembre.
- Plafond en euros et quotas : confirmés (aucun code ne lit le plafond ; quotas 30/30/40/20/30/10/40).
