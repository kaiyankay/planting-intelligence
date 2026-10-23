import type { SiteAssumptions } from "../types.ts";

// SYNTHETIC SITE ASSUMPTIONS.
// East Park (Southeast False Creek, Vancouver) is used only as a design-context
// reference. None of the values below were measured or taken from City of
// Vancouver documents. They exist so that the engine has conditions to check.
// Every field carries its provenance and can be edited in the interface.
export const DEFAULT_SITE: SiteAssumptions = {
  name: "Synthetic test bed",
  context_reference:
    "Design-context reference only: East Park, Southeast False Creek, Vancouver (City of Vancouver project page: https://www.shapeyourcity.ca/east-park). Stakeholder statements are synthetic roles, not consultation records.",
  disclaimer:
    "All site values are synthetic assumptions or unknown. They are not survey data and must be confirmed before any design decision.",
  light: {
    value: "partial_shade",
    provenance: "synthetic_assumption",
    note: "Assumed partial shade for the test bed. Real exposure depends on bed location and adjacent buildings; not measured.",
  },
  drainage: {
    value: "unknown",
    provenance: "unknown",
    note: "No drainage information. Affects whether moisture-demanding plants are viable.",
  },
  soil: {
    value: "unknown",
    provenance: "unknown",
    note: "Texture, pH and compaction unknown.",
  },
  irrigation: {
    value: "establishment_only",
    provenance: "synthetic_assumption",
    note: "Assumed: watering available during establishment (first one to two summers) but not as a long-term regime.",
  },
  bed_area_m2: {
    value: "unknown",
    provenance: "unknown",
    note: "Bed size and shape unknown; quantities and spacing are therefore out of scope.",
  },
  existing_vegetation: {
    value: "unknown",
    provenance: "unknown",
    note: "Existing trees, shrubs and groundcover not recorded.",
  },
};

export const DEFAULT_STAKEHOLDERS = [
  {
    id: "residents",
    role: "Residents",
    statement: "We want a welcoming garden with lots of visible yellow flowers.",
  },
  {
    id: "ecology",
    role: "Ecological Adviser",
    statement: "We want to support local pollinators and provide ecological value across seasons.",
  },
  {
    id: "maintenance",
    role: "Maintenance Team",
    statement: "We cannot sustain intensive watering or frequent plant replacement.",
  },
];
