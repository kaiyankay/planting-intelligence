import type { Adjustment, Intention, LlmStatus, NegotiationAnalysis, SiteAssumptions, Stakeholder, Strategy } from "../types.ts";
import { PLANTS, PRINCIPLES, plantNameIndex } from "../knowledge/index.ts";
import { parseAdjustmentsOffline, parseIntentionsOffline } from "./interpret.ts";
import { evaluateAll } from "./validate.ts";
import { analyseRelations, commonGroundAndTensions, openQuestions, retrievePrinciples, seasonCoverage } from "./relations.ts";
import { generateStrategies, type Ctx } from "./strategies.ts";
import { applyAdjustments } from "./revise.ts";
import { groundNarrative, offlineNegotiationNarrative, offlineRevisionNarrative } from "./narrate.ts";
import { buildSummary } from "./summary.ts";

// Orchestration: decides which parts come from the LLM (language) and which
// from code (facts), and falls back to offline mode with a visible notice.

export interface RunResult {
  analysis: NegotiationAnalysis;
  strategies: Strategy[];
  ctx: Ctx;
  notices: string[];
}

const CHECKABILITY: Record<Intention["kind"], Intention["checkability"]> = {
  flower_colour: "database",
  flower_abundance: "partial",
  welcoming_character: "design_judgement",
  pollinator_support: "partial",
  seasonal_continuity: "database",
  native_preference: "database",
  low_water: "database",
  low_replacement: "partial",
  low_maintenance: "partial",
  winter_interest: "database",
  shade_tolerance: "database",
  safety_or_toxicity: "partial",
  other: "design_judgement",
};

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data as T;
}

export async function fetchStatus(): Promise<LlmStatus> {
  try {
    const r = await fetch("/api/status");
    return (await r.json()) as LlmStatus;
  } catch {
    return { available: false, mode: "offline_demonstration" };
  }
}

export async function interpret(stakeholders: Stakeholder[], status: LlmStatus, notices: string[]): Promise<Intention[]> {
  if (status.available) {
    try {
      const data = await post<{ intentions: any[] }>("/api/interpret", { stakeholders });
      return data.intentions.map((x, i) => ({
        id: `I-${String(i + 1).padStart(2, "0")}`,
        stakeholderId: x.stakeholderId,
        kind: x.kind,
        value: x.value ?? undefined,
        strength: x.strength,
        statement: x.statement,
        evidence: x.evidence,
        confidence: x.confidence,
        checkability: CHECKABILITY[x.kind as Intention["kind"]] ?? "design_judgement",
        origin: "llm" as const,
      }));
    } catch (e: any) {
      notices.push(`LLM interpretation failed (${e.message}); fell back to the offline rule parser.`);
    }
  }
  return parseIntentionsOffline(stakeholders);
}

export function factsForNarrative(a: Omit<NegotiationAnalysis, "narrative">, stakeholders: Stakeholder[]): string {
  const lines: string[] = [];
  lines.push("STAKEHOLDERS:");
  for (const s of stakeholders) lines.push(`- ${s.id} (${s.role}): "${s.statement}"`);
  lines.push("\nINTENTIONS (interpreted):");
  for (const i of a.intentions) lines.push(`- ${i.id} [${i.stakeholderId}] ${i.kind}${i.value ? `=${i.value}` : ""} (${i.strength}, ${i.checkability}): ${i.statement}`);
  lines.push("\nRELATIONS (computed by code from the plant database):");
  for (const r of a.relations) lines.push(`- ${r.a} × ${r.b}: ${r.kind.toUpperCase()}. ${r.summary} Plants satisfying both: ${r.plantsSatisfyingBoth.join(", ") || "none"}. Season gaps: ${r.seasonGaps.join(", ") || "none"}.`);
  lines.push("\nSEASON COVERAGE (site-fit plants meeting every database-checkable intention):");
  for (const c of a.seasonCoverage) lines.push(`- ${c.season}: all=${c.plantsSatisfyingAll.join(", ") || "none"}; colour=${c.plantsSatisfyingColour.join(", ") || "none"}; pollinators=${c.plantsSatisfyingPollinators.join(", ") || "none"}`);
  lines.push("\nPLANT RECORDS (verified fields; 'unknown' means the source did not state it):");
  for (const e of a.evaluations) {
    const p = PLANTS.find((x) => x.id === e.plantId)!;
    lines.push(
      `- ${p.id} ${p.scientific_name}: type=${p.type}; light=${JSON.stringify(p.light.value)}; water=${p.water.value}${p.water.dry_tolerant ? " (tolerates dry spells)" : ""}; colour=${JSON.stringify(p.flower_colour.value)}; season=${JSON.stringify(p.flowering_season.value)}; evergreen=${p.evergreen.value}; native=${p.native_to_pnw_bc.value}; pollinators=${p.pollinator_evidence.value}; siteFit=${e.siteFit} (${e.site.light.reason} ${e.site.water.reason}); cautions=${JSON.stringify(p.cautions.value)}`,
    );
  }
  lines.push("\nDESIGN PRINCIPLES RETRIEVED:");
  for (const id of a.retrievedPrincipleIds) {
    const k = PRINCIPLES.find((x) => x.id === id)!;
    lines.push(`- ${k.id} (${k.type}) ${k.title}: ${k.statement}`);
  }
  lines.push("\nOPEN QUESTIONS:");
  for (const q of a.openQuestions) lines.push(`- ${q.question} (${q.why})`);
  return lines.join("\n");
}

