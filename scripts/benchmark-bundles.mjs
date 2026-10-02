#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  mkdir,
  readdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../', import.meta.url))
const entryKeys = {
  public: 'src/islands/runtime.tsx',
  admin: 'src/admin/main.tsx',
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fail = (message) => {
  throw new Error(message)
}
const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

function argumentsFor(argv) {
  if (
    argv.length !== 2 ||
    argv[0] !== '--output' ||
    !argv[1] ||
    argv[1].startsWith('--')
  ) {
    fail('Usage: benchmark-bundles.mjs --output <empty-directory>')
  }
  return path.resolve(argv[1])
}

async function prepareOutput(directory) {
  await mkdir(directory, { recursive: true })
  if ((await readdir(directory)).length !== 0)
    fail('Output directory must be empty; use a new run directory')
}

function safeFile(file) {
  if (
    typeof file !== 'string' ||
    !file ||
    file.includes('\\') ||
    file.includes('\0') ||
    file.startsWith('/') ||
    file.split('/').some((part) => !part || part === '.' || part === '..') ||
    /^[a-z][a-z\d+.-]*:/i.test(file)
  )
    fail('Manifest contains an invalid asset path')
  return file
}

function validateManifest(manifest) {
  if (!object(manifest)) fail('Manifest must be an object')
  for (const [key, entry] of Object.entries(manifest)) {
    if (!key || !object(entry)) fail('Manifest contains a malformed entry')
    safeFile(entry.file)
    for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
      if (entry[field] === undefined) continue
      if (
        !Array.isArray(entry[field]) ||
        entry[field].some((item) => typeof item !== 'string' || !item)
      ) {
        fail(`Malformed manifest ${field} list`)
      }
      for (const item of entry[field]) {
        if (field === 'imports' || field === 'dynamicImports') {
          if (!Object.hasOwn(manifest, item))
            fail(`Missing manifest dependency: ${item}`)
        } else safeFile(item)
      }
    }
  }
  for (const key of Object.values(entryKeys)) {
    if (!Object.hasOwn(manifest, key) || manifest[key].isEntry !== true)
      fail(`Missing manifest entry: ${key}`)
    if (!/\.m?js$/i.test(manifest[key].file))
      fail(`Entry is not JavaScript: ${key}`)
  }
}

function closure(manifest, key, dynamic) {
  const visited = new Set()
  const files = new Set()
  function visit(id) {
    if (visited.has(id)) return
    visited.add(id)
    const entry = manifest[id]
    files.add(entry.file)
    for (const file of [...(entry.css ?? []), ...(entry.assets ?? [])])
      files.add(file)
    for (const dependency of entry.imports ?? []) visit(dependency)
    if (dynamic)
      for (const dependency of entry.dynamicImports ?? []) visit(dependency)
  }
  visit(key)
  // Public page CSS is a separate entry so lazy imports do not refetch it.
  if (key === entryKeys.public && manifest['src/styles.scss'])
    visit('src/styles.scss')
  return files
}

function total(files, table) {
  const result = Object.fromEntries(
    ['js', 'css', 'other', 'all'].map((kind) => [
      kind,
      { count: 0, rawBytes: 0, gzipBytes: 0, brotliBytes: 0 },
    ]),
  )
  for (const file of files) {
    const item = table.get(file)
    for (const kind of [item.kind, 'all']) {
      result[kind].count++
      for (const metric of ['rawBytes', 'gzipBytes', 'brotliBytes'])
        result[kind][metric] += item[metric]
    }
  }
  return result
}

async function main() {
  const output = argumentsFor(process.argv.slice(2))
  await prepareOutput(output)
  const assetDirectory = await realpath(
    path.join(root, 'apps/web/wwwroot/assets'),
  )
  const manifestBytes = await readFile(
    path.join(assetDirectory, 'manifest.json'),
  )
  let manifest
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'))
  } catch {
    fail('Manifest is not valid JSON')
  }
  validateManifest(manifest)
  const lockfileBytes = await readFile(path.join(root, 'pnpm-lock.yaml'))
  const sets = {
    publicEntryFile: new Set([manifest[entryKeys.public].file]),
    adminEntryFile: new Set([manifest[entryKeys.admin].file]),
    publicStatic: closure(manifest, entryKeys.public, false),
    adminStatic: closure(manifest, entryKeys.admin, false),
    publicFull: closure(manifest, entryKeys.public, true),
    adminFull: closure(manifest, entryKeys.admin, true),
  }
  for (const suffix of ['Static', 'Full']) {
    sets[`shared${suffix}`] = new Set(
      [...sets[`public${suffix}`]].filter((file) =>
        sets[`admin${suffix}`].has(file),
      ),
    )
    sets[`combined${suffix}`] = new Set([
      ...sets[`public${suffix}`],
      ...sets[`admin${suffix}`],
    ])
  }
  const table = new Map()
  for (const file of [...sets.combinedFull].sort()) {
    const filename = await realpath(path.join(assetDirectory, file))
    if (
      !filename.startsWith(assetDirectory + path.sep) ||
      !(await stat(filename)).isFile()
    )
      fail('Asset escapes directory or is not a regular file')
    const bytes = await readFile(filename)
    table.set(file, {
      path: file,
      kind: /\.m?js$/i.test(file)
        ? 'js'
        : /\.css$/i.test(file)
          ? 'css'
          : 'other',
      rawBytes: bytes.length,
      gzipBytes: gzipSync(bytes, { level: 9 }).length,
      brotliBytes: brotliCompressSync(bytes, {
        params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
      }).length,
      sha256: sha256(bytes),
    })
  }
  const scopes = Object.fromEntries(
    Object.entries(sets).map(([name, files]) => [
      name,
      { files: [...files].sort(), totals: total(files, table) },
    ]),
  )
  const result = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim(),
    nodeVersion: process.version,
    manifestSha256: sha256(manifestBytes),
    lockfileSha256: sha256(lockfileBytes),
    entryKeys,
    compression: {
      gzipLevel: 9,
      brotliQuality: 11,
      synthetic: true,
      note: 'Synthetic per-file estimates, not observed transfer bytes.',
    },
    scopeDefinitions: {
      entryFile: 'Only the emitted entry JavaScript file.',
      static:
        'Entry plus recursively imported chunks, CSS and assets; excludes dynamic imports.',
      full: 'Entry plus recursive static and dynamic imports, CSS and assets.',
      shared: 'Intersection of the public and admin closures.',
      combined:
        'Deduplicated union of the public and admin closures; excludes retained unrelated releases.',
    },
    files: [...table.values()],
    scopes,
  }
  await writeFile(path.join(output, 'manifest.json'), manifestBytes, {
    flag: 'wx',
  })
  await writeFile(
    path.join(output, 'bundles.json'),
    JSON.stringify(result, null, 2) + '\n',
    { flag: 'wx' },
  )
  console.log(`Saved manifest-scoped bundle measurements to ${output}`)
}

main().catch((error) => {
  console.error(`Bundle benchmark failed: ${error.message}`)
  process.exitCode = 1
})
