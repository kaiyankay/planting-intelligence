import type { Narrative, PlantRecord } from "../types.ts";
import { plantById } from "../knowledge/index.ts";

export function PlantChip({ id, state }: { id: string; state?: "added" | "removed" }) {
  const p = plantById(id);
  if (!p) return <span className="chip">{id}</span>;
  return (
    <span className={`chip ${state ?? ""}`} title={plantTitle(p)}>
      {p.scientific_name}
    </span>
  );
}

export function plantTitle(p: PlantRecord): string {
  const s = (v: unknown) => (v === "unknown" ? "unknown" : Array.isArray(v) ? v.join(", ") || "none" : String(v));
  return [
    `${p.scientific_name} (${p.common_name})`,
    `light: ${s(p.light.value)} · water: ${p.water.value}${p.water.dry_tolerant ? " (tolerates dry spells)" : ""}`,
    `flowers: ${s(p.flower_colour.value)} in ${s(p.flowering_season.value)}`,
    `evergreen: ${s(p.evergreen.value)} · native to PNW/BC: ${s(p.native_to_pnw_bc.value)}`,
    `height ${s(p.mature_height_m.value)} m · spread ${s(p.mature_spread_m.value)} m`,
    `sources: ${p.sources.map((x) => x.publisher).join("; ")}`,
  ].join("\n");
}

export function NarrativeBlock({ n, title }: { n: Narrative; title?: string }) {
  return (
    <div className="narr">
      <div className="sec-title" style={{ marginBottom: 10 }}>
        <span>{title ?? "Reasoning"}</span>
        <span className={`tag ${n.mode === "llm" ? "llm" : "offline"}`}>{n.mode === "llm" ? `Generated live · ${n.model ?? "Claude"}` : "Offline demonstration · template text, not AI generated"}</span>
      </div>
      {n.text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>{renderCitations(para)}</p>
      ))}
      {n.warnings.length > 0 && <div className="warn">{n.warnings.join(" ")}</div>}
    </div>
  );
}

export function renderCitations(text: string) {
  const parts = text.split(/(\[(?:P|K)-\d{2}\])/g);
  return parts.map((part, i) => {
    const m = part.match(/^\[((?:P|K)-\d{2})\]$/);
    if (!m) return <span key={i}>{part}</span>;
    const id = m[1];
    const p = id.startsWith("P-") ? plantById(id) : undefined;
    return (
      <span key={i} className="cite" title={p ? plantTitle(p) : undefined}>
        {id}
      </span>
    );
  });
}

export function statusWord(s: string) {
  return s.replace(/_/g, " ");
}
