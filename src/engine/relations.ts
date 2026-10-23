import type {
  DesignPrinciple,
  Intention,
  OpenQuestion,
  PlantEvaluation,
  PlantRecord,
  Relation,
  RelationKind,
  Season,
  SeasonCoverage,
  SiteAssumptions,
} from "../types.ts";
import { SEASONS } from "../types.ts";
import { flowersIn } from "./validate.ts";

// ---------------------------------------------------------------------------
// RELATIONSHIP ANALYSIS (code, not model).
// For each pair of database-checkable intentions we compute which plants in
// the knowledge base satisfy both while fitting the site, and in which
// seasons. The relation kind follows from those sets:
//   compatible        – plants satisfying both exist in every relevant season
//   conditional       – exist, but with season gaps or only via moderate-water plants
//   conflict          – no plant satisfies both
//   insufficient_data – the answer hinges on unknown fields
//   not_checkable     – at least one side is a design judgement
// ---------------------------------------------------------------------------

const CHECKABLE = new Set(["database", "partial"]);

function passes(ev: PlantEvaluation, intentionId: string, allowUnknown = false): boolean {
  const c = ev.checks.find((x) => x.intentionId === intentionId);
  if (!c) return false;
  if (c.status === "pass") return true;
  if (allowUnknown && c.status === "unknown") return true;
  return false;
}

function siteOk(ev: PlantEvaluation, allowUnknown = true): boolean {
  return ev.siteFit === "pass" || (allowUnknown && ev.siteFit === "unknown");
}

const SEASONAL_KINDS = new Set(["flower_colour", "flower_abundance", "pollinator_support", "seasonal_continuity"]);

export function analyseRelations(
  intentions: Intention[],
  evaluations: PlantEvaluation[],
  plants: PlantRecord[],
  principles: DesignPrinciple[],
): Relation[] {
  const byId = new Map(plants.map((p) => [p.id, p]));
  // Pairwise analysis covers the goals that can be tested plant by plant; composition-level
  // goals (abundance, general maintenance, character) are carried into the strategies instead.
  const PAIRWISE_KINDS = new Set(["flower_colour", "pollinator_support", "native_preference", "low_water", "low_replacement", "winter_interest", "safety_or_toxicity"]);
  const checkable = intentions.filter((i) => CHECKABLE.has(i.checkability) && PAIRWISE_KINDS.has(i.kind));
  // Seasons in which no site-fit plant in the knowledge base flowers at all are a knowledge-base
  // gap, not a disagreement between two goals; they are reported in season coverage instead.
  const flowering = new Set<Season>(SEASONS.filter((s) => evaluations.some((e) => siteOk(e) && flowersIn(byId.get(e.plantId)!, s))));
  const relations: Relation[] = [];
  for (let x = 0; x < checkable.length; x++) {
    for (let y = x + 1; y < checkable.length; y++) {
      const a = checkable[x];
      const b = checkable[y];
      if (a.stakeholderId === b.stakeholderId) continue; // negotiation is between parties
      const strict = evaluations.filter((e) => siteOk(e, false) && passes(e, a.id) && passes(e, b.id)).map((e) => e.plantId);
      const lenient = evaluations.filter((e) => siteOk(e, true) && passes(e, a.id, true) && passes(e, b.id, true)).map((e) => e.plantId);
      const onlyA = evaluations.filter((e) => siteOk(e) && passes(e, a.id, true)).length;
      const onlyB = evaluations.filter((e) => siteOk(e) && passes(e, b.id, true)).length;
      const unknownHeavy = evaluations.filter((e) => {
        const ca = e.checks.find((c) => c.intentionId === a.id)?.status;
        const cb = e.checks.find((c) => c.intentionId === b.id)?.status;
        return ca === "unknown" || cb === "unknown";
      }).length;

      // Season gaps only matter when at least one side is about flowers/pollinators.
      const seasonal = SEASONAL_KINDS.has(a.kind) || SEASONAL_KINDS.has(b.kind);
      const seasonGaps: Season[] = seasonal
        ? SEASONS.filter((s) => flowering.has(s) && !lenient.some((pid) => flowersIn(byId.get(pid)!, s)))
        : [];

      const strictGaps: Season[] = seasonal ? SEASONS.filter((s) => flowering.has(s) && !strict.some((pid) => flowersIn(byId.get(pid)!, s))) : [];
      const conditionalOnly = lenient.filter((pid) => !strict.includes(pid));
      // The candidates that would close the verified-season gaps, if their unknown fields are confirmed.
      const gapClosers = seasonal ? conditionalOnly.filter((pid) => strictGaps.some((s) => flowersIn(byId.get(pid)!, s))) : conditionalOnly;
      let kind: RelationKind;
      let summary: string;
      if (strict.length > 0 && strictGaps.length === 0) {
        kind = "compatible";
        summary = `${strict.length} plant(s) satisfy both with verified fields${seasonal ? " in every flowering season of the knowledge base" : ""}.`;
      } else if (strict.length > 0 && lenient.length > strict.length) {
        kind = "conditional";
        const verifiedSeasons = SEASONS.filter((s) => flowering.has(s) && !strictGaps.includes(s));
        summary =
          `Verified together ${seasonal && verifiedSeasons.length ? `in ${verifiedSeasons.join(", ")}` : `by ${strict.length} plant(s)`}; ` +
          `${seasonal && strictGaps.length ? `${strictGaps.filter((g) => !seasonGaps.includes(g)).join(" and ") || "other seasons"} depend on ${gapClosers.map((pid) => byId.get(pid)!.scientific_name).join(", ")}, whose unknown fields must be confirmed` : `${conditionalOnly.length} further candidate(s) depend on unknown fields`}` +
          `${seasonGaps.length ? `; no shared candidate flowers in ${seasonGaps.join(" or ")}` : ""}.`;
      } else if (strict.length > 0) {
        kind = "conditional";
        summary = `Verified together by ${strict.map((pid) => byId.get(pid)!.scientific_name).join(", ")}, but no shared candidate flowers in ${seasonGaps.join(" or ")}.`;
      } else if (lenient.length > 0) {
        kind = "insufficient_data";
        summary = `No plant satisfies both with verified fields; ${lenient.length} candidate(s) could, depending on unknown fields (${conditionalOnly.map((pid) => byId.get(pid)!.scientific_name).join(", ")}).`;
      } else if (onlyA > 0 && onlyB > 0) {
        kind = "conflict";
        summary = `Each goal has candidates (${onlyA} and ${onlyB}) but none satisfies both.`;
      } else {
        kind = unknownHeavy > plants.length / 2 ? "insufficient_data" : "conflict";
        summary = kind === "insufficient_data" ? `Most plant records lack the field needed to judge this pair.` : `No plant in the knowledge base satisfies both goals.`;
      }
      relations.push({
        a: a.id,
        b: b.id,
        kind,
        summary,
        plantsSatisfyingBoth: lenient,
        seasonGaps,
        principleIds: retrievePrinciples(principles, [a, b]).map((p) => p.id),
      });
    }
  }
  // Design-judgement intentions get explicit not_checkable entries so they are not silently dropped.
  for (const dj of intentions.filter((i) => i.checkability === "design_judgement")) {
    relations.push({
      a: dj.id,
      b: dj.id,
      kind: "not_checkable",
      summary: "Design judgement; cannot be verified against plant attributes. Carried into strategies as a composition brief.",
      plantsSatisfyingBoth: [],
      seasonGaps: [],
      principleIds: retrievePrinciples(principles, [dj]).map((p) => p.id),
    });
  }
  return relations;
}

