# AI Nutrition Pipeline — Integration Note

## Overview

Society HomeChef uses a **two-stage hybrid nutrition pipeline** to auto-generate calorie estimates and health scores for every dish a chef publishes. The pipeline prioritizes speed and explainability over raw accuracy, which is the correct trade-off for an MVP where users need instant feedback during dish creation.

---

## Pipeline Architecture

```
                    Chef types dish name + description
                                │
                                ▼
                ┌───────────────────────────────┐
                │   STAGE 1: Heuristic Engine   │
                │   (lib/nutrition.ts)           │
                │                               │
                │   Input: dish name + desc      │
                │   Process:                     │
                │     1. Concatenate text         │
                │     2. Scan against 15 regex   │
                │        rules (see table below) │
                │     3. Accumulate kcal deltas  │
                │     4. Adjust health score     │
                │     5. Collect tags            │
                │     6. Compute confidence      │
                │                               │
                │   Output:                      │
                │     • calories (int)           │
                │     • health_score (0-10)      │
                │     • tags[] (Veg, Keto, etc.) │
                │     • explanation (string)     │
                │     • confidence (low/med/high)│
                └──────────────┬────────────────┘
                               │
                        confidence level?
                       ╱                ╲
                 medium/high             low
                     │                    │
                     ▼                    ▼
              Return result     ┌─────────────────────┐
              immediately       │  STAGE 2: AI Model  │
                                │  (Gemini 2.5 Flash)  │
                                │                     │
                                │  Via server function │
                                │  (TanStack Start)   │
                                │                     │
                                │  Prompt:             │
                                │  "Estimate calories  │
                                │   per serving and    │
                                │   health score for   │
                                │   this Indian home-  │
                                │   cooked dish..."    │
                                │                     │
                                │  Response: JSON      │
                                │  {calories, score,   │
                                │   tags, explanation} │
                                └──────────┬──────────┘
                                           │
                                    Merge AI result
                                    with heuristic tags
                                           │
                                           ▼
                                    Return enriched
                                    result (confidence: high)
```

---

## Stage 1: Heuristic Engine (Detailed)

The heuristic engine starts with a **baseline** of 200 kcal and a health score of 6.0/10, then adjusts based on keyword matches.

### Rule Table

| Category | Keywords | Kcal Added | Score Delta | Tags Added |
|---|---|---|---|---|
| **Proteins (Veg)** | paneer, tofu | +180 | +1.0 | High Protein |
| **Proteins (Non-veg)** | chicken, mutton, fish, prawn, egg, beef, lamb | +220 | +0.5 | High Protein |
| **Legumes** | dal, lentil, chickpea, chana, rajma, sprout | +150 | +1.5 | High Protein, High Fiber |
| **Carbs (Rice)** | rice, biryani, pulao | +250 | -0.3 | — |
| **Carbs (Bread)** | roti, paratha, naan, bread, chapati | +180 | 0.0 | — |
| **Carbs (Processed)** | noodle, pasta, maggi | +280 | -0.8 | — |
| **Vegetables** | salad, spinach, broccoli, cucumber, sabzi, palak, methi | +60 | +2.0 | Low Calorie, High Fiber |
| **Fried** | fried, deep-fried, pakora, samosa, bhaji, puri | +150 | -1.8 | — |
| **Healthy Cooking** | grilled, tandoori, baked, steamed, roasted, boiled | +0 | +1.2 | — |
| **Fats** | ghee, butter, cream, cheese, mayo | +90 | -0.6 | — |
| **Sweets** | sugar, sweet, halwa, gulab, jalebi, kheer, laddu, dessert | +200 | -1.5 | — |
| **Diet: Keto** | keto, low-carb | +0 | +0.5 | Keto |
| **Diet: Vegan** | vegan | +0 | +0.3 | Vegan, Veg |

### Derived Tags
- If **no non-veg keyword** is detected → automatically tags as **Veg**
- If total **kcal < 250** → adds **Low Calorie** tag

### Clamping
- Calories: clamped to `[80, 1200]`, rounded to nearest 10
- Health score: clamped to `[1.0, 10.0]`

### Confidence Scoring
| Matches | Confidence |
|---|---|
| 0 keywords | `low` → triggers AI refinement |
| 1-2 keywords | `medium` → heuristic result used |
| 3+ keywords | `high` → heuristic result used |

