import verified from "./plants.verified.json";
import principlesJson from "./principles.json";
import type { DesignPrinciple, PlantRecord } from "../types.ts";
import { normalisePlant, type Raw } from "./normalise.ts";

// ---------------------------------------------------------------------------
// KNOWLEDGE LOADING.
// plants.verified.json is the research record: every field quotes the fetched
// source page. normalise.ts maps the quoted wording onto the controlled
// vocabulary the engine checks, using visible rules, and keeps the raw wording
// alongside so the interface can show both. Derivations are code, not model.
// ---------------------------------------------------------------------------

export { normalisePlant };
export const PLANTS: PlantRecord[] = (verified as Raw[]).map(normalisePlant);
export const PRINCIPLES = principlesJson as unknown as DesignPrinciple[];

export function plantById(id: string): PlantRecord | undefined {
  return PLANTS.find((p) => p.id === id);
}
export function principleById(id: string): DesignPrinciple | undefined {
  return PRINCIPLES.find((p) => p.id === id);
}
export function plantNameIndex(): { id: string; names: string[] }[] {
  return PLANTS.map((p) => ({ id: p.id, names: [p.scientific_name, p.common_name, p.scientific_name.split(" ")[0]] }));
}
