import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**'] },
  ...tseslint.configs.recommended,
  {
    // Game + tools may only use third-party libs through @automata/engine.
    files: ['games/**/*.ts', 'tools/**/*.ts'],
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
    // Engine must never depend on games or tools.
    files: ['packages/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['monkey-ball', 'monkey-ball/*', 'level-editor', 'level-editor/*'],
          message: 'Engine must not import games or tools.'
        }]
      }]
    }
  }
)
