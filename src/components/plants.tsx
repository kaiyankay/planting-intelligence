import type { PlantRecord } from "../types.ts";
import { plantById } from "../knowledge/index.ts";
import { imageFor, imageSrc } from "../knowledge/images.ts";

// Plant thumbnail: a licensed Wikimedia Commons photo when one is recorded for the species,
// otherwise an illustration mark coloured by the recorded flower colour and labelled as such.
export function PlantThumb({ plant, size = 44 }: { plant: PlantRecord; size?: number }) {
  const img = imageFor(plant.id);
  if (img) {
    return <img className="thumb" src={imageSrc(img)} width={size} height={size} alt={`${plant.scientific_name}, photograph by ${img.author} (${img.license})`} title={`Photo: ${img.author}, ${img.license}, Wikimedia Commons`} loading="lazy" />;
  }
  const colour = thumbColour(plant);
  return (
    <svg className="thumb illus" width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={`${plant.scientific_name}: illustration mark, no licensed photo`}>
      <title>Illustration mark (no licensed photo): colour from the recorded flower colour</title>
      <rect width="44" height="44" rx="6" fill="var(--green-soft)" />
      <circle cx="22" cy="24" r="11" fill={colour ?? "var(--green-mid)"} />
      <path d="M22 13 C 18 8, 14 10, 15 16 C 18 16, 21 15, 22 13 Z" fill="var(--green)" />
    </svg>
  );
}

const HEX: Record<string, string> = { yellow: "#e2b53a", gold: "#e2b53a", orange: "#d9843b", red: "#b9473d", pink: "#d690a6", white: "#f1efe6", cream: "#efe6c8", purple: "#8d6fae", blue: "#6d86b8" };
export function thumbColour(p: PlantRecord): string | null {
  if (p.flower_colour.value === "unknown" || !p.flower_colour.value.length) return null;
  const c = p.flower_colour.value.map((x) => x.toLowerCase()).find((x) => Object.keys(HEX).some((k) => x.includes(k)));
  if (!c) return null;
  return HEX[Object.keys(HEX).find((k) => c.includes(k))!];
}

// Seasonal flowering matrix: only the seasons the sources record. Winter shows evergreen
// foliage, not flowering. Unknown seasons are shown as unknown, not left blank.
const COLS: { key: "spring" | "summer" | "autumn" | "winter"; label: string }[] = [
  { key: "spring", label: "Spr" },
  { key: "summer", label: "Sum" },
  { key: "autumn", label: "Aut" },
  { key: "winter", label: "Win" },
];

export function SeasonMatrix({ plantIds, highlight, extra = 0, removed }: { plantIds: string[]; highlight?: Set<string>; extra?: number; removed?: Set<string> }) {
  const plants = plantIds.map((id) => plantById(id)).filter(Boolean) as PlantRecord[];
  return (
    <div className="matrix" role="table" aria-label="Flowering seasons recorded in sources">
      <div className="mrow mhead" role="row">
        <span className="mname" role="columnheader">
          Flowering by season
        </span>
        {COLS.map((c) => (
          <span key={c.key} className="mcell" role="columnheader">
            {c.label}
          </span>
        ))}
      </div>
      {plants.map((p) => {
        const unknown = p.flowering_season.value === "unknown";
        const seasons = unknown ? [] : p.flowering_season.value;
        const colour = thumbColour(p) ?? "var(--green-mid)";
        return (
          <div className={`mrow ${removed?.has(p.id) ? "mremoved" : ""} ${highlight?.has(p.id) ? "madded" : ""}`} role="row" key={p.id}>
            <span className="mname" role="rowheader" title={p.common_name}>
              {p.scientific_name.split(" ").slice(0, 2).join(" ")}
            </span>
            {COLS.map((c) => {
              if (c.key === "winter") {
                const ever = p.evergreen.value === true;
                return (
                  <span key={c.key} className="mcell" role="cell" title={ever ? "Evergreen foliage recorded" : p.evergreen.value === "unknown" ? "Leaf retention unknown" : "Deciduous"}>
                    {ever ? <i className="mark ever" /> : p.evergreen.value === "unknown" ? <i className="mark unk">?</i> : <i className="mark none" />}
                  </span>
                );
              }
              const on = seasons.includes(c.key);
              return (
                <span key={c.key} className="mcell" role="cell" title={unknown ? "Flowering season not stated in source" : on ? `Flowers in ${c.key} (source)` : ""}>
                  {unknown ? <i className="mark unk">?</i> : on ? <i className="mark on" style={{ background: colour }} /> : <i className="mark none" />}
                </span>
              );
            })}
          </div>
        );
      })}
      {extra > 0 && <div className="mmore">{extra} more plant{extra > 1 ? "s" : ""} in details</div>}
    </div>
  );
}
