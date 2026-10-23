import type { Intention, NegotiationSummary, OpenQuestion, PlantEvaluation, PlantRecord, Relation, SeasonCoverage, SummaryItem } from "../types.ts";
import { SEASONS } from "../types.ts";
import { flowersIn } from "./validate.ts";

// ---------------------------------------------------------------------------
// NEGOTIATION SUMMARY.
// Turns the pairwise relations, season coverage and open questions into the
// three answers a designer needs first: what can be met together, what pulls
// apart and why, and what cannot be judged yet. Every sentence is assembled
// from engine results; nothing here is pre-written for the default scenario.
// ---------------------------------------------------------------------------

export function shortLabel(i: Intention): string {
  switch (i.kind) {
    case "flower_colour":
      return `${i.value ?? "the preferred colour"} flowers`;
    case "flower_abundance":
      return "an abundant display";
    case "welcoming_character":
      return "a welcoming character";
    case "pollinator_support":
      return i.value && !/pollinators?/.test(i.value) ? `support for ${i.value}` : "pollinator support";
    case "seasonal_continuity":
      return "interest across seasons";
    case "native_preference":
      return "native plants";
    case "low_water":
      return "limited watering";
    case "low_replacement":
      return "long-lived planting";
    case "low_maintenance":
      return "low maintenance";
    case "winter_interest":
      return "winter interest";
    case "shade_tolerance":
      return "shade tolerance";
    case "safety_or_toxicity":
      return "no hazardous plants";
    default:
      return i.statement.replace(/\.$/, "");
  }
}

function joinNames(ids: string[], plants: PlantRecord[], max = 3): string {
  const names = ids.map((id) => plants.find((p) => p.id === id)?.scientific_name ?? id);
  return names.length > max ? `${names.slice(0, max).join(", ")} and ${names.length - max} more` : names.join(", ");
}

function listLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function buildSummary(
  intentions: Intention[],
  relations: Relation[],
  coverage: SeasonCoverage[],
  evaluations: PlantEvaluation[],
  plants: PlantRecord[],
  questions: OpenQuestion[],
): NegotiationSummary {
  const byId = (id: string) => intentions.find((i) => i.id === id)!;
  const label = (id: string) => shortLabel(byId(id));
  const commonGround: SummaryItem[] = [];
  const tradeOffs: SummaryItem[] = [];
  const needsConfirmation: SummaryItem[] = [];
  const siteOk = (e: PlantEvaluation) => e.siteFit !== "fail";
  const checkOf = (e: PlantEvaluation, id: string) => e.checks.find((c) => c.intentionId === id)?.status;

  // 1. Knowledge-base limits: a checkable goal that no record can satisfy at all.
  for (const i of intentions.filter((x) => x.checkability !== "design_judgement" && x.kind !== "seasonal_continuity")) {
    const anyPass = evaluations.some((e) => checkOf(e, i.id) === "pass");
    const anyUnknown = evaluations.some((e) => checkOf(e, i.id) === "unknown");
    if (!anyPass) {
      tradeOffs.push({
        kind: "knowledge_limit",
        text: anyUnknown
          ? `No record in the knowledge base is confirmed to provide ${label(i.id)}; for some plants the source does not state it.`
          : `No record in the knowledge base provides ${label(i.id)}. The strategies cannot meet this with the current 12 records.`,
        plantIds: [],
        principleIds: [],
        intentionIds: [i.id],
      });
    }
  }

  // 2. Pairwise relations, grouped so identical findings read as one sentence.
  const compatible = relations.filter((r) => r.kind === "compatible");
  const groupsMet = new Map<string, { pairs: string[][]; plants: string[]; principles: string[] }>();
  for (const r of compatible) {
    const key = r.plantsSatisfyingBoth.slice().sort().join("|");
    const g = groupsMet.get(key) ?? { pairs: [], plants: r.plantsSatisfyingBoth, principles: [] };
    g.pairs.push([r.a, r.b]);
    g.principles.push(...r.principleIds);
    groupsMet.set(key, g);
  }
  for (const g of groupsMet.values()) {
    const labels = [...new Set(g.pairs.flat())].map(label);
    commonGround.push({
      kind: "met",
      text: `${cap(listLabels(labels))} can be met together: ${joinNames(g.plants, plants)}.`,
      plantIds: g.plants,
      principleIds: [...new Set(g.principles)],
      intentionIds: [...new Set(g.pairs.flat())],
    });
  }

  const conditional = relations.filter((r) => r.kind === "conditional" || r.kind === "insufficient_data");
  const groupsCond = new Map<string, { pairs: string[][]; r: Relation }>();
  for (const r of conditional) {
    const g = groupsCond.get(r.summary) ?? { pairs: [], r };
    g.pairs.push([r.a, r.b]);
    groupsCond.set(r.summary, g);
  }
  for (const { pairs, r } of groupsCond.values()) {
    const ids = [...new Set(pairs.flat())];
    const labels = ids.map(label);
    const verified = r.plantsSatisfyingBoth.filter((pid) => evaluations.find((e) => e.plantId === pid)?.siteFit === "pass" && ids.every((iid) => checkOf(evaluations.find((e) => e.plantId === pid)!, iid) === "pass"));
    const verifiedSeasons = SEASONS.filter((s) => verified.some((pid) => flowersIn(plants.find((p) => p.id === pid)!, s)));
    if (verified.length) {
      commonGround.push({
        kind: "met",
        text: `${cap(listLabels(labels))} are met together${verifiedSeasons.length ? ` in ${listLabels(verifiedSeasons)}` : ""} by ${joinNames(verified, plants)}.`,
        plantIds: verified,
        principleIds: r.principleIds,
        intentionIds: ids,
      });
    }
    const conditionalAll = r.plantsSatisfyingBoth.filter((pid) => !verified.includes(pid));
    const gapSeasons = SEASONS.filter((s) => conditionalAll.some((pid) => flowersIn(plants.find((p) => p.id === pid)!, s)) && !verifiedSeasons.includes(s));
    const seasonalPair = ids.some((iid) => ["flower_colour", "pollinator_support", "flower_abundance"].includes(byId(iid).kind));
    const conditionalPlants = seasonalPair && gapSeasons.length ? conditionalAll.filter((pid) => gapSeasons.some((s) => flowersIn(plants.find((p) => p.id === pid)!, s))) : conditionalAll;
    if (conditionalPlants.length) {
      const seasons = seasonalPair ? gapSeasons : [];
      // Group plants by the kind of condition so one sentence covers them.
      const groups = new Map<string, string[]>();
      for (const pid of conditionalPlants) {
        const key = conditionKey(pid, ids, evaluations);
        groups.set(key, [...(groups.get(key) ?? []), pid]);
      }
      const reasons = [...groups].map(([key, pids]) => conditionSentence(key, pids, plants));
      const single = groups.size === 1 ? conditionSentence([...groups.keys()][0], conditionalPlants, plants, true) : null;
      tradeOffs.push({
        kind: "conditional",
        text: `${seasons.length ? `In ${listLabels(seasons)}, ` : ""}${listLabels(labels)} depend${labels.length > 1 ? "" : "s"} on ${joinNames(conditionalPlants, plants, 4)}${single ? `, which ${single}` : `: ${reasons.join("; ")}`}.`,
        plantIds: conditionalPlants,
        principleIds: r.principleIds,
        intentionIds: ids,
      });
    }
    if (!verified.length && !conditionalPlants.length) {
      tradeOffs.push({ kind: "conflict", text: `${cap(listLabels(labels))}: ${r.summary}`, plantIds: [], principleIds: r.principleIds, intentionIds: ids });
    }
  }
  for (const r of relations.filter((x) => x.kind === "conflict")) {
    const ids = [r.a, r.b];
    const limitAlready = tradeOffs.some((t) => t.kind === "knowledge_limit" && t.intentionIds.some((x) => ids.includes(x)));
    if (limitAlready) continue; // the knowledge-base limit already explains it
    tradeOffs.push({ kind: "conflict", text: `${cap(label(r.a))} and ${label(r.b)} conflict in this knowledge base: ${r.summary}`, plantIds: [], principleIds: r.principleIds, intentionIds: ids });
  }

  // 3. Goals that are not compared pairwise but are checked plant by plant.
  const pairwise = new Set(relations.flatMap((r) => [r.a, r.b]));
  for (const i of intentions.filter((x) => !pairwise.has(x.id) && x.checkability !== "design_judgement" && x.kind !== "seasonal_continuity")) {
    const fit = evaluations.filter(siteOk);
    const pass = fit.filter((e) => checkOf(e, i.id) === "pass");
    const fail = fit.filter((e) => checkOf(e, i.id) === "fail");
    const unk = fit.filter((e) => checkOf(e, i.id) === "unknown");
    if (pass.length && !fail.length) commonGround.push({ kind: "met", text: `${cap(label(i.id))}: no site-fit candidate is flagged against it${unk.length ? `, though the source is silent for ${joinNames(unk.map((e) => e.plantId), plants)}` : ""}.`, plantIds: pass.map((e) => e.plantId), principleIds: [], intentionIds: [i.id] });
    else if (fail.length) tradeOffs.push({ kind: "conditional", text: `${cap(label(i.id))}: ${joinNames(fail.map((e) => e.plantId), plants)} ${fail.length > 1 ? "are" : "is"} flagged by ${fail.length > 1 ? "their" : "its"} source; the strategies avoid or caveat them.`, plantIds: fail.map((e) => e.plantId), principleIds: [], intentionIds: [i.id] });
  }

  // 4. Seasonal continuity: where the knowledge base can and cannot provide it.
  const seasonal = intentions.find((i) => i.kind === "seasonal_continuity");
  const noFlower = SEASONS.filter((s) => !coverage.find((c) => c.season === s)?.plantsSatisfyingAll.length && !evaluations.some((e) => siteOk(e) && flowersIn(plants.find((p) => p.id === e.plantId)!, s)));
  if (seasonal || intentions.some((i) => i.kind === "flower_colour")) {
    const full = SEASONS.filter((s) => coverage.find((c) => c.season === s)!.plantsSatisfyingAll.length > 0);
    if (full.length) commonGround.push({ kind: "met", text: `Every checkable goal is met by at least one site-fit plant in ${listLabels(full)}.`, plantIds: [...new Set(full.flatMap((s) => coverage.find((c) => c.season === s)!.plantsSatisfyingAll))], principleIds: [], intentionIds: intentions.filter((i) => i.checkability === "database").map((i) => i.id) });
    if (noFlower.length) {
      const evergreens = evaluations.filter((e) => siteOk(e) && plants.find((p) => p.id === e.plantId)!.evergreen.value === true).map((e) => e.plantId);
      tradeOffs.push({ kind: "knowledge_limit", text: `No site-fit record flowers in ${listLabels(noFlower)}; ${noFlower.includes("winter") && evergreens.length ? `winter interest can only come from evergreen structure (${joinNames(evergreens, plants)}).` : "the strategies cannot fill it with the current records."}`, plantIds: evergreens, principleIds: [], intentionIds: seasonal ? [seasonal.id] : [] });
    }
  }

  // 6. Unknowns, site first.
  for (const q of questions.filter((x) => x.id.startsWith("Q-light") || x.id.startsWith("Q-irrigation") || x.id.startsWith("Q-soil") || x.id.startsWith("Q-area"))) {
    needsConfirmation.push({ kind: "site_unknown", text: q.question, plantIds: q.blocks.filter((b) => b.startsWith("P-")), principleIds: [], intentionIds: q.blocks.filter((b) => b.startsWith("I-")) });
  }
  // 5. Design judgements are acknowledged, not checked.
  for (const i of intentions.filter((x) => x.checkability === "design_judgement" && x.kind !== "other")) {
    needsConfirmation.push({ kind: "judgement", text: `${cap(label(i.id))} is a design judgement: the strategies address it through composition, and the designer decides whether they succeed.`, plantIds: [], principleIds: [], intentionIds: [i.id] });
  }

  for (const q of questions.filter((x) => x.id.startsWith("Q-I-")).slice(0, 2)) {
    needsConfirmation.push({ kind: "plant_unknown", text: q.question, plantIds: q.blocks, principleIds: [], intentionIds: [q.id.replace("Q-", "")] });
  }

  return { commonGround: dropSubsets(dedupe(commonGround)), tradeOffs: dropSubsets(dedupe(tradeOffs)), needsConfirmation: dedupe(needsConfirmation) };
}

