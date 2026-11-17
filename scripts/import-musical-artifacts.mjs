#!/usr/bin/env node
/**
 * Draft candidate entries from the Musical Artifacts catalogue.
 *
 *   node scripts/import-musical-artifacts.mjs --format sf2 --limit 40
 *   node scripts/import-musical-artifacts.mjs --format sf3
 *
 * Output lands in `candidates/` (gitignored). Nothing here is mergeable as-is:
 * candidates default to `install: "external"` pointing at the artifact page,
 * because musical-artifacts.com gates direct file downloads behind a browser
 * challenge, and because each licence has to be reviewed by a human.
 *
 * To promote a candidate: copy it to `soundfonts/<vendor>/<name>.json`, give it
 * a real vendor, verify the licence, and (if the files are hosted somewhere a
 * client may download directly) add a `file`/`archive` entry for that URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "candidates");
const API = "https://musical-artifacts.com/artifacts.json";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : fallback;
};
const format = flag("format", "sf2");
const limit = Number(flag("limit", "40"));
const maxPages = Number(flag("pages", "20"));

if (!["sf2", "sf3"].includes(format)) {
  console.error("--format must be sf2 or sf3");
  process.exit(2);
}

const UA = "ai-daw-soundfont-registry/1 (+https://github.com/heshengtao/ai-daw-soundfont-registry)";

function slugify(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "bank";
}

async function page(pageNumber) {
  const url = `${API}?formats=${format}&page=${pageNumber}`;
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return { items: await response.json(), total: Number(response.headers.get("x-total") ?? 0) };
}

fs.mkdirSync(OUT_DIR, { recursive: true });

let written = 0;
let pages = 0;
outer: for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
  const { items } = await page(pageNumber);
  pages = pageNumber;
  if (items.length === 0) break;
  for (const item of items) {
    if (written >= limit) break outer;
    const slug = `musical-artifacts/${item.id}-${slugify(item.name)}`;
    const page = `https://musical-artifacts.com/artifacts/${item.id}`;
    const candidate = {
      slug,
      name: String(item.name ?? "").trim(),
      vendor: String(item.author ?? "").trim() || "Unknown",
      description: (item.description ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
      homepage: page,
      source: page,
      license: `LicenseRef-musical-artifacts-${slugify(item.license || "unknown")}`,
      license_url: page,
      redistributable: false,
      formats: [format],
      tags: (item.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8),
      files: [
        {
          url: page,
          format,
          install: "external",
          note: `Musical Artifacts licence code: ${item.license ?? "unknown"}; downloads: ${item.download_count ?? 0}`,
        },
      ],
    };
    const file = path.join(OUT_DIR, `${item.id}-${slugify(item.name)}.json`);
    fs.writeFileSync(file, `${JSON.stringify(candidate, null, 2)}\n`);
    written += 1;
  }
}

console.log(`✓ wrote ${written} candidate(s) to candidates/ (${pages} page(s) of ${format})`);
console.log("  review the licence, rewrite the slug/vendor, then move it under soundfonts/");
