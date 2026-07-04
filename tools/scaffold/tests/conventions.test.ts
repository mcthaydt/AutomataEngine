import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

interface WorkspaceManifest {
  dir: string
  name?: string
  exports?: Record<string, unknown>
  automata?: { devPort?: number }
}

function workspaceManifests(group: 'games' | 'tools'): WorkspaceManifest[] {
  const groupDir = join(repoRoot, group)
  return readdirSync(groupDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(groupDir, entry.name, 'package.json')))
    .map((entry) => ({
      dir: join(groupDir, entry.name),
      ...(JSON.parse(readFileSync(join(groupDir, entry.name, 'package.json'), 'utf8')) as object)
    }))
}

const manifests = [...workspaceManifests('games'), ...workspaceManifests('tools')]

describe('workspace conventions', () => {
  it('assigns each dev-served workspace a unique integer automata.devPort', () => {
    const ports = manifests
      .filter((manifest) => manifest.automata?.devPort !== undefined)
      .map((manifest) => manifest.automata!.devPort!)
    expect(ports.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ports).size).toBe(ports.length)
    for (const port of ports) {
      expect(Number.isInteger(port)).toBe(true)
      expect(port).toBeGreaterThan(0)
      expect(port).toBeLessThanOrEqual(65_535)
    }
  })

  it('gives every game dev script a devPort so Playwright can derive its server', () => {
    for (const manifest of workspaceManifests('games')) {
      expect(manifest.automata?.devPort, `${manifest.dir} needs automata.devPort`).toBeDefined()
    }
  })

  it('backs every project editor entry with the conventional package exports', () => {
    for (const manifest of workspaceManifests('games')) {
      if (!existsSync(join(manifest.dir, 'src/project/editor.ts'))) continue
      expect(manifest.exports?.['./editor'], `${manifest.dir} needs a ./editor export`).toBeDefined()
      expect(manifest.exports?.['./project'], `${manifest.dir} needs a ./project export`).toBeDefined()
    }
  })
})
