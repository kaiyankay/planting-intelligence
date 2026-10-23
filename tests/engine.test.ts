import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalisePlant, type Raw } from "../src/knowledge/normalise.ts";
import type { DesignPrinciple, PlantRecord } from "../src/types.ts";
import { DEFAULT_SITE, DEFAULT_STAKEHOLDERS } from "../src/knowledge/site.ts";
import { parseAdjustmentsOffline, parseIntentionsOffline } from "../src/engine/interpret.ts";
import { evaluateAll } from "../src/engine/validate.ts";
import { analyseRelations, openQuestions, retrievePrinciples, seasonCoverage } from "../src/engine/relations.ts";
import { generateStrategies, type Ctx } from "../src/engine/strategies.ts";
import { applyAdjustments } from "../src/engine/revise.ts";
import { groundNarrative } from "../src/engine/narrate.ts";

const here = new URL(".", import.meta.url);
const PLANTS: PlantRecord[] = (JSON.parse(readFileSync(new URL("../src/knowledge/plants.verified.json", here), "utf8")) as Raw[]).map(normalisePlant);
const PRINCIPLES: DesignPrinciple[] = JSON.parse(readFileSync(new URL("../src/knowledge/principles.json", here), "utf8"));

function build(site = DEFAULT_SITE) {
  const intentions = parseIntentionsOffline(DEFAULT_STAKEHOLDERS);
  const evaluations = evaluateAll(PLANTS, intentions, site);
  const relations = analyseRelations(intentions, evaluations, PLANTS, PRINCIPLES);
  const coverage = seasonCoverage(intentions, evaluations, PLANTS);
  const questions = openQuestions(site, intentions, evaluations, PLANTS);
  const ctx: Ctx = { plants: PLANTS, evaluations, intentions, principles: PRINCIPLES, openQuestions: questions };
  return { intentions, evaluations, relations, coverage, questions, ctx };
}

test("knowledge base: every plant field value is sourced or unknown", () => {
  assert.ok(PLANTS.length >= 6 && PLANTS.length <= 12);
  for (const p of PLANTS) {
    for (const key of ["light", "water", "flower_colour", "flowering_season", "native_to_pnw_bc", "maintenance"] as const) {
      const f = p[key] as { value: unknown; source?: string };
      assert.ok(f.value === "unknown" || f.source, `${p.id}.${key} has a value but no source`);
    }
    assert.ok(p.sources.length > 0, `${p.id} has no source list`);
  }
});

test("knowledge base: principles are either sourced with a URL or explicitly heuristic", () => {
  for (const k of PRINCIPLES) {
    if (k.type === "sourced_principle") assert.ok(k.source?.url, `${k.id} sourced without url`);
    else assert.equal(k.source, null);
  }
});

test("offline parser extracts the three synthetic statements into checkable intentions", () => {
  const intentions = parseIntentionsOffline(DEFAULT_STAKEHOLDERS);
  const kinds = intentions.map((i) => i.kind);
  assert.ok(kinds.includes("flower_colour"));
  assert.equal(intentions.find((i) => i.kind === "flower_colour")?.value, "yellow");
  assert.ok(kinds.includes("pollinator_support"));
  assert.ok(kinds.includes("seasonal_continuity"));
  assert.ok(kinds.includes("low_water"));
  assert.equal(intentions.find((i) => i.kind === "low_water")?.strength, "must");
  assert.ok(kinds.includes("low_replacement"));
  assert.ok(kinds.includes("welcoming_character"));
  for (const i of intentions) assert.ok(i.evidence.length > 0);
});

test("validation: unknown fields yield unknown, not pass or fail", () => {
  const { evaluations, intentions } = build();
  const digitalis = evaluations.find((e) => e.plantId === "P-03")!;
  const seasonal = intentions.find((i) => i.kind === "seasonal_continuity")!;
  assert.equal(digitalis.checks.find((c) => c.intentionId === seasonal.id)?.status, "unknown");
});

