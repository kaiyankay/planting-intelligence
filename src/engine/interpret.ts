import type { Adjustment, Intention, IntentionKind, Stakeholder, Checkability } from "../types.ts";

// ---------------------------------------------------------------------------
// OFFLINE RULE PARSER.
// A transparent keyword/pattern parser used when no LLM is configured. Every
// rule is listed below so the reader can see exactly what the offline mode can
// and cannot understand. It is a stand-in for language understanding, not a
// claim about it. Intentions carry origin: "rule_parser".
// ---------------------------------------------------------------------------

interface Rule {
  kind: IntentionKind;
  pattern: RegExp;
  value?: (m: RegExpMatchArray) => string | undefined;
  statement: (m: RegExpMatchArray) => string;
  checkability: Checkability;
  strength?: (text: string) => "must" | "prefer";
}

const COLOURS = "yellow|white|pink|red|purple|blue|orange|gold(?:en)?";

const MUST_WORDS = /\b(cannot|can't|must|never|no |not able|unable|essential|required?)\b/i;

export const RULES: Rule[] = [
  {
    kind: "flower_colour",
    pattern: new RegExp(`\\b(${COLOURS})\\b[^.]*?\\b(flowers?|blooms?|colou?r)`, "i"),
    value: (m) => m[1].toLowerCase().replace(/^golden?$/, "yellow"),
    statement: (m) => `Flower colour preference: ${m[1].toLowerCase()}.`,
    checkability: "database",
  },
  {
    kind: "flower_abundance",
    pattern: /\b(lots of|plenty of|abundant|masses of|many|full of)\b[^.]*?\b(flowers?|blooms?|colou?r)/i,
    statement: () => "Wants an abundant, visible floral display.",
    checkability: "partial",
  },
  {
    kind: "welcoming_character",
    pattern: /\b(welcoming|inviting|friendly|cheerful|attractive|beautiful|pleasant)\b/i,
    statement: (m) => `Wants a ${m[1].toLowerCase()} character; this is a design judgement, not a plant attribute.`,
    checkability: "design_judgement",
  },
  {
    kind: "pollinator_support",
    pattern: /\b(pollinators?|bees?|butterfl(?:y|ies)|hummingbirds?|birds?|wildlife|habitat|biodiversity)\b/i,
    statement: (m) => `Wants planting that supports ${m[1].toLowerCase()}.`,
    checkability: "partial",
  },
  {
    kind: "seasonal_continuity",
    pattern: /\b(across|through(?:out)?|all|every|multiple|different|year[- ]round|succession of)\s+(the\s+)?seasons?\b|\byear[- ]round\b/i,
    statement: () => "Wants interest or ecological value continuing across seasons.",
    checkability: "database",
  },
  {
    kind: "native_preference",
    pattern: /\b(native|indigenous|local species|local plants)\b/i,
    statement: () => "Prefers regionally native plants.",
    checkability: "database",
  },
  {
    kind: "low_water",
    pattern: /\b(water(?:ing)?|irrigat\w*|drought)\b/i,
    statement: (m) =>
      /drought/i.test(m[1]) ? "Wants drought-tolerant planting." : "Cannot sustain intensive or long-term watering.",
    checkability: "database",
    strength: (t) => (MUST_WORDS.test(t) ? "must" : "prefer"),
  },
  {
    kind: "low_replacement",
    pattern: /\b(replac\w+|replant\w*|short[- ]lived|die(?:s)? back|longevity|long[- ]lived|durable)\b/i,
    statement: () => "Wants long-lived plants; avoid frequent replacement.",
    checkability: "partial",
    strength: (t) => (MUST_WORDS.test(t) ? "must" : "prefer"),
  },
  {
    kind: "low_maintenance",
    pattern: /\b(low[- ]maintenance|maintenance|upkeep|pruning|staking|deadhead\w*|weeding|labou?r)\b/i,
    statement: () => "Wants low maintenance demand.",
    checkability: "partial",
  },
  {
    kind: "winter_interest",
    pattern: /\b(winter|evergreen|structure in winter)\b/i,
    statement: () => "Wants winter interest or evergreen structure.",
    checkability: "database",
  },
  {
    kind: "shade_tolerance",
    pattern: /\b(shade|shady)\b/i,
    statement: () => "Mentions shade; check light compatibility.",
    checkability: "database",
  },
  {
    kind: "safety_or_toxicity",
    pattern: /\b(toxic|poison\w*|safe for (?:children|kids|dogs|pets)|thorn\w*|spin(?:y|es))\b/i,
    statement: () => "Wants to avoid toxic or hazardous plants.",
    checkability: "partial",
  },
];

export function parseIntentionsOffline(stakeholders: Stakeholder[]): Intention[] {
  const out: Intention[] = [];
  let n = 0;
  for (const s of stakeholders) {
    const text = s.statement;
    const seenKinds = new Set<IntentionKind>();
    for (const rule of RULES) {
      const m = text.match(rule.pattern);
      if (!m || seenKinds.has(rule.kind)) continue;
      seenKinds.add(rule.kind);
      n += 1;
      out.push({
        id: `I-${String(n).padStart(2, "0")}`,
        stakeholderId: s.id,
        kind: rule.kind,
        value: rule.value?.(m),
        strength: rule.strength ? rule.strength(text) : "prefer",
        statement: rule.statement(m),
        evidence: m[0],
        confidence: 0.6,
        checkability: rule.checkability,
        origin: "rule_parser",
      });
    }
    if (!seenKinds.size && text.trim()) {
      n += 1;
      out.push({
        id: `I-${String(n).padStart(2, "0")}`,
        stakeholderId: s.id,
        kind: "other",
        strength: "prefer",
        statement: "No rule matched this statement; needs human interpretation.",
        evidence: text.trim(),
        confidence: 0.1,
        checkability: "design_judgement",
        origin: "rule_parser",
      });
    }
  }
  return out;
}

// Feedback → adjustments (offline rules). Same transparency principle.
const ADJUSTMENT_RULES: { kind: Adjustment["kind"]; pattern: RegExp }[] = [
  { kind: "reduce_water", pattern: /\b(reduce|less|lower|cut|without|no)\b[^.]*\b(water\w*|irrigat\w*)|\b(water\w*|irrigat\w*)\b[^.]*\b(reduce|less|lower|too much)/i },
  { kind: "keep_summer_colour", pattern: /\b(keep|without losing|retain|maintain|preserve|not lose|don't lose)\b[^.]*\b(summer)\b[^.]*\b(colou?r|flowers?|bloom)/i },
  { kind: "more_summer_colour", pattern: /\b(more|extra|add|stronger)\b[^.]*\bsummer\b[^.]*\b(colou?r|flowers?|bloom)/i },
  { kind: "more_native", pattern: /\b(more|only|prefer|prioriti[sz]e)\b[^.]*\bnative/i },
  { kind: "less_maintenance", pattern: /\b(less|lower|reduce|minimi[sz]e|easier)\b[^.]*\b(maintenance|upkeep|pruning|staking|work)/i },
  { kind: "more_winter_interest", pattern: /\b(winter|evergreen)\b/i },
  { kind: "avoid_toxic", pattern: /\b(toxic|poison\w*|children|kids|pets|dogs|spin(?:y|es)|thorn\w*)\b/i },
  { kind: "more_colour", pattern: /\b(more|extra|add)\b[^.]*\b(yellow|colou?r|flowers?)/i },
];

export function parseAdjustmentsOffline(feedback: string, plantNames: { id: string; names: string[] }[]): Adjustment[] {
  const out: Adjustment[] = [];
  for (const r of ADJUSTMENT_RULES) {
    const m = feedback.match(r.pattern);
    if (m) out.push({ kind: r.kind, evidence: m[0], origin: "rule_parser" });
  }
  const removeMatch = feedback.match(/\b(remove|drop|replace|swap out|take out|no more|without)\b\s+(?:the\s+)?([A-Za-z' ]{3,40})/i);
  if (removeMatch) {
    const target = removeMatch[2].toLowerCase();
    for (const p of plantNames) {
      if (p.names.some((nm) => target.includes(nm.toLowerCase()) || nm.toLowerCase().includes(target.trim()))) {
        out.push({ kind: "remove_plant", plantId: p.id, evidence: removeMatch[0], origin: "rule_parser" });
      }
    }
  }
  if (!out.length) out.push({ kind: "unknown", evidence: feedback, origin: "rule_parser" });
  return out;
}