export function seasonCoverage(intentions: Intention[], evaluations: PlantEvaluation[], plants: PlantRecord[]): SeasonCoverage[] {
  const byId = new Map(plants.map((p) => [p.id, p]));
  const dbIntentions = intentions.filter((i) => i.checkability === "database" && i.kind !== "seasonal_continuity" && i.kind !== "shade_tolerance");
  const colour = intentions.find((i) => i.kind === "flower_colour");
  const poll = intentions.find((i) => i.kind === "pollinator_support");
  return SEASONS.map((season) => {
    const inSeason = evaluations.filter((e) => siteOk(e) && flowersIn(byId.get(e.plantId)!, season));
    return {
      season,
      plantsSatisfyingAll: inSeason.filter((e) => dbIntentions.every((i) => passes(e, i.id, true))).map((e) => e.plantId),
      plantsSatisfyingColour: colour ? inSeason.filter((e) => passes(e, colour.id)).map((e) => e.plantId) : [],
      plantsSatisfyingPollinators: poll ? inSeason.filter((e) => passes(e, poll.id)).map((e) => e.plantId) : [],
    };
  });
}

// Knowledge retrieval: principles whose applies_when tags match the intentions.
const KIND_TAGS: Record<string, string[]> = {
  flower_colour: ["intent:colour", "intent:visibility", "intent:seasonal_interest"],
  flower_abundance: ["intent:colour", "intent:visibility", "intent:legibility"],
  welcoming_character: ["intent:visibility", "intent:legibility", "intent:colour", "location:entrance"],
  pollinator_support: ["intent:pollinators", "intent:ecology"],
  seasonal_continuity: ["intent:seasonal_interest", "season:all", "intent:pollinators"],
  native_preference: ["intent:native", "ecology"],
  low_water: ["intent:low_water", "water"],
  low_replacement: ["intent:low_maintenance", "maintenance", "spacing"],
  low_maintenance: ["intent:low_maintenance", "maintenance"],
  winter_interest: ["season:winter", "seasonal_succession", "layering"],
  shade_tolerance: ["site_fit"],
  safety_or_toxicity: ["maintenance"],
  other: [],
};