export async function runNegotiation(stakeholders: Stakeholder[], site: SiteAssumptions, status: LlmStatus): Promise<RunResult> {
  const notices: string[] = [];
  const intentions = await interpret(stakeholders, status, notices);
  const evaluations = evaluateAll(PLANTS, intentions, site);
  const relations = analyseRelations(intentions, evaluations, PLANTS, PRINCIPLES);
  const coverage = seasonCoverage(intentions, evaluations, PLANTS);
  const questions = openQuestions(site, intentions, evaluations, PLANTS);
  const retrieved = retrievePrinciples(PRINCIPLES, intentions).map((p) => p.id);
  const { commonGround, tensions } = commonGroundAndTensions(intentions, relations, coverage, PLANTS);
  const summary = buildSummary(intentions, relations, coverage, evaluations, PLANTS, questions);
  const partial = { summary, intentions, evaluations, relations, seasonCoverage: coverage, openQuestions: questions, retrievedPrincipleIds: retrieved, commonGround, tensions };
  let narrative;
  if (status.available) {
    try {
      const data = await post<{ text: string; model: string }>("/api/narrate", {
        facts: factsForNarrative(partial, stakeholders),
        instruction:
          "Write the negotiation reasoning for the designer in 4 short paragraphs: (1) how you read each party's goal and what is checkable; (2) where goals meet, citing plants [P-xx]; (3) where they pull apart, season by season, and what kind of design move could reconcile them, citing principles [K-xx]; (4) what must be confirmed before deciding. Do not list plants exhaustively; reason. Do not invent conflict where the facts show compatibility.",
      });
      narrative = groundNarrative(data.text, "llm", PLANTS, PRINCIPLES, data.model);
    } catch (e: any) {
      notices.push(`LLM narrative failed (${e.message}); showing the offline template narrative.`);
    }
  }
  if (!narrative) narrative = offlineNegotiationNarrative(partial, stakeholders, PLANTS, PRINCIPLES);
  const ctx: Ctx = { plants: PLANTS, evaluations, intentions, principles: PRINCIPLES, openQuestions: questions };
  const strategies = generateStrategies(ctx);
  return { analysis: { ...partial, narrative }, strategies, ctx, notices };
}

export async function reviseStrategy(ctx: Ctx, strategy: Strategy, feedback: string, status: LlmStatus): Promise<{ strategy: Strategy; notices: string[] }> {
  const notices: string[] = [];
  let adjustments: Adjustment[] | undefined;
  const plantList = [...new Set(strategy.placements.flatMap((p) => p.plantIds))].map((id) => ({ id, name: PLANTS.find((p) => p.id === id)?.scientific_name ?? id }));
  if (status.available) {
    try {
      const data = await post<{ adjustments: any[] }>("/api/adjust", { feedback, strategySummary: `${strategy.name}: ${strategy.approach}`, plants: plantList });
      adjustments = data.adjustments.map((a) => ({ kind: a.kind, plantId: a.plantId ?? undefined, evidence: a.evidence, origin: "llm" as const }));
    } catch (e: any) {
      notices.push(`LLM feedback interpretation failed (${e.message}); used the offline rule parser.`);
    }
  }
  if (!adjustments) adjustments = parseAdjustmentsOffline(feedback, plantNameIndex());
  if (adjustments.every((a) => a.kind === "unknown")) {
    // Honest failure: the feedback did not map to any revision operator, so no version is created.
    return { strategy, notices: [...notices, `The feedback could not be interpreted into a revision the system supports (${status.available ? "model" : "rule parser"} found no operator). Supported: reduce watering, keep or add summer colour, more native plants, less maintenance, winter interest, avoid toxic plants, remove a named plant. Nothing was changed.`] };
  }
  const next = applyAdjustments(ctx, strategy, feedback, adjustments);
  const entry = next.revisionLog[next.revisionLog.length - 1];
  let narrative;
  if (status.available) {
    try {
      const facts = [
        `STRATEGY ${next.name} v${next.version}: ${next.approach}`,
        `REVIEWER FEEDBACK: "${feedback}"`,
        `ADJUSTMENTS: ${adjustments.map((a) => a.kind).join(", ")}`,
        `REMOVED: ${entry.removed.map((r) => `${r.plantId} (${r.reason})`).join("; ") || "none"}`,
        `ADDED: ${entry.added.map((r) => `${r.plantId} (${r.reason})`).join("; ") || "none"}`,
        `ENGINE EXPLANATION: ${entry.explanation.join(" ")}`,
        `REQUIREMENT OUTCOMES NOW: ${next.requirementOutcomes.map((o) => `${o.intentionId}=${o.status} (${o.reason})`).join("; ")}`,
        `TRADE-OFFS NOW: ${next.tradeOffs.join(" | ")}`,
        `PLANT RECORDS: ${[...new Set(next.placements.flatMap((p) => p.plantIds))].map((id) => { const p = PLANTS.find((x) => x.id === id)!; return `${p.id} ${p.scientific_name} water=${p.water.value} season=${JSON.stringify(p.flowering_season.value)} colour=${JSON.stringify(p.flower_colour.value)}`; }).join("; ")}`,
        `PRINCIPLES: ${next.principleIds.map((id) => { const k = PRINCIPLES.find((x) => x.id === id)!; return `${k.id} ${k.title}`; }).join("; ")}`,
      ].join("\n");
      const data = await post<{ text: string; model: string }>("/api/narrate", { facts, instruction: "In 2 short paragraphs, explain to the reviewer what changed in the strategy and why, what was gained and what was given up, citing plants [P-xx] and principles [K-xx] from the facts only. If a gap remains, say so plainly and name what would close it." });
      narrative = groundNarrative(data.text, "llm", PLANTS, PRINCIPLES, data.model);
    } catch (e: any) {
      notices.push(`LLM revision narrative failed (${e.message}); showing the offline template.`);
    }
  }
  if (!narrative) narrative = offlineRevisionNarrative(next, PLANTS, PRINCIPLES);
  entry.narrative = narrative;
  return { strategy: next, notices };
}
