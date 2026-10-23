import type { ConceptDiagram as Diagram, PlantRecord } from "../types.ts";
import { plantById } from "../knowledge/index.ts";

// ---------------------------------------------------------------------------
// CONCEPTUAL COMPOSITION DIAGRAMS.
// Three drawing languages, one per strategy approach, all driven by the
// strategy's layers and the plants inside them: how many groups appear, which
// flower colours they carry (from the records) and whether they are evergreen.
// Deliberately schematic: no site boundary, no dimensions, no counts.
// ---------------------------------------------------------------------------

const W = 360;
const H = 130;

const FLOWER_HEX: Record<string, string> = {
  yellow: "#e2b53a",
  gold: "#e2b53a",
  orange: "#d9843b",
  red: "#b9473d",
  pink: "#d690a6",
  white: "#f1efe6",
  cream: "#efe6c8",
  purple: "#8d6fae",
  blue: "#6d86b8",
};

function flowerColour(p: PlantRecord | undefined): string | null {
  if (!p || p.flower_colour.value === "unknown" || p.flower_colour.value.length === 0) return null;
  const first = p.flower_colour.value.map((c) => c.toLowerCase()).find((c) => Object.keys(FLOWER_HEX).some((k) => c.includes(k)));
  if (!first) return null;
  const key = Object.keys(FLOWER_HEX).find((k) => first.includes(k))!;
  return FLOWER_HEX[key];
}

// Deterministic pseudo-random for stable but organic-looking placement.
function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function blob(cx: number, cy: number, r: number, rnd: () => number, wobble = 0.18): string {
  const n = 9;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wobble / 2 + rnd() * wobble);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1: [number, number] = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: [number, number] = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += i === 0 ? `M ${p1[0]} ${p1[1]} ` : "";
    d += `C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]} `;
  }
  return d + "Z";
}

export default function ConceptDiagram({ d, id }: { d: Diagram; id: string }) {
  const bands = d.bands.filter((b) => b.plantIds.length > 0);
  const byRole = (role: string) => bands.filter((b) => b.role === role).flatMap((b) => b.plantIds);
  const plants = (ids: string[]) => ids.map((x) => plantById(x)).filter(Boolean) as PlantRecord[];
  const rnd = seeded(id.charCodeAt(2) * 97 + bands.length * 13);
  const hid = `hatch-${id}`;
  const did = `dots-${id}`;

  return (
    <figure className="concept-fig">
      <svg className="concept" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Conceptual composition for ${id}`}>
        <defs>
          <pattern id={hid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--green-mid)" strokeWidth="1.2" />
          </pattern>
          <pattern id={did} width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.3" fill="var(--green)" opacity=".55" />
          </pattern>
        </defs>
        {/* ground plane: the whole drawing floats on an open field, no boundary */}
        <rect x="0" y="0" width={W} height={H} fill="transparent" />
        {d.style === "seasonal" && <Seasonal structural={plants(byRole("structural"))} seasonal={plants(byRole("seasonal"))} ground={plants(byRole("ground"))} rnd={rnd} hid={hid} />}
        {d.style === "native" && <Native structural={plants(byRole("structural"))} seasonal={plants(byRole("seasonal"))} accent={plants(byRole("accent"))} ground={plants(byRole("ground"))} rnd={rnd} hid={hid} did={did} />}
        {d.style === "lowinput" && <LowInput structural={plants(byRole("structural"))} ground={plants(byRole("ground"))} rnd={rnd} hid={hid} />}
      </svg>
      <figcaption className="concept-cap">
        <span>Conceptual composition · Not to scale</span>
        <span>{d.caption}</span>
      </figcaption>
    </figure>
  );
}

function shortName(p: PlantRecord): string {
  const parts = p.scientific_name.replace(/'[^']*'/, "").trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}. ${parts[1]}` : parts[0];
}

function Label({ x, y, text, anchor = "start" }: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize="8.5" textAnchor={anchor} fill="var(--ink-2)" fontFamily="Inter, system-ui" stroke="#fff" strokeWidth="3" paintOrder="stroke">
      {text}
    </text>
  );
}