test("validation: site light excludes full-sun-only plants under partial shade", () => {
  const { evaluations } = build();
  const sunOnly = PLANTS.filter((p) => p.light.value !== "unknown" && p.light.value.length === 1 && p.light.value[0] === "full_sun");
  assert.ok(sunOnly.length > 0);
  for (const p of sunOnly) assert.equal(evaluations.find((e) => e.plantId === p.id)?.site.light.status, "fail");
});

test("relations: yellow and pollinators are not reported as a conflict when shared plants exist", () => {
  const { relations, intentions } = build();
  const colour = intentions.find((i) => i.kind === "flower_colour")!;
  const poll = intentions.find((i) => i.kind === "pollinator_support")!;
  const r = relations.find((x) => (x.a === colour.id && x.b === poll.id) || (x.b === colour.id && x.a === poll.id))!;
  assert.ok(r);
  assert.notEqual(r.kind, "conflict");
  assert.ok(r.plantsSatisfyingBoth.length > 0);
});

test("relations: every pair of parties' checkable intentions gets a relation and principles", () => {
  const { relations } = build();
  assert.ok(relations.length >= 3);
  for (const r of relations) assert.ok(["compatible", "conditional", "conflict", "insufficient_data", "not_checkable"].includes(r.kind));
  assert.ok(relations.some((r) => r.principleIds.length > 0));
});

test("strategies: at least two distinct approaches with different plant sets", () => {
  const { ctx } = build();
  const strategies = generateStrategies(ctx);
  assert.ok(strategies.length >= 2);
  const sets = strategies.map((s) => new Set(s.placements.flatMap((p) => p.plantIds)));
  assert.notDeepEqual([...sets[0]].sort(), [...sets[1]].sort());
  for (const s of strategies) {
    assert.equal(s.requirementOutcomes.length, ctx.intentions.length);
    assert.ok(s.principleIds.length > 0);
    assert.ok(s.unresolved.length > 0, "unknown site data must surface as unresolved");
  }
});

test("revision: 'reduce watering without losing summer colour' removes non-low-water plants and records reasons", () => {
  const { ctx } = build();
  const s = generateStrategies(ctx)[0];
  const feedback = "Can we reduce watering without losing too much summer colour?";
  const adj = parseAdjustmentsOffline(feedback, PLANTS.map((p) => ({ id: p.id, names: [p.scientific_name, p.common_name] })));
  assert.ok(adj.some((a) => a.kind === "reduce_water"));
  assert.ok(adj.some((a) => a.kind === "keep_summer_colour"));
  const v2 = applyAdjustments(ctx, s, feedback, adj);
  assert.equal(v2.version, 2);
  const ids = v2.placements.flatMap((p) => p.plantIds);
  const entry = v2.revisionLog[0];
  for (const id of ids) {
    const p = PLANTS.find((x) => x.id === id)!;
    assert.notEqual(p.water.value, "high", `${id} needs moist soil and should have been removed`);
    if (p.water.value === "moderate") {
      assert.ok(p.water.dry_tolerant, `${id} kept although its source has no dry-tolerance note`);
      assert.ok(entry.explanation.some((e) => e.includes(p.scientific_name) && e.includes("conditionally")), `${id} kept without a recorded conditional reason`);
    }
  }
  assert.ok(entry.explanation.length > 0);
  for (const r of entry.removed) assert.ok(r.reason.length > 10);
});

test("narrative grounding strips citations to records that do not exist", () => {
  const n = groundNarrative("Use [P-01] and [P-99] with [K-05] and [K-77].", "offline_template", PLANTS, PRINCIPLES);
  assert.deepEqual(n.citedPlantIds, ["P-01"]);
  assert.deepEqual(n.citedPrincipleIds, ["K-05"]);
  assert.equal(n.warnings.length, 2);
  assert.ok(n.text.includes("[unverified]"));
});

test("retrieval: low-water intention retrieves the watering principles", () => {
  const intentions = parseIntentionsOffline(DEFAULT_STAKEHOLDERS);
  const ks = retrievePrinciples(PRINCIPLES, intentions).map((k) => k.id);
  assert.ok(ks.includes("K-08"));
  assert.ok(ks.includes("K-09"));
});

