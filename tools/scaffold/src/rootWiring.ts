function rootScripts(source: string): { root: Record<string, unknown>; scripts: Record<string, string> } {
  const parsed: unknown = JSON.parse(source)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Root package.json must contain an object')
  }
  const root = parsed as Record<string, unknown>
  const scripts = root.scripts
  if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
    throw new Error('Root package.json must contain scripts')
  }
  const record = scripts as Record<string, unknown>
  if (Object.values(record).some((value) => typeof value !== 'string')) {
    throw new Error('Root package.json scripts must be strings')
  }
  return { root, scripts: record as Record<string, string> }
}

/** Adds the generated game's dev command and build gate to the root package. */
export function wirePackageJson(source: string, name: string, port: number): string {
  const { root, scripts } = rootScripts(source)
  const devKey = `dev:${name}`
  const buildCommand = `npm run build -w ${name}`
  if (Object.hasOwn(scripts, devKey) || scripts.build?.split('&&').map((part) => part.trim()).includes(buildCommand)) {
    throw new Error(`Game ${name} is already wired in package.json`)
  }
  if (typeof scripts.build !== 'string') {
    throw new Error('Root package.json scripts must contain build')
  }
  scripts[devKey] = `npm run dev -w ${name} -- --host 127.0.0.1 --port ${port} --strictPort`
  scripts.build = `${scripts.build} && ${buildCommand}`
  return `${JSON.stringify(root, null, 2)}\n`
}

/** Appends the generated game's dev server to the root Playwright configuration. */
export function wirePlaywrightConfig(source: string, name: string, port: number): string {
  const command = `npm run dev:${name}`
  const commandPattern = new RegExp(`command:\\s*(['"])${command}\\1`)
  if (commandPattern.test(source)) throw new Error(`Game ${name} is already wired in Playwright`)
  const urlPattern = new RegExp(`url:\\s*(['"])http://127\\.0\\.0\\.1:${port}\\1`)
  if (urlPattern.test(source)) {
    throw new Error(`Port ${port} is already wired in Playwright`)
  }

  const arrayStart = source.indexOf('  webServer: [')
  if (arrayStart < 0) throw new Error('Playwright configuration must contain a webServer array')
  const arrayEnd = source.indexOf('\n  ]', arrayStart)
  if (arrayEnd < 0) throw new Error('Playwright configuration must contain a webServer array')

  const before = source.slice(0, arrayEnd).trimEnd()
  const separator = before.endsWith('[') || before.endsWith(',') ? '\n' : ',\n'
  const server = `    { command: '${command}', url: 'http://127.0.0.1:${port}', reuseExistingServer: !process.env.CI }`
  return `${before}${separator}${server}${source.slice(arrayEnd)}`
}
