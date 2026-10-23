import type {
  Check,
  CheckStatus,
  Intention,
  PlantEvaluation,
  PlantRecord,
  Season,
  SiteAssumptions,
  SiteCheck,
} from "../types.ts";

// ---------------------------------------------------------------------------
// DETERMINISTIC VALIDATION.
// Everything here is code checking database fields. No model is involved.
// A check returns "unknown" whenever the database field is unknown, so that
// gaps are surfaced rather than papered over.
// ---------------------------------------------------------------------------

export function checkSiteLight(plant: PlantRecord, site: SiteAssumptions): SiteCheck {
  if (site.light.value === "unknown") return { status: "unknown", reason: "Site light is unknown." };
  if (plant.light.value === "unknown") return { status: "unknown", reason: "Light requirement not recorded in source.", source: plant.light.source };
  const ok = plant.light.value.includes(site.light.value);
  return {
    status: ok ? "pass" : "fail",
    reason: ok
      ? `Source lists ${plant.light.value.join("/")}; site assumed ${site.light.value}.`
      : `Source lists ${plant.light.value.join("/")} only; site assumed ${site.light.value}.`,
    source: plant.light.source,
  };
}

export function checkSiteWater(plant: PlantRecord, site: SiteAssumptions): SiteCheck {
  const w = plant.water.value;
  if (w === "unknown") return { status: "unknown", reason: "Water requirement not recorded in source.", source: plant.water.source };
  const irrigation = site.irrigation.value;
  if (irrigation === "unknown") return { status: "unknown", reason: "Irrigation capacity unknown." };
  // establishment_only or none: only low (and, conditionally, moderate) water plants pass.
  if (irrigation === "seasonal") return { status: "pass", reason: `Seasonal irrigation assumed; ${w} water demand can be met.`, source: plant.water.source };
  if (w === "low") return { status: "pass", reason: `Source describes low water need once established (${plant.water.wording ?? "low"}).`, source: plant.water.source };
  if (w === "moderate") {
    if (plant.water.dry_tolerant)
      return {
        status: irrigation === "none" ? "fail" : "unknown",
        reason: `Source prefers moist soil but notes tolerance of dry spells (${plant.water.dry_tolerant_evidence ?? "see source"}); viability after establishment depends on soil and exposure, which are unknown.`,
        source: plant.water.source,
      };
    return {
      status: "fail",
      reason: `Source describes moist conditions with no dry-tolerance note (${plant.water.wording ?? "moderate"}); in a dry Vancouver summer this would depend on irrigation. Inference from the source wording, not a stated fact.`,
      source: plant.water.source,
    };
  }
  return { status: "fail", reason: `Source describes high or moist-to-wet water need (${plant.water.wording ?? "high"}); not sustainable without irrigation.`, source: plant.water.source };
}

function unknown(intentionId: string, field: string, source?: string): Check {
  return { intentionId, status: "unknown", reason: `${field} not recorded in the cited source.`, field, source };
}

