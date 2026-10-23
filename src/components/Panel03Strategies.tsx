import { useState } from "react";
import type { LlmStatus, NegotiationAnalysis, Strategy } from "../types.ts";
import { SEASONS } from "../types.ts";
import { PRINCIPLES, plantById } from "../knowledge/index.ts";
import { NarrativeBlock, PlantChip, statusWord } from "./shared.tsx";

interface Props {
  strategies: Strategy[];
  analysis: NegotiationAnalysis | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRevise: (id: string, feedback: string) => Promise<void>;
  revising: boolean;
  status: LlmStatus;
}

const SUGGESTIONS = [
  "Can we reduce watering without losing too much summer colour?",
  "Use more native plants where possible.",
  "Make it easier to maintain; nothing that needs staking or dividing.",
  "We need more winter interest.",
  "Avoid anything toxic; children use this park.",
];

export default function Panel03Strategies({ strategies, analysis, selectedId, onSelect, onRevise, revising, status }: Props) {
  const [feedback, setFeedback] = useState("");
  const selected = strategies.find((s) => s.id === selectedId) ?? null;
  const label = (id: string) => analysis?.intentions.find((i) => i.id === id)?.statement.replace(/\.$/, "") ?? id;

  return (
    <section>
      <div className="panel-head">
        <div>
          <div className="num">Panel 03</div>
          <h2>Design Strategies</h2>
        </div>
        <div className="hint">Alternative design approaches, not re-ranked plant lists. Select one, give feedback in plain language, and the strategy is revised with its reasons recorded as a new version.</div>
      </div>
      {!strategies.length && <div className="empty">Strategies appear after the negotiation has run.</div>}
      <div className="cards">
        {strategies.map((s) => (
          <StrategyCard key={s.id} s={s} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} label={label} />
        ))}
      </div>
      {selected && (
        <div className="detail">
          <div className="detail-head">
            <div>
              <h3>{selected.name}</h3>
              <div className="v">
                {selected.id} · version {selected.version} · {selected.designIntention}
              </div>
            </div>
          </div>
          <div className="grid-2">
            <div>
              <div className="sec-title">
                <span>Knowledge and evidence used</span>
              </div>
              {selected.principleIds.map((id) => {
                const k = PRINCIPLES.find((p) => p.id === id);
                return k ? (
                  <div className="principle" key={id}>
                    <div className="t">
                      <span className="id">{k.id}</span>
                      <b>{k.title}</b>
                      <span className={`tag ${k.type === "sourced_principle" ? "sourced" : "heuristic"}`}>{k.type === "sourced_principle" ? "sourced" : "heuristic"}</span>
                    </div>
                    <div className="src">{k.source ? `${k.source.publisher}` : "Working hypothesis, no source."}</div>
                  </div>
                ) : null;
              })}
              <div className="sec-title" style={{ marginTop: 18 }}>
                <span>Plant records in this strategy</span>
              </div>
              {[...new Set(selected.placements.flatMap((p) => p.plantIds))].map((id) => {
                const p = plantById(id)!;
                return (
                  <div className="principle" key={id}>
                    <div className="t">
                      <span className="id">{p.id}</span>
                      <b style={{ fontStyle: "italic", fontFamily: "var(--serif)", fontSize: 14 }}>{p.scientific_name}</b>
                      <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{p.common_name}</span>
                    </div>
                    <div className="src">
                      water {p.water.value}
                      {p.water.dry_tolerant ? " (tolerates dry spells)" : ""} · flowers {p.flower_colour.value === "unknown" ? "unknown" : p.flower_colour.value.join("/") || "none"} in {p.flowering_season.value === "unknown" ? "unknown season" : p.flowering_season.value.join(", ") || "—"} · {p.evergreen.value === true ? "evergreen" : p.evergreen.value === false ? "deciduous" : "leaf retention unknown"} · native {String(p.native_to_pnw_bc.value)} ·{" "}
                      {p.sources.map((s, i) => (
                        <a key={i} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 6 }}>
                          {s.publisher.split(" ")[0]}
                        </a>
                      ))}
                      {p.missing_information.length > 0 && <span> · missing: {p.missing_information.join(", ")}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div>
              <div className="sec-title">
                <span>Revise this strategy</span>
                <span className={`tag ${status.available ? "llm" : "offline"}`}>{status.available ? "feedback read by LLM" : "feedback read by rule parser"}</span>
              </div>
              <div className="feedback">
                <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="e.g. Can we reduce watering without losing too much summer colour?" />
              </div>
              <div className="sugg">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => setFeedback(s)}>
                    {s}
                  </button>
                ))}
              </div>
              <div className="row-actions">
                <button
                  className="primary"
                  disabled={revising || !feedback.trim()}
                  onClick={async () => {
                    await onRevise(selected.id, feedback);
                    setFeedback("");
                  }}
                >
                  {revising ? "Revising…" : `Revise → version ${selected.version + 1}`}
                </button>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>The designer keeps the decision: nothing is final until you accept it.</span>
              </div>

              <div className="sec-title" style={{ marginTop: 24 }}>
                <span>Version history</span>
              </div>
              {selected.revisionLog.length === 0 && <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Version 1 · generated from the negotiation; no revisions yet.</div>}
              {[...selected.revisionLog].reverse().map((v) => (
                <div className="version" key={v.version}>
                  <div className="vh">
                    <span className="n">v{v.version}</span>
                    <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{new Date(v.timestamp).toLocaleTimeString()}</span>
                    <span style={{ fontSize: 12 }}>
                      read as: {v.adjustments.map((a) => a.kind.replace(/_/g, " ")).join(", ")} <span className={`tag ${v.adjustments[0]?.origin === "llm" ? "llm" : "offline"}`}>{v.adjustments[0]?.origin === "llm" ? "llm" : "rules"}</span>
                    </span>
                  </div>
                  <div className="fb">“{v.feedback}”</div>
                  <div className="diff">
                    <div>
                      <h6>Removed</h6>
                      {v.removed.length ? (
                        v.removed.map((r) => (
                          <div key={r.plantId} style={{ marginBottom: 4 }}>
                            <PlantChip id={r.plantId} state="removed" /> <span style={{ color: "var(--ink-3)" }}>{r.reason}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>none</span>
                      )}
                    </div>
                    <div>
                      <h6>Added</h6>
                      {v.added.length ? (
                        v.added.map((r) => (
                          <div key={r.plantId} style={{ marginBottom: 4 }}>
                            <PlantChip id={r.plantId} state="added" /> <span style={{ color: "var(--ink-3)" }}>{r.reason}</span>
                          </div>
                        ))
                      ) : (
                        <span style={{ color: "var(--ink-3)" }}>none</span>
                      )}
                    </div>
                  </div>
                  <ul className="list" style={{ marginTop: 8 }}>
                    {v.explanation.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                  {v.narrative && (
                    <div style={{ marginTop: 10 }}>
                      <NarrativeBlock n={v.narrative} title="Why the strategy changed" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function StrategyCard({ s, selected, onSelect, label }: { s: Strategy; selected: boolean; onSelect: () => void; label: (id: string) => string }) {
  const latest = s.revisionLog[s.revisionLog.length - 1];
  const added = new Set(latest?.added.map((a) => a.plantId) ?? []);
  return (
    <div className={`card ${selected ? "selected" : ""}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onSelect()}>
      <div className="id">
        <span>{s.id}</span>
        <span>v{s.version}</span>
      </div>
      <h3>{s.name}</h3>
      <p className="approach">{s.approach}</p>
      <div>
        <h5>Composition</h5>
        {s.placements.map((p, i) => (
          <div className="layer" key={i}>
            <div className="role">{p.label}</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{p.approach}</div>
            <div className="chips">
              {p.plantIds.map((id) => (
                <PlantChip key={id} id={id} state={added.has(id) ? "added" : undefined} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div>
        <h5>Flowering by season</h5>
        <div className="minibar">
          {SEASONS.map((se) => (
            <div key={se} className={s.seasonCoverage[se].length ? "on" : ""} title={`${se}: ${s.seasonCoverage[se].map((id) => plantById(id)?.scientific_name).join(", ") || "none"}`} />
          ))}
        </div>
        <div className="minibar-labels">
          {SEASONS.map((se) => (
            <span key={se}>{se.slice(0, 3)}</span>
          ))}
        </div>
      </div>
      <div>
        <h5>Requirements</h5>
        {s.requirementOutcomes.map((o) => (
          <div className="outcome" key={o.intentionId}>
            <span className={`dot ${o.status}`} />
            <div>
              <div>
                {label(o.intentionId)} <span style={{ color: "var(--ink-3)" }}>· {statusWord(o.status)}</span>
              </div>
              <div className="r">{o.reason}</div>
            </div>
          </div>
        ))}
      </div>
      <div>
        <h5>Trade-offs</h5>
        <ul className="list">
          {s.tradeOffs.slice(0, 6).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
          {s.tradeOffs.length === 0 && <li>None detected against the current requirements.</li>}
        </ul>
      </div>
      <div>
        <h5>Unresolved</h5>
        <ul className="list">
          {s.unresolved.slice(0, 4).map((t, i) => (
            <li key={i}>{t}</li>
          ))}
        </ul>
      </div>
      <div className="id" style={{ marginTop: "auto" }}>
        <span>Evidence: {s.principleIds.join(" ")}</span>
      </div>
    </div>
  );
}
