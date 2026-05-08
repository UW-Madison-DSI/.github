// Render the DSI org banner.
//
// 1. Pulls live stats from the GitHub REST API for ORG (default UW-Madison-DSI).
// 2. Loads profile/template.html in headless Chromium with stats injected.
// 3. Screenshots a 1280×320 viewport to profile/banner.png.
//
// Env vars:
//   GITHUB_TOKEN  required — Actions provides this automatically
//   ORG           optional, default 'UW-Madison-DSI'
//
// Deps: @octokit/rest, playwright (chromium only).

import { Octokit } from "@octokit/rest";
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const ORG = process.env.ORG || "UW-Madison-DSI";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) { console.error("GITHUB_TOKEN is required"); process.exit(1); }

const octokit = new Octokit({ auth: TOKEN });

// ---- Stats ---------------------------------------------------------------

async function getStats() {
  console.log(`Fetching repos for org: ${ORG}`);
  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org: ORG, type: "public", per_page: 100,
  });

  // Count: public, non-archived, non-fork
  const active = repos.filter(r => !r.archived && !r.fork);
  const repoCount = active.length;
  console.log(`  ${repos.length} public · ${repoCount} active (non-archived, non-fork)`);

  // Unique contributors across all active repos
  const contributors = new Set();
  for (const repo of active) {
    try {
      const list = await octokit.paginate(octokit.repos.listContributors, {
        owner: ORG, repo: repo.name, per_page: 100, anon: false,
      });
      for (const c of list) {
        // Skip bots (login ends with [bot] or type is Bot)
        if (c.type === "Bot") continue;
        if (c.login && c.login.endsWith("[bot]")) continue;
        if (c.login) contributors.add(c.login);
      }
    } catch (e) {
      console.warn(`  skip ${repo.name}: ${e.status || e.message}`);
    }
  }
  console.log(`  ${contributors.size} unique contributors`);

  return { repos: repoCount, contributors: contributors.size };
}

// ---- Render --------------------------------------------------------------

function fmt(n) {
  // 1234 -> "1,234"; small numbers unchanged
  return new Intl.NumberFormat("en-US").format(n);
}

async function render({ repos, contributors }) {
  const templatePath = path.join(ROOT, "profile", "template.html");
  const outPath = path.join(ROOT, "profile", "banner.png");

  let html = await fs.readFile(templatePath, "utf8");
  // Inject the live numbers by replacing the default text content.
  // The template uses #stat-repos and #stat-contributors as anchors.
  html = html
    .replace(/(<div class="n red" id="stat-repos">)[^<]*(<\/div>)/, `$1${fmt(repos)}$2`)
    .replace(/(<div class="n" id="stat-contributors">)[^<]*(<\/div>)/, `$1${fmt(contributors)}$2`);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 200 },
      deviceScaleFactor: 2,    // crisper output
    });
    const page = await ctx.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    // Wait for fonts so the screenshot doesn't catch the FOUT
    await page.evaluate(() => document.fonts.ready);
    const buf = await page.locator("#banner").screenshot({ type: "png", omitBackground: false });
    await fs.writeFile(outPath, buf);
    console.log(`Wrote ${outPath} (${buf.length} bytes)`);
  } finally {
    await browser.close();
  }
}

// ---- Run -----------------------------------------------------------------

const stats = await getStats();
await render(stats);
