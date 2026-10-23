import type { PlantRecord, Season, SourcedField, Water } from "../types.ts";

// Normalisation of the verified research JSON onto the engine vocabulary (see index.ts).

export type Raw = Record<string, any>;

function waterFrom(raw: Raw): PlantRecord["water"] {
  const v: string = String(raw.water?.value ?? "unknown");
  const lower = v.toLowerCase();
  let value: Water = "unknown";
  if (lower.startsWith("low")) value = "low";
  else if (lower.startsWith("moderate")) value = "moderate";
  else if (lower.startsWith("high") || lower.startsWith("moist_to_wet") || lower.startsWith("moist to wet")) value = "high";
  // Dry tolerance: the source itself says the plant tolerates dry spells.
  // Prefer the most explicit statement of dry tolerance, then weaker habitat wording.
  const dryMatch =
    v.match(/[^.;']*once established[^.;']*drought[- ]tolerant[^.;']*|drought[- ]tolerant[^.;']*|tolerant of dry[^.;']*/i) ??
    v.match(/mesic to dry[^.;']*|moist to dry[^.;']*|occasionally dry/i);
  return {
    value,
    source: raw.water?.source,
    wording: v.replace(/^(low|moderate|high|moist_to_wet)\s*(\([^)]*\))?\s*-\s*/i, "").trim(),
    dry_tolerant: value === "moderate" ? Boolean(dryMatch) : undefined,
    dry_tolerant_evidence: dryMatch ? dryMatch[0] : undefined,
  };
}

function seasonsFrom(raw: Raw): SourcedField<Season[]> {
  const v = raw.flowering_season?.value;
  if (v === "unknown" || v == null) return { value: "unknown", source: raw.flowering_season?.source, note: raw.flowering_season?.note };
  const map: Record<string, Season> = { winter: "winter", spring: "spring", summer: "summer", fall: "autumn", autumn: "autumn", early_spring: "spring", late_winter: "winter" };
  const seasons = [...new Set((v as string[]).map((s) => map[s.toLowerCase()]).filter(Boolean))] as Season[];
  return { value: seasons, source: raw.flowering_season?.source, note: raw.flowering_season?.note };
}

function pollinatorFrom(raw: Raw): SourcedField<boolean> {
  const v = raw.ecological_value?.value;
  if (v === "unknown" || v == null) return { value: "unknown", source: raw.ecological_value?.source };
  const yes = /pollinator|bees?\b|butterfl|hummingbird|birds?\b|wildlife|beneficial insects|moths?/i.test(String(v));
  return { value: yes, source: raw.ecological_value?.source, note: "Derived by keyword rule from the quoted ecological_value text." };
}

function field<T>(f: any): SourcedField<T> {
  if (f == null) return { value: "unknown" };
  return { value: f.value ?? "unknown", source: f.source, note: f.note };
}

export function normalisePlant(raw: Raw): PlantRecord {
  return {
    id: raw.id,
    scientific_name: String(raw.scientific_name).replace(/\s*\((syn\.|NCSU)[^)]*\)\s*/g, "").trim(),
    common_name: raw.common_name,
    type: raw.type,
    mature_height_m: field(raw.mature_height_m),
    mature_spread_m: field(raw.mature_spread_m),
    light: field(raw.light),
    soil: field(raw.soil),
    water: waterFrom(raw),
    flower_colour: field(raw.flower_colour),
    flowering_season: seasonsFrom(raw),
    growth_habit: field(raw.growth_habit),
    evergreen: field(raw.evergreen),
    ecological_value: field(raw.ecological_value),
    pollinator_evidence: pollinatorFrom(raw),
    native_to_pnw_bc: field(raw.native_to_pnw_bc),
    maintenance: field(raw.maintenance),
    cautions: field(raw.cautions),
    regional_suitability: field(raw.regional_suitability),
    sources: raw.sources ?? [],
    missing_information: raw.missing_information ?? [],
  };
}

