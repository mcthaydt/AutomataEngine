import type { ProjectSnapshot } from '@automata/project'

/**
 * The default authored project, in memory. `public/project` is generated from
 * this template (npm run generate:project); the content test keeps them equal.
 */
const TEMPLATE: ProjectSnapshot = {
  "manifest": {
    "formatVersion": 2,
    "id": "first-light",
    "name": "First Light",
    "gameId": "first-light",
    "entrySceneId": "main",
    "scenes": [
      {
        "id": "main",
        "path": "scenes/main.scene.json"
      }
    ],
    "resources": [
      {
        "id": "tuning",
        "typeId": "first-light.tuning",
        "path": "resources/tuning.resource.json"
      }
    ]
  },
  "scenes": {
    "main": {
      "id": "main",
      "name": "Main",
      "entities": [
        {
          "id": "spawn",
          "name": "Spawn",
          "enabled": true,
          "components": [
            {
              "id": "transform",
              "typeId": "core.transform",
              "data": {
                "position": {
                  "x": -8,
                  "y": 0.5,
                  "z": -8
                },
                "rotation": {
                  "x": 0,
                  "y": 0,
                  "z": 0
                },
                "scale": {
                  "x": 1,
                  "y": 1,
                  "z": 1
                }
              }
            },
            {
              "id": "spawn-point",
              "typeId": "first-light.spawn-point",
              "data": {}
            }
          ]
        }
      ]
    }
  },
  "resources": {
    "tuning": {
      "id": "tuning",
      "typeId": "first-light.tuning",
      "data": {
        "arenaHalf": 12,
        "moveSpeed": 6,
        "goal": {
          "x": 8,
          "z": 8
        },
        "goalRadius": 1.5,
        "timeLimitS": 30,
        "colors": {
          "floor": "#12203a",
          "player": "#27e0ff",
          "goal": "#ffd23f"
        }
      }
    }
  }
}

export function createTemplate(): ProjectSnapshot {
  return structuredClone(TEMPLATE)
}
