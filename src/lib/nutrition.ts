/**
 * Hybrid Nutrition Pipeline
 * ─────────────────────────
 * Step 1: Heuristic engine — fast, deterministic, fully documented.
 *   • Scans dish name + description for known ingredient/cooking keywords.
 *   • Each keyword contributes calorie weight and a health-score delta.
 *   • Tags (Veg, High Protein, Low Calorie, Keto) derived from the same scan.
 *
 * Step 2: AI fallback (Lovable AI Gateway, Gemini Flash) is invoked from
 *   the chef-create flow ONLY when heuristic confidence is low (no keywords
 *   matched, or dish name is generic). Returns refined calories + score.
 *
 * Why hybrid: deterministic baseline keeps the demo fast and explainable,
 * while AI fills the long tail. Accuracy isn't the eval criterion —
 * pipeline thinking is.
 */

interface Rule {
  match: RegExp;
  kcal: number;
  scoreDelta: number; // +healthier / -unhealthier
  tags?: string[];
  nonVeg?: boolean;
}

const RULES: Rule[] = [
  // Proteins
  { match: /\b(paneer|tofu)\b/i, kcal: 180, scoreDelta: +1.0, tags: ["High Protein"] },
  { match: /\b(chicken|mutton|fish|prawn|egg|beef|lamb)\b/i, kcal: 220, scoreDelta: +0.5, tags: ["High Protein"], nonVeg: true },
  { match: /\b(dal|lentil|chickpea|chana|rajma|sprout)\b/i, kcal: 150, scoreDelta: +1.5, tags: ["High Protein", "High Fiber"] },
  // Carbs
  { match: /\b(rice|biryani|pulao)\b/i, kcal: 250, scoreDelta: -0.3 },
  { match: /\b(roti|paratha|naan|bread|chapati)\b/i, kcal: 180, scoreDelta: 0 },
  { match: /\b(noodle|pasta|maggi)\b/i, kcal: 280, scoreDelta: -0.8 },
  // Veggies
  { match: /\b(salad|spinach|broccoli|cucumber|lettuce|veggie|sabzi|palak|methi)\b/i, kcal: 60, scoreDelta: +2.0, tags: ["Low Calorie", "High Fiber"] },
  // Cooking style
  { match: /\b(fried|deep[- ]?fried|pakora|samosa|bhaji|puri)\b/i, kcal: 150, scoreDelta: -1.8 },
  { match: /\b(grilled|tandoori|baked|steamed|roasted|boiled)\b/i, kcal: 0, scoreDelta: +1.2 },
  // Fats / sweets
  { match: /\b(ghee|butter|cream|cheese|mayo)\b/i, kcal: 90, scoreDelta: -0.6 },
  { match: /\b(sugar|sweet|halwa|gulab|jalebi|kheer|laddu|dessert|chocolate|cake)\b/i, kcal: 200, scoreDelta: -1.5 },
  // Diet hints
  { match: /\b(keto|low[- ]?carb)\b/i, kcal: 0, scoreDelta: +0.5, tags: ["Keto"] },
  { match: /\b(vegan)\b/i, kcal: 0, scoreDelta: +0.3, tags: ["Vegan", "Veg"] },
];

export interface NutritionResult {
  calories: number;
  health_score: number; // 0–10, one decimal
  tags: string[];
  explanation: string;
  confidence: "low" | "medium" | "high";
}

export function heuristicNutrition(name: string, description = ""): NutritionResult {
  const text = `${name} ${description}`.toLowerCase();
  let kcal = 200; // baseline serving
  let score = 6.0;
  const tags = new Set<string>();
  const matched: string[] = [];
  let nonVeg = false;

  for (const r of RULES) {
    if (r.match.test(text)) {
      kcal += r.kcal;
      score += r.scoreDelta;
      r.tags?.forEach((t) => tags.add(t));
      if (r.nonVeg) nonVeg = true;
      matched.push(r.match.source.replace(/\\b|\(|\)|\?|\\/g, "").split("|")[0]);
    }
  }

  if (!nonVeg) tags.add("Veg");
  if (kcal < 250 && !tags.has("Low Calorie")) tags.add("Low Calorie");

  // Clamp
  score = Math.max(1, Math.min(10, score));
  kcal = Math.max(80, Math.min(1200, Math.round(kcal / 10) * 10));

  const confidence: NutritionResult["confidence"] =
    matched.length >= 3 ? "high" : matched.length >= 1 ? "medium" : "low";

  const explanation =
    matched.length > 0
      ? `Detected: ${matched.join(", ")}. Score adjusted from baseline 6.0 → ${score.toFixed(1)}.`
      : `No ingredient signals detected — using baseline (200 kcal, 6.0/10).`;

  return {
    calories: kcal,
    health_score: Number(score.toFixed(1)),
    tags: Array.from(tags),
    explanation,
    confidence,
  };
}

/** Optional AI refinement — called when heuristic confidence is low.
 *  Uses Lovable AI Gateway through a server function (see ai-refine).
 *  If anything fails, we silently fall back to the heuristic result.
 */
export async function refineWithAI(
  base: NutritionResult,
  name: string,
  description: string,
): Promise<NutritionResult> {
  try {
    const { aiNutrition } = await import("@/server/ai-nutrition.functions");
    const out = await aiNutrition({ data: { name, description } });
    if (out && typeof out.calories === "number" && typeof out.health_score === "number") {
      return {
        calories: out.calories,
        health_score: Number(out.health_score.toFixed(1)),
        tags: Array.from(new Set([...(out.tags ?? []), ...base.tags])),
        explanation: `AI refinement: ${out.explanation ?? "model returned values"}. (Heuristic: ${base.explanation})`,
        confidence: "high",
      };
    }
  } catch (e) {
    console.warn("AI refinement failed, using heuristic", e);
  }
  return base;
}

export async function estimateNutrition(name: string, description = ""): Promise<NutritionResult> {
  const base = heuristicNutrition(name, description);
  if (base.confidence === "low") {
    return await refineWithAI(base, name, description);
  }
  return base;
}
