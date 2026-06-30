# Automata Editor MCP Server

A stdio MCP server for Automata game projects. It loads a project folder or
portable bundle, selects the registered game from `manifest.gameId`, and applies
commands only to an isolated in-memory snapshot. Status messages use stderr;
stdout remains exclusively the MCP protocol channel.

## Tools and resources

Write tools: `addEntity`, `removeEntities`, `reparentEntity`, `addComponent`,
`removeComponent`, `addResource`, `removeResource`, `setProperty`,
`insertArrayItem`, `removeArrayItem`, and `moveArrayItem`.

Read/evaluation tools: `getProject`, `getHierarchy`, `getResources`, `validate`,
and `evaluate`.

Resources: `editor://project`, `editor://hierarchy`, `editor://resources`,
`editor://validation`, and `editor://baseline`.

## Run

From the repository root:

```sh
# Backward-compatible default: shipped Monkey Ball project
npm run start -w editor-mcp-server

# Open either shipped project explicitly
npm run start -w editor-mcp-server -- --project games/monkey-ball/public/project
npm run start -w editor-mcp-server -- --project games/pulsebreak/public/project

# Open a portable project bundle
npm run start -w editor-mcp-server -- --bundle /absolute/path/project.bundle.json
```

`--project` and `--bundle` are mutually exclusive. Run
`node_modules/.bin/automata-editor-mcp --help` for launcher usage.

## Claude Desktop / Claude Code

Use absolute paths in client configuration. Configure either project, or keep
both under distinct server names:

```json
{
  "mcpServers": {
    "automata-monkey-ball": {
      "command": "/absolute/repo/node_modules/.bin/automata-editor-mcp",
      "args": ["--project", "/absolute/repo/games/monkey-ball/public/project"]
    },
    "automata-pulsebreak": {
      "command": "/absolute/repo/node_modules/.bin/automata-editor-mcp",
      "args": ["--project", "/absolute/repo/games/pulsebreak/public/project"]
    }
  }
}
```

## Codex

Add the corresponding entries to the Codex MCP configuration:

```toml
[mcp_servers.automata_monkey_ball]
command = "/absolute/repo/node_modules/.bin/automata-editor-mcp"
args = ["--project", "/absolute/repo/games/monkey-ball/public/project"]

[mcp_servers.automata_pulsebreak]
command = "/absolute/repo/node_modules/.bin/automata-editor-mcp"
args = ["--project", "/absolute/repo/games/pulsebreak/public/project"]
```

Each server process owns its sandbox snapshot. Persist approved commands through
the editor/project workflow; MCP writes do not directly overwrite project files.
