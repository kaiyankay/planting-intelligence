import type {
  DesignPrinciple,
  Intention,
  LayerRole,
  OpenQuestion,
  Placement,
  PlantEvaluation,
  PlantRecord,
  RequirementOutcome,
  Season,
  Strategy,
} from "../types.ts";
import { SEASONS } from "../types.ts";
import { flowersIn } from "./validate.ts";
import { retrievePrinciples } from "./relations.ts";

// ---------------------------------------------------------------------------
// STRATEGY GENERATION.
// Strategies differ by DESIGN APPROACH (which layer leads, how colour is
// placed, how much maintenance is designed out), not by re-weighting a
// ranking. Each approach is a set of explicit selection rules over verified
// fields. Requirement outcomes and trade-offs are then computed from the
// chosen plants, so the explanation is grounded in data, not asserted.
// ---------------------------------------------------------------------------

export interface Ctx {
  plants: PlantRecord[];
  evaluations: PlantEvaluation[];
  intentions: Intention[];
  principles: DesignPrinciple[];
  openQuestions: OpenQuestion[];
}

const status = (ctx: Ctx, pid: string, kind: Intention["kind"]) => {
  const intention = ctx.intentions.find((i) => i.kind === kind);
  if (!intention) return "not_applicable" as const;
  return ctx.evaluations.find((e) => e.plantId === pid)?.checks.find((c) => c.intentionId === intention.id)?.status ?? "not_applicable";
};
const siteFit = (ctx: Ctx, pid: string) => ctx.evaluations.find((e) => e.plantId === pid)?.siteFit ?? "unknown";
const plant = (ctx: Ctx, pid: string) => ctx.plants.find((p) => p.id === pid)!;
const isEvergreen = (p: PlantRecord) => p.evergreen.value === true;
const isNative = (p: PlantRecord) => p.native_to_pnw_bc.value === true;
const water = (p: PlantRecord) => p.water.value;
const isShrub = (p: PlantRecord) => /shrub|tree/i.test(p.type);
const heavyMaintenance = (ctx: Ctx, pid: string) => status(ctx, pid, "low_maintenance") === "fail";

export function candidates(ctx: Ctx): PlantRecord[] {
  return ctx.plants.filter((p) => siteFit(ctx, p.id) !== "fail");
}

function colourPass(ctx: Ctx, pid: string) {
  return status(ctx, pid, "flower_colour") === "pass";
}
function pollinatorOk(ctx: Ctx, pid: string) {
  const s = status(ctx, pid, "pollinator_support");
  return s === "pass" || s === "unknown" || s === "not_applicable";
}

