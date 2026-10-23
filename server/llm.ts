import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

// ---------------------------------------------------------------------------
// SERVER-SIDE LLM LAYER. Runs inside the Vite dev/preview process only.
// The API key never reaches the browser. The model is used for three things:
//   1. interpreting stakeholder language into structured intentions,
//   2. interpreting reviewer feedback into revision adjustments,
//   3. writing professional narrative constrained to engine-computed facts.
// It is never asked to assert plant attributes; those come from the database.
// ---------------------------------------------------------------------------

export interface LlmEnv {
  ANTHROPIC_API_KEY: string;
  PI_LLM_MODEL: string;
}

const IntentionKind = z.enum([
  "flower_colour",
  "flower_abundance",
  "welcoming_character",
  "pollinator_support",
  "seasonal_continuity",
  "native_preference",
  "low_water",
  "low_replacement",
  "low_maintenance",
  "winter_interest",
  "shade_tolerance",
  "safety_or_toxicity",
  "other",
]);

export const IntentionsSchema = z.object({
  intentions: z.array(
    z.object({
      stakeholderId: z.string(),
      kind: IntentionKind,
      value: z.string().nullable(),
      strength: z.enum(["must", "prefer"]),
      statement: z.string(),
      evidence: z.string(),
      confidence: z.number(),
    }),
  ),
});

export const AdjustmentsSchema = z.object({
  adjustments: z.array(
    z.object({
      kind: z.enum(["reduce_water", "keep_summer_colour", "more_summer_colour", "more_native", "less_maintenance", "more_winter_interest", "remove_plant", "avoid_toxic", "more_colour", "unknown"]),
      plantId: z.string().nullable(),
      evidence: z.string(),
    }),
  ),
});

const SYSTEM = `You are the language-interpretation layer of "Planting Intelligence", a research prototype that negotiates planting design goals between stakeholders.
Rules you must follow:
- You interpret natural language; you do not supply plant facts. Plant attributes come from a separate verified database and are checked by code.
- When you write narrative, you may cite only the plant ids (P-xx) and principle ids (K-xx) that appear in the facts given to you, using the exact form [P-01] or [K-05]. Never introduce other species, attributes, or sources.
- Distinguish verified facts (from the facts given), design judgement, and uncertainty. Say "unknown" rather than guessing.
- Do not manufacture conflict: when the facts show goals can be met together, say so plainly.
- Write in the voice of an experienced planting designer: concise, specific, professional, no marketing tone.`;

function client(env: LlmEnv) {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function llmAvailable(env: LlmEnv) {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export async function interpretIntentions(env: LlmEnv, stakeholders: { id: string; role: string; statement: string }[]) {
  const c = client(env);
  const res = await c.beta.messages.parse({
    model: env.PI_LLM_MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: betaZodOutputFormat(IntentionsSchema), effort: "medium" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `Extract planting intentions from each stakeholder statement. One intention per distinct goal. ` +
          `Use kind from the controlled list; put the colour word in "value" for flower_colour. ` +
          `"strength" is "must" when the statement expresses a hard limit (cannot, never, must), otherwise "prefer". ` +
          `"evidence" is the exact quoted span. "statement" is a one-sentence professional paraphrase.\n\n` +
          stakeholders.map((s) => `[${s.id}] ${s.role}: "${s.statement}"`).join("\n"),
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (!res.parsed_output) throw new Error("Structured output could not be parsed.");
  return res.parsed_output;
}

export async function interpretAdjustments(env: LlmEnv, feedback: string, strategySummary: string, plantList: { id: string; name: string }[]) {
  const c = client(env);
  const res = await c.beta.messages.parse({
    model: env.PI_LLM_MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { format: betaZodOutputFormat(AdjustmentsSchema), effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content:
          `A reviewer commented on a planting strategy. Map the comment to revision operators from the controlled list. ` +
          `Use remove_plant with the plantId only when a listed plant is named. Use "unknown" if nothing applies.\n\n` +
          `Strategy: ${strategySummary}\nPlants in strategy: ${plantList.map((p) => `${p.id} ${p.name}`).join("; ")}\n\nReviewer comment: "${feedback}"`,
      },
    ],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  if (!res.parsed_output) throw new Error("Structured output could not be parsed.");
  return res.parsed_output;
}

export async function narrate(env: LlmEnv, facts: string, instruction: string) {
  const c = client(env);
  const res = await c.beta.messages.create({
    model: env.PI_LLM_MODEL,
    max_tokens: 6000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: `${instruction}\n\nFACTS (the only material you may rely on):\n${facts}` }],
  });
  if (res.stop_reason === "refusal") throw new Error("The model declined this request.");
  return res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}
