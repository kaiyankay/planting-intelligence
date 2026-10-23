import type { NegotiationAnalysis, PlantRecord, Strategy } from "../types.ts";
import { plantById } from "../knowledge/index.ts";
import ConceptDiagram from "./ConceptDiagram.tsx";
import { PlantThumb, SeasonMatrix } from "./plants.tsx";

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
        <span className="lede">Three pre-authored approaches, filled from the records. Select one to see details and give feedback.</span>
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

// Representative plants for the palette: one per layer in display order, up to three.
export function representativePlants(s: Strategy, max = 3): { plant: PlantRecord; role: string }[] {
  const out: { plant: PlantRecord; role: string }[] = [];
  const order = ["accent", "seasonal", "structural", "ground"];
  for (const role of order) {
    for (const p of s.placements.filter((x) => x.role === role)) {
      for (const id of p.plantIds) {
        const plant = plantById(id);
        if (plant && !out.some((o) => o.plant.id === id)) out.push({ plant, role: p.label });
        if (out.length >= max) return out;
      }
    }
  }
  return out;
}

function StrategyCard({ s, selected, onSelect }: { s: Strategy; selected: boolean; onSelect: () => void }) {
  const ids = [...new Set(s.placements.flatMap((p) => p.plantIds))];
  const latest = s.revisionLog[s.revisionLog.length - 1];
  const added = new Set(latest?.added.map((a) => a.plantId) ?? []);
  const palette = representativePlants(s);
  return (
    <article className={`card ${selected ? "selected" : ""}`} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()} aria-pressed={selected}>
      <div className="top">
        <span className="id">
          {s.id}
          {s.version > 1 ? ` · v${s.version}` : ""}
        </span>
        <span className="pick">{selected ? "Selected" : "Select"}</span>
      </div>
      <ConceptDiagram d={s.concept} id={s.id} />
      <h3>{s.name}</h3>
      <p className="approach">{s.approach}</p>
      <div className="palette">
        {palette.map(({ plant, role }) => (
          <div className="pal" key={plant.id} title={`${plant.scientific_name} · ${role}`}>
            <PlantThumb plant={plant} size={52} />
            <div className="pal-text">
              <div className="pal-common">{plant.common_name.split(" (")[0]}</div>
              <div className="pal-sci">{plant.scientific_name.replace(/ var\. sullivantii/, "")}</div>
            </div>
          </div>
        ))}
      </div>
      <SeasonMatrix plantIds={ids.slice(0, 3)} highlight={added} extra={ids.length - 3} />
      <div className="kv">
        <div>
          <h5>Main benefit</h5>
          <div className="benefit">{s.benefits.length ? `Meets ${s.benefits.slice(0, 3).map((b) => b.toLowerCase()).join(", ")}${s.benefits.length > 3 ? ` and ${s.benefits.length - 3} more` : ""}.` : "No goal is fully met with the current records."}</div>
        </div>
        <div>
          <h5>Main trade-off</h5>
          <div className="tradeoff">{s.mainTradeOff}</div>
        </div>
      </div>
    </article>
  );
}