// --- Strategy A: seasonal relay of the preferred colour ---------------------
export function strategySeasonalRelay(ctx: Ctx): Strategy {
  const cands = candidates(ctx);
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  const colour = colourIntent?.value ?? "the preferred colour";
  const structural = cands.filter((p) => isEvergreen(p) && isShrub(p) && (colourPass(ctx, p.id) || !colourIntent) && water(p) === "low");
  const seasonal: PlantRecord[] = [];
  const notes: string[] = [];
  for (const s of SEASONS) {
    const inSeason = cands.filter((p) => flowersIn(p, s) && (colourIntent ? colourPass(ctx, p.id) : true) && pollinatorOk(ctx, p.id));
    const low = inSeason.filter((p) => water(p) === "low");
    const moderate = inSeason.filter((p) => water(p) === "moderate");
    const pick = low.length ? low : moderate.length ? moderate : [];
    if (!low.length && moderate.length) notes.push(`${s}: ${colour} relies on moderate-water plants (${moderate.map((p) => p.scientific_name).join(", ")}); viability depends on soil and establishment watering.`);
    if (!pick.length) {
      const wet = inSeason.filter((p) => water(p) === "high");
      if (wet.length) notes.push(`${s}: the only ${colour} candidates need moist conditions (${wet.map((p) => p.scientific_name).join(", ")}); they are excluded unless a small irrigated pocket is accepted.`);
      else notes.push(`${s}: no ${colour}-flowering candidate in the knowledge base that fits the site.`);
    }
    for (const p of pick) if (!seasonal.includes(p) && !structural.includes(p)) seasonal.push(p);
  }
  const ground = cands.filter((p) => !isShrub(p) && isEvergreen(p) && water(p) === "low" && !seasonal.includes(p));
  const placements: Placement[] = [
    { role: "structural", label: "Evergreen framework", approach: `Low, evergreen shrubs placed as a continuous backbone along the bed edge so the ${colour} spring display sits on a stable winter structure.`, plantIds: structural.map((p) => p.id) },
    { role: "seasonal", label: "Seasonal relay", approach: `Drifts of ${colour}-flowering perennials and shrubs sequenced so that at least one is in flower in each season; repeated in groups rather than scattered singly.`, plantIds: seasonal.map((p) => p.id) },
    { role: "ground", label: "Ground layer", approach: "Evergreen ground layer under and between the shrubs to close the soil surface and reduce weeding.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-A",
    name: `${cap(colour)} relay through the seasons`,
    approach: `Lead with the residents' colour, but deliver it as a seasonal sequence of low-water plants with pollinator value rather than a single summer bed.`,
    designIntention: `Test whether one colour can carry spring, summer and autumn while every plant stays within the maintenance team's watering limit.`,
    placements,
    notes,
    topics: ["layering", "seasonal_succession", "visibility", "water", "trade_offs", "site_fit", "spacing"],
  });
}

// --- Strategy B: native framework, colour concentrated at thresholds --------
export function strategyNativeFramework(ctx: Ctx): Strategy {
  const cands = candidates(ctx);
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  const colour = colourIntent?.value ?? "colour";
  const natives = cands.filter((p) => isNative(p) && water(p) !== "high");
  const structural = natives.filter((p) => isShrub(p));
  const seasonal = natives.filter((p) => !isShrub(p) && p.flowering_season.value !== "unknown" && (p.flowering_season.value as Season[]).length > 0);
  const ground = natives.filter((p) => !isShrub(p) && !seasonal.includes(p));
  // Accent: the two colour-passing, low-water plants with the longest / latest flowering, massed at entrances.
  // Accent: colour-passing plants that do not need moist soil, massed at entrances. A structural
  // native may double as the accent (e.g. massing an evergreen yellow-flowered shrub at the gate).
  const used = new Set([...structural, ...seasonal].map((p) => p.id));
  const accent = cands
    .filter((p) => colourPass(ctx, p.id) && water(p) !== "high" && !seasonal.includes(p))
    .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || waterRank(a) - waterRank(b) || seasonCount(b) - seasonCount(a))
    .slice(0, 2);
  const notes: string[] = [];
  if (accent.some((p) => water(p) === "moderate")) notes.push(`Accent plants ${accent.filter((p) => water(p) === "moderate").map((p) => p.scientific_name).join(", ")} prefer moist soil but tolerate dry spells per their sources; they depend on establishment watering.`);
  const nonNativeAccent = accent.filter((p) => !isNative(p));
  if (nonNativeAccent.length) notes.push(`Accent plants ${nonNativeAccent.map((p) => p.scientific_name).join(", ")} are not recorded as native; they are limited to the threshold drifts.`);
  const placements: Placement[] = [
    { role: "structural", label: "Native shrub framework", approach: "Regionally native shrubs form the main body of the bed and the year-round habitat structure; colour comes from whatever these species offer, not from the residents' palette.", plantIds: structural.map((p) => p.id) },
    { role: "seasonal", label: "Native pollinator layer", approach: "Native perennials in repeated clumps extend flowering resources into summer and autumn.", plantIds: seasonal.map((p) => p.id) },
    { role: "accent", label: `${cap(colour)} at the threshold`, approach: `Massed drifts of ${colour} concentrated where people enter and look first, so a smaller quantity reads as 'lots of ${colour}' from the path.`, plantIds: accent.map((p) => p.id) },
    { role: "ground", label: "Native ground layer", approach: "Evergreen native ground layer closing the soil surface.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-B",
    name: `Native framework, ${colour} at the threshold`,
    approach: "Lead with the ecological adviser's goal: a native, multi-season habitat framework, and meet the residents' request for visible colour by placing it where it is seen rather than everywhere.",
    designIntention: "Test whether concentrating colour at entrances can satisfy 'lots of visible colour' with fewer ornamental plants, leaving most of the bed to native structure.",
    placements,
    notes,
    topics: ["ecology", "composition", "visibility", "layering", "trade_offs", "site_fit"],
  });
}

