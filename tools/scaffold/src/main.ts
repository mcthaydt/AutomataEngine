import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { planNewGame } from './plan.ts'

const name = process.argv[2]
if (!name) { console.error('usage: npm run new-game <name> [port]'); process.exit(1) }
const port = process.argv[3] ? Number(process.argv[3]) : undefined
const plan = planNewGame(name, port)
for (const file of plan.files) {
  const abs = resolve(process.cwd(), file.path)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, file.content, { flag: 'wx' })
}
console.log(`Created games/${name}. Now wire these into the repo root:`)
for (const snippet of plan.rootSnippets) console.log(`  - ${snippet}`)
console.log('Then run: npm install')
