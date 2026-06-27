import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    // Game, tools, and editor may only use third-party libs through @automata/engine.
    files: ['games/**/*.ts', 'tools/**/*.ts', 'packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['three', 'three/*', '@dimforge/*', 'miniplex', 'smol-toml', 'yaml', 'zod'],
          message: 'Import the engine-wrapped API from @automata/engine instead.'
        }]
      }]
    }
  },
  {
    // The generic editor core must not depend on any game.
    files: ['packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['monkey-ball', 'monkey-ball/*'],
          message: 'The editor core is generic; the game registers itself via GameDefinition.'
        }]
      }]
    }
  },
  {
    // Headless MCP code must use narrow package entry points only.
    files: ['tools/editor-mcp-server/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          { name: '@automata/engine', message: 'Use @automata/engine/data in the headless MCP graph.' },
          { name: '@automata/editor', message: 'Use @automata/editor/headless in the headless MCP graph.' },
          { name: 'monkey-ball', message: 'Use monkey-ball/headless in the headless MCP graph.' }
        ],
        patterns: [{
          group: ['three', 'three/*', '@dimforge/*', 'miniplex', 'smol-toml', 'yaml', 'zod'],
          message: 'Import the engine-wrapped API from @automata/engine instead.'
        }]
      }]
    }
  },
  {
    // Engine must never depend on games or tools.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*', '@automata/editor'],
          message: 'Engine must not import games or tools.'
        }]
      }]
    }
  },
  {
    // Miniplex is an implementation detail of the engine-owned ECS facade.
    files: ['packages/engine/src/**/*.ts'],
    ignores: ['packages/engine/src/ecs/world.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*', '@automata/editor'],
            message: 'Engine must not import games or tools.'
          },
          {
            group: ['miniplex'],
            message: 'All ECS access must go through the engine facade.'
          }
        ]
      }]
    }
  },
  {
    // contracts is the dependency-free leaf; it must not depend on anything else in the repo.
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@automata/engine',
            '@automata/editor',
            '@automata/editor/*',
            'monkey-ball',
            'monkey-ball/*',
            'level-editor',
            'level-editor/*'
          ],
          message: 'contracts is the dependency-free leaf; do not import editor, engine, games, or tools.'
        }]
      }]
    }
  },
  {
    // agent-core depends only on @automata/contracts (+ provider SDKs); never editor/engine/games/tools.
    files: ['packages/agent-core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@automata/engine',
            '@automata/editor',
            '@automata/editor/*',
            'monkey-ball',
            'monkey-ball/*',
            'level-editor',
            'level-editor/*'
          ],
          message: 'agent-core depends only on @automata/contracts and the provider SDKs.'
        }]
      }]
    }
  }
)