export function checkIntention(plant: PlantRecord, intention: Intention): Check {
  const id = intention.id;
  switch (intention.kind) {
    case "flower_colour": {
      if (plant.flower_colour.value === "unknown") return unknown(id, "flower_colour", plant.flower_colour.source);
      const want = (intention.value ?? "").toLowerCase();
      const has = plant.flower_colour.value.some((c) => c.toLowerCase().includes(want));
      return {
        intentionId: id,
        status: has ? "pass" : "fail",
        reason: has ? `Flower colour recorded as ${plant.flower_colour.value.join(", ")}.` : `Flower colour recorded as ${plant.flower_colour.value.join(", ") || "none"}; no ${want}.`,
        field: "flower_colour",
        source: plant.flower_colour.source,
      };
    }
    case "flower_abundance": {
      // Partial: database has no "showiness" field. We can only say whether the plant flowers at all.
      if (plant.flower_colour.value === "unknown") return unknown(id, "flower_colour", plant.flower_colour.source);
      const flowers = plant.flower_colour.value.length > 0;
      return {
        intentionId: id,
        status: flowers ? "pass" : "fail",
        reason: flowers ? "Flowering plant; display intensity is not a database field and needs design judgement." : "Grown for foliage, not flowers.",
        field: "flower_colour",
        source: plant.flower_colour.source,
      };
    }
    case "pollinator_support": {
      if (plant.pollinator_evidence.value === "unknown") return unknown(id, "ecological_value", plant.ecological_value.source);
      return {
        intentionId: id,
        status: plant.pollinator_evidence.value ? "pass" : "fail",
        reason: plant.pollinator_evidence.value
          ? `Source states ecological value: ${truncate(String(plant.ecological_value.value), 110)}`
          : "Source does not state pollinator or wildlife value.",
        field: "ecological_value",
        source: plant.ecological_value.source,
      };
    }
    case "seasonal_continuity": {
      if (plant.flowering_season.value === "unknown") return unknown(id, "flowering_season", plant.flowering_season.source);
      return {
        intentionId: id,
        status: "pass",
        reason: `Contributes ${plant.flowering_season.value.join(", ")} flowering${plant.evergreen.value === true ? " and evergreen winter structure" : ""}; continuity is judged across the whole composition.`,
        field: "flowering_season",
        source: plant.flowering_season.source,
      };
    }
    case "native_preference": {
      if (plant.native_to_pnw_bc.value === "unknown") return unknown(id, "native_to_pnw_bc", plant.native_to_pnw_bc.source);
      return {
        intentionId: id,
        status: plant.native_to_pnw_bc.value ? "pass" : "fail",
        reason: plant.native_to_pnw_bc.value ? `Source records the species as native to the region (${plant.native_to_pnw_bc.note ?? ""}).` : "Source does not record the species as native to the Pacific Northwest.",
        field: "native_to_pnw_bc",
        source: plant.native_to_pnw_bc.source,
      };
    }
    case "low_water": {
      const w = plant.water.value;
      if (w === "unknown") return unknown(id, "water", plant.water.source);
      const status: CheckStatus = w === "low" ? "pass" : w === "moderate" ? (plant.water.dry_tolerant ? "unknown" : "fail") : "fail";
      return {
        intentionId: id,
        status,
        reason:
          status === "pass"
            ? `Low water need once established (source wording: ${plant.water.wording ?? "low"}).`
            : status === "unknown"
              ? `Prefers moist soil but tolerates dry spells (${plant.water.dry_tolerant_evidence ?? "see source"}); depends on soil and establishment watering.`
              : w === "moderate"
                ? `Source describes moist conditions with no dry-tolerance note (${plant.water.wording ?? "moderate"}).`
                : `High water need (source wording: ${plant.water.wording ?? "high"}).`,
        field: "water",
        source: plant.water.source,
      };
    }
    case "low_replacement": {
      const m = String(plant.maintenance.value);
      if (plant.maintenance.value === "unknown") return unknown(id, "maintenance", plant.maintenance.source);
      const shortLived = /short[- ]lived|biennial|self[- ]?seed|reseed|replant/i.test(m) || /short[- ]lived|biennial/i.test(plant.cautions.value === "unknown" ? "" : plant.cautions.value.join(" "));
      return {
        intentionId: id,
        status: shortLived ? "fail" : "pass",
        reason: shortLived ? `Source notes short lifespan or reliance on self-seeding: ${truncate(m, 100)}` : `No short-lifespan note in source; longevity on this site is still unverified.`,
        field: "maintenance",
        source: plant.maintenance.source,
      };
    }
    case "low_maintenance": {
      if (plant.maintenance.value === "unknown") return unknown(id, "maintenance", plant.maintenance.source);
      const m = String(plant.maintenance.value) + " " + (plant.cautions.value === "unknown" ? "" : plant.cautions.value.join(" "));
      const heavy = /stak(e|ing)|aggressive|spreads? (rapidly|aggressively|vigorously)|invasive|deadhead|frequent pruning|suckers?/i.test(m);
      return {
        intentionId: id,
        status: heavy ? "fail" : "pass",
        reason: heavy ? `Source notes maintenance demands: ${truncate(String(plant.maintenance.value), 110)}` : `Source notes: ${truncate(String(plant.maintenance.value), 110)}`,
        field: "maintenance",
        source: plant.maintenance.source,
      };
    }
    case "winter_interest": {
      if (plant.evergreen.value === "unknown" && plant.flowering_season.value === "unknown") return unknown(id, "evergreen", plant.evergreen.source);
      const winter = plant.evergreen.value === true || (plant.flowering_season.value !== "unknown" && plant.flowering_season.value.includes("winter"));
      return {
        intentionId: id,
        status: winter ? "pass" : "fail",
        reason: winter ? (plant.evergreen.value === true ? "Evergreen foliage recorded." : "Winter flowering recorded.") : "Deciduous or herbaceous; no winter interest recorded.",
        field: "evergreen",
        source: plant.evergreen.source ?? plant.flowering_season.source,
      };
    }
    case "shade_tolerance": {
      if (plant.light.value === "unknown") return unknown(id, "light", plant.light.source);
      const ok = plant.light.value.includes("partial_shade") || plant.light.value.includes("shade");
      return { intentionId: id, status: ok ? "pass" : "fail", reason: `Light recorded as ${plant.light.value.join("/")}.`, field: "light", source: plant.light.source };
    }
    case "safety_or_toxicity": {
      if (plant.cautions.value === "unknown") return unknown(id, "cautions", plant.cautions.source);
      const hazard = plant.cautions.value.some((c) => /toxic|poison|spin|thorn|dermatitis/i.test(c));
      return {
        intentionId: id,
        status: hazard ? "fail" : "pass",
        reason: hazard ? `Source cautions: ${plant.cautions.value.filter((c) => /toxic|poison|spin|thorn|dermatitis/i.test(c)).join("; ")}` : "No toxicity or spine caution in source (absence of a note is not proof of safety).",
        field: "cautions",
        source: plant.cautions.source,
      };
    }
    default:
      return { intentionId: id, status: "not_applicable", reason: "Design judgement; not checkable against plant attributes." };
  }
}

export function evaluatePlant(plant: PlantRecord, intentions: Intention[], site: SiteAssumptions): PlantEvaluation {
  const light = checkSiteLight(plant, site);
  const water = checkSiteWater(plant, site);
  const siteFit: CheckStatus = light.status === "fail" || water.status === "fail" ? "fail" : light.status === "unknown" || water.status === "unknown" ? "unknown" : "pass";
  return {
    plantId: plant.id,
    site: { light, water },
    siteFit,
    checks: intentions.map((i) => checkIntention(plant, i)),
  };
}

export function evaluateAll(plants: PlantRecord[], intentions: Intention[], site: SiteAssumptions): PlantEvaluation[] {
  return plants.map((p) => evaluatePlant(p, intentions, site));
}

export function flowersIn(plant: PlantRecord, season: Season): boolean {
  return plant.flowering_season.value !== "unknown" && plant.flowering_season.value.includes(season);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}