// ---- Added with the UX revision: summary, principle gating, honest limits ----
import { buildSummary } from "../src/engine/summary.ts";

test("summary: default scenario reports common ground and conditional trade-offs, no manufactured conflict", () => {
  const { intentions, evaluations, relations, coverage, questions } = build();
  const s = buildSummary(intentions, relations, coverage, evaluations, PLANTS, questions);
  assert.ok(s.commonGround.length >= 1);
  assert.ok(s.commonGround.some((i) => /met together/.test(i.text)));
  assert.ok(!s.tradeOffs.some((i) => i.kind === "conflict"), "no conflict should be reported for the default scenario");
  assert.ok(s.tradeOffs.some((i) => i.kind === "conditional"));
  assert.ok(s.needsConfirmation.some((i) => i.kind === "site_unknown"));
});

test("summary: an unsupported requirement is reported as a knowledge-base limit, not hidden", () => {
  const intentions = parseIntentionsOffline([{ id: "r", role: "Residents", statement: "We want blue flowers." }, { id: "m", role: "Maintenance", statement: "We cannot water." }]);
  const evaluations = evaluateAll(PLANTS, intentions, DEFAULT_SITE);
  const relations = analyseRelations(intentions, evaluations, PLANTS, PRINCIPLES);
  const coverage = seasonCoverage(intentions, evaluations, PLANTS);
  const questions = openQuestions(DEFAULT_SITE, intentions, evaluations, PLANTS);
  const s = buildSummary(intentions, relations, coverage, evaluations, PLANTS, questions);
  assert.ok(s.tradeOffs.some((i) => i.kind === "knowledge_limit" && /blue/.test(i.text)));
  const strategies = generateStrategies({ plants: PLANTS, evaluations, intentions, principles: PRINCIPLES, openQuestions: questions });
  for (const st of strategies) assert.ok(!/blue at the threshold/i.test(st.name), "a strategy must not promise a colour the records cannot supply");
});

test("strategies: principles are applied as decisions and change with the intentions", () => {
  const { ctx } = build();
  const [a, b] = generateStrategies(ctx);
  assert.ok(a.appliedPrinciples.some((p) => p.id === "K-06"), "evergreen framework principle applies when year-round interest is wanted");
  assert.ok(b.appliedPrinciples.some((p) => p.id === "K-13"), "warm-colour principle applies to yellow");
  // Without any seasonal or winter intention, K-06 must not be applied.
  const intentions = parseIntentionsOffline([{ id: "r", role: "Residents", statement: "We want white flowers." }]);
  const evaluations = evaluateAll(PLANTS, intentions, DEFAULT_SITE);
  const questions = openQuestions(DEFAULT_SITE, intentions, evaluations, PLANTS);
  const [a2, b2] = generateStrategies({ plants: PLANTS, evaluations, intentions, principles: PRINCIPLES, openQuestions: questions });
  assert.ok(!a2.appliedPrinciples.some((p) => p.id === "K-06"));
  assert.ok(!b2.appliedPrinciples.some((p) => p.id === "K-13"), "warm-colour principle must not be applied to white");
  for (const st of [a, b]) assert.deepEqual(st.principleIds, [...new Set(st.appliedPrinciples.map((p) => p.id))], "cited principles are exactly the applied ones");
});

test("interpretation: a named animal group is checked literally against the source text", () => {
  const intentions = parseIntentionsOffline([{ id: "e", role: "Ecology", statement: "Please support hummingbirds." }]);
  const evaluations = evaluateAll(PLANTS, intentions, DEFAULT_SITE);
  const ribes = evaluations.find((e) => e.plantId === "P-07")!;
  assert.equal(ribes.checks[0].status, "pass");
  const anyFail = evaluations.some((e) => e.checks[0].status === "fail");
  assert.ok(anyFail, "plants whose source does not mention hummingbirds must not pass");
});
