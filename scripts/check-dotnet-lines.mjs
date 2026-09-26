import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const maxColumns = 100
const roots = ['apps/web', 'apps/web.tests']
const excludedDirectories = new Set(['bin', 'obj', 'Migrations'])
let checked = 0
let violations = 0

async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await inspect(filename)
    } else if (entry.isFile() && /\.cs(html)?$/u.test(entry.name)) {
      checked++
      const lines = (await readFile(filename, 'utf8')).split(/\r?\n/u)
      for (let index = 0; index < lines.length; index++) {
        const columns = lines[index].length
        if (columns <= maxColumns) continue
        violations++
        console.error(
          `${filename}:${index + 1}: ${columns} columns (max ${maxColumns})`,
        )
      }
    }
  }
}

for (const root of roots) await inspect(root)
if (violations) {
  console.error(`${violations} overlong lines in ${checked} C# and Razor files`)
  process.exitCode = 1
} else {
  console.log(`${checked} C# and Razor files satisfy the ${maxColumns}-column limit`)
}
