import type { LlmStatus, NegotiationAnalysis, Stakeholder } from "../types.ts";
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

export default function Panel02Negotiation({ analysis, stakeholders, status, notices, error, running }: Props) {
  const role = (id: string) => stakeholders.find((s) => s.id === id)?.role ?? id;
  const name = (id: string) => plantById(id)?.scientific_name ?? id;
  const label = (id: string) => analysis?.intentions.find((i) => i.id === id)?.statement.replace(/\.$/, "") ?? id;

  return (
    <section>
      <div className="panel-head">
        <div>
          <div className="num">Panel 02</div>
          <h2>AI Negotiation</h2>
        </div>
        <div className="hint">
          Language is interpreted by {status.available ? `the model (${status.model})` : "a transparent rule parser (offline mode)"}; every plant fact is checked by code against the sourced database; relationships between goals are computed, not asserted.
        </div>
      </div>
      {error && <div className="err">{error}</div>}
      {notices.map((n, i) => (
        <div className="notice" key={i}>
          {n}
        </div>
      ))}
      {!analysis && <div className="empty">{running ? "Interpreting intentions and checking the knowledge base…" : "Enter the parties' goals on the left and run the negotiation."}</div>}
      {analysis && (
        <>
          <div className="grid-2">
            <div className="sec">
              <div className="sec-title">
                <span>Interpreted intentions</span>
                <span className={`tag ${analysis.intentions[0]?.origin === "llm" ? "llm" : "offline"}`}>{analysis.intentions[0]?.origin === "llm" ? "LLM extraction" : "Rule parser"}</span>
              </div>
              {analysis.intentions.map((i) => (
                <div className="intent" key={i.id}>
                  <div className="who">
                    {role(i.stakeholderId)}
                    <div style={{ color: "var(--ink-3)", marginTop: 2 }}>{i.id}</div>
                  </div>
                  <div>
                    <div className="st">{i.statement}</div>
                    <div className="ev">
                      from <q>{i.evidence}</q>
                    </div>
                    <div className="tags">
                      <span className={`tag ${i.strength}`}>{i.strength === "must" ? "hard limit" : "preference"}</span>
                      <span className={`tag ${i.checkability}`}>{i.checkability === "database" ? "checkable in database" : i.checkability === "partial" ? "partly checkable" : "design judgement"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="sec">
              <div className="sec-title">
                <span>Relationship analysis · computed</span>
              </div>
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
                      {r.plantsSatisfyingBoth.length > 0 && <div className="plants">Both met by: {r.plantsSatisfyingBoth.map(name).join(", ")}</div>}
                    </div>
                  </div>
                ))}
              {analysis.relations
                .filter((r) => r.kind === "not_checkable")
                .map((r) => (
                  <div className="rel" key={r.a}>
                    <span className="badge not_checkable">design brief</span>
                    <div>
                      <div className="pair">{label(r.a)}</div>
                      <div className="sum">{r.summary}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="sec">
            <div className="sec-title">
              <span>Season coverage · site-fit plants that meet every database-checkable goal</span>
            </div>
            <div className="seasons">
              {SEASONS.map((s) => {
                const c = analysis.seasonCoverage.find((x) => x.season === s)!;
                return (
                  <div className={`season ${c.plantsSatisfyingAll.length ? "" : "gap"}`} key={s}>
                    <h4>{s}</h4>
                    <div className="row">
                      <b>All goals</b>
                      {c.plantsSatisfyingAll.length ? c.plantsSatisfyingAll.map(name).join(", ") : <span className="none">no single plant</span>}
                    </div>
                    {c.plantsSatisfyingColour.length > 0 && (
                      <div className="row">
                        <b>Colour</b>
                        {c.plantsSatisfyingColour.map(name).join(", ")}
                      </div>
                    )}
                    {c.plantsSatisfyingPollinators.length > 0 && (
                      <div className="row">
                        <b>Pollinator value</b>
                        {c.plantsSatisfyingPollinators.map(name).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="sec">
            <NarrativeBlock n={analysis.narrative} title="Negotiation reasoning" />
          </div>

          <div className="grid-2">
            <div className="sec">
              <div className="sec-title">
                <span>Planting knowledge retrieved</span>
              </div>
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
                        "No source: working hypothesis stated by the project, not a textbook rule."
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="sec">
              <div className="sec-title">
                <span>Needs confirmation before deciding</span>
              </div>
              {analysis.openQuestions.map((q) => (
                <div className="q" key={q.id}>
                  <div>{q.question}</div>
                  <div className="why">{q.why}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