function conditionKey(pid: string, intentionIds: string[], evaluations: PlantEvaluation[]): string {
  const e = evaluations.find((x) => x.plantId === pid)!;
  if (e.site.water.status === "unknown") return "dry_tolerant";
  if (e.site.light.status === "unknown") return "light_unknown";
  const unk = e.checks.find((c) => intentionIds.includes(c.intentionId) && c.status === "unknown");
  return unk ? `field:${unk.field ?? "unknown"}` : "site";
}

function conditionSentence(key: string, pids: string[], plants: PlantRecord[], relative = false): string {
  const names = relative ? "" : joinNames(pids, plants, 4) + " ";
  const plural = pids.length > 1;
  if (key === "dry_tolerant") return `${names}prefer${plural ? "" : "s"} moist soil but ${plural ? "their sources note" : "its source notes"} tolerance of dry spells, so ${plural ? "they" : "it"} need${plural ? "" : "s"} establishment watering`;
  if (key === "light_unknown") return relative ? `${plural ? "have" : "has"} an unknown light fit` : `the light fit of ${names.trim()} is unknown`;
  if (key.startsWith("field:")) return relative ? `${plural ? "lack" : "lacks"} a sourced value for ${key.slice(6).replace(/_/g, " ")}` : `the source for ${names.trim()} does not state ${key.slice(6).replace(/_/g, " ")}`;
  return `${names}depend${plural ? "" : "s"} on site conditions`;
}

// An item whose intentions are a subset of another item's, with the same kind and plants, adds nothing.
function dropSubsets(items: SummaryItem[]): SummaryItem[] {
  return items.filter((a, i) => {
    return !items.some((b, j) => {
      if (i === j || a.kind !== b.kind) return false;
      const samePlants = a.plantIds.slice().sort().join() === b.plantIds.slice().sort().join();
      const subset = a.intentionIds.every((x) => b.intentionIds.includes(x)) && (a.intentionIds.length < b.intentionIds.length || (a.intentionIds.length === b.intentionIds.length && j < i));
      return samePlants && subset;
    });
  });
}

function dedupe(items: SummaryItem[]): SummaryItem[] {
  const seen = new Set<string>();
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true)));
}
