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
await page.getByText("Interpreted intentions").waitFor();
await page.waitForTimeout(600);
await page.evaluate(() => { document.querySelector(".rail-inner")?.scrollTo(0, 0); window.scrollTo(0, 0); });
await page.screenshot({ path: "docs/screenshots/01-intentions-and-interpretation.png" });

// Season coverage + reasoning + knowledge
await page.evaluate(() => document.querySelector(".seasons")?.scrollIntoView({ block: "start" }));
await page.evaluate(() => window.scrollBy(0, -120));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/02-season-coverage-and-reasoning.png" });

// Strategies
await page.evaluate(() => document.querySelector(".cards")?.scrollIntoView({ block: "start" }));
await page.evaluate(() => window.scrollBy(0, -150));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/03-strategies-and-tradeoffs.png" });

// Revision: select strategy B (native framework), apply the brief's example feedback
await page.locator(".card").nth(1).click();
await page.getByRole("button", { name: "Can we reduce watering without losing too much summer colour?" }).click();
await page.getByRole("button", { name: /Revise → version/ }).click();
await page.getByText("Why the strategy changed").waitFor();
await page.waitForTimeout(400);
await page.evaluate(() => document.querySelector(".detail")?.scrollIntoView({ block: "start" }));
await page.evaluate(() => window.scrollBy(0, -40));
await page.waitForTimeout(300);
await page.screenshot({ path: "docs/screenshots/04-revision-after-feedback.png" });

await browser.close();
console.log("Screenshots written to docs/screenshots/");