// --- Strategy C: low-input evergreen structure ------------------------------
export function strategyLowInput(ctx: Ctx): Strategy {
  // Low input: low water, or moist-preferring plants whose source notes tolerance of dry spells
  // (establishment watering still required); no recorded staking, aggressive spread or short lifespan.
  // The herbaceous perennial layer is designed out (annual cut-back, division), and the species
  // count is capped: the fewest shrubs that cover the most seasons, planted in large groups.
  const cands = candidates(ctx).filter((p) => (water(p) === "low" || (water(p) === "moderate" && p.water.dry_tolerant)) && !heavyMaintenance(ctx, p.id) && status(ctx, p.id, "low_replacement") !== "fail");
  const shrubs = cands.filter((p) => isShrub(p)).sort((a, b) => Number(isEvergreen(b)) - Number(isEvergreen(a)) || waterRank(a) - waterRank(b));
  const chosen: PlantRecord[] = [];
  const covered = new Set<Season>();
  const MAX_SPECIES = 3;
  // 1) evergreen framework first (winter structure), 2) then only shrubs that add an uncovered season.
  for (const p of shrubs.filter(isEvergreen)) {
    if (chosen.length >= MAX_SPECIES) break;
    chosen.push(p);
    for (const se of SEASONS) if (flowersIn(p, se)) covered.add(se);
  }
  for (const p of shrubs.filter((x) => !isEvergreen(x))) {
    if (chosen.length >= MAX_SPECIES) break;
    const adds = SEASONS.filter((se) => flowersIn(p, se) && !covered.has(se));
    if (!adds.length) continue;
    chosen.push(p);
    for (const se of adds) covered.add(se);
  }
  const omitted = shrubs.filter((p) => !chosen.includes(p));
  const ground = cands.filter((p) => !isShrub(p) && isEvergreen(p));
  const structural = chosen.filter(isEvergreen);
  const deciduousShrubs = chosen.filter((p) => !isEvergreen(p));
  const notes: string[] = [];
  const dry = chosen.filter((p) => water(p) === "moderate");
  if (dry.length) notes.push(`${dry.map((p) => p.scientific_name).join(", ")} prefer moist soil but are recorded as tolerating dry spells; they still need establishment watering.`);
  if (omitted.length) notes.push(`Omitted to keep the species count at ${MAX_SPECIES}: ${omitted.map((p) => p.scientific_name).join(", ")} (their flowering seasons are already covered).`);
  const perennials = cands.filter((p) => !isShrub(p) && !isEvergreen(p));
  if (perennials.length) notes.push(`No herbaceous perennial layer: ${perennials.map((p) => p.scientific_name).join(", ")} would add colour but need annual cut-back and periodic division.`);
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  if (colourIntent) {
    const colourSeasons = SEASONS.filter((s) => chosen.some((p) => flowersIn(p, s) && colourPass(ctx, p.id)));
    const missing = SEASONS.filter((s) => !colourSeasons.includes(s));
    if (missing.length) notes.push(`${cap(colourIntent.value ?? "colour")} is absent in ${missing.join(", ")} under this strategy's shrub-only, low-input filter.`);
  }
  const placements: Placement[] = [
    { role: "structural", label: "Evergreen shrub mass", approach: "Few species, planted at mature spacing in large groups; evergreen mass carries the bed through winter with no replanting.", plantIds: structural.map((p) => p.id) },
    { role: "structural", label: "Deciduous native shrub", approach: "One long-lived deciduous shrub chosen because it adds a flowering season the evergreens do not cover; pruned rarely.", plantIds: deciduousShrubs.map((p) => p.id) },
    { role: "ground", label: "Closed ground layer", approach: "Dense evergreen ground layer so that the soil is covered and weeding is minimal.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-C",
    name: "Low-input evergreen structure",
    approach: "Lead with the maintenance team's limits: shrubs only, at most three species in large groups, no herbaceous perennial layer, and nothing whose source records staking, aggressive spread or a short lifespan.",
    designIntention: "Test how much colour and pollinator value survive when maintenance is designed out first.",
    placements,
    notes,
    topics: ["maintenance", "water", "spacing", "layering", "trade_offs", "site_fit"],
  });
}

