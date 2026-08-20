/**
 * Copies Monaco's prebuilt AMD bundle out of node_modules and into public/monaco/vs
 * so the app serves the editor from its own origin instead of the jsdelivr CDN.
 *
 * Runs automatically via the `predev` / `prebuild` npm hooks. public/monaco/ is
 * gitignored — it is regenerated from whatever monaco-editor version is installed,
 * which keeps the served editor and package.json in lockstep.
 *
 * Monaco lazily fetches language support, so anything the app never opens is never
 * requested. The editor registers only turtle, sparql, dot, xml, jsonld and jsonc
 * (see src/components/editor/MonacoEditorComponent.tsx), so the TypeScript, CSS and
 * HTML language services are dead weight and are dropped below. JSON is kept because
 * the 'javascript' editor mode maps to jsonc.
 *
 * Pass --full to copy everything unpruned.
 */
import { existsSync, rmSync, statSync } from 'node:fs'
import { cp, readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'monaco-editor', 'min', 'vs')
const dest = join(root, 'public', 'monaco', 'vs')
const full = process.argv.includes('--full')

// Matched against the path relative to vs/, with forward slashes.
const PRUNE = [
  /^assets\/ts\.worker-.*\.js$/,
  /^assets\/css\.worker-.*\.js$/,
  /^assets\/html\.worker-.*\.js$/,
  /^language\/typescript\//,
  /^language\/css\//,
  /^language\/html\//,
  /^nls\/lang\//, // non-English locales; English is baked into the core
]

const bytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(1)} ${u[i]}`
}

async function dirSize(dir) {
  let total = 0
  for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) total += (await stat(join(entry.parentPath ?? entry.path, entry.name))).size
  }
  return total
}

if (!existsSync(src)) {
  console.error(`[monaco] not found: ${relative(root, src)}\n[monaco] run "npm install" first.`)
  process.exit(1)
}

// Wipe first: filenames are content-hashed, so a version bump would otherwise
// leave stale bundles behind forever.
rmSync(dest, { recursive: true, force: true })
await cp(src, dest, { recursive: true })

const before = await dirSize(dest)
let pruned = 0

if (!full) {
  for (const entry of await readdir(dest, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue
    const abs = join(entry.parentPath ?? entry.path, entry.name)
    const rel = relative(dest, abs).replace(/\\/g, '/')
    if (PRUNE.some((re) => re.test(rel))) {
      pruned += statSync(abs).size
      await rm(abs)
    }
  }
}

// Drop directories the prune emptied out.
for (let i = 0; i < 3; i++) {
  for (const entry of await readdir(dest, { withFileTypes: true, recursive: true })) {
    if (!entry.isDirectory()) continue
    const abs = join(entry.parentPath ?? entry.path, entry.name)
    if ((await readdir(abs)).length === 0) await rm(abs, { recursive: true })
  }
}

const version = JSON.parse(
  await readFile(join(root, 'node_modules', 'monaco-editor', 'package.json'), 'utf8'),
).version

console.log(`[monaco] public/monaco/vs <- monaco-editor ${version}`)
console.log(
  full
    ? `[monaco] copied ${bytes(before)} (unpruned)`
    : `[monaco] copied ${bytes(before - pruned)} (pruned ${bytes(pruned)} of unused language services)`
)
