# Automata Editor MCP Server

A Node MCP server that exposes the level-editor command/eval registry to MCP clients
(Claude Desktop / Claude Code) over stdio. It binds a headless in-memory monkey-ball
document as the same `@automata/contracts` `ToolHost` the browser editor uses.

## Tools

`addItem`, `moveSelected`, `setItemField`, `setSurface`, `setMetadata`, `deleteItems`,
`getDoc`, `listItems`, `validate`, `testPlay` — plus resources `editor://doc`,
`editor://items`, `editor://validation`, `editor://baseline`.

## Run

```sh
npm run start -w editor-mcp-server
# optional: seed an initial level
AUTOMATA_LEVEL_JSON="$(cat path/to/level.json)" npm run start -w editor-mcp-server
```

## Connect Claude Desktop / Claude Code

Add to the MCP client config (adjust the absolute path):

```json
{
  "mcpServers": {
    "automata-editor": {
      "command": "npx",
      "args": ["tsx", "<repo>/tools/editor-mcp-server/src/main.ts"]
    }
  }
}
```

The live browser editor syncs via the existing doc load/export round-trip:
export a level from the editor, pass it as `AUTOMATA_LEVEL_JSON`, edit via the agent,
and re-import the result.