export function generateStrategies(ctx: Ctx): Strategy[] {
  return [strategySeasonalRelay(ctx), strategyNativeFramework(ctx), strategyLowInput(ctx)].filter((s) => s.placements.some((p) => p.plantIds.length > 0));
}

// --- Shared: compute outcomes, trade-offs, coverage ------------------------

interface Draft {
  id: string;
  name: string;
  approach: string;
  designIntention: string;
  placements: Placement[];
  notes: string[];
  topics: string[];
}

export function finish(ctx: Ctx, d: Draft, version = 1, revisionLog: Strategy["revisionLog"] = []): Strategy {
  const ids = [...new Set(d.placements.flatMap((p) => p.plantIds))];
  const plants = ids.map((id) => plant(ctx, id));
  const coverage = Object.fromEntries(SEASONS.map((s) => [s, plants.filter((p) => flowersIn(p, s)).map((p) => p.id)])) as Record<Season, string[]>;
  const outcomes = ctx.intentions.map((i) => outcomeFor(ctx, i, plants));
  const tradeOffs = [
    ...d.notes,
    ...outcomes.filter((o) => o.status === "unmet" || o.status === "partially_satisfied").map((o) => `${label(ctx, o.intentionId)}: ${o.reason}`),
    ...plants.flatMap((p) => (p.cautions.value === "unknown" ? [] : p.cautions.value.filter((c) => /toxic|poison|spread|aggressive|stak|spin|thorn|dermatitis|short/i.test(c)).map((c) => `${p.scientific_name}: ${c}`))),
  ];
  const unresolved = [
    ...ctx.openQuestions.filter((q) => q.blocks.some((b) => ids.includes(b)) || q.id.startsWith("Q-light") || q.id.startsWith("Q-area")).map((q) => q.question),
    ...outcomes.filter((o) => o.status === "unknown").map((o) => `${label(ctx, o.intentionId)}: ${o.reason}`),
  ];
  const principleIds = retrievePrinciples(ctx.principles, ctx.intentions)
    .filter((p) => p.topics.some((t) => d.topics.includes(t)) || p.applies_when.some((t) => d.topics.includes(t)))
    .map((p) => p.id);
  return {
    id: d.id,
    version,
    name: d.name,
    approach: d.approach,
    designIntention: d.designIntention,
    placements: d.placements.filter((p) => p.plantIds.length > 0),
    requirementOutcomes: outcomes,
    tradeOffs: [...new Set(tradeOffs)],
    principleIds: [...new Set(principleIds)],
    unresolved: [...new Set(unresolved)],
    seasonCoverage: coverage,
    revisionLog,
  };
}

