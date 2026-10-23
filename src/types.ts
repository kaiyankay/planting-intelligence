// ---------------------------------------------------------------------------
// Shared domain types for Planting Intelligence.
// Knowledge (plants, principles, site) is data. The engine (code) validates
// what can be validated. The LLM only interprets language and writes
// narrative that is constrained to engine-computed facts.
// ---------------------------------------------------------------------------

export type Light = "full_sun" | "partial_shade" | "shade";
export type Water = "low" | "moderate" | "high" | "unknown";
export type Season = "winter" | "spring" | "summer" | "autumn";
export const SEASONS: Season[] = ["winter", "spring", "summer", "autumn"];

export interface SourcedField<T> {
  value: T | "unknown";
  source?: string; // URL of the page that states the value
  note?: string;
}

export interface SourceRef {
  url: string;
  publisher: string;
  accessed: string;
  fields_supported: string[];
}

export interface PlantRecord {
  id: string;
  scientific_name: string;
  common_name: string;
  type: string;
  mature_height_m: SourcedField<string>;
  mature_spread_m: SourcedField<string>;
  light: SourcedField<Light[]>;
  soil: SourcedField<string>;
  water: SourcedField<Water> & { wording?: string; dry_tolerant?: boolean; dry_tolerant_evidence?: string };
  flower_colour: SourcedField<string[]>;
  flowering_season: SourcedField<Season[]>;
  growth_habit: SourcedField<string>;
  evergreen: SourcedField<boolean>;
  ecological_value: SourcedField<string>;
  pollinator_evidence: SourcedField<boolean>;
  native_to_pnw_bc: SourcedField<boolean>;
  maintenance: SourcedField<string>;
  cautions: SourcedField<string[]>;
  regional_suitability: SourcedField<string>;
  sources: SourceRef[];
  missing_information: string[];
}

export type PrincipleType = "sourced_principle" | "proposed_heuristic";

export interface DesignPrinciple {
  id: string;
  title: string;
  statement: string;
  type: PrincipleType;
  topics: string[];
  source: {
    title: string;
    publisher: string;
    url: string;
    year: string;
    accessed: string;
    support_note: string;
  } | null;
  applies_when: string[];
}

// --- Site -------------------------------------------------------------------

export type Provenance = "synthetic_assumption" | "unknown" | "user_confirmed";

export interface SiteField<T> {
  value: T | "unknown";
  provenance: Provenance;
  note: string;
}

export interface SiteAssumptions {
  name: string;
  context_reference: string;
  disclaimer: string;
  light: SiteField<Light>;
  drainage: SiteField<"well_drained" | "poorly_drained" | "mixed">;
  soil: SiteField<string>;
  irrigation: SiteField<"none" | "establishment_only" | "seasonal">;
  bed_area_m2: SiteField<number>;
  existing_vegetation: SiteField<string>;
}

// --- Stakeholders and intentions -------------------------------------------

export interface Stakeholder {
  id: string;
  role: string;
  statement: string;
}

export type IntentionKind =
  | "flower_colour"
  | "flower_abundance"
  | "welcoming_character"
  | "pollinator_support"
  | "seasonal_continuity"
  | "native_preference"
  | "low_water"
  | "low_replacement"
  | "low_maintenance"
  | "winter_interest"
  | "shade_tolerance"
  | "safety_or_toxicity"
  | "other";

export type Checkability = "database" | "partial" | "design_judgement";

export interface Intention {
  id: string;
  stakeholderId: string;
  kind: IntentionKind;
  value?: string; // e.g. "yellow"
  strength: "must" | "prefer";
  statement: string; // normalised paraphrase
  evidence: string; // quoted span from the stakeholder text
  confidence: number; // 0..1
  checkability: Checkability;
  origin: "rule_parser" | "llm";
}

// --- Validation -------------------------------------------------------------

export type CheckStatus = "pass" | "fail" | "unknown" | "not_applicable";

export interface Check {
  intentionId: string;
  status: CheckStatus;
  reason: string; // plain explanation referencing the field value
  field?: string;
  source?: string;
}

export interface SiteCheck {
  status: CheckStatus;
  reason: string;
  source?: string;
}

export interface PlantEvaluation {
  plantId: string;
  site: { light: SiteCheck; water: SiteCheck };
  siteFit: CheckStatus;
  checks: Check[];
}

// --- Relationship analysis --------------------------------------------------

export type RelationKind = "compatible" | "conditional" | "conflict" | "insufficient_data" | "not_checkable";

export interface Relation {
  a: string; // intention id
  b: string; // intention id
  kind: RelationKind;
  summary: string; // engine-computed, factual
  plantsSatisfyingBoth: string[];
  seasonGaps: Season[]; // seasons where no plant satisfies both
  principleIds: string[];
}

export interface SeasonCoverage {
  season: Season;
  plantsSatisfyingAll: string[]; // plants meeting every database-checkable intention
  plantsSatisfyingColour: string[];
  plantsSatisfyingPollinators: string[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  why: string;
  blocks: string[]; // intention ids or plant ids whose evaluation depends on it
}

export interface NegotiationAnalysis {
  intentions: Intention[];
  evaluations: PlantEvaluation[];
  relations: Relation[];
  seasonCoverage: SeasonCoverage[];
  openQuestions: OpenQuestion[];
  retrievedPrincipleIds: string[];
  commonGround: string[]; // factual sentences from the engine
  tensions: string[]; // factual sentences from the engine
  narrative: Narrative;
}

export interface Narrative {
  mode: "llm" | "offline_template";
  model?: string;
  text: string; // professional reasoning text
  citedPlantIds: string[];
  citedPrincipleIds: string[];
  warnings: string[]; // e.g. citations removed because they did not exist
}

// --- Strategies -------------------------------------------------------------

export type LayerRole = "structural" | "seasonal" | "ground" | "accent";

export interface Placement {
  role: LayerRole;
  label: string; // e.g. "Evergreen framework"
  approach: string; // spatial description (engine template or LLM, labelled)
  plantIds: string[];
}

export interface RequirementOutcome {
  intentionId: string;
  status: "satisfied" | "partially_satisfied" | "unmet" | "unknown";
  reason: string;
  supportingPlantIds: string[];
}

export interface Strategy {
  id: string;
  version: number;
  name: string;
  approach: string; // the design idea, one or two sentences
  designIntention: string;
  placements: Placement[];
  requirementOutcomes: RequirementOutcome[];
  tradeOffs: string[];
  principleIds: string[];
  unresolved: string[];
  seasonCoverage: Record<Season, string[]>;
  revisionLog: RevisionEntry[];
}

export interface Adjustment {
  kind:
    | "reduce_water"
    | "keep_summer_colour"
    | "more_summer_colour"
    | "more_native"
    | "less_maintenance"
    | "more_winter_interest"
    | "remove_plant"
    | "avoid_toxic"
    | "more_colour"
    | "unknown";
  plantId?: string;
  evidence: string;
  origin: "rule_parser" | "llm";
}

export interface RevisionEntry {
  version: number;
  timestamp: string;
  feedback: string;
  adjustments: Adjustment[];
  removed: { plantId: string; reason: string }[];
  added: { plantId: string; reason: string }[];
  kept: string[];
  explanation: string[]; // engine reasons
  narrative?: Narrative;
}

export interface LlmStatus {
  available: boolean;
  model?: string;
  mode: "llm" | "offline_demonstration";
}