export function retrievePrinciples(principles: DesignPrinciple[], intentions: Intention[]): DesignPrinciple[] {
  const wanted = new Set<string>();
  for (const i of intentions) for (const t of KIND_TAGS[i.kind] ?? []) wanted.add(t);
  // trade-off principles are always relevant when more than one stakeholder is present
  if (new Set(intentions.map((i) => i.stakeholderId)).size > 1) {
    wanted.add("intent:trade_off");
    wanted.add("phase:site_analysis");
  }
  return principles.filter((p) => p.applies_when.some((t) => wanted.has(t)) || p.topics.some((t) => wanted.has(t)));
}

export function openQuestions(site: SiteAssumptions, intentions: Intention[], evaluations: PlantEvaluation[], plants: PlantRecord[]): OpenQuestion[] {
  const qs: OpenQuestion[] = [];
  const unknownSite = (["light", "drainage", "soil", "irrigation", "bed_area_m2", "existing_vegetation"] as const).filter((k) => site[k].value === "unknown" || site[k].provenance === "synthetic_assumption");
  if (unknownSite.includes("light"))
    qs.push({ id: "Q-light", question: "What is the actual sun exposure of the bed (hours of direct sun, which part of the day)?", why: `Light is ${site.light.provenance.replace("_", " ")}. Every site-fit check depends on it.`, blocks: evaluations.filter((e) => e.site.light.status !== "pass").map((e) => e.plantId) });
  if (unknownSite.includes("irrigation"))
    qs.push({ id: "Q-irrigation", question: "Is establishment watering (first one to two summers) available, and is any long-term irrigation possible?", why: "Drought-tolerant plants still need establishment water; moderate-water candidates hinge on this.", blocks: evaluations.filter((e) => e.site.water.status === "unknown").map((e) => e.plantId) });
  if (unknownSite.includes("drainage") || unknownSite.includes("soil"))
    qs.push({ id: "Q-soil", question: "What are the soil texture, drainage and compaction of the bed?", why: "Moisture-demanding and drought-tolerant plants respond differently to drainage; several records state soil preferences.", blocks: intentions.filter((i) => i.kind === "low_water").map((i) => i.id) });
  if (unknownSite.includes("bed_area_m2"))
    qs.push({ id: "Q-area", question: "What is the bed area and shape, and where are the entrances and main views?", why: "Quantities, spacing at mature spread and the location of visible colour cannot be decided without it.", blocks: intentions.filter((i) => i.kind === "flower_abundance" || i.kind === "welcoming_character").map((i) => i.id) });
  // Plant-level unknowns that block an intention
  const unknownChecks = new Map<string, string[]>();
  for (const e of evaluations) for (const c of e.checks) if (c.status === "unknown") unknownChecks.set(c.intentionId, [...(unknownChecks.get(c.intentionId) ?? []), e.plantId]);
  for (const [intentionId, pids] of unknownChecks) {
    const intention = intentions.find((i) => i.id === intentionId);
    if (!intention || pids.length === 0) continue;
    const names = pids.map((pid) => plants.find((p) => p.id === pid)?.scientific_name ?? pid);
    qs.push({ id: `Q-${intentionId}`, question: `Confirm "${intention.statement.replace(/\.$/, "")}" for: ${names.join(", ")}.`, why: "The cited sources do not state the field needed, or state a moderate value whose outcome depends on site conditions.", blocks: pids });
  }
  return qs;
}

export function commonGroundAndTensions(intentions: Intention[], relations: Relation[], coverage: SeasonCoverage[], plants: PlantRecord[]): { commonGround: string[]; tensions: string[] } {
  const name = (id: string) => plants.find((p) => p.id === id)?.scientific_name ?? id;
  const label = (id: string) => intentions.find((i) => i.id === id)?.statement.replace(/\.$/, "") ?? id;
  const commonGround: string[] = [];
  const tensions: string[] = [];
  for (const r of relations) {
    if (r.kind === "compatible") commonGround.push(`"${label(r.a)}" and "${label(r.b)}" can be met together: ${r.plantsSatisfyingBoth.map(name).join(", ")}.`);
    if (r.kind === "conditional") tensions.push(`"${label(r.a)}" and "${label(r.b)}" are compatible only under conditions: ${r.summary}`);
    if (r.kind === "conflict") tensions.push(`"${label(r.a)}" and "${label(r.b)}" conflict within this knowledge base: ${r.summary}`);
    if (r.kind === "insufficient_data") tensions.push(`"${label(r.a)}" vs "${label(r.b)}": ${r.summary}`);
  }
  const gaps = coverage.filter((c) => c.plantsSatisfyingAll.length === 0).map((c) => c.season);
  if (gaps.length) tensions.push(`No site-fit plant satisfies every database-checkable requirement in ${gaps.join(", ")}.`);
  else commonGround.push("At least one site-fit plant satisfies every database-checkable requirement in each season.");
  return { commonGround, tensions };
}