function outcomeFor(ctx: Ctx, i: Intention, plants: PlantRecord[]): RequirementOutcome {
  const st = (p: PlantRecord) => ctx.evaluations.find((e) => e.plantId === p.id)?.checks.find((c) => c.intentionId === i.id)?.status ?? "not_applicable";
  const passing = plants.filter((p) => st(p) === "pass");
  const failing = plants.filter((p) => st(p) === "fail");
  const unknown = plants.filter((p) => st(p) === "unknown");
  const names = (ps: PlantRecord[]) => ps.map((p) => p.scientific_name).join(", ");
  const base = { intentionId: i.id, supportingPlantIds: passing.map((p) => p.id) };
  switch (i.kind) {
    case "flower_colour":
    case "flower_abundance": {
      const seasons = SEASONS.filter((s) => passing.some((p) => flowersIn(p, s)));
      const status = seasons.length >= 3 ? "satisfied" : seasons.length >= 1 ? "partially_satisfied" : "unmet";
      return { ...base, status, reason: seasons.length ? `${passing.length} plant(s) supply it in ${seasons.join(", ")}${i.kind === "flower_abundance" ? "; quantity and massing need a bed area" : ""}.` : "No plant in this strategy supplies it." };
    }
    case "pollinator_support": {
      const seasons = SEASONS.filter((s) => passing.some((p) => flowersIn(p, s)));
      const status = seasons.length >= 3 ? "satisfied" : seasons.length >= 1 ? "partially_satisfied" : unknown.length ? "unknown" : "unmet";
      return { ...base, status, reason: `Sourced pollinator/wildlife value from ${passing.length} plant(s) across ${seasons.join(", ") || "no season"}${unknown.length ? `; unverified for ${names(unknown)}` : ""}.` };
    }
    case "seasonal_continuity": {
      const covered = SEASONS.filter((s) => plants.some((p) => flowersIn(p, s) || (s === "winter" && p.evergreen.value === true)));
      const status = covered.length === 4 ? "satisfied" : covered.length >= 3 ? "partially_satisfied" : "unmet";
      return { ...base, supportingPlantIds: plants.map((p) => p.id), status, reason: `Flower or evergreen interest in ${covered.join(", ")}.` };
    }
    case "native_preference": {
      const share = plants.length ? passing.length / plants.length : 0;
      const status = share >= 0.6 ? "satisfied" : share >= 0.3 ? "partially_satisfied" : "unmet";
      return { ...base, status, reason: `${passing.length} of ${plants.length} plants recorded as regionally native${unknown.length ? `; ${names(unknown)} unverified` : ""}.` };
    }
    case "low_water": {
      const status = failing.length ? "unmet" : unknown.length ? "partially_satisfied" : "satisfied";
      return { ...base, status, reason: failing.length ? `${names(failing)} need(s) moist conditions.` : unknown.length ? `${names(unknown)} have moderate water needs; outcome depends on soil and establishment watering.` : "Every plant has a low water need once established (establishment watering still required)." };
    }
    case "low_replacement":
    case "low_maintenance":
    case "safety_or_toxicity": {
      const status = failing.length ? "partially_satisfied" : unknown.length === plants.length ? "unknown" : "satisfied";
      return { ...base, status, reason: failing.length ? `Flagged: ${names(failing)}.` : unknown.length ? `Not stated in source for ${names(unknown)}.` : "No flags in the cited sources." };
    }
    case "winter_interest": {
      return { ...base, status: passing.length ? "satisfied" : "unmet", reason: passing.length ? `Evergreen or winter-flowering: ${names(passing)}.` : "No evergreen or winter-flowering plant." };
    }
    case "shade_tolerance":
      return { ...base, status: failing.length ? "partially_satisfied" : "satisfied", reason: failing.length ? `${names(failing)} need full sun.` : "All plants tolerate partial shade per sources." };
    default:
      return { ...base, status: "unknown", reason: "Design judgement; the composition approach addresses it but it cannot be verified from plant data." };
  }
}

export function label(ctx: Ctx, intentionId: string) {
  return ctx.intentions.find((i) => i.id === intentionId)?.statement.replace(/\.$/, "") ?? intentionId;
}
function waterRank(p: PlantRecord) {
  return p.water.value === "low" ? 0 : p.water.value === "moderate" ? 1 : 2;
}
function seasonCount(p: PlantRecord) {
  return p.flowering_season.value === "unknown" ? 0 : p.flowering_season.value.length;
}
function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export type { LayerRole };
