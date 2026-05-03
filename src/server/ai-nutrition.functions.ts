import { createServerFn } from "@tanstack/react-start";

interface AIResp {
  calories: number;
  health_score: number;
  tags: string[];
  explanation: string;
}

export const aiNutrition = createServerFn({ method: "POST" })
  .inputValidator((d: { name: string; description?: string }) => d)
  .handler(async ({ data }): Promise<AIResp | null> => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      console.warn("[ai-nutrition] LOVABLE_API_KEY not set");
      return null;
    }

    const prompt = `You are a nutrition estimator for an Indian home-cook food platform.
Estimate calories per serving and a health score (0-10) for this dish.
Also return relevant tags from this set: Veg, Vegan, High Protein, Low Calorie, Keto, High Fiber.

Dish: ${data.name}
Description: ${data.description ?? "(none)"}

Respond ONLY with compact JSON: {"calories": <int>, "health_score": <number 0-10>, "tags": [..], "explanation": "<one sentence>"}`;

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!r.ok) {
        console.warn("[ai-nutrition] gateway non-ok", r.status);
        return null;
      }
      const j = await r.json();
      const text: string = j.choices?.[0]?.message?.content ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]);
      return {
        calories: Number(parsed.calories),
        health_score: Number(parsed.health_score),
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        explanation: String(parsed.explanation ?? ""),
      };
    } catch (e) {
      console.warn("[ai-nutrition] error", e);
      return null;
    }
  });
