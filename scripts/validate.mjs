#!/usr/bin/env node
/**
 * Validate every entry under `soundfonts/` and regenerate `registry.json`.
 *
 *   node scripts/validate.mjs                 # validate + rewrite registry.json
 *   node scripts/validate.mjs --verify-files  # also HEAD every download URL
 *   node scripts/validate.mjs --check         # validate only, do not write
 *
 * Exit code 1 on errors. Warnings never fail the build.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BANKS_DIR = path.join(ROOT, "soundfonts");
const REGISTRY = path.join(ROOT, "registry.json");
const VERIFY_FILES = process.argv.includes("--verify-files");
const CHECK_ONLY = process.argv.includes("--check");

const SPDX = new Set([
  "0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "CC0-1.0", "ISC",
  "MIT", "MPL-2.0", "Unlicense", "WTFPL",
  "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0-only", "GPL-3.0-or-later",
  "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0-only", "LGPL-3.0-or-later",
  "AGPL-3.0-only", "AGPL-3.0-or-later",
  "CC-BY-3.0", "CC-BY-4.0", "CC-BY-SA-3.0", "CC-BY-SA-4.0",
  "CC-BY-NC-3.0", "CC-BY-NC-4.0", "CC-BY-NC-SA-4.0", "CC-BY-NC-ND-4.0",
  "CC-BY-ND-4.0",
]);
const CC_RESTRICTED = /-(NC|ND)(-|$)/;
const FORMATS = new Set(["sf2", "sf3"]);
const KINDS = new Set(["gm", "instrument", "drumkit", "collection"]);
const INSTALL = new Set(["file", "archive", "external"]);
const ARCHIVES = new Set(["zip", "tar.gz", "tar.bz2", "tar.xz", "7z"]);
const SLUG = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const HTTPS = /^https:\/\//;
const MIN_SIZE = 10 * 1024;
const MAX_SIZE = 4 * 1024 * 1024 * 1024;

const errors = [];
const warnings = [];
const rel = (file) => path.relative(ROOT, file);

const fail = (file, message) => errors.push(`${rel(file)}: ${message}`);
const warn = (file, message) => warnings.push(`${rel(file)}: ${message}`);

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".json")) out.push(full);
  }
  return out;
}

function isLicenseRef(license) {
  return typeof license === "string" && license.startsWith("LicenseRef-");
}

function validateEntry(file, entry) {
  const required = ["slug", "name", "license", "source", "formats", "files"];
  for (const key of required) {
    if (entry[key] == null || entry[key] === "") fail(file, `missing required field "${key}"`);
  }
  if (typeof entry.slug !== "string" || !SLUG.test(entry.slug)) {
    fail(file, `invalid slug "${entry.slug}" (expected vendor/name, lowercase kebab-case)`);
  } else {
    // The file layout must mirror the slug so contributors can find an entry.
    const expected = path.join(BANKS_DIR, `${entry.slug}.json`);
    if (path.resolve(file) !== path.resolve(expected)) {
      fail(file, `slug "${entry.slug}" must live at soundfonts/${entry.slug}.json`);
    }
  }
  if (typeof entry.name === "string" && (entry.name.length === 0 || entry.name.length > 120)) {
    fail(file, "name must be 1-120 characters");
  }
  if (entry.description == null) warn(file, "missing description");
  for (const key of ["homepage", "source", "license_url"]) {
    if (entry[key] != null && !HTTPS.test(entry[key])) fail(file, `${key} must be https://`);
  }

  const license = entry.license;
  if (typeof license === "string") {
    if (isLicenseRef(license)) {
      if (!entry.license_url) fail(file, `${license} requires license_url`);
    } else if (!SPDX.has(license)) {
      fail(file, `license "${license}" is not an allowed SPDX/CC identifier (use LicenseRef-<slug> for custom terms)`);
    }
  }

  const restricted = typeof license === "string" && (CC_RESTRICTED.test(license) || isLicenseRef(license));
  if (entry.redistributable === true && restricted) {
    fail(file, `redistributable must be false for ${license}`);
  }

  if (!Array.isArray(entry.formats) || entry.formats.length === 0) {
    fail(file, "formats must be a non-empty array");
  } else if (entry.formats.some((f) => !FORMATS.has(f))) {
    fail(file, "formats may only contain sf2 / sf3");
  }
  if (entry.kind != null && !KINDS.has(entry.kind)) fail(file, `unknown kind "${entry.kind}"`);
  if (entry.presets != null && (!Number.isInteger(entry.presets) || entry.presets < 1)) {
    fail(file, "presets must be a positive integer");
  }

  if (!Array.isArray(entry.files) || entry.files.length === 0) {
    fail(file, "files must be a non-empty array");
    return;
  }

  const seenUrls = new Set();
  for (const [index, item] of entry.files.entries()) {
    const at = `files[${index}]`;
    if (typeof item.url !== "string" || !HTTPS.test(item.url)) {
      fail(file, `${at}.url must be https://`);
      continue;
    }
    if (seenUrls.has(item.url)) fail(file, `${at}: duplicate url`);
    seenUrls.add(item.url);

    if (!FORMATS.has(item.format)) fail(file, `${at}.format must be sf2 / sf3`);
    if (!INSTALL.has(item.install)) fail(file, `${at}.install must be file / archive / external`);

    if (Array.isArray(entry.formats) && !entry.formats.includes(item.format)) {
      fail(file, `${at}.format "${item.format}" is not listed in the entry's formats`);
    }

    if (item.install === "external") {
      if (item.sha256) warn(file, `${at}: external links should not carry sha256`);
      continue;
    }

    if (item.install === "archive") {
      if (!ARCHIVES.has(item.archive)) {
        fail(file, `${at}: install "archive" requires an archive kind (zip, tar.gz, tar.bz2, tar.xz, 7z)`);
      }
    } else if (item.archive) {
      fail(file, `${at}: archive is only meaningful when install = "archive"`);
    }

    if (!Number.isInteger(item.size) || item.size < MIN_SIZE || item.size > MAX_SIZE) {
      fail(file, `${at}: size is required and must be between 10 KB and 4 GB`);
    }
    if (!item.sha256) {
      warn(file, `${at}: no sha256 (run scripts/fill-hashes.mjs before merging)`);
    } else if (!SHA256.test(item.sha256)) {
      fail(file, `${at}: sha256 must be 64 lowercase hex characters`);
    }
  }
}

async function headSize(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "HEAD",
        redirect: "follow",
        headers: { "User-Agent": "ai-daw-soundfont-registry/1 (+https://github.com/heshengtao/ai-daw-soundfont-registry)" },
        signal: AbortSignal.timeout(30_000),
      });
      const length = response.headers.get("content-length");
      return { status: response.status, size: length ? Number(length) : null, finalUrl: response.url };
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
    }
  }
  throw lastError;
}

async function verifyFiles(file, entry) {
  for (const [index, item] of entry.files.entries()) {
    if (item.install === "external") continue;
    const at = `files[${index}]`;
    try {
      const { status, size, finalUrl } = await headSize(item.url);
      if (status >= 400) {
        fail(file, `${at}: HEAD returned HTTP ${status} (${finalUrl})`);
        continue;
      }
      if (size == null) {
        warn(file, `${at}: server did not report content-length`);
      } else if (Number.isInteger(item.size) && size !== item.size) {
        fail(file, `${at}: size mismatch, registry says ${item.size}, server says ${size}`);
      }
      console.log(`  ✓ ${entry.slug} ${item.format} ${status} ${size ?? "?"} B`);
    } catch (error) {
      fail(file, `${at}: HEAD failed (${error?.message ?? error})`);
    }
  }
}

const files = walk(BANKS_DIR);
if (files.length === 0) errors.push("soundfonts/: no entries found");

const bySlug = new Map();
const byUrl = new Map();
const entries = [];

for (const file of files) {
  let entry;
  try {
    entry = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(file, `invalid JSON: ${error.message}`);
    continue;
  }
  validateEntry(file, entry);

  if (typeof entry.slug === "string") {
    if (bySlug.has(entry.slug)) fail(file, `duplicate slug "${entry.slug}" (also in ${rel(bySlug.get(entry.slug))})`);
    else bySlug.set(entry.slug, file);
  }
  for (const item of Array.isArray(entry.files) ? entry.files : []) {
    if (typeof item.url !== "string") continue;
    if (byUrl.has(item.url)) {
      warn(file, `url already used by ${byUrl.get(item.url)}`);
    } else {
      byUrl.set(item.url, entry.slug);
    }
  }
  entries.push(entry);
}

if (VERIFY_FILES) {
  for (const entry of entries) {
    const file = bySlug.get(entry.slug) ?? path.join(BANKS_DIR, `${entry.slug}.json`);
    await verifyFiles(file, entry);
  }
}

if (errors.length > 0) {
  console.error(`\n${errors.length} error(s):`);
  for (const line of errors) console.error(`  ✗ ${line}`);
  if (warnings.length > 0) {
    console.error(`\n${warnings.length} warning(s):`);
    for (const line of warnings) console.error(`  ! ${line}`);
  }
  process.exit(1);
}

entries.sort((a, b) => String(a.name).localeCompare(String(b.name), "en"));
const registry = { schema_version: 1, soundfonts: entries };

if (!CHECK_ONLY) {
  fs.writeFileSync(REGISTRY, `${JSON.stringify(registry, null, 2)}\n`);
}

console.log(`✓ ${entries.length} soundfont(s) validated`);
for (const line of warnings) console.log(`  ! ${line}`);
if (!CHECK_ONLY) console.log(`✓ wrote ${rel(REGISTRY)}`);
