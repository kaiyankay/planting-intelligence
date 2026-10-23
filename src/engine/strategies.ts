import type {
  AppliedPrinciple,
  ConceptDiagram,
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
import { shortLabel } from "./summary.ts";

// ---------------------------------------------------------------------------
// STRATEGY GENERATION.
// Three pre-authored DESIGN APPROACHES (which goal leads, how colour is placed,
// how much maintenance is designed out). Within each approach every selection
// step is a rule over verified plant fields, and several steps are gated by a
// design principle from the knowledge base: the principle is applied only when
// its conditions hold for the current intentions, and the decision it changed
// is recorded in `appliedPrinciples`. Principles that did not change anything
// are not listed. This is encoded professional knowledge, not model inference.
// ---------------------------------------------------------------------------

export interface Ctx {
  plants: PlantRecord[];
  evaluations: PlantEvaluation[];
  intentions: Intention[];
  principles: DesignPrinciple[];
  openQuestions: OpenQuestion[];
}

const WARM = /^(yellow|gold|golden|orange|red)$/i;

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
const has = (ctx: Ctx, kind: Intention["kind"]) => ctx.intentions.some((i) => i.kind === kind);
const colourPass = (ctx: Ctx, pid: string) => status(ctx, pid, "flower_colour") === "pass";
const pollinatorOk = (ctx: Ctx, pid: string) => ["pass", "unknown", "not_applicable"].includes(status(ctx, pid, "pollinator_support"));
const seasonCount = (p: PlantRecord) => (p.flowering_season.value === "unknown" ? 0 : p.flowering_season.value.length);
const waterRank = (p: PlantRecord) => (p.water.value === "low" ? 0 : p.water.value === "moderate" ? 1 : 2);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function candidates(ctx: Ctx): PlantRecord[] {
  return ctx.plants.filter((p) => siteFit(ctx, p.id) !== "fail");
}

// Principle gate: the principle applies when any of its applies_when tags matches the live intentions.
const KIND_TAGS: Partial<Record<Intention["kind"], string[]>> = {
  flower_colour: ["intent:colour", "intent:visibility"],
  flower_abundance: ["intent:colour", "intent:visibility", "intent:legibility"],
  welcoming_character: ["intent:visibility", "intent:legibility", "location:entrance"],
  pollinator_support: ["intent:pollinators", "intent:ecology"],
  seasonal_continuity: ["intent:seasonal_interest", "season:all", "season:winter"],
  native_preference: ["intent:native", "intent:ecology"],
  low_water: ["intent:low_water"],
  low_replacement: ["intent:low_maintenance"],
  low_maintenance: ["intent:low_maintenance"],
  winter_interest: ["season:winter", "intent:seasonal_interest"],
};
function applies(ctx: Ctx, principleId: string): boolean {
  const k = ctx.principles.find((p) => p.id === principleId);
  if (!k) return false;
  const live = new Set(ctx.intentions.flatMap((i) => KIND_TAGS[i.kind] ?? []));
  return k.applies_when.some((t) => live.has(t));
}
function use(list: AppliedPrinciple[], ctx: Ctx, id: string, decision: string): boolean {
  if (!applies(ctx, id)) return false;
  list.push({ id, decision });
  return true;
}

// --- Strategy A: seasonal relay led by the residents' aesthetic goal ----------
export function strategySeasonalRelay(ctx: Ctx): Strategy {
  const applied: AppliedPrinciple[] = [];
  const cands = candidates(ctx);
  applied.push({ id: "K-01", decision: `Only plants whose sourced light and water needs fit the assumed site were considered (${cands.length} of ${ctx.plants.length}).` });
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  const colour = colourIntent?.value;
  const lead = colour ? `${colour} flowers` : has(ctx, "winter_interest") ? "winter interest" : "seasonal interest";
  const notes: string[] = [];

  // K-06: evergreen framework only when winter or year-round interest is wanted.
  const wantsEvergreen = use(applied, ctx, "K-06", "The framework layer is restricted to evergreen shrubs so the bed holds structure in winter.");
  const structural = cands.filter((p) => isShrub(p) && (!wantsEvergreen || isEvergreen(p)) && water(p) !== "high" && (colourIntent ? colourPass(ctx, p.id) : true));

  // K-05: sequence the lead quality season by season.
  use(applied, ctx, "K-05", `The seasonal layer is chosen season by season so that ${lead} appear${colour ? "" : "s"} in as many seasons as the records allow.`);
  const seasonal: PlantRecord[] = [];
  for (const s of SEASONS) {
    const inSeason = cands.filter((p) => flowersIn(p, s) && (colourIntent ? colourPass(ctx, p.id) : true) && pollinatorOk(ctx, p.id));
    const low = inSeason.filter((p) => water(p) === "low");
    const dry = inSeason.filter((p) => water(p) === "moderate" && p.water.dry_tolerant);
    const pick = low.length ? low : dry;
    if (!low.length && dry.length) notes.push(`${cap(s)}: ${lead} rel${colour ? "y" : "ies"} on ${dry.map((p) => p.scientific_name).join(", ")}, which prefer moist soil but tolerate dry spells; this depends on establishment watering.`);
    if (!pick.length) {
      const wet = inSeason.filter((p) => water(p) === "high" || (water(p) === "moderate" && !p.water.dry_tolerant));
      if (wet.length) notes.push(`${cap(s)}: the only ${lead} candidates need moist conditions (${wet.map((p) => p.scientific_name).join(", ")}); excluded unless a small irrigated pocket is accepted.`);
      else if (colourIntent) notes.push(`${cap(s)}: no site-fit record in the knowledge base has ${colour} flowers.`);
    }
    for (const p of pick) if (!seasonal.includes(p) && !structural.includes(p)) seasonal.push(p);
  }
  if (has(ctx, "low_water") && seasonal.some((p) => water(p) === "moderate")) use(applied, ctx, "K-08", "Moist-preferring plants with a sourced dry-tolerance note were allowed on the condition of establishment watering; nothing that needs permanent moisture was.");

  // K-12: close the ground only when maintenance is a stated concern.
  const ground = use(applied, ctx, "K-12", "A dense evergreen ground layer is added to cover soil and reduce weeding.") ? cands.filter((p) => !isShrub(p) && isEvergreen(p) && water(p) !== "high" && !seasonal.includes(p)) : [];

  // K-10: repetition for legibility when a visible display is wanted.
  const massed = use(applied, ctx, "K-10", "Seasonal plants are specified in repeated drifts rather than scattered singles so the display reads from the path.");

  const placements: Placement[] = [
    { role: "structural", label: "Evergreen framework", approach: `${wantsEvergreen ? "Low evergreen" : "Low"} shrubs as a continuous backbone along the bed edge.`, plantIds: structural.map((p) => p.id) },
    { role: "seasonal", label: "Seasonal relay", approach: `${massed ? "Repeated drifts" : "Groups"} of plants sequenced so that at least one carries ${lead} in each season the records allow.`, plantIds: seasonal.map((p) => p.id) },
    { role: "ground", label: "Ground layer", approach: "Evergreen ground layer between the shrubs.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-A",
    name: colour ? `${cap(colour)} relay through the seasons` : "Seasonal relay",
    approach: colour
      ? `Deliver the residents' ${colour} as a season-by-season sequence of site-fit plants with ecological value, instead of one summer display.`
      : `Sequence site-fit plants so that ${lead} continues through the year.`,
    designIntention: `Test whether one quality can carry several seasons while every plant stays within the watering limit.`,
    placements,
    notes,
    applied,
    concept: {
      style: "seasonal",
      caption: "Seasonal drifts in front of an evergreen frame.",
      bands: [
        { role: "seasonal", label: "Seasonal drifts", share: 2, plantIds: seasonal.map((p) => p.id), pattern: "drift" },
        { role: "structural", label: wantsEvergreen ? "Evergreen shrubs" : "Shrub frame", share: 2, plantIds: structural.map((p) => p.id), pattern: "mass" },
        { role: "ground", label: "Ground", share: 1, plantIds: ground.map((p) => p.id), pattern: "ground" },
      ],
    },
  });
}

// --- Strategy B: native framework, lead quality concentrated at thresholds ---
export function strategyNativeFramework(ctx: Ctx): Strategy {
  const applied: AppliedPrinciple[] = [];
  const cands = candidates(ctx);
  applied.push({ id: "K-01", decision: `Only site-fit plants were considered (${cands.length} of ${ctx.plants.length}).` });
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  const colour = colourIntent?.value;
  const natives = cands.filter((p) => isNative(p) && water(p) !== "high");
  const structural = natives.filter((p) => isShrub(p));
  // K-07: when pollinators matter, extend native flowering across the seasons.
  const wantsBloomSpread = use(applied, ctx, "K-07", "Native perennials are chosen to overlap flowering from spring to autumn, in clumps of one species.");
  const seasonal = natives.filter((p) => !isShrub(p) && seasonCount(p) > 0).sort((a, b) => (wantsBloomSpread ? seasonCount(b) - seasonCount(a) : 0));
  const ground = natives.filter((p) => !isShrub(p) && !seasonal.includes(p));
  const notes: string[] = [];

  // K-13 / K-10: colour concentrated where people arrive. K-13 only supports warm colours.
  let accent: PlantRecord[] = [];
  let accentLabel = "";
  let accentApproach = "";
  if (colourIntent) {
    const used = new Set([...structural, ...seasonal].map((p) => p.id));
    accent = cands
      .filter((p) => colourPass(ctx, p.id) && water(p) !== "high" && !seasonal.includes(p))
      .sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)) || waterRank(a) - waterRank(b) || seasonCount(b) - seasonCount(a))
      .slice(0, 2);
    if (accent.length) {
      const warm = WARM.test(colour ?? "");
      if (warm) use(applied, ctx, "K-13", `${cap(colour!)} is a warm colour that advances and draws the eye, so a small massed quantity at the entrances can read as "lots of ${colour}".`);
      else notes.push(`${cap(colour!)} is a cool or neutral colour; the source principle on advancing colours (K-13) does not support it, so the threshold accent relies on massing alone and may read as less than "lots".`);
      use(applied, ctx, "K-10", `${cap(colour!)} plants are massed and repeated at the thresholds rather than spread thinly.`);
      accentLabel = `${cap(colour!)} at the threshold`;
      accentApproach = `Massed ${colour} concentrated where people enter and look first.`;
      const nonNative = accent.filter((p) => !isNative(p));
      if (nonNative.length) notes.push(`Accent plants ${nonNative.map((p) => p.scientific_name).join(", ")} are not recorded as native; they are confined to the threshold drifts.`);
      if (accent.some((p) => water(p) === "moderate")) use(applied, ctx, "K-08", `${accent.filter((p) => water(p) === "moderate").map((p) => p.scientific_name).join(", ")} prefer moist soil but tolerate dry spells per source; accepted on the condition of establishment watering.`);
    } else notes.push(`No site-fit record has ${colour} flowers, so this strategy cannot offer a ${colour} accent; the residents' colour goal is unmet with the current records.`);
  }
  // K-14 / K-15: zoning as the reconciling move.
  use(applied, ctx, "K-14", "The bed is zoned: the most looked-after, most visible planting sits at the entrances; the native body is managed more lightly.");
  use(applied, ctx, "K-15", "Working hypothesis applied: ornamental, ecological and maintenance goals are reconciled by giving each its own zone rather than diluting all three everywhere.");

  const placements: Placement[] = [
    { role: "structural", label: "Native shrub framework", approach: "Regionally native shrubs form the main body and the year-round habitat structure.", plantIds: structural.map((p) => p.id) },
    { role: "seasonal", label: "Native pollinator layer", approach: wantsBloomSpread ? "Native perennials in single-species clumps, overlapping their flowering." : "Native perennials in clumps.", plantIds: seasonal.map((p) => p.id) },
    { role: "accent", label: accentLabel || "Threshold accent", approach: accentApproach || "No accent possible from the current records.", plantIds: accent.map((p) => p.id) },
    { role: "ground", label: "Native ground layer", approach: "Evergreen native ground layer.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-B",
    name: colour && accent.length ? `Native framework, ${colour} at the threshold` : "Native framework",
    approach:
      colour && accent.length
        ? `Build the bed from native plants for habitat and structure, and meet the request for visible ${colour} by concentrating it where people arrive instead of everywhere.`
        : "Build the bed from native plants for habitat and year-round structure, managed lightly.",
    designIntention: "Test whether concentrating the ornamental goal at thresholds satisfies it with fewer ornamental plants.",
    placements,
    notes,
    applied,
    concept: {
      style: "native",
      caption: "Native body with the accent gathered at the threshold.",
      bands: [
        { role: "accent", label: colour && accent.length ? `${cap(colour)} accent` : "Threshold", share: 1, plantIds: accent.map((p) => p.id), pattern: "accent" },
        { role: "structural", label: "Native shrubs", share: 3, plantIds: structural.map((p) => p.id), pattern: "mass" },
        { role: "seasonal", label: "Pollinator clumps", share: 1, plantIds: seasonal.map((p) => p.id), pattern: "drift" },
        { role: "ground", label: "Ground", share: 1, plantIds: ground.map((p) => p.id), pattern: "ground" },
      ],
    },
  });
}

