import type { ProjectSnapshot } from '@automata/project'

/**
 * The default authored project for a generated game, built once here and
 * injected verbatim into both the generated `src/project/template.ts` and the
 * generated `public/project/*.json` files — template/file parity holds by
 * construction, and the generated content test keeps it that way.
 */
export function buildProjectSnapshot(name: string, label: string): ProjectSnapshot {
  const zero = { x: 0, y: 0, z: 0 }
  const one = { x: 1, y: 1, z: 1 }
  return {
    manifest: {
      formatVersion: 1,
      id: name,
      name: label,
      gameId: name,
      entrySceneId: 'main',
      scenes: [{ id: 'main', path: 'scenes/main.scene.json' }],
      resources: [{ id: 'tuning', typeId: `${name}.tuning`, path: 'resources/tuning.resource.json' }]
    },
    scenes: {
      main: {
        formatVersion: 1,
        id: 'main',
        name: 'Main',
        entities: [
          {
            id: 'spawn',
            name: 'Spawn',
            enabled: true,
            components: [
              {
                id: 'transform',
                typeId: 'core.transform',
                data: { position: { x: -8, y: 0.5, z: -8 }, rotation: { ...zero }, scale: { ...one } }
              },
              { id: 'spawn-point', typeId: `${name}.spawn-point`, data: {} }
            ]
          }
        ]
      }
    },
    resources: {
      tuning: {
        formatVersion: 1,
        id: 'tuning',
        typeId: `${name}.tuning`,
        data: {
          arenaHalf: 12,
          moveSpeed: 6,
          goal: { x: 8, z: 8 },
          goalRadius: 1.5,
          timeLimitS: 30,
          colors: { floor: '#12203a', player: '#27e0ff', goal: '#ffd23f' }
        }
      }
    }
  }
}

/** Serialize the snapshot into the persisted `public/project` file set. */
export function projectFilesFromSnapshot(snapshot: ProjectSnapshot): Array<{ path: string; content: string }> {
  const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`
  const files = [{ path: 'public/project/automata.project.json', content: json(snapshot.manifest) }]
  for (const scene of snapshot.manifest.scenes) {
    files.push({ path: `public/project/${scene.path}`, content: json(snapshot.scenes[scene.id]) })
  }
  for (const resource of snapshot.manifest.resources) {
    files.push({ path: `public/project/${resource.path}`, content: json(snapshot.resources[resource.id]) })
  }
  return files
}
