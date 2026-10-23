import type { DesignPrinciple, Intention, Narrative, NegotiationAnalysis, PlantRecord, Stakeholder, Strategy } from "../types.ts";

// ---------------------------------------------------------------------------
// NARRATIVE.
// Online: the LLM writes professional reasoning but may cite only plant ids
// and principle ids that exist; code strips anything else and records a
// warning. Offline: a template composes sentences from engine facts and is
// labelled as such. Neither mode is allowed to introduce new plant facts.
// ---------------------------------------------------------------------------

export function groundNarrative(text: string, mode: Narrative["mode"], plants: PlantRecord[], principles: DesignPrinciple[], model?: string): Narrative {
  const plantIds = new Set(plants.map((p) => p.id));
  const principleIds = new Set(principles.map((p) => p.id));
  const warnings: string[] = [];
  const cited = new Set<string>();
  const citedK = new Set<string>();
  const cleaned = text.replace(/\[((?:P|K)-\d{2})\]/g, (m, id: string) => {
    if (id.startsWith("P-")) {
      if (plantIds.has(id)) {
        cited.add(id);
        return m;
      }
      warnings.push(`Removed citation ${id}: no such plant record.`);
      return "[unverified]";
    }
    if (principleIds.has(id)) {
      citedK.add(id);
      return m;
    }
    warnings.push(`Removed citation ${id}: no such principle.`);
    return "[unverified]";
  });
  return { mode, model, text: cleaned, citedPlantIds: [...cited], citedPrincipleIds: [...citedK], warnings };
}

export function offlineNegotiationNarrative(a: Omit<NegotiationAnalysis, "narrative">, stakeholders: Stakeholder[], plants: PlantRecord[], principles: DesignPrinciple[]): Narrative {
  const who = (i: Intention) => stakeholders.find((s) => s.id === i.stakeholderId)?.role ?? i.stakeholderId;
  const name = (id: string) => `${plants.find((p) => p.id === id)?.scientific_name ?? id} [${id}]`;
  const paras: string[] = [];
  paras.push(
    `Reading the statements. ` +
      a.intentions
        .filter((i) => i.kind !== "other")
        .map((i) => `${who(i)}: ${i.statement.replace(/\.$/, "")} (${i.checkability === "database" ? "checkable against plant records" : i.checkability === "partial" ? "partly checkable" : "a design judgement"})`)
        .join("; ") +
      ".",
  );
  const label = (id: string) => a.intentions.find((i) => i.id === id)?.statement.replace(/\.$/, "").replace(/^(Flower colour preference: |Wants |Cannot sustain |Prefers )/, "") ?? id;
  const byKind = (k: string) => a.relations.filter((r) => r.kind === k);
  if (byKind("compatible").length) paras.push(`Where the goals meet. ${byKind("compatible").map((r) => `${label(r.a)} and ${label(r.b)} are met together by ${r.plantsSatisfyingBoth.map(name).join(", ")}`).join("; ")}.`);
  const cond = [...byKind("conditional"), ...byKind("insufficient_data")];
  if (cond.length) {
    // Group pairs that share the same computed summary so the template does not repeat itself.
    const groups = new Map<string, string[]>();
    for (const r of cond) groups.set(r.summary, [...(groups.get(r.summary) ?? []), `${label(r.a)} with ${label(r.b)}`]);
    paras.push(`Where they depend on conditions. ${[...groups].map(([summary, pairs]) => `${pairs.join("; ")}: ${summary.charAt(0).toLowerCase()}${summary.slice(1)}`).join(" ")}`);
  }
  if (byKind("conflict").length) paras.push(`Where they conflict. ${byKind("conflict").map((r) => `${label(r.a)} against ${label(r.b)}: ${r.summary}`).join(" ")}`);
  const gap = a.seasonCoverage.filter((c) => c.plantsSatisfyingAll.length === 0);
  const full = a.seasonCoverage.filter((c) => c.plantsSatisfyingAll.length > 0);
  if (full.length) paras.push(`Season by season, plants meeting every checkable requirement exist in ${full.map((c) => `${c.season} (${c.plantsSatisfyingAll.map(name).join(", ")})`).join("; ")}.`);
  if (gap.length) paras.push(`In ${gap.map((c) => c.season).join(" and ")} no single plant does, so the strategies below handle those seasons differently: by accepting a conditional plant, by shifting colour to another layer, or by letting the season go.`);
  const ks = a.retrievedPrincipleIds.map((id) => principles.find((p) => p.id === id)).filter(Boolean) as DesignPrinciple[];
  if (ks.length) paras.push(`Knowledge applied: ${ks.slice(0, 6).map((k) => `${k.title} [${k.id}]`).join("; ")}.`);
  if (a.openQuestions.length) paras.push(`Before any of this is decided: ${a.openQuestions.slice(0, 3).map((q) => q.question).join(" ")}`);
  return groundNarrative(paras.join("\n\n"), "offline_template", plants, principles);
}

export function offlineRevisionNarrative(s: Strategy, plants: PlantRecord[], principles: DesignPrinciple[]): Narrative {
  const entry = s.revisionLog[s.revisionLog.length - 1];
  const name = (id: string) => `${plants.find((p) => p.id === id)?.scientific_name ?? id} [${id}]`;
  const lines: string[] = [];
  lines.push(`Feedback read as: ${entry.adjustments.map((x) => x.kind.replace(/_/g, " ")).join(", ")}.`);
  if (entry.removed.length) lines.push(`Removed ${entry.removed.map((r) => `${name(r.plantId)} because ${r.reason.charAt(0).toLowerCase()}${r.reason.slice(1)}`).join("; ")}`);
  if (entry.added.length) lines.push(`Added ${entry.added.map((r) => `${name(r.plantId)}: ${r.reason}`).join("; ")}`);
  lines.push(...entry.explanation);
  return groundNarrative(lines.join("\n\n"), "offline_template", plants, principles);
}
