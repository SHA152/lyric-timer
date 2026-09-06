// Writes one version into every place the app declares it.
// Used by CI so a `vX.Y.Z` tag is the single source of truth for a release:
// tauri-action's __VERSION__ and the bundle filenames both come from
// tauri.conf.json, which otherwise silently keeps its committed value.
//
// Usage: node scripts/set-version.mjs v1.2.3   (leading "v" optional)

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const raw = process.argv[2]
if (!raw) {
  console.error('usage: node scripts/set-version.mjs <version>')
  process.exit(1)
}
const version = raw.replace(/^v/, '')
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`not a semver version: ${raw}`)
  process.exit(1)
}

// Rewrites textually so key order and formatting survive, and stays idempotent:
// a file already at `version` matches the pattern and is simply rewritten as-is.
// Every line break in a pattern must be `\r?\n`: the Windows runner checks out
// with autocrlf, so a literal `\n` matches nothing there.
function patch(rel, ...patterns) {
  const path = join(root, rel)
  let text = readFileSync(path, 'utf8')
  for (const pattern of patterns) {
    if (!pattern.test(text)) throw new Error(`no version to patch in ${rel}`)
    text = text.replace(pattern, `$1"${version}"`)
  }
  writeFileSync(path, text)
}

patch('package.json', /("version"\s*:\s*)"[^"]*"/)
// Both root copies, or `npm ci` sees package.json and the lockfile disagree.
patch(
  'package-lock.json',
  /^(\{\s*\r?\n\s*"name":\s*"[^"]*",\s*\r?\n\s*"version":\s*)"[^"]*"/,
  /("":\s*\{\s*\r?\n\s*"name":\s*"[^"]*",\s*\r?\n\s*"version":\s*)"[^"]*"/,
)
patch('src-tauri/tauri.conf.json', /("version"\s*:\s*)"[^"]*"/)
// Only the [package] section's version, never a dependency's.
patch('src-tauri/Cargo.toml', /(\[package\][^[]*?\r?\nversion\s*=\s*)"[^"]*"/)
// Keep the lockfile in step so a `--locked` build cannot fail on the bump.
patch('src-tauri/Cargo.lock', /(name = "lyric-timer"\r?\nversion\s*=\s*)"[^"]*"/)

console.log(`version set to ${version}`)