### Example Walkthrough

**Input:** "Paneer Paratha" (name), "Stuffed with fresh paneer, lightly pan-fried in ghee" (description)

1. Regex scan detects: `paneer` (+180 kcal, +1.0 score), `paratha` (+180 kcal, +0.0), `ghee` (+90 kcal, -0.6), `fried` (+150 kcal, -1.8)
2. Total kcal: 200 (base) + 180 + 180 + 90 + 150 = **800 kcal**
3. Health score: 6.0 + 1.0 + 0.0 - 0.6 - 1.8 = **4.6/10**
4. Tags: `High Protein`, `Veg` (no non-veg detected)
5. Confidence: `high` (4 matches)
6. Explanation: "Detected: paneer, paratha, ghee, fried. Score adjusted from baseline 6.0 → 4.6."

---

## Stage 2: AI Refinement (Gemini 2.5 Flash)

### When It Triggers
Only when the heuristic engine returns `confidence: "low"` (zero keyword matches). This happens for dishes with:
- Unusual names ("Aunty's Special")
- Non-Indian cuisine ("Sushi Bowl")
- Descriptive names without ingredients ("Today's Surprise")

### Implementation
- Runs as a **TanStack Start server function** (`createServerFn`) to keep the API key server-side
- Calls the Lovable AI Gateway (proxied OpenAI-compatible endpoint)
- Model: `google/gemini-2.5-flash`
- Prompt engineered for **compact JSON output** with explicit schema

### Prompt Template
```
You are a nutrition estimator for an Indian home-cook food platform.
Estimate calories per serving and a health score (0-10) for this dish.
Also return relevant tags from this set: Veg, Vegan, High Protein,
Low Calorie, Keto, High Fiber.

Dish: {name}
Description: {description}

Respond ONLY with compact JSON:
{"calories": <int>, "health_score": <number 0-10>, "tags": [..], "explanation": "<one sentence>"}
```

### Error Handling
- If the API key is missing → log warning, return heuristic result
- If the gateway returns non-200 → log warning, return heuristic result
- If the response isn't valid JSON → return heuristic result
- **The system never fails** — AI is purely additive enhancement

### Result Merging
When AI succeeds, the final result:
- Uses AI's `calories` and `health_score` (presumed more accurate)
- **Merges** AI tags with heuristic tags (union, not replacement)
- Concatenates explanations: `"AI refinement: {ai_explanation}. (Heuristic: {heuristic_explanation})"`
- Sets confidence to `high`

---

## Why This Design?

### Trade-offs Made

| Decision | Alternative | Rationale |
|---|---|---|
| Heuristic-first | AI-first | Heuristic is instant (0ms vs ~2s), deterministic, and explainable. For a demo, speed and transparency matter more than precision. |
| Text-only input | Image analysis (Vision API) | Vision analysis adds 3-5s latency and requires image upload before nutrition estimate. Text analysis gives instant preview as the chef types. |
| Keyword regex | NLP entity extraction | Regex is ~15 lines, zero dependencies, 100% debuggable. NLP is overkill for known Indian food vocabulary. |
| Per-serving estimate | Per-100g nutrient breakdown | Simpler mental model for end users. "320 kcal per plate" is more actionable than macronutrient splits. |

### Future Improvements (With More Time)
1. **Image-based analysis** — Send the dish photo to Gemini Pro Vision to extract visible ingredients, cross-reference with the heuristic tags for higher confidence
2. **IFCT database** — Map matched ingredients to the Indian Food Composition Tables (NIN Hyderabad) for medically accurate nutrient profiles
3. **User feedback loop** — Let residents flag "calorie estimate seems off" → feed corrections back into heuristic weights
4. **Ingredient parser** — Extract quantities ("200g paneer", "2 tbsp ghee") for weight-based calorie calculation instead of keyword-only presence detection
5. **Multi-language support** — Expand regex rules to match Hindi/regional terms (e.g., "daal" → dal, "aloo" → potato)

---

## File Map

| File | Purpose |
|---|---|
| `src/lib/nutrition.ts` | Heuristic engine + AI orchestrator (`estimateNutrition()`) |
| `src/server/ai-nutrition.functions.ts` | TanStack Start server function for Gemini API call |
| `src/routes/chef.tsx` | Chef form invokes `heuristicNutrition()` live and `estimateNutrition()` on "Refine with AI" |
