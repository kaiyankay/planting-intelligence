import { useState } from "react";
import type { LlmStatus, NegotiationAnalysis, Strategy } from "../types.ts";
import { PRINCIPLES, plantById } from "../knowledge/index.ts";
import { shortLabel } from "../engine/summary.ts";
import { NarrativeBlock, PlantChip, statusWord } from "./shared.tsx";
import ConceptDiagram from "./ConceptDiagram.tsx";
import { SeasonMatrix } from "./plants.tsx";

interface Props {
  strategy: Strategy | null;
  analysis: NegotiationAnalysis | null;
  onRevise: (id: string, feedback: string) => Promise<void>;
  revising: boolean;
  status: LlmStatus;
  notices: string[];
}

const SUGGESTIONS = [
  "Can we reduce watering without losing too much summer colour?",
  "Use more native plants where possible.",
  "Make it easier to maintain; nothing that needs staking.",
  "We need more winter interest.",
  "Avoid anything toxic; children use this park.",
];

export default function Feedback({ strategy, analysis, onRevise, revising, status, notices }: Props) {
  const [feedback, setFeedback] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  if (!strategy) return null;
  const s = strategy;
  const latest = s.revisionLog[s.revisionLog.length - 1];
  const earlier = s.revisionLog.slice(0, -1);
  const lbl = (id: string) => {
    const i = analysis?.intentions.find((x) => x.id === id);
    return i ? shortLabel(i) : id;
  };
  const remaining = s.requirementOutcomes.filter((o) => o.status === "unmet" || o.status === "partially_satisfied");
  const ids = [...new Set(s.placements.flatMap((p) => p.plantIds))];

  return (
    <section>
      <div className="sec-head">
        <h2>Feedback on “{s.name}”</h2>
        <span className="lede">Say what should change in plain language. The strategy is re-checked against the plant records and revised; every change carries its reason.</span>
      </div>
      <div className="workbench">
        <div className="pane feedback">
          <h3>Revise this strategy</h3>
          <div className="meta">
            Version {s.version} · feedback read by {status.available ? "the model" : "a rule parser (offline)"}
          </div>
          {notices.map((n, i) => (
            <div className="notice" key={i}>
              {n}
            </div>
          ))}
          <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. Can we reduce watering without losing too much summer colour?" aria-label="Feedback" />
          <div className="sugg">
            {SUGGESTIONS.map((x) => (
              <button key={x} onClick={() => setFeedback(x)}>
                {x}
              </button>
            ))}
          </div>
          <div className="row-actions">
            <button
              className="primary"
              disabled={revising || !feedback.trim()}
              onClick={async () => {
                await onRevise(s.id, feedback);
                setFeedback("");
              }}
            >
              {revising ? "Revising…" : "Revise strategy"}
            </button>
            <span>You keep the decision. A revision is a new version; the earlier one stays available.</span>
          </div>

          <h4>Why this approach</h4>
          <ul className="list">
            {s.appliedPrinciples.map((a) => {
              const k = PRINCIPLES.find((p) => p.id === a.id);
              return (
                <li key={a.id + a.decision}>
                  <span className="id">{a.id}</span> {a.decision}
                  {k && <span style={{ color: "var(--ink-3)" }}> ({k.type === "sourced_principle" ? k.source?.publisher.split(";")[0] : "working hypothesis"})</span>}
                </li>
              );
            })}
          </ul>
          <button className="linkish" style={{ marginTop: 12 }} onClick={() => setShowDetails((v) => !v)}>
            {showDetails ? "Hide full details" : "Show full details: layers, every requirement, trade-offs, plant records"}
          </button>
          {showDetails && (
            <div>
              <h4>Composition by layer</h4>
              {s.placements.map((p, i) => (
                <div key={i} style={{ padding: "6px 0", borderTop: "1px solid var(--rule-2)", fontSize: 12.5 }}>
                  <b>{p.label}</b> <span style={{ color: "var(--ink-3)" }}>{p.approach}</span>
                  <div className="chips" style={{ marginTop: 4 }}>
                    {p.plantIds.map((id) => (
                      <PlantChip key={id} id={id} />
                    ))}
                  </div>
                </div>
              ))}
              <h4>Every requirement</h4>
              {s.requirementOutcomes.map((o) => (
                <div className="outcome" key={o.intentionId}>
                  <span className={`dot ${o.status}`} />
                  <div>
                    {lbl(o.intentionId)} <span style={{ color: "var(--ink-3)" }}>· {statusWord(o.status)}</span>
                    <div className="r">{o.reason}</div>
                  </div>
                </div>
              ))}
              <h4>All trade-offs and cautions</h4>
              <ul className="list">
                {s.tradeOffs.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              <h4>Unresolved</h4>
              <ul className="list">
                {s.unresolved.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
              <h4>Plant records used</h4>
              {ids.map((id) => {
                const p = plantById(id)!;
                return (
                  <div className="principle" key={id}>
                    <div className="t">
                      <span className="id">{p.id}</span>
                      <b style={{ fontStyle: "italic", fontFamily: "var(--serif)", fontWeight: 500 }}>{p.scientific_name}</b>
                      <span style={{ color: "var(--ink-3)" }}>{p.common_name}</span>
                    </div>
                    <div className="src">
                      water {p.water.value}
                      {p.water.dry_tolerant ? " (tolerates dry spells)" : ""} · flowers {p.flower_colour.value === "unknown" ? "unknown" : p.flower_colour.value.join("/") || "none"} in {p.flowering_season.value === "unknown" ? "unknown season" : p.flowering_season.value.join(", ") || "—"} · {p.evergreen.value === true ? "evergreen" : p.evergreen.value === false ? "deciduous" : "leaf retention unknown"} · native {String(p.native_to_pnw_bc.value)} ·{" "}
                      {p.sources.map((src, i) => (
                        <a key={i} href={src.url} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>
                          {src.publisher.split(" ")[0]}
                        </a>
                      ))}
                      {p.missing_information.length > 0 && <span>· not stated: {p.missing_information.join(", ")}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="pane">
          {!latest && (
            <>
              <h3>What a revision shows</h3>
              <div className="meta">After you send feedback, this pane shows what changed, why, and which trade-off remains.</div>
              <h4>Trade-offs in version {s.version}</h4>
              <ul className="list">
                {remaining.length ? remaining.map((o) => <li key={o.intentionId}>{lbl(o.intentionId)}: {o.reason}</li>) : <li>No requirement is unmet with the current records.</li>}
              </ul>
            </>
          )}
          {latest && (
            <>
              <h3>Version {latest.version - 1} → {latest.version}</h3>
              <div className="meta">
                In response to “{latest.feedback}” · read as {latest.adjustments.map((a) => a.kind.replace(/_/g, " ")).join(", ")}
              </div>
              <div className="compare">
                <div className="cmp">
                  <h5>Previous · v{latest.version - 1}</h5>
                  <ConceptDiagram d={latest.before.concept} id={`${s.id}-before`} />
                  <SeasonMatrix plantIds={latest.before.plantIds} removed={new Set(latest.removed.map((r) => r.plantId))} />
                </div>
                <div className="cmp">
                  <h5>Revised · v{latest.version}</h5>
                  <ConceptDiagram d={s.concept} id={`${s.id}-after`} />
                  <SeasonMatrix plantIds={ids} highlight={new Set(latest.added.map((a) => a.plantId))} />
                </div>
              </div>
              <div className="change">
                <div className="blk">
                  <h5>What changed</h5>
                  {latest.removed.length === 0 && latest.added.length === 0 && <p>No plant was added or removed; see why below.</p>}
                  {latest.removed.map((r) => (
                    <div key={r.plantId} style={{ marginBottom: 4 }}>
                      <PlantChip id={r.plantId} state="removed" /> <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.reason}</span>
                    </div>
                  ))}
                  {latest.added.map((r) => (
                    <div key={r.plantId} style={{ marginBottom: 4 }}>
                      <PlantChip id={r.plantId} state="added" /> <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{r.reason}</span>
                    </div>
                  ))}
                </div>
                <div className="blk why">
                  <h5>Why it changed</h5>
                  <ul>
                    {latest.explanation.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
                <div className="blk">
                  <h5>What trade-off remains</h5>
                  <ul>
                    {remaining.length ? remaining.map((o) => <li key={o.intentionId}>{lbl(o.intentionId)}: {o.reason}</li>) : <li>No requirement is unmet with the current records; site unknowns remain.</li>}
                  </ul>
                </div>
              </div>
              {latest.narrative && latest.narrative.mode === "llm" && (
                <div style={{ marginTop: 12 }}>
                  <NarrativeBlock n={latest.narrative} title="Explanation" />
                </div>
              )}
              {earlier.length > 0 && (
                <details className="inline">
                  <summary>Earlier versions ({earlier.length})</summary>
                  {[...earlier].reverse().map((v) => (
                    <div className="version" key={v.version}>
                      <b>Version {v.version}</b> · <span className="fb">“{v.feedback}”</span>
                      <div style={{ color: "var(--ink-3)" }}>
                        removed {v.removed.map((r) => plantById(r.plantId)?.scientific_name).join(", ") || "none"}; added {v.added.map((r) => plantById(r.plantId)?.scientific_name).join(", ") || "none"}
                      </div>
                    </div>
                  ))}
                </details>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
