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

## Quel fournisseur — mesuré, pas supposé

`npm run banc` : 3 modèles × 2 prompts × 5 essais, dix critères vérifiables.
La **qualité** est notée sur les appels qui ont répondu, la **disponibilité** est
comptée à part — sans quoi un 429 provoqué par le banc lui-même se lit comme une
faute du modèle.

| Modèle | Qualité | Dispo | Latence |
|---|:-:|:-:|:-:|
| **gemini-3.5-flash-lite** | **100 %** | **5/5** | 4,7 s |
| groq · qwen3.8-27b | 100 % | 2/5 | 0,8 s |
| groq · gpt-oss-120b | 95 % | 2/5 | 3,4 s |
| groq · gpt-oss-20b | — | 0/5 | ne tient pas le schéma strict |

`gemini-3.5-flash-lite` est le seul **parfait ET toujours disponible**. Les deux
modèles Groq sont excellents quand ils répondent, mais le palier gratuit les
coupe (429) et `gpt-oss-120b` rend par intermittence un `json_validate_failed`
avec une génération vide.

## La configuration en place

| Usage | Principal | Repli |
|---|---|---|
| **Génération** | `gemini-3.5-flash-lite` | Groq `gpt-oss-120b` — *autre fournisseur*, donc vrai repli |
| **Vision** | `gemini-flash-lite-latest` | `gemini-3.6-flash`, puis `gemini-3.1-flash-lite` |

⚠️ **Le quota gratuit de Gemini est de 20 requêtes par jour ET PAR MODÈLE**
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, relevé dans l'erreur 429).
C'est pour cela que la génération et la vision n'utilisent **pas les mêmes
modèles** : elles ne se partagent pas le même budget. Face au besoin réel —
10 générations et ~30 photos par mois — c'est cent fois trop large.

Aucun modèle de Groq n'est multimodal : le repli de la vision ne peut pas être
Groq, il est dans d'autres modèles Gemini.

```bash
npx supabase secrets set LLM_API_KEY=... LLM_BASE_URL=... LLM_MODEL=...
npx supabase secrets set LLM_FALLBACK_API_KEY=... LLM_FALLBACK_BASE_URL=... LLM_FALLBACK_MODEL=...
npx supabase secrets set LLM_VISION_API_KEY=... LLM_VISION_MODELS=a,b,c
```

⚠️ **`llama-3.3-70b` n'est plus au catalogue de Groq.** Une liste de modèles se
périme : `curl https://api.groq.com/openai/v1/models` avant de choisir.

⚠️ **Un abonnement ChatGPT Plus / Claude Pro ne donne AUCUN accès à l'API.**

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
