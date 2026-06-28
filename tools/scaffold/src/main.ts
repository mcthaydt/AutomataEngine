import { writeNewGame } from './write.ts'

const name = process.argv[2]
if (!name) { console.error('usage: npm run new-game <name> [port]'); process.exit(1) }
const port = process.argv[3] ? Number(process.argv[3]) : undefined
await writeNewGame(process.cwd(), name, port)
console.log(`Created games/${name} and wired root dev, build, and Playwright configuration.`)
console.log('Run npm install before starting the game.')
