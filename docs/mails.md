# Les e-mails

## Ce qui part aujourd'hui : rien

| Chemin | État |
|---|---|
| **Invitation** | **Aucun mail, exprès** (décision du 19/10/2026). La fonction `invite` rend le **lien** `/invite/<jeton>` — trente jours, usage unique —, que l'hôte envoie lui-même (SMS, WhatsApp, mail). L'invitée y choisit son mot de passe et son compte naît sur place (`accept-invite`). |
| **Lien magique** (première connexion, mot de passe oublié) | Passe par le SMTP **intégré** de Supabase : **2 mails par heure**, expéditeur `noreply@mail.app.supabase.io`, classé en indésirable une fois sur deux. |

Deux personnes s'en accommodent. Une troisième, non.

## Le réglage à faire : SMTP applicatif

Il couvre **tout** d'un coup — lien magique, réinitialisation, confirmation — là
où Resend ne couvrirait que l'invitation. C'est la seule raison de le préférer.

### 1 · Le mot de passe d'application Gmail

Il ne se génère pas depuis un script : il demande le compte Google.

1. La validation en deux étapes doit être **active** :
   `myaccount.google.com/security` → « Validation en deux étapes ».
   Sans elle, la page suivante n'existe pas.
2. `myaccount.google.com/apppasswords`
3. Nom de l'application : `Supabase batchcooking`.
4. Google affiche **seize caractères en quatre groupes**. Ils ne seront plus
   jamais affichés. Copier sans les espaces.

> Ce n'est **pas** le mot de passe du compte Google, et il ne donne accès qu'à
> l'envoi. Il se révoque depuis la même page, sans toucher au compte.

### 2 · Le réglage, dans le tableau de bord

`supabase.com/dashboard/project/mjlxfffdirlqmmjzhorg` → **Authentication** →
**Emails** → onglet **SMTP Settings** → *Enable Custom SMTP*.

| Champ | Valeur |
|---|---|
| Sender email | l'adresse Gmail elle-même |
| Sender name | `Popote` |
| Host | `smtp.gmail.com` |
| Port | `465` |
| Username | l'adresse Gmail |
| Password | les seize caractères, **sans espaces** |
| Minimum interval between emails | `60` secondes |

Puis, juste en dessous, **Rate limits** → `Emails per hour` : le passer de **2**
à `30`. C'est ce plafond-là qui bloque aujourd'hui, pas le SMTP.

### 3 · Vérifier

Se déconnecter, « Première fois, ou mot de passe oublié ? », entrer l'adresse.
Le mail doit arriver en moins d'une minute, expédié de l'adresse Gmail. S'il
n'arrive pas : Dashboard → **Logs** → **Auth Logs**, l'erreur SMTP y est en
clair (presque toujours un mot de passe recopié avec ses espaces).

Gmail plafonne à **500 envois par jour**. Pour deux personnes, c'est sans objet.

## ⚠️ Ne jamais lancer `supabase config push` sur ce projet

Le projet hébergé porte les bonnes valeurs :

```
site_url                 = https://kamil-bentounes.github.io/batchcooking/
additional_redirect_urls = https://kamil-bentounes.github.io/batchcooking/**
```

`supabase/config.toml` porte celles du développement local
(`http://localhost:5173`), et `config push` **écraserait les premières par les
secondes** — les liens magiques renverraient alors vers une machine locale, et
plus personne ne pourrait se connecter.

`supabase config diff` est en lecture seule et reste sans danger.

## Pourquoi l'invitation n'envoie plus de mail

Elle passait par `inviteUserByEmail` : le mail portait un lien de connexion
Supabase, mort au bout d'**une heure** (`mailer_otp_exp`), consommé par les
antivirus de messagerie qui l'ouvrent avant la personne, et parti par le SMTP
intégré (deux mails par heure, souvent en indésirables). Cinq invitées réelles
n'ont jamais dépassé la création de compte ; le 30 septembre, l'une a ouvert un
mail vieux de huit jours.

Le lien de l'application, lui, vaut trente jours et ne dépend d'aucun mail.
`APP_BASE_URL` reste un secret de la fonction `invite` : il fait le lien qu'elle
rend à l'ancien paquet.
