#!/bin/bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
H=(-H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" -H "Accept-Language: fr-FR,fr;q=0.9,en;q=0.8" -H "Sec-Fetch-Mode: navigate" -H "Upgrade-Insecure-Requests: 1")
export UA
test_url() {
  local label="$1" url="$2"
  local f=/tmp/t_$$_$RANDOM.html
  local code; code=$(curl -sSL -m 25 -A "$UA" -H "Accept-Language: fr-FR,fr;q=0.9" -o "$f" -w "%{http_code}" "$url" 2>/dev/null)
  local typ="AUCUN" nut="-" ing="-" ins="-"
  local flat; flat=$(tr -d ' \n' < "$f" 2>/dev/null)
  echo "$flat" | grep -qiE '"@type":"?\[?"?Recipe' && typ="JSON-LD"
  [ "$typ" = "AUCUN" ] && grep -qiE 'itemtype="https?://schema.org/Recipe"' "$f" 2>/dev/null && typ="MICRODATA"
  echo "$flat" | grep -qiE '"nutrition"' && nut="nutrition"
  echo "$flat" | grep -qiE '"recipeIngredient"' && ing="ingredients"
  echo "$flat" | grep -qiE '"recipeInstructions"' && ins="etapes"
  local sz; sz=$(wc -c < "$f" 2>/dev/null)
  echo "$label|$code|$typ|$ing|$ins|$nut|${sz}o|$url"
  rm -f "$f"
}
export -f test_url
cat > urls.txt <<'LIST'
Marmiton|https://www.marmiton.org/recettes/recette_salade-cesar-cremeuse_18999.aspx
750g|https://www.750g.com/tarte-aux-pommes-r11048.htm
CuisineAZ|https://www.cuisineaz.com/recettes/cookies-a-congeler-pour-les-gouters-de-la-rentree-125357.aspx
CuisineActuelle|https://www.cuisineactuelle.fr/recettes/tarte-tomates-courgettes-300698
JournalDesFemmes|https://cuisine.journaldesfemmes.fr/recette/309957-poulet-basquaise
PtitChef|https://www.ptitchef.com/recettes/plat/poulet-basquaise-fid-1541545
ChefSimon|https://chefsimon.com/recettes/poulet-basquaise
AcademieDuGout|https://www.academiedugout.fr/recettes/tarte-aux-figues_10099_2
Allrecipes|https://www.allrecipes.com/recipe/223042/chicken-parmesan/
BBCGoodFood|https://www.bbcgoodfood.com/recipes/classic-lasagne
EatingWell|https://www.eatingwell.com/recipe/250790/chicken-shawarma/
SeriousEats|https://www.seriouseats.com/classic-panzanella-salad-recipe
SimplyRecipes|https://www.simplyrecipes.com/recipes/homemade_pizza/
Skinnytaste|https://www.skinnytaste.com/air-fryer-chicken-breast/
BudgetBytes|https://www.budgetbytes.com/garlic-herb-baked-chicken-breast/
Foodspring|https://www.foodspring.fr/magazine/recettes-musculation-prise-de-masse
Fitadium|https://www.fitadium.com/conseils/nutrition/recettes/
EspaceMusculation|https://www.espace-musculation.com/recettes/
RecetteProteine|https://recetteproteine.fr/desserts/
GoRecettes|https://gorecettes.com/batch-cooking-healthy-recette/
MonCoachGourmand|https://moncoachgourmand.com/blog/batch-cooking-recettes
SabNPepper|https://www.sabnpepper.com/batch-cooking-healthy-cest-possible/
HelloFresh|https://www.hellofresh.fr/recipes/recettes-batch-cooking
MoveYourFit|https://www.moveyourfit.com/2024/07/09/batch-cooking-healthy-des-recettes-pour-la-semaine/
Fitnessmith|https://www.fitnessmith.fr/10-recettes-reussir-seche-musculation/
Isostar|https://www.isostar.fr/blog/10-recettes-delicieuses-et-riches-en-proteines-pour-la-prise-de-masse-musculaire/
LigneEtProteines|https://www.ligne-et-proteines.com/blog/gateaux-proteines-maison-nos-5-recettes-healthy-preferees-n44
Fitadium-recette|https://www.fitadium.com/conseils/nutrition/recettes/
Cookomix|https://www.cookomix.com/recettes/poulet-basquaise-thermomix/
Jow|https://jow.fr/recipes
LIST
cat urls.txt | xargs -d '\n' -P 10 -I{} bash -c 'IFS="|" read -r l u <<< "{}"; test_url "$l" "$u"'
