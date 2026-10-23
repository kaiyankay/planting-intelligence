import type { NegotiationAnalysis, Strategy } from "../types.ts";
import { plantById } from "../knowledge/index.ts";
import ConceptDiagram from "./ConceptDiagram.tsx";

interface Props {
  strategies: Strategy[];
  analysis: NegotiationAnalysis | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function StrategyCards({ strategies, selectedId, onSelect }: Props) {
  return (
    <section>
      <div className="sec-head">
        <h2>Design strategies</h2>
        <span className="lede">Three ways to reconcile the goals. Pick one to see its details and give feedback.</span>
      </div>
      {!strategies.length && <div className="empty">Strategies appear after the negotiation has run.</div>}
      <div className="cards">
        {strategies.map((s) => (
          <StrategyCard key={s.id} s={s} selected={s.id === selectedId} onSelect={() => onSelect(s.id)} />
        ))}
      </div>
    </section>
  );
}

function StrategyCard({ s, selected, onSelect }: { s: Strategy; selected: boolean; onSelect: () => void }) {
  const latest = s.revisionLog[s.revisionLog.length - 1];
  const added = new Set(latest?.added.map((a) => a.plantId) ?? []);
  const ids = [...new Set(s.placements.flatMap((p) => p.plantIds))];
  return (
    <div className={`card ${selected ? "selected" : ""}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()} aria-pressed={selected}>
      <div className="top">
        <span>
          {s.id}
          {s.version > 1 ? ` · version ${s.version}` : ""}
        </span>
        <span className="pick">{selected ? "Selected" : "Select"}</span>
      </div>
      <ConceptDiagram d={s.concept} id={s.id} />
      <h3>{s.name}</h3>
      <p className="approach">{s.approach}</p>
      <div>
        <h5>Key planting</h5>
        <div className="chips">
          {ids.slice(0, 4).map((id) => (
            <span key={id} className={`chip ${added.has(id) ? "added" : ""}`} title={plantById(id)?.common_name}>
              {plantById(id)?.scientific_name ?? id}
            </span>
          ))}
          {ids.length > 4 && <span className="chip muted">+{ids.length - 4}</span>}
        </div>
      </div>
      <div className="kv">
        <div>
          <h5>Meets</h5>
          {s.benefits.length ? (
            <ul>
              {s.benefits.slice(0, 3).map((b) => (
                <li key={b}>{b}</li>
              ))}
              {s.benefits.length > 3 && <li>and {s.benefits.length - 3} more</li>}
            </ul>
          ) : (
            <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>No goal fully met with current records</div>
          )}
        </div>
        <div>
          <h5>Main trade-off</h5>
          <div className="tradeoff">{s.mainTradeOff}</div>
        </div>
      </div>
    </div>
  );
}
