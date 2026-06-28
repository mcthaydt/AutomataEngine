export interface ScaffoldFile { path: string; content: string }
export interface ScaffoldPlan { files: ScaffoldFile[]; rootSnippets: string[] }

/** Plans the files + root-config snippets for a new game package. Pure. */
export function planNewGame(name: string, port = 5177): ScaffoldPlan {
  const dir = `games/${name}`
  const files: ScaffoldFile[] = [
    {
      path: `${dir}/package.json`,
      content: JSON.stringify({
        name,
        private: true,
        version: '0.0.0',
        type: 'module',
        exports: { '.': './src/index.ts' },
        dependencies: { '@automata/engine': '*', '@automata/game-kit': '*' },
        scripts: { dev: 'vite', build: 'vite build', typecheck: 'tsc --noEmit' }
      }, null, 2) + '\n'
    },
    {
      path: `${dir}/tsconfig.json`,
      content: JSON.stringify({
        extends: '../../tsconfig.base.json',
        compilerOptions: { lib: ['ES2022', 'DOM', 'DOM.Iterable'] },
        include: ['src', 'tests', 'vitest.config.ts']
      }, null, 2) + '\n'
    },
    { path: `${dir}/vite.config.ts`, content: "import { defineConfig } from 'vite'\n\nexport default defineConfig({ base: './' })\n" },
    {
      path: `${dir}/vitest.config.ts`,
      content: "import { defineConfig } from 'vitest/config'\n\n" +
        `export default defineConfig({\n  test: { name: '${name}', environment: 'happy-dom', include: ['tests/**/*.test.ts'] }\n})\n`
    },
    {
      path: `${dir}/index.html`,
      content: '<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8" />\n' +
        '    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n' +
        `    <title>${name}</title>\n  </head>\n  <body>\n    <div id="app"></div>\n` +
        '    <script type="module" src="/src/main.ts"></script>\n  </body>\n</html>\n'
    },
    { path: `${dir}/src/index.ts`, content: `// Public entry for ${name}; re-export anything other packages import.\nexport {}\n` },
    { path: `${dir}/src/vite-env.d.ts`, content: '/// <reference types="vite/client" />\n' },
    {
      path: `${dir}/src/main.ts`,
      content: "// Browser composition root. Wire renderer, audio, input, store, and the\n" +
        "// game loop here using @automata/engine and @automata/game-kit.\n" +
        "const app = document.getElementById('app')\n" +
        "if (!app) throw new Error('Missing #app')\n"
    }
  ]
  const rootSnippets = [
    `package.json scripts: "dev:${name}": "npm run dev -w ${name} -- --host 127.0.0.1 --port ${port} --strictPort"`,
    `package.json build: append " && npm run build -w ${name}"`,
    `playwright.config.ts webServer: { command: 'npm run dev:${name}', url: 'http://127.0.0.1:${port}', reuseExistingServer: !process.env.CI }`
  ]
  return { files, rootSnippets }
}
