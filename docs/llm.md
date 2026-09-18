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

| Fournisseur | `LLM_BASE_URL` | Gratuit | Carte ? | Limite |
|---|---|---|---|---|
| **Groq** | `https://api.groq.com/openai/v1` | oui, sans fin | non | 1 000 req/jour |
| **Anthropic** | `https://api.anthropic.com/v1/` | ~5 $ offerts | oui (vérification) | le crédit |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | oui, sans fin | non | généreuse |
| Mistral | `https://api.mistral.ai/v1` | oui (Experiment) | non | ~1 req/min |
| OpenAI | `https://api.openai.com/v1` | non | oui | — |

**Groq d'abord.** Gratuit sans échéance, sans carte, cent fois notre besoin, et
le protocole est déjà le bon. Modèle : `llama-3.3-70b-versatile`.

**Anthropic si la qualité déçoit.** ~5 $ offerts à l'ouverture d'un compte sur
`console.anthropic.com` (une carte est demandée pour vérification, pas débitée).
À dix générations par mois, ces 5 $ tiennent des années. La couche de
compatibilité OpenAI suffit ici — la doc d'Anthropic la réserve aux tests, ce
qui vaut pour du cache de prompt ou des sorties structurées avancées, pas pour
un appel JSON par semaine.

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
