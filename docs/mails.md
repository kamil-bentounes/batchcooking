# Les e-mails

## Ce qui part aujourd'hui : rien

| Chemin | État |
|---|---|
| **Invitation** | `RESEND_API_KEY` n'est pas posée. La fonction `invite` ne tente aucun envoi et rend le **lien**, à transmettre soi-même. C'est le chemin qui marche. |
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
| Sender name | `Batch cooking` |
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

## Si un jour l'invitation doit partir toute seule

`RESEND_API_KEY` et `APP_BASE_URL` en secrets de fonction, et
`supabase/functions/invite/index.ts` fait le reste — le code est déjà écrit.
Ce n'est pas nécessaire tant qu'on transmet le lien à la main.
