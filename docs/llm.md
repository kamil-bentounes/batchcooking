# Le modèle

Un seul appel LLM est déclenché volontairement par l'utilisateur : **« Envie
spéciale »**, plafonné à **10 générations par foyer et par mois** (D11). La
vision (photo du frigo) viendra s'y ajouter. L'ingestion, elle, n'en a pas
besoin : le déterministe couvre 100 % des étapes retenues.

## Ce que ça coûte vraiment

| Usage | Volume / mois | Jetons | Coût (gpt-5-mini) |
|---|---|---|---|
| « Envie spéciale » | 10 générations | ~14 000 | ~0,02 € |
| Photo du frigo | ~10 photos | ~18 000 | ~0,01 € |
| Raffinement d'ingestion | 0 | 0 | 0 € |

**Quelques centimes par mois** — et zéro en pratique, le palier gratuit de Groq
couvrant cent fois ce volume. D'où la conséquence qui compte : **rien à louer**.
Un VPS avec GPU coûte 50 à 200 €/mois — trois mille fois le besoin. La fonction
`inventer` tourne déjà sur Supabase et appelle une API hébergée.

## Quel fournisseur

Le code parle le protocole **OpenAI**. Trois variables suffisent à en changer :

```bash
npx supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=...
```

Le critère est le prix : **aucune raison de payer** pour dix générations par mois.

| Fournisseur | `LLM_BASE_URL` | `LLM_MODEL` | Gratuit | Carte ? |
|---|---|---|---|---|
| **Groq** ← en place | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | oui, sans fin | non |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | `gemini-2.5-flash` | oui, sans fin | non |
| Anthropic | `https://api.anthropic.com/v1/` | `claude-haiku-4-5-20251001` | ~5 $ offerts | vérification |
| Mistral | `https://api.mistral.ai/v1` | `mistral-small-latest` | oui (Experiment) | non |
| OpenAI | `https://api.openai.com/v1` | `gpt-5-mini` | non | oui |

**Groq est configuré.** Gratuit sans échéance, sans carte, mille requêtes par
jour contre dix par mois de besoin. Mesuré en production : une recette cohérente
en **6,8 s**, JSON valide du premier coup, appareils et charges correctement
étiquetés.

⚠️ **`llama-3.3-70b` n'est plus au catalogue de Groq** (relevé le 18/09/2026).
Les modèles de conversation disponibles sont `openai/gpt-oss-120b`,
`openai/gpt-oss-20b`, `qwen/qwen3.8-27b` et `groq/compound`. Une liste de
modèles se périme : `curl https://api.groq.com/openai/v1/models` avant de choisir.

Changer de fournisseur, c'est trois variables et trente secondes :

```bash
npx supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=...
```

Tous ceux du tableau acceptent `response_format: {"type":"json_object"}`, que la
fonction envoie. C'est la seule exigence du code.

⚠️ **Un abonnement ChatGPT Plus / Claude Pro ne donne AUCUN accès à l'API.**
Ce sont deux facturations séparées. Payer l'une ne paie pas l'autre.

## Ce que le modèle voit — et ne voit pas

Le prompt est construit **côté serveur** (`supabase/functions/inventer/`), pas
par le client. Non par précaution juridique — c'est un usage domestique, la
question ne se pose pas — mais parce qu'un prompt construit par le client est
un prompt que n'importe quel client peut réécrire.

| Reçoit | Ne reçoit jamais |
|---|---|
| Des bornes chiffrées : « au moins 30 g de protéines, au plus 620 kcal » | Un prénom, un poids, un objectif nominatif |
| Les libellés des placards : « skyr 400 g, poulet 300 g » | L'identifiant du foyer ou de la personne |
| L'envie exprimée, tronquée à 300 caractères | L'historique des repas |

## Un point à ne pas confondre

**Un abonnement ChatGPT Plus ou Pro ne donne AUCUN accès à l'API.** Ce sont deux
facturations séparées — `chatgpt.com` d'un côté, `platform.openai.com` de
l'autre. Payer l'un ne paie pas l'autre.

## Sans clé

`inventer` répond **503** avec « Aucun modèle configuré » et l'écran l'affiche.
Le reste de l'app — tout le cycle — fonctionne sans aucun modèle.
