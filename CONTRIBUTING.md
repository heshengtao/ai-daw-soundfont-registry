# Contributing

Thanks for adding a sound bank. Every entry is reviewed by CI and a human.

## Rules

1. **Metadata only.** Never commit a `.sf2` / `.sf3` file, archive, cover art,
   or screenshot you do not have the right to redistribute.
2. **One entry per bank.** Put both the SF3 and SF2 variants of the same bank in
   the same entry's `files` array instead of creating two entries.
3. **Honest licence.** Use an SPDX identifier, a Creative Commons identifier, or
   `LicenseRef-<slug>` together with `license_url` when the bank has custom
   terms. If the licence is ambiguous, use `install: "external"` and say so in
   `note`. Do not label a bank "CC0" because the download page looks free.
4. **Slug.** `vendor/name`, lowercase kebab-case, and the file must live at
   `soundfonts/<vendor>/<name>.json`. Reusing a slug for a different bank is
   forbidden — clients key user data by it.
5. **Direct downloads.** `install: "file"` and `install: "archive"` require a
   URL you have downloaded yourself, a correct `size`, and — strongly
   recommended — a `sha256`. The URL must be HTTPS and immutable (a versioned
   release asset or a dated file, not a `latest` link).
6. **Archives.** Declare `archive` as `zip`, `tar.gz`, `tar.bz2`, `tar.xz` or
   `7z`. Keep the archive small where a "small" variant exists.
7. **No hotlinking to a page.** If only a download page exists, use
   `install: "external"`.
8. **DCO.** By submitting a PR you agree that your metadata contribution is
   licensed under CC0-1.0 and that you have the right to submit it.

## Validate locally

```bash
node scripts/validate.mjs                 # validate + regenerate registry.json
node scripts/validate.mjs --verify-files  # HEAD every URL, compare sizes
node scripts/fill-hashes.mjs --all        # fill size + sha256 (streams, no temp files)
```

`registry.json` is generated: stage the entry file and the regenerated index
together, or CI's `git diff --exit-code` will fail.

## Promoting a Musical Artifacts candidate

```bash
node scripts/import-musical-artifacts.mjs --format sf3 --limit 20
```

Candidates land in `candidates/` (gitignored) with `install: "external"` and a
`LicenseRef-musical-artifacts-*` placeholder. To promote one: rewrite the slug
with the real vendor, replace the licence with the actual SPDX/CC/`LicenseRef`
value, and only add a direct-download file once you have fetched it and know
its size and hash.

## Example

[`soundfonts/musescore/general.json`](./soundfonts/musescore/general.json) shows
one bank with two file variants; [`soundfonts/generaluser/gs.json`](./soundfonts/generaluser/gs.json)
shows an external-only entry.
