# Automata Project Editor

One shared editor app for every registered Automata game project.

```bash
npm run dev:editor
```

The chooser creates Monkey Ball or PULSEBREAK projects, opens project folders,
imports portable bundles when folder access is unavailable, and reopens recent
folder handles. Query parameters support `?game=<game-id>` preselection and
`?project=<recent-project-id>` direct open.

The project hierarchy edits scenes/entities/components; the resource browser
edits standalone tuning/content documents. Controls, nested objects, references,
array lists, and tables are generated from registered property schemas. All
changes use immutable `ProjectCommand`s, so a command batch is one undo step and
selection is reconciled by the project store.

## Directory layout

```text
automata.project.json
scenes/<scene-id>.scene.json
resources/<resource-id>.resource.json
```

Folder saves write only dirty documents. Bundle export remains available for
invalid work in progress and for browsers without File System Access support.
The shipped examples live at `games/monkey-ball/public/project` and
`games/pulsebreak/public/project`.
