// Downloads the licensed Wikimedia Commons thumbnails listed in src/knowledge/plant-images.json
// into public/plants/<id>.jpg and regenerates docs/IMAGE-CREDITS.md from the same metadata.
// Run once after editing plant-images.json: node scripts/fetch-plant-images.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const list = JSON.parse(readFileSync("src/knowledge/plant-images.json", "utf8"));
mkdirSync("public/plants", { recursive: true });
const lines = [
  "# Image credits",
  "",
  "Plant thumbnails shown in the interface are photographs from Wikimedia Commons, used under the licence stated for each file. They were downloaded by `scripts/fetch-plant-images.mjs` at 480 px width and copied to `public/plants/`. Each image was selected because its Commons description or categories name the species; no AI-generated or substitute-species images are used. Plants without an entry here are shown with a labelled illustration mark instead.",
  "",
  "| Record | Species | File (Commons) | Author | Licence |",
  "|---|---|---|---|---|",
];
for (const img of list) {
  const url = img.thumb_url;
  const res = await fetch(url, { headers: { "User-Agent": "PlantingIntelligence/0.1 (UBC ARCH 540 research prototype; contact via repository)" } });
  if (!res.ok) {
    console.error(`${img.id}: download failed ${res.status} ${url}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`public/plants/${img.id}.jpg`, buf);
  console.log(`${img.id} ${img.species}: ${(buf.length / 1024).toFixed(0)} kB`);
  lines.push(`| ${img.id} | *${img.species}* | [${img.file.replace(/^File:/, "")}](${img.page_url}) | ${img.author} | [${img.license}](${img.license_url}) |`);
}
writeFileSync("docs/IMAGE-CREDITS.md", lines.join("\n") + "\n");
console.log("Wrote docs/IMAGE-CREDITS.md");
