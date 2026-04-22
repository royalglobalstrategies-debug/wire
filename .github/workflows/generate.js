/**
 * generate.js
 * Run by GitHub Actions to pre-fetch all Catholic news articles.
 * Writes articles-cache.json which index.html reads on load.
 *
 * Usage: ANTHROPIC_API_KEY=sk-... node generate.js
 */

import fetch from "node-fetch";
import fs from "fs/promises";

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("❌  ANTHROPIC_API_KEY not set");
  process.exit(1);
}

const SOURCES = [
  { id: "ewtnnews",             label: "EWTN News",                domain: "www.ewtnnews.com" },
  { id: "europeanconservative", label: "European Conservative",    domain: "europeanconservative.com" },
  { id: "ncregister",           label: "National Catholic Register",domain: "www.ncregister.com" },
  { id: "realclearreligion",    label: "RealClear Religion",       domain: "www.realclearreligion.org" },
  { id: "osvnews",              label: "OSV News",                 domain: "www.osvnews.com" },
  { id: "dianemontagna",        label: "Diane Montagna",           domain: "dianemontagna.substack.com" },
  { id: "edwardpentin",         label: "Edward Pentin",            domain: "edwardpentin.substack.com" },
  { id: "firstthings",          label: "First Things",             domain: "firstthings.com" },
  { id: "catholicculture",      label: "Catholic Culture",         domain: "www.catholicculture.org" },
  { id: "aciafrica",            label: "ACI Africa",               domain: "www.aciafrica.org" },
  { id: "catholicherald",       label: "Catholic Herald",          domain: "thecatholicherald.com" },
  { id: "asianews",             label: "Asia News",                domain: "www.asianews.it/en.html" },
  { id: "fides",                label: "Fides News",               domain: "www.fides.org/en" },
  { id: "vaticannews",          label: "Vatican News",             domain: "www.vaticannews.va/en.html" },
  { id: "publicdiscourse",      label: "The Public Discourse",     domain: "www.thepublicdiscourse.com" },
];

const BATCH_SIZE = 3;
const DELAY_MS   = 1500; // polite delay between batches

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchSource(source) {
  const prompt = `Search for the 5 most recent news articles published on ${source.domain} (${source.label}).
Return ONLY a JSON array — no markdown fences, no preamble, nothing else:
[{"title":"...","summary":"One sentence, max 20 words","url":"full URL","date":"e.g. April 14, 2026"}]
Only include real articles from this specific site. Minimum 1, maximum 5.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.find(b => b.type === "text")?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) return JSON.parse(match[0]);
  return [];
}

async function main() {
  console.log(`\n🕊  Catholic Wire — article fetch starting (${new Date().toUTCString()})\n`);
  const results = {};
  let total = 0;

  for (let i = 0; i < SOURCES.length; i += BATCH_SIZE) {
    const batch = SOURCES.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async source => {
      try {
        console.log(`  ⏳  ${source.label}…`);
        const articles = await fetchSource(source);
        results[source.id] = articles;
        total += articles.length;
        console.log(`  ✅  ${source.label} — ${articles.length} article(s)`);
      } catch (err) {
        console.error(`  ❌  ${source.label} — ${err.message}`);
        results[source.id] = [];
      }
    }));

    if (i + BATCH_SIZE < SOURCES.length) await sleep(DELAY_MS);
  }

  const cache = { generatedAt: new Date().toISOString(), articles: results };
  await fs.writeFile("articles-cache.json", JSON.stringify(cache, null, 2), "utf8");
  console.log(`\n✨  Done. ${total} articles across ${SOURCES.length} sources.`);
  console.log(`📄  Wrote articles-cache.json\n`);
}

main().catch(err => { console.error(err); process.exit(1); });
