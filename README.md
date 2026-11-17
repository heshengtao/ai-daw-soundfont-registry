# AI DAW SoundFont Registry

A static, community-maintained index of downloadable **SoundFont 2 (`.sf2`)** and
**SoundFont 3 (`.sf3`)** banks, for [AI DAW](https://github.com/heshengtao/ai-daw)
and any other sampler that wants a machine-readable list of free sound banks.

- Registry index: [`registry.json`](./registry.json)
- Schema: [`schema/registry.schema.json`](./schema/registry.schema.json)
- Licence: metadata is **CC0-1.0**; every bank keeps its own licence.

## Why this exists

There is no official registry for SoundFonts. The Open Audio Registry that
plugins use (`open-audio-stack-registry`) models `apps`, `plugins`, `presets`
and `projects` — there is no place in it for a bank of samples. Community
catalogues such as [Musical Artifacts](https://musical-artifacts.com/) have a
JSON API, but they are a general-purpose artefact archive: licences are mixed,
direct downloads sit behind a browser challenge, and nothing there is shaped
like an installable package.

This repository is the missing, narrow piece: a reviewed list of banks whose
licence a human actually checked, with a stable URL, a byte size, and — where
possible — a SHA-256 so a client can verify what it downloaded.

## What this repository distributes

Only metadata: names, descriptions, licence identifiers, source pages, format
and archive tags, download URLs, sizes and hashes.

It does **not** host, mirror, or bundle any `.sf2` / `.sf3` data. Clients
download from the URL declared by the entry, which points at the author's own
hosting (MuseScore's FTP, FreePats, GitHub releases) or at the project's
download page.

## Entry model

Each bank is one file under `soundfonts/<vendor>/<name>.json`, and `slug` must
match that path. `registry.json` is generated from those files — never edited
by hand.

```json
{
  "slug": "musescore/general",
  "name": "MuseScore General",
  "vendor": "MuseScore",
  "description": "The General MIDI bank shipped with MuseScore …",
  "homepage": "https://musescore.org/en/handbook/4/soundfonts",
  "source": "https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/",
  "license": "MIT",
  "license_url": "https://…/MuseScore_General_License.md",
  "redistributable": true,
  "formats": ["sf2", "sf3"],
  "kind": "gm",
  "presets": 128,
  "tags": ["gm", "orchestral"],
  "files": [
    {
      "url": "https://…/MuseScore_General.sf3",
      "format": "sf3",
      "install": "file",
      "size": 39900972,
      "sha256": "…"
    }
  ]
}
```

- `formats` — what the bank is; `files[].format` — what one download contains.
  One entry lists both the SF3 and SF2 variants of the same bank when both exist.
- `kind` — `gm` (General MIDI / GS / XG), `instrument`, `drumkit`, or
  `collection` (many separate banks in one archive).
- `install` —
  - `file`: the URL serves one `.sf2` / `.sf3`;
  - `archive`: the URL serves an archive (`archive` says which) containing banks;
  - `external`: the URL is a page for a human to open. No size or hash needed.
- `size` is required for `file` and `archive`; `sha256` is strongly recommended
  (the validator warns without it).
- `redistributable` describes the **licence**, not this repository: `false`
  means third parties may not redistribute the bank itself (non-commercial,
  no-derivatives, or custom terms). Clients may still download it from the
  author's host.

### Archive kinds and client support

`archive` is one of `zip`, `tar.gz`, `tar.bz2`, `tar.xz`, `7z`. AI DAW 1.9
extracts `zip` and `tar.gz`; `7z` / `tar.xz` / `tar.bz2` entries are listed for
clients that grow support. A client **must** only offer one-click install for
archive kinds it can actually extract, and fall back to opening the URL
otherwise.

## How AI DAW will load it

Planned client behaviour, mirroring the plugin store (`crates/daemon/src/manager.rs`):

1. Fresh local cache (6 hour TTL)
2. Configured registry mirrors
3. `https://raw.githubusercontent.com/heshengtao/ai-daw-soundfont-registry/main/registry.json`
4. Stale local cache
5. Registry snapshot bundled with the app

## Contributing a bank

1. Pick a slug: `vendor/name` (lowercase, kebab-case). The vendor is the
   author or project, not the host.
2. Add `soundfonts/<vendor>/<name>.json`.
3. Declare a real licence — SPDX, Creative Commons, or `LicenseRef-<slug>` plus
   `license_url` for custom terms. Never guess.
4. Use `install: "file"` / `"archive"` only for a URL you have actually
   downloaded; record its size, and run `node scripts/fill-hashes.mjs <slug>`.
5. Otherwise use `install: "external"` and point `url` at the download page.
6. Run `node scripts/validate.mjs` and commit the regenerated `registry.json`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full rules. Draft candidates
can be pulled from Musical Artifacts with
`node scripts/import-musical-artifacts.mjs --format sf2 --limit 40`; they land
in `candidates/` and still need review.

## Licence policy

- Accepted: OSI licences (MIT, Apache, BSD, ISC, MPL, LGPL, GPL, AGPL), public
  domain dedications (CC0, Unlicense, WTFPL), and Creative Commons licences
  including the NC/ND variants.
- NC/ND and `LicenseRef-*` banks must set `"redistributable": false`.
- Do not commit or mirror bank data, cover art, or screenshots you do not have
  the right to redistribute.
- Bank names may be trademarks of their owners. This registry claims no
  ownership over them.

## Scripts

| Command | What it does |
| --- | --- |
| `node scripts/validate.mjs` | Validate entries, regenerate `registry.json` |
| `node scripts/validate.mjs --check` | Validate only |
| `node scripts/validate.mjs --verify-files` | Also HEAD every download URL and compare sizes |
| `node scripts/fill-hashes.mjs --all` | Stream each file once, fill `size` + `sha256` |
| `node scripts/import-musical-artifacts.mjs` | Draft candidates from Musical Artifacts |

No dependencies: plain Node.js 20+.
