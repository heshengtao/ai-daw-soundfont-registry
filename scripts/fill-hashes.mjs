#!/usr/bin/env node
/**
 * Fill in `size` and `sha256` for downloadable files by streaming each URL once.
 *
 *   node scripts/fill-hashes.mjs --all
 *   node scripts/fill-hashes.mjs musescore/general freepats/concert-harp
 *   node scripts/fill-hashes.mjs --all --only-missing
 *
 * Only `install: "file"` and `install: "archive"` entries are fetched; external
 * links are skipped. The downloaded bytes are never written to disk.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANKS_DIR = path.join(ROOT, "soundfonts");

const args = process.argv.slice(2);
const ALL = args.includes("--all");
const ONLY_MISSING = args.includes("--only-missing");
const slugs = args.filter((arg) => !arg.startsWith("--"));

if (!ALL && slugs.length === 0) {
  console.error("usage: node scripts/fill-hashes.mjs (--all | <slug>...) [--only-missing]");
  process.exit(2);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

async function digest(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "ai-daw-soundfont-registry/1 (+https://github.com/heshengtao/ai-daw-soundfont-registry)" },
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of Readable.fromWeb(response.body)) {
    bytes += chunk.length;
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size: bytes };
}

const files = walk(BANKS_DIR);
let updated = 0;

for (const file of files) {
  const entry = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!ALL && !slugs.includes(entry.slug)) continue;

  let dirty = false;
  for (const item of entry.files ?? []) {
    if (item.install === "external") continue;
    if (ONLY_MISSING && item.sha256) continue;
    process.stdout.write(`  ${entry.slug} ${item.format} ← ${item.url}\n`);
    try {
      const { sha256, size } = await digest(item.url);
      if (item.size !== size) {
        console.log(`    size ${item.size ?? "?"} → ${size}`);
        item.size = size;
        dirty = true;
      }
      if (item.sha256 !== sha256) {
        console.log(`    sha256 ${sha256}`);
        item.sha256 = sha256;
        dirty = true;
      }
    } catch (error) {
      console.error(`    ✗ failed: ${error?.message ?? error}`);
      process.exitCode = 1;
    }
  }

  if (dirty) {
    fs.writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`);
    updated += 1;
  }
}

console.log(`✓ ${updated} file(s) updated — run node scripts/validate.mjs to refresh registry.json`);
