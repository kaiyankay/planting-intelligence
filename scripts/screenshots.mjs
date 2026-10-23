// Captures real 16:9 screenshots of the running prototype with the system Chrome.
// Usage: start the dev server (npm run dev), then: node scripts/screenshots.mjs [baseUrl]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:5173";
mkdirSync("docs/screenshots", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Run negotiation" }).click();
await page.getByRole("heading", { name: "Common ground" }).waitFor();
await page.waitForTimeout(600);
await page.evaluate(() => { document.querySelector(".rail-inner")?.scrollTo(0, 0); window.scrollTo(0, 0); });
// 01: inputs + negotiation summary + strategy cards in one 16:9 view
await page.screenshot({ path: "docs/screenshots/01-core-view.png" });

// 02: strategies in full
await page.evaluate(() => document.querySelector(".cards")?.scrollIntoView({ block: "start" }));
await page.evaluate(() => window.scrollBy(0, -90));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/02-strategies.png" });

// 03: feedback on strategy B with the brief's example comment
await page.locator(".card").nth(1).click();
await page.getByRole("button", { name: "Can we reduce watering without losing too much summer colour?" }).click();
await page.getByRole("button", { name: "Revise strategy" }).click();
await page.getByText("What changed").waitFor();
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector(".workbench")?.scrollIntoView({ block: "start" }));
await page.evaluate(() => window.scrollBy(0, -90));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/03-feedback-revision.png" });

// 04: evidence expanded
await page.evaluate(() => { const d = document.querySelector("details.evidence"); if (d) d.open = true; d?.scrollIntoView({ block: "start" }); window.scrollBy(0, -90); });
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/04-evidence-details.png" });

// 05: layout check at a 1440 x 900 laptop viewport (scrolls; not the presentation frame)
const laptop = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await laptop.goto(base, { waitUntil: "networkidle" });
await laptop.getByRole("button", { name: "Run negotiation" }).click();
await laptop.getByRole("heading", { name: "Common ground" }).waitFor();
await laptop.waitForTimeout(500);
await laptop.screenshot({ path: "docs/screenshots/05-layout-1440x900.png" });

await browser.close();
console.log("Screenshots written to docs/screenshots/");
