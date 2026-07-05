import type { Tier } from "./rules.js";

const SYSTEM_PROMPT = `You are a prompt complexity classifier. Given a user message, classify it as one of:
- "simple": factual questions, definitions, translations, simple fixes, lookups
- "standard": coding tasks, explanations, moderate analysis, summaries
- "complex": architecture design, deep research, multi-step reasoning, comprehensive analysis

Respond with ONLY the word: simple, standard, or complex`;

export async function classifyWithHaiku(prompt: string, apiKey: string): Promise<Tier> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": apiKey.replace(/^Bearer\s+/i, ""),
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt.slice(0, 500) }],
      }),
    });

    if (!response.ok) return "standard";

    const data = await response.json() as { content: Array<{ text: string }> };
    const answer = data.content[0]?.text?.trim().toLowerCase() ?? "";

    if (answer === "simple") return "simple";
    if (answer === "complex") return "complex";
    return "standard";
  } catch {
    return "standard";
  }
}