// --- Strategy C: low-input structure ----------------------------------------
export function strategyLowInput(ctx: Ctx): Strategy {
  const applied: AppliedPrinciple[] = [];
  applied.push({ id: "K-01", decision: "Only site-fit plants were considered." });
  // K-11: plant choice drives maintenance load. Exclude anything whose source records staking, aggressive spread or short lifespan.
  const excludeHeavy = use(applied, ctx, "K-11", "Plants whose sources record staking, aggressive spread, deadheading or short lifespan were excluded, and the herbaceous perennial layer (annual cut-back, division) was designed out.");
  const cands = candidates(ctx).filter((p) => (water(p) === "low" || (water(p) === "moderate" && p.water.dry_tolerant)) && (!excludeHeavy || (!heavyMaintenance(ctx, p.id) && status(ctx, p.id, "low_replacement") !== "fail")));
  if (cands.some((p) => water(p) === "moderate")) use(applied, ctx, "K-08", "Moist-preferring plants with a sourced dry-tolerance note were accepted on the condition of one to three seasons of establishment watering.");
  const shrubs = cands.filter((p) => isShrub(p)).sort((a, b) => Number(isEvergreen(b)) - Number(isEvergreen(a)) || waterRank(a) - waterRank(b));
  // K-02 + K-10: fewest species, planted at mature spacing in large groups.
  const MAX_SPECIES = 3;
  use(applied, ctx, "K-02", `Species are planted at their sourced mature spread, so fewer plants fill the bed without later thinning.`);
  const chosen: PlantRecord[] = [];
  const covered = new Set<Season>();
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
  const perennials = excludeHeavy ? candidates(ctx).filter((p) => !isShrub(p) && !isEvergreen(p) && water(p) !== "high") : [];
  const structural = chosen.filter(isEvergreen);
  const deciduous = chosen.filter((p) => !isEvergreen(p));
  const notes: string[] = [];
  if (omitted.length) notes.push(`Omitted to keep the species count at ${MAX_SPECIES}: ${omitted.map((p) => p.scientific_name).join(", ")} (their flowering seasons were already covered).`);
  if (perennials.length) notes.push(`No herbaceous perennial layer: ${perennials.map((p) => p.scientific_name).join(", ")} would add colour but need annual cut-back or periodic division.`);
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");
  if (colourIntent) {
    const colourSeasons = SEASONS.filter((s) => chosen.some((p) => flowersIn(p, s) && colourPass(ctx, p.id)));
    const missing = SEASONS.filter((s) => !colourSeasons.includes(s));
    if (missing.length) notes.push(`${cap(colourIntent.value ?? "colour")} is absent in ${missing.join(", ")} under the shrub-only, low-input filter.`);
  }
  const placements: Placement[] = [
    { role: "structural", label: "Evergreen shrub mass", approach: "Few species in large groups at mature spacing; evergreen mass carries the bed through winter.", plantIds: structural.map((p) => p.id) },
    { role: "structural", label: "Deciduous native shrub", approach: "One long-lived deciduous shrub that adds a flowering season the evergreens lack.", plantIds: deciduous.map((p) => p.id) },
    { role: "ground", label: "Closed ground layer", approach: "Dense evergreen ground layer so weeding stays minimal.", plantIds: ground.map((p) => p.id) },
  ];
  return finish(ctx, {
    id: "S-C",
    name: "Low-input evergreen structure",
    approach: "Design the maintenance out first: shrubs only, at most three species in large groups, nothing that needs staking, dividing or replanting; then see how much colour and habitat survive.",
    designIntention: "Test how much of the other goals survive when maintenance leads.",
    placements,
    notes,
    applied,
    concept: {
      style: "lowinput",
      caption: "Few species in large single groups.",
      bands: [
        { role: "structural", label: "Evergreen mass", share: 3, plantIds: structural.map((p) => p.id), pattern: "mass" },
        { role: "structural", label: "Deciduous shrub", share: 2, plantIds: deciduous.map((p) => p.id), pattern: "mass" },
        { role: "ground", label: "Ground", share: 1, plantIds: ground.map((p) => p.id), pattern: "ground" },
      ],
    },
  });
}

