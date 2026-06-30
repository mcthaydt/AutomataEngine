import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    // Game, tools, and editor may only use third-party libs through @automata/engine.
    files: ['games/**/*.ts', 'tools/**/*.ts', 'packages/editor/**/*.ts', 'packages/editor-agent/**/*.ts'],
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
    // game-kit may use third-party engine deps only via @automata/engine, and
    // must not depend on any game or the editor.
    files: ['packages/game-kit/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['three', 'three/*', '@dimforge/*', 'miniplex', 'smol-toml', 'yaml', 'zod'],
            message: 'Import the engine-wrapped API from @automata/engine instead.'
          },
          {
            group: ['monkey-ball', 'monkey-ball/*', 'pulsebreak', 'pulsebreak/*', 'level-editor', 'level-editor/*', '@automata/editor', '@automata/editor/*'],
            message: 'game-kit must not import games or the editor.'
          }
        ]
      }]
    }
  },
  {
    // The generic editor core must not depend on any game or on the optional AI layer.
    files: ['packages/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['monkey-ball', 'monkey-ball/*', 'pulsebreak', 'pulsebreak/*'],
            message: 'The editor core is generic; games attach through project registrations.'
          },
          {
            group: ['@automata/agent-core', '@automata/agent-core/*'],
            message: 'AI is optional; the agent layer lives in @automata/editor-agent, not the editor core.'
          }
        ]
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
          { name: 'monkey-ball', message: 'Use monkey-ball/project in the headless MCP graph.' },
          { name: 'pulsebreak', message: 'Use pulsebreak/project in the headless MCP graph.' }
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
          group: ['monkey-ball', 'monkey-ball/*', 'pulsebreak', 'pulsebreak/*', 'level-editor', 'level-editor/*', '@automata/editor'],
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
            group: ['monkey-ball', 'monkey-ball/*', 'pulsebreak', 'pulsebreak/*', 'level-editor', 'level-editor/*', '@automata/editor'],
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
    // contracts may share persisted command schemas with @automata/project only;
    // it must not depend on runtime, editor, agent, game, or tool packages.
    files: ['packages/contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@automata/engine',
            '@automata/editor',
            '@automata/editor/*',
            '@automata/editor-agent',
            '@automata/editor-agent/*',
            '@automata/agent-core',
            '@automata/agent-core/*',
            'monkey-ball',
            'monkey-ball/*',
            'pulsebreak',
            'pulsebreak/*',
            'level-editor',
            'level-editor/*'
          ],
          message: 'contracts may import only @automata/project from internal packages.'
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
  },
  {
    // project is the new persisted-model leaf: it may import zod directly, but must
    // not depend on engine, editor, contracts, games, or tools.
    files: ['packages/project/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: [
            '@automata/engine',
            '@automata/editor',
            '@automata/editor/*',
            '@automata/editor-agent',
            '@automata/agent-core',
            '@automata/contracts',
            '@automata/contracts/*',
            'monkey-ball',
            'monkey-ball/*',
            'pulsebreak',
            'pulsebreak/*',
            'level-editor',
            'level-editor/*'
          ],
          message: 'project is the persisted-model leaf; do not import editor, engine, contracts, games, or tools.'
        }]
      }]
    }
  }
)
