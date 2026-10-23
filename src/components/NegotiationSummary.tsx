import { useState } from "react";
import type { LlmStatus, NegotiationAnalysis, Stakeholder, SummaryItem } from "../types.ts";
import { SEASONS } from "../types.ts";
import { PRINCIPLES, plantById } from "../knowledge/index.ts";
import { NarrativeBlock } from "./shared.tsx";

interface Props {
  analysis: NegotiationAnalysis | null;
  stakeholders: Stakeholder[];
  status: LlmStatus;
  notices: string[];
  error: string | null;
  running: boolean;
}

const LIMIT = 3;

export default function NegotiationSummary({ analysis, stakeholders, status, notices, error, running }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [evidence, setEvidence] = useState(false);
  const role = (id: string) => stakeholders.find((s) => s.id === id)?.role ?? id;
  const name = (id: string) => plantById(id)?.scientific_name ?? id;
  const label = (id: string) => analysis?.intentions.find((i) => i.id === id)?.statement.replace(/\.$/, "") ?? id;

  return (
    <section>
      <div className="sec-head">
        <h2>AI negotiation</h2>
        <span className="lede">{status.available ? `Language read by ${status.model}; facts checked by code against sourced records.` : "Offline demonstration: a rule parser reads the statements; facts are checked by code against sourced records."}</span>
      </div>
      {error && <div className="err">{error}</div>}
      {notices.map((n, i) => (
        <div className="notice" key={i}>
          {n}
        </div>
      ))}
      {!analysis && <div className="empty">{running ? "Reading the statements and checking the knowledge base…" : "Enter what each party wants, then run the negotiation."}</div>}
      {analysis && (
        <>
          <div className="summary">
            <div className="summary-cols">
              <Column title="Common ground" mark="met" items={analysis.summary.commonGround} glyph={() => "met"} showAll={showAll} empty="No goal pair is verified together with the current records." />
              <Column title="Potential trade-offs" mark="cond" items={analysis.summary.tradeOffs} glyph={(it) => (it.kind === "knowledge_limit" ? "limit" : it.kind === "conflict" ? "limit" : "cond")} showAll={showAll} empty="No tension found between the goals in this knowledge base." />
              <Column title="Needs confirmation" mark="unk" items={analysis.summary.needsConfirmation} glyph={() => "unk"} showAll={showAll} empty="Nothing blocks a judgement." />
            </div>
            <div className="summary-foot">
              <span>Assembled from code checks of {analysis.evaluations.length} sourced plant records against the assumed site. Unknown values stay unknown; they are never treated as failures.</span>
              <span style={{ display: "flex", gap: 16 }}>
                <button className="linkish" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Show fewer points" : "Show all points"}
                </button>
                <button className="linkish" onClick={() => setEvidence((v) => !v)} aria-expanded={evidence}>
                  {evidence ? "Hide details and evidence" : "Details and evidence"}
                </button>
              </span>
            </div>
          </div>

          {evidence && (
          <div className="evidence">
            <div className="body">
              <div>
                <h4>How the statements were read <span className={`tag ${analysis.intentions[0]?.origin === "llm" ? "llm" : "offline"}`}>{analysis.intentions[0]?.origin === "llm" ? "model" : "rule parser"}</span></h4>
                {analysis.intentions.map((i) => (
                  <div className="intent" key={i.id}>
                    <div className="who">
                      {role(i.stakeholderId)} <span className="id">{i.id}</span>
                    </div>
                    <div>
                      <div className="st">{i.statement}</div>
                      <div className="ev">from “{i.evidence}”</div>
                      <div className="tags">
                        <span className={`tag ${i.strength}`}>{i.strength === "must" ? "hard limit" : "preference"}</span>
                        <span className={`tag ${i.checkability}`}>{i.checkability === "database" ? "checkable in records" : i.checkability === "partial" ? "partly checkable" : "design judgement"}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <h4>Season coverage of site-fit plants meeting every checkable goal</h4>
                <div className="seasons">
                  {SEASONS.map((s) => {
                    const c = analysis.seasonCoverage.find((x) => x.season === s)!;
                    return (
                      <div className={`season ${c.plantsSatisfyingAll.length ? "" : "gap"}`} key={s}>
                        <h5>{s}</h5>
                        <div>{c.plantsSatisfyingAll.length ? c.plantsSatisfyingAll.map(name).join(", ") : <em style={{ color: "var(--ochre)" }}>no single plant</em>}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 14 }}>
                  <NarrativeBlock n={analysis.narrative} title="Reasoning text" />
                </div>
              </div>
              <div>
                <h4>Every goal pair, as computed</h4>
                {analysis.relations
                  .filter((r) => r.kind !== "not_checkable")
                  .map((r) => (
                    <div className="rel" key={r.a + r.b}>
                      <span className={`badge ${r.kind}`}>{r.kind.replace("_", " ")}</span>
                      <div>
                        <div className="pair">
                          {label(r.a)} <span style={{ color: "var(--ink-3)" }}>×</span> {label(r.b)}
                        </div>
                        <div className="sum">{r.summary}</div>
                        {r.plantsSatisfyingBoth.length > 0 && <div className="sum" style={{ fontStyle: "italic", color: "var(--ink-3)" }}>Both met by {r.plantsSatisfyingBoth.map(name).join(", ")}</div>}
                      </div>
                    </div>
                  ))}
                <h4>Planting knowledge retrieved for these goals</h4>
                {analysis.retrievedPrincipleIds.map((id) => {
                  const k = PRINCIPLES.find((p) => p.id === id);
                  if (!k) return null;
                  return (
                    <div className="principle" key={id}>
                      <div className="t">
                        <span className="id">{k.id}</span>
                        <b>{k.title}</b>
                        <span className={`tag ${k.type === "sourced_principle" ? "sourced" : "heuristic"}`}>{k.type === "sourced_principle" ? "sourced" : "heuristic"}</span>
                      </div>
                      <div className="s">{k.statement}</div>
                      <div className="src">
                        {k.source ? (
                          <>
                            {k.source.publisher}
                            {k.source.year ? `, ${k.source.year}` : ""} ·{" "}
                            <a href={k.source.url} target="_blank" rel="noreferrer">
                              source
                            </a>
                          </>
                        ) : (
                          "No source: a working hypothesis of this project."
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          )}
        </>
      )}
    </section>
  );
}

function Column({ title, mark, items, glyph, showAll, empty }: { title: string; mark: string; items: SummaryItem[]; glyph: (it: SummaryItem) => string; showAll: boolean; empty: string }) {
  const shown = showAll ? items : items.slice(0, LIMIT);
  return (
    <div className="col">
      <h3>
        <span className={`mark ${mark}`} />
        {title} <span className="count">{items.length}</span>
      </h3>
      {items.length === 0 && <div className="empty-col">{empty}</div>}
      {shown.map((it, i) => (
        <div className="item" key={i}>
          <span className={`glyph ${glyph(it)}`} />
          <div>
            <p>{it.text}</p>
            {(it.plantIds.length > 0 || it.principleIds.length > 0) && (
              <div className="ev" title={[...it.plantIds, ...it.principleIds].join(" ")}>
                Evidence: {it.plantIds.slice(0, 4).join(" ")}
                {it.plantIds.length > 4 ? ` +${it.plantIds.length - 4}` : ""} {it.principleIds.slice(0, 3).join(" ")}
              </div>
            )}
          </div>
        </div>
      ))}
      {!showAll && items.length > LIMIT && <div className="more">{items.length - LIMIT} more</div>}
    </div>
  );
}
