import type { Adjustment, PlantRecord, RevisionEntry, Season, Strategy } from "../types.ts";
import { SEASONS } from "../types.ts";
import { flowersIn } from "./validate.ts";
import { finish, type Ctx } from "./strategies.ts";

// ---------------------------------------------------------------------------
// REVISION OPERATORS.
// Human feedback is interpreted into adjustments (by the LLM online, or by the
// rule parser offline). Each adjustment is applied as an explicit operator over
// the strategy's plant set, then the strategy is re-validated. The diff and the
// reasons are recorded as a new version.
// ---------------------------------------------------------------------------

const status = (ctx: Ctx, pid: string, kind: string) => {
  const intention = ctx.intentions.find((i) => i.kind === kind);
  if (!intention) return "not_applicable";
  return ctx.evaluations.find((e) => e.plantId === pid)?.checks.find((c) => c.intentionId === intention.id)?.status ?? "not_applicable";
};

export function applyAdjustments(ctx: Ctx, strategy: Strategy, feedback: string, adjustments: Adjustment[]): Strategy {
  const plants = ctx.plants;
  const byId = (id: string) => plants.find((p) => p.id === id)!;
  const current = new Set(strategy.placements.flatMap((p) => p.plantIds));
  const removed: RevisionEntry["removed"] = [];
  const added: RevisionEntry["added"] = [];
  const explanation: string[] = [];
  const placements = strategy.placements.map((p) => ({ ...p, plantIds: [...p.plantIds] }));
  const siteFitOk = (id: string) => (ctx.evaluations.find((e) => e.plantId === id)?.siteFit ?? "unknown") !== "fail";
  const colourIntent = ctx.intentions.find((i) => i.kind === "flower_colour");

  const remove = (id: string, reason: string) => {
    if (!current.has(id)) return;
    current.delete(id);
    for (const p of placements) p.plantIds = p.plantIds.filter((x) => x !== id);
    removed.push({ plantId: id, reason });
  };
  const add = (id: string, role: Strategy["placements"][number]["role"], reason: string) => {
    if (current.has(id)) return false;
    current.add(id);
    const target = placements.find((p) => p.role === role) ?? placements[placements.length - 1];
    target.plantIds.push(id);
    added.push({ plantId: id, reason });
    return true;
  };
  const roleFor = (p: PlantRecord): Strategy["placements"][number]["role"] => (/shrub|tree/i.test(p.type) ? (p.evergreen.value === true ? "structural" : "structural") : p.evergreen.value === true && p.flowering_season.value !== "unknown" && p.flowering_season.value.length === 0 ? "ground" : "seasonal");

  // Fill a season gap with the best alternative satisfying the given filter.
  const fillSeason = (season: Season, filter: (p: PlantRecord) => boolean, reason: string) => {
    const options = plants.filter((p) => !current.has(p.id) && siteFitOk(p.id) && flowersIn(p, season) && filter(p));
    if (!options.length) {
      // Knowledge-driven hint: plants that pass every filter except the assumed site light.
      const ifSunnier = plants.filter((p) => !current.has(p.id) && flowersIn(p, season) && filter(p) && (ctx.evaluations.find((e) => e.plantId === p.id)?.site.light.status === "fail") && (ctx.evaluations.find((e) => e.plantId === p.id)?.site.water.status !== "fail"));
      if (ifSunnier.length) explanation.push(`${season}: ${ifSunnier.map((p) => `${p.scientific_name} (${p.light.value === "unknown" ? "light unknown" : (p.light.value as string[]).join("/")})`).join(", ")} would pass every filter if the bed is sunnier than assumed. Confirming the actual light could close this gap.`);
      return false;
    }
    // prefer low water, then native, then more seasons
    options.sort((a, b) => rank(a) - rank(b));
    const pick = options[0];
    return add(pick.id, roleFor(pick), `${reason} (${season}): ${pick.scientific_name}.`);
  };
  const rank = (p: PlantRecord) => (p.water.value === "low" ? 0 : p.water.value === "moderate" ? 1 : 2) * 10 + (p.native_to_pnw_bc.value === true ? 0 : 1) * 3 + (status(ctx, p.id, "low_maintenance") === "fail" ? 2 : 0);

  const kinds = new Set(adjustments.map((a) => a.kind));
  const wantsColourFilter = (p: PlantRecord) => !colourIntent || status(ctx, p.id, "flower_colour") === "pass";

  if (kinds.has("reduce_water")) {
    const keepColour = kinds.has("keep_summer_colour") || kinds.has("more_summer_colour");
    for (const id of [...current]) {
      const p = byId(id);
      if (p.water.value === "high") remove(id, `Needs moist to wet conditions per source; removed to reduce watering.`);
      else if (p.water.value === "moderate") {
        // A moist-preferring plant whose source records tolerance of dry spells may be kept as the
        // one conditional plant when it is the only source of a colour season the reviewer asked to keep.
        const onlyColourIn = SEASONS.filter((s) => flowersIn(p, s) && wantsColourFilter(p) && ![...current].some((o) => o !== id && flowersIn(byId(o), s) && wantsColourFilter(byId(o))));
        if (keepColour && p.water.dry_tolerant && onlyColourIn.length) {
          explanation.push(`Kept ${p.scientific_name} conditionally: it is the only ${colourIntent?.value ?? "colour"} source in ${onlyColourIn.join("/")}, and its source states "${p.water.dry_tolerant_evidence}". This relies on establishment watering only; it is a trade-off for the reviewer to accept or reject.`);
        } else remove(id, `Prefers moist soil per source${p.water.dry_tolerant ? " (tolerates dry spells only)" : ""}; removed so that nothing depends on irrigation.`);
      }
    }
    explanation.push("Applied: tightened the water filter (source field: water); low-water plants kept, moist-dependent plants removed.");
  }
  if (kinds.has("less_maintenance")) {
    for (const id of [...current]) if (status(ctx, id, "low_maintenance") === "fail" || status(ctx, id, "low_replacement") === "fail") remove(id, "Source notes staking, aggressive spread or short lifespan; removed to lower maintenance.");
    explanation.push("Applied: removed plants whose sources note staking, aggressive spread or short lifespan (field: maintenance/cautions).");
  }
  if (kinds.has("avoid_toxic")) {
    for (const id of [...current]) if (status(ctx, id, "safety_or_toxicity") === "fail" || (byId(id).cautions.value !== "unknown" && (byId(id).cautions.value as string[]).some((c) => /toxic|poison|spin|thorn|dermatitis/i.test(c)))) remove(id, "Source carries a toxicity, spine or dermatitis caution.");
    explanation.push("Applied: removed plants with toxicity or hazard cautions (field: cautions).");
  }
  for (const a of adjustments.filter((x) => x.kind === "remove_plant" && x.plantId)) {
    remove(a.plantId!, `Removed at the reviewer's request ("${a.evidence}").`);
    explanation.push(`Applied: removed ${byId(a.plantId!).scientific_name} as requested.`);
  }
  if (kinds.has("more_native")) {
    for (const id of [...current]) {
      const p = byId(id);
      if (p.native_to_pnw_bc.value === false) {
        // only remove if a native alternative exists for at least one of its seasons
        const seasons = p.flowering_season.value === "unknown" ? [] : p.flowering_season.value;
        const alt = plants.find((q) => !current.has(q.id) && q.native_to_pnw_bc.value === true && siteFitOk(q.id) && seasons.some((s) => flowersIn(q, s)) && q.water.value !== "high");
        if (alt) {
          remove(id, `Not recorded as native; a native alternative exists for ${seasons.join("/")}.`);
          add(alt.id, roleFor(alt), `Native alternative covering ${seasons.filter((s) => flowersIn(alt, s)).join("/")}: ${alt.scientific_name}.`);
        }
      }
    }
    explanation.push("Applied: swapped non-native plants for native ones where a season-matching native exists (field: native_to_pnw_bc).");
  }

  // Re-fill gaps according to what the reviewer asked to keep or add.
  const lowWaterOnly = kinds.has("reduce_water");
  const waterFilter = (p: PlantRecord) => (lowWaterOnly ? p.water.value === "low" : p.water.value !== "high");
  const maintenanceFilter = (p: PlantRecord) => (kinds.has("less_maintenance") ? status(ctx, p.id, "low_maintenance") !== "fail" : true);
  const nativeFilter = (p: PlantRecord) => (kinds.has("more_native") ? p.native_to_pnw_bc.value === true : true);
  const combined = (p: PlantRecord) => waterFilter(p) && maintenanceFilter(p) && nativeFilter(p);

  if (kinds.has("keep_summer_colour") || kinds.has("more_summer_colour")) {
    const summerColour = [...current].some((id) => flowersIn(byId(id), "summer") && wantsColourFilter(byId(id)));
    if (!summerColour || kinds.has("more_summer_colour")) {
      const ok = fillSeason("summer", (p) => wantsColourFilter(p) && combined(p), "Restored summer colour with a plant that passes the new filters");
      if (!ok) explanation.push("No further low-water, site-fit plant in the knowledge base flowers in summer in the preferred colour: the summer colour gap remains and is reported as a trade-off.");
      else explanation.push("Applied: refilled summer with a colour-matching plant that passes the tightened filters.");
    } else explanation.push("Summer colour is still present after the changes; no refill needed.");
  }
  if (kinds.has("more_colour")) {
    for (const s of SEASONS) if (![...current].some((id) => flowersIn(byId(id), s) && wantsColourFilter(byId(id)))) fillSeason(s, (p) => wantsColourFilter(p) && combined(p), "Added colour");
    explanation.push("Applied: added colour-matching plants for seasons without any.");
  }
  if (kinds.has("more_winter_interest")) {
    const opts = plants.filter((p) => !current.has(p.id) && siteFitOk(p.id) && combined(p) && (p.evergreen.value === true || flowersIn(p, "winter"))).sort((a, b) => rank(a) - rank(b));
    if (opts[0]) add(opts[0].id, roleFor(opts[0]), `Winter interest: ${opts[0].scientific_name} (${opts[0].evergreen.value === true ? "evergreen" : "winter flowering"}).`);
    explanation.push("Applied: added an evergreen or winter-flowering plant.");
  }
  // After removals, check whether any season lost all flowering and try to refill within the filters.
  for (const s of SEASONS) {
    const hadBefore = strategy.seasonCoverage[s].length > 0;
    const hasNow = [...current].some((id) => flowersIn(byId(id), s));
    if (hadBefore && !hasNow) {
      const ok = fillSeason(s, (p) => combined(p) && (wantsColourFilter(p) || true), "Season lost all flowering after removals; refilled within the new filters");
      if (!ok) explanation.push(`${s}: no plant that passes the new filters flowers in this season; the gap is recorded as a trade-off.`);
    }
  }
  if (kinds.has("unknown") && adjustments.length === 1) explanation.push("The feedback did not match any revision operator. Nothing was changed; please rephrase or edit the stakeholder statements.");

  const kept = [...current].filter((id) => !added.some((a) => a.plantId === id));
  const entry: RevisionEntry = {
    version: strategy.version + 1,
    timestamp: new Date().toISOString(),
    feedback,
    adjustments,
    removed,
    added,
    kept,
    explanation: [...new Set(explanation)],
  };
  const applied = [...strategy.appliedPrinciples];
  if (kinds.has("reduce_water") && explanation.some((e) => e.includes("conditionally"))) applied.push({ id: "K-08", decision: "Revision: a moist-preferring plant with a sourced dry-tolerance note was kept on the condition of establishment watering instead of being removed." });
  if (kinds.has("less_maintenance")) applied.push({ id: "K-11", decision: "Revision: plants whose sources record staking, aggressive spread or short lifespan were removed." });
  const concept = { ...strategy.concept, bands: strategy.concept.bands.map((b) => ({ ...b, plantIds: b.plantIds.filter((id) => current.has(id)).concat(added.filter((a) => placements.find((p) => p.role === b.role)?.plantIds.includes(a.plantId) && !b.plantIds.includes(a.plantId)).map((a) => a.plantId)) })) };
  const next = finish(
    ctx,
    { id: strategy.id, name: strategy.name, approach: strategy.approach, designIntention: strategy.designIntention, placements, notes: [], applied, concept },
    strategy.version + 1,
    [...strategy.revisionLog, entry],
  );
  return next;
}