// A: an evergreen frame runs along the back; in front, a left-to-right relay in three season
// columns. Each flowering plant places a drift in every season column its source records,
// tinted with its recorded flower colour, so continuity and gaps are visible at once.
function Seasonal({ structural, seasonal, ground, rnd, hid }: { structural: PlantRecord[]; seasonal: PlantRecord[]; ground: PlantRecord[]; rnd: () => number; hid: string }) {
  const cols: ("spring" | "summer" | "autumn")[] = ["spring", "summer", "autumn"];
  const colW = W / 3;
  const frameN = Math.max(7, structural.length * 3);
  const frameY = 50;
  const flowersIn = (p: PlantRecord, c: string) => p.flowering_season.value !== "unknown" && p.flowering_season.value.includes(c as never);
  return (
    <g>
      {ground.length > 0 && <rect x="0" y="66" width={W} height={H - 80} fill={`url(#${hid})`} opacity=".55" />}
      {/* evergreen frame: continuous overlapping masses along the back; coloured dots where a frame plant flowers in that season */}
      {structural.length > 0 &&
        Array.from({ length: frameN }).map((_, i) => <path key={i} d={blob((W / frameN) * i + W / frameN / 2, frameY + rnd() * 4, 24 + rnd() * 6, rnd, 0.16)} fill="var(--green-deep)" opacity=".85" />)}
      {cols.map((c, ci) =>
        structural
          .filter((p) => flowersIn(p, c) && flowerColour(p))
          .map((p, pi) =>
            Array.from({ length: 5 }).map((_, k) => <circle key={`${p.id}${c}${k}`} cx={colW * ci + 16 + k * ((colW - 32) / 4) + pi * 4} cy={frameY - 6 + rnd() * 12} r="3" fill={flowerColour(p)!} stroke="var(--green-deep)" strokeWidth=".5" />),
          ),
      )}
      {/* season columns */}
      {cols.map((c, ci) => (
        <g key={c}>
          {ci > 0 && <line x1={colW * ci} y1={70} x2={colW * ci} y2={H - 16} stroke="var(--rule)" strokeDasharray="2 4" />}
          <text x={colW * ci + colW / 2} y={H - 4} fontSize="8.5" textAnchor="middle" fill="var(--ink-3)" fontFamily="Inter, system-ui">
            {c}
          </text>
        </g>
      ))}
      {seasonal.flatMap((p, pi) =>
        cols.map((c, ci) => {
          if (!flowersIn(p, c)) return null;
          const colour = flowerColour(p) ?? "#c9d7c9";
          const cx = colW * ci + colW / 2 + (pi - (seasonal.length - 1) / 2) * 26;
          const cy = 94 + (pi % 2) * 8;
          return (
            <g key={p.id + c}>
              <path d={blob(cx, cy, 17 + rnd() * 4, rnd, 0.24)} fill={colour} opacity=".92" stroke="var(--green-deep)" strokeWidth=".6" />
              <path d={blob(cx + 13, cy + 11, 9 + rnd() * 3, rnd, 0.3)} fill={colour} opacity=".8" stroke="var(--green-deep)" strokeWidth=".5" />
            </g>
          );
        }),
      )}
      {/* legend strip, kept clear of the drawing */}
      {structural.length > 0 && <Label x={6} y={12} text={`Evergreen frame: ${structural.map((p) => `${shortName(p)}${p.flowering_season.value !== "unknown" && p.flowering_season.value.length ? ` (${seasonsOf(p)})` : ""}`).join(", ")}`} />}
      {seasonal.map((p, pi) => (
        <Label key={p.id} x={6} y={24 + pi * 11} text={`Drifts: ${shortName(p)} (${seasonsOf(p)})`} />
      ))}
      {seasonal.length === 0 && <Label x={W / 2} y={96} anchor="middle" text="No site-fit flowering plant passes the filters" />}
      {cols.map((c, ci) => {
        const any = [...seasonal, ...structural].some((p) => flowersIn(p, c));
        return any ? null : <Label key={c} x={colW * ci + colW / 2} y={98} anchor="middle" text="gap" />;
      })}
    </g>
  );
}