export function generateStrategies(ctx: Ctx): Strategy[] {
  return [strategySeasonalRelay(ctx), strategyNativeFramework(ctx), strategyLowInput(ctx)].filter((s) => s.placements.some((p) => p.plantIds.length > 0));
}

// --- Shared: compute outcomes, trade-offs, coverage ------------------------

export interface Draft {
  id: string;
  name: string;
  approach: string;
  designIntention: string;
  placements: Placement[];
  notes: string[];
  applied: AppliedPrinciple[];
  concept: ConceptDiagram;
}

export function finish(ctx: Ctx, d: Draft, version = 1, revisionLog: Strategy["revisionLog"] = []): Strategy {
  const ids = [...new Set(d.placements.flatMap((p) => p.plantIds))];
  const plants = ids.map((id) => plant(ctx, id));
  const coverage = Object.fromEntries(SEASONS.map((s) => [s, plants.filter((p) => flowersIn(p, s)).map((p) => p.id)])) as Record<Season, string[]>;
  const outcomes = ctx.intentions.map((i) => outcomeFor(ctx, i, plants));
  const lbl = (id: string) => shortLabel(ctx.intentions.find((i) => i.id === id)!);
  const tradeOffs = [
    ...d.notes,
    ...outcomes.filter((o) => o.status === "unmet" || o.status === "partially_satisfied").map((o) => `${cap(lbl(o.intentionId))}: ${o.reason}`),
    ...plants.flatMap((p) => (p.cautions.value === "unknown" ? [] : p.cautions.value.filter((c) => /toxic|poison|spread|aggressive|stak|spin|thorn|dermatitis|short/i.test(c)).map((c) => `${p.scientific_name}: ${c}`))),
  ];
  const unresolved = [
    ...ctx.openQuestions.filter((q) => q.blocks.some((b) => ids.includes(b)) || q.id.startsWith("Q-light") || q.id.startsWith("Q-area")).map((q) => q.question),
    ...outcomes.filter((o) => o.status === "unknown").map((o) => `${cap(lbl(o.intentionId))}: ${o.reason}`),
  ];
  const benefits = outcomes.filter((o) => o.status === "satisfied").map((o) => cap(lbl(o.intentionId)));
  const worst = outcomes.find((o) => o.status === "unmet") ?? outcomes.find((o) => o.status === "partially_satisfied");
  const mainTradeOff = worst ? `${cap(lbl(worst.intentionId))} ${worst.status === "unmet" ? "is not met" : "is only partly met"}: ${worst.reason}` : d.notes[0] ?? "No requirement is left unmet by the current records; site unknowns remain.";
  const concept = { ...d.concept, bands: d.concept.bands.filter((b) => b.plantIds.length > 0 || b.pattern === "accent") };
  return {
    id: d.id,
    version,
    name: d.name,
    approach: d.approach,
    designIntention: d.designIntention,
    benefits,
    mainTradeOff,
    appliedPrinciples: d.applied,
    concept,
    placements: d.placements.filter((p) => p.plantIds.length > 0),
    requirementOutcomes: outcomes,
    tradeOffs: [...new Set(tradeOffs)],
    principleIds: [...new Set(d.applied.map((a) => a.id))],
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
      return { ...base, status, reason: seasons.length ? `${passing.length} plant(s) supply it in ${seasons.join(", ")}${i.kind === "flower_abundance" ? "; quantity needs a bed area" : ""}.` : "no plant in this strategy supplies it." };
    }
    case "pollinator_support": {
      const seasons = SEASONS.filter((s) => passing.some((p) => flowersIn(p, s)));
      const status = seasons.length >= 3 ? "satisfied" : seasons.length >= 1 ? "partially_satisfied" : unknown.length ? "unknown" : "unmet";
      return { ...base, status, reason: `sourced value from ${passing.length} plant(s) across ${seasons.join(", ") || "no season"}${unknown.length ? `; unverified for ${names(unknown)}` : ""}.` };
    }
    case "seasonal_continuity": {
      const covered = SEASONS.filter((s) => plants.some((p) => flowersIn(p, s) || (s === "winter" && p.evergreen.value === true)));
      const status = covered.length === 4 ? "satisfied" : covered.length >= 3 ? "partially_satisfied" : "unmet";
      return { ...base, supportingPlantIds: plants.map((p) => p.id), status, reason: `flower or evergreen interest in ${covered.join(", ")}.` };
    }
    case "native_preference": {
      const share = plants.length ? passing.length / plants.length : 0;
      const status = share >= 0.6 ? "satisfied" : share >= 0.3 ? "partially_satisfied" : "unmet";
      return { ...base, status, reason: `${passing.length} of ${plants.length} plants recorded as regionally native${unknown.length ? `; ${names(unknown)} unverified` : ""}.` };
    }
    case "low_water": {
      const status = failing.length ? "unmet" : unknown.length ? "partially_satisfied" : "satisfied";
      return { ...base, status, reason: failing.length ? `${names(failing)} need(s) moist conditions.` : unknown.length ? `${names(unknown)} prefer moist soil but tolerate dry spells; depends on establishment watering.` : "every plant has a low water need once established." };
    }
    case "low_replacement":
    case "low_maintenance":
    case "safety_or_toxicity": {
      const status = failing.length ? "partially_satisfied" : unknown.length === plants.length ? "unknown" : "satisfied";
      return { ...base, status, reason: failing.length ? `flagged by source: ${names(failing)}.` : unknown.length ? `not stated in source for ${names(unknown)}.` : "no flags in the cited sources." };
    }
    case "winter_interest":
      return { ...base, status: passing.length ? "satisfied" : "unmet", reason: passing.length ? `evergreen or winter-flowering: ${names(passing)}.` : "no evergreen or winter-flowering plant." };
    case "shade_tolerance":
      return { ...base, status: failing.length ? "partially_satisfied" : "satisfied", reason: failing.length ? `${names(failing)} need full sun.` : "all plants tolerate partial shade per sources." };
    default:
      return { ...base, status: "unknown", reason: "design judgement; addressed by the composition, not verifiable from plant data." };
  }
}

export type { LayerRole };
