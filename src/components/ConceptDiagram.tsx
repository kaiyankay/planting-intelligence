import type { ConceptDiagram as Diagram } from "../types.ts";
import { plantById } from "../knowledge/index.ts";

// A deliberately schematic drawing of the strategy's layers. It encodes only
// what the strategy states (which layers exist, roughly how much of the bed each
// takes, where the accent sits). It is not a plan: no dimensions, no counts.
export default function ConceptDiagram({ d, id }: { d: Diagram; id: string }) {
  const W = 320;
  const H = 64;
  const bands = d.bands.filter((b) => b.plantIds.length > 0);
  const total = bands.reduce((a, b) => a + b.share, 0) || 1;
  let x = 0;
  const pid = `dots-${id}`;
  const hid = `hatch-${id}`;
  return (
    <div>
      <svg className="concept" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Conceptual layer diagram for ${id}`}>
        <defs>
          <pattern id={pid} width="8" height="8" patternUnits="userSpaceOnUse">
            <circle cx="4" cy="4" r="2.2" fill="var(--green)" opacity=".75" />
          </pattern>
          <pattern id={hid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--green-mid)" strokeWidth="1.5" />
          </pattern>
        </defs>
        {/* path edge */}
        <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="var(--rule)" strokeWidth="1" />
        <text x="0" y={H - 0.5} fontSize="7.5" fill="var(--ink-3)" fontFamily="Inter, system-ui">
          path / entrance side
        </text>
        {bands.map((b) => {
          const w = (b.share / total) * W;
          const names = b.plantIds.map((p) => plantById(p)?.scientific_name ?? p).join(", ");
          const el = (
            <g key={b.label + x}>
              <title>{`${b.label}: ${names}`}</title>
              {b.pattern === "mass" && <rect x={x + 1} y={8} width={w - 2} height={H - 22} rx="4" fill="var(--green)" opacity=".82" />}
              {b.pattern === "drift" && <rect x={x + 1} y={8} width={w - 2} height={H - 22} rx="4" fill={`url(#${pid})`} stroke="var(--green-mid)" />}
              {b.pattern === "ground" && <rect x={x + 1} y={8} width={w - 2} height={H - 22} rx="4" fill={`url(#${hid})`} stroke="var(--rule)" />}
              {b.pattern === "accent" && (
                <>
                  <rect x={x + 1} y={8} width={w - 2} height={H - 22} rx="4" fill="var(--green-soft)" stroke="var(--green-mid)" />
                  <circle cx={x + w / 2} cy={20} r={Math.min(w, H) / 6} fill="#d9b42a" />
                </>
              )}
              <text x={x + w / 2} y={b.pattern === "accent" ? H - 14 : H / 2 - 3} fontSize="8" textAnchor="middle" fill={b.pattern === "mass" ? "#fff" : "var(--ink)"} stroke={b.pattern === "mass" ? "none" : "#fff"} strokeWidth="3" paintOrder="stroke" fontFamily="Inter, system-ui">
                {b.label}
              </text>
            </g>
          );
          x += w;
          return el;
        })}
      </svg>
      <div className="concept-cap">Conceptual. {d.caption}</div>
    </div>
  );
}