// B: a large native body of overlapping dark masses, small pollinator clumps inside it, and
// the accent gathered as a tight cluster of coloured dots at the lower-left threshold.
function Native({ structural, seasonal, accent, ground, rnd, hid, did }: { structural: PlantRecord[]; seasonal: PlantRecord[]; accent: PlantRecord[]; ground: PlantRecord[]; rnd: () => number; hid: string; did: string }) {
  const accentColour = flowerColour(accent[0]) ?? null;
  return (
    <g>
      {ground.length > 0 && <rect x="0" y="20" width={W} height={H - 30} fill={`url(#${hid})`} opacity=".5" />}
      {/* native body */}
      {structural.map((p, i) => {
        const cx = 130 + i * (190 / Math.max(structural.length - 1, 1)) + rnd() * 14;
        const cy = 56 + (i % 2) * 18 + rnd() * 8;
        const ever = p.evergreen.value === true;
        return <path key={p.id} d={blob(cx, cy, 38 + rnd() * 8, rnd, 0.2)} fill={ever ? "var(--green-deep)" : "var(--green)"} opacity={ever ? ".88" : ".72"} />;
      })}
      {/* pollinator clumps */}
      {seasonal.map((p, i) => {
        const c = flowerColour(p) ?? "#d9d9d9";
        return <circle key={p.id} cx={200 + i * 48 + rnd() * 20} cy={44 + rnd() * 40} r="8" fill={c} stroke="var(--green-deep)" strokeWidth=".6" />;
      })}
      {seasonal.length === 0 && <rect x="150" y="30" width="180" height="70" fill={`url(#${did})`} opacity=".0" />}
      {/* threshold accent */}
      {accentColour && (
        <g>
          {Array.from({ length: 14 }).map((_, i) => (
            <circle key={i} cx={28 + rnd() * 48} cy={68 + rnd() * 40} r={4 + rnd() * 3.5} fill={accentColour} stroke="var(--green-deep)" strokeWidth=".5" />
          ))}
          <path d={`M 8 ${H - 8} L 8 ${H - 22}`} stroke="var(--ink-3)" strokeWidth="1" />
          <Label x={12} y={H - 5} text={`Threshold accent: ${accent.map(shortName).join(", ")}`} />
        </g>
      )}
      {!accentColour && <Label x={8} y={H - 5} text="No colour accent possible from the records" />}
      <Label x={W - 6} y={12} anchor="end" text={`Native body: ${structural.map(shortName).join(", ")}`} />
      {seasonal.length > 0 && <Label x={W - 6} y={24} anchor="end" text={`Pollinator clumps: ${seasonal.map(shortName).join(", ")}`} />}
    </g>
  );
}

// C: few, large, even groups at mature spacing. Evergreen groups solid, deciduous outlined.
function LowInput({ structural, ground, rnd, hid }: { structural: PlantRecord[]; ground: PlantRecord[]; rnd: () => number; hid: string }) {
  const n = Math.max(structural.length, 1);
  const slot = W / n;
  const cy = 66;
  return (
    <g>
      {ground.length > 0 && <rect x="0" y="24" width={W} height={H - 34} fill={`url(#${hid})`} opacity=".55" />}
      {structural.map((p, i) => {
        const ever = p.evergreen.value === true;
        const cx = slot * i + slot / 2;
        const r = Math.min(slot / 2 - 14, 38);
        const fc = flowerColour(p);
        return (
          <g key={p.id}>
            <circle cx={cx} cy={cy} r={r} fill={ever ? "var(--green-deep)" : "none"} stroke="var(--green-deep)" strokeWidth={ever ? 0 : 1.6} strokeDasharray={ever ? undefined : "4 3"} opacity={ever ? ".9" : "1"} />
            {fc && <circle cx={cx} cy={cy} r={ever ? r * 0.22 : r * 0.45} fill={fc} opacity=".9" />}
            <Label x={cx} y={cy + r + 13} anchor="middle" text={shortName(p)} />
            <text x={cx} y={cy + r + 23} fontSize="7.5" textAnchor="middle" fill="var(--ink-3)" fontFamily="Inter, system-ui">
              {ever ? "evergreen" : "deciduous"}
            </text>
          </g>
        );
      })}
      <Label x={6} y={12} text={`${structural.length} species in large single groups${ground.length ? " · closed ground layer" : ""}`} />
      <text x={W - 6} y={12} fontSize="7.5" textAnchor="end" fill="var(--ink-3)" fontFamily="Inter, system-ui">
        spaced at sourced mature spread{rnd() > 2 ? "" : ""}
      </text>
      {Array.from({ length: n - 1 }).map((_, i) => (
        <line key={i} x1={slot * (i + 1)} y1={30} x2={slot * (i + 1)} y2={H - 30} stroke="var(--rule)" strokeDasharray="2 4" />
      ))}
    </g>
  );
}

function seasonsOf(p: PlantRecord): string {
  if (p.flowering_season.value === "unknown") return "season unknown";
  return p.flowering_season.value.map((s) => s.slice(0, 3)).join("/");
}
