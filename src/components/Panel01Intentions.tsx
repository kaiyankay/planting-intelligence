import type { SiteAssumptions, Stakeholder } from "../types.ts";

interface Props {
  stakeholders: Stakeholder[];
  onChange: (s: Stakeholder[]) => void;
  site: SiteAssumptions;
  onSite: (s: SiteAssumptions) => void;
  onRun: () => void;
  running: boolean;
}

export default function Panel01Intentions({ stakeholders, onChange, site, onSite, onRun, running }: Props) {
  const update = (id: string, patch: Partial<Stakeholder>) => onChange(stakeholders.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => onChange(stakeholders.filter((s) => s.id !== id));
  const add = () => onChange([...stakeholders, { id: `party-${Date.now().toString(36)}`, role: "New stakeholder", statement: "" }]);
  const setSite = <K extends "light" | "irrigation" | "drainage">(key: K, value: string) =>
    onSite({ ...site, [key]: { ...site[key], value: value as any, provenance: value === "unknown" ? "unknown" : "user_confirmed", note: value === "unknown" ? site[key].note : "Set in the interface by the reviewer (still a test input, not a survey)." } });

  return (
    <div className="rail-inner">
      <div className="panel-head">
        <div>
          <div className="num">Panel 01</div>
          <h2>Design Intentions</h2>
        </div>
      </div>
      <p className="site note" style={{ marginTop: 0 }}>
        Natural-language goals from each party. Synthetic roles for a test scenario; not consultation records.
      </p>
      {stakeholders.map((s) => (
        <div className="stake" key={s.id}>
          <div className="stake-top">
            <input value={s.role} onChange={(e) => update(s.id, { role: e.target.value })} aria-label="Stakeholder role" />
            <button className="x" onClick={() => remove(s.id)} title="Remove stakeholder" aria-label="Remove stakeholder">
              ×
            </button>
          </div>
          <textarea value={s.statement} onChange={(e) => update(s.id, { statement: e.target.value })} placeholder="What does this party want from the planting?" />
        </div>
      ))}
      <button className="ghost" onClick={add}>
        + Add a stakeholder
      </button>
      <div style={{ height: 16 }} />
      <button className="primary" onClick={onRun} disabled={running || stakeholders.every((s) => !s.statement.trim())}>
        {running ? "Negotiating…" : "Run negotiation"}
      </button>

      <div className="site">
        <h3>Site conditions · synthetic assumptions</h3>
        <p className="note">{site.disclaimer}</p>
        <SiteRow label="Light" tag={site.light.provenance}>
          <select value={site.light.value} onChange={(e) => setSite("light", e.target.value)}>
            <option value="full_sun">Full sun</option>
            <option value="partial_shade">Partial shade</option>
            <option value="shade">Shade</option>
            <option value="unknown">Unknown</option>
          </select>
        </SiteRow>
        <SiteRow label="Irrigation" tag={site.irrigation.provenance}>
          <select value={site.irrigation.value} onChange={(e) => setSite("irrigation", e.target.value)}>
            <option value="none">None</option>
            <option value="establishment_only">Establishment only</option>
            <option value="seasonal">Seasonal irrigation</option>
            <option value="unknown">Unknown</option>
          </select>
        </SiteRow>
        <SiteRow label="Drainage" tag={site.drainage.provenance}>
          <select value={site.drainage.value} onChange={(e) => setSite("drainage", e.target.value)}>
            <option value="well_drained">Well drained</option>
            <option value="poorly_drained">Poorly drained</option>
            <option value="mixed">Mixed</option>
            <option value="unknown">Unknown</option>
          </select>
        </SiteRow>
        <SiteRow label="Soil" tag={site.soil.provenance}>
          <span style={{ color: "var(--ink-3)" }}>unknown</span>
        </SiteRow>
        <SiteRow label="Bed area" tag={site.bed_area_m2.provenance}>
          <span style={{ color: "var(--ink-3)" }}>unknown</span>
        </SiteRow>
        <SiteRow label="Existing plants" tag={site.existing_vegetation.provenance}>
          <span style={{ color: "var(--ink-3)" }}>unknown</span>
        </SiteRow>
        <p className="footer-note">{site.context_reference}</p>
      </div>
    </div>
  );
}

function SiteRow({ label, tag, children }: { label: string; tag: string; children: React.ReactNode }) {
  const cls = tag === "synthetic_assumption" ? "synthetic" : tag === "user_confirmed" ? "user" : "unknown";
  const text = tag === "synthetic_assumption" ? "synthetic" : tag === "user_confirmed" ? "set here" : "unknown";
  return (
    <div className="site-row">
      <span>{label}</span>
      <span>{children}</span>
      <span className={`tag ${cls}`}>{text}</span>
    </div>
  );
}
