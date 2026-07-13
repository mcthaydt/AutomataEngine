# Phase 2 — Versioned `GameSpec` — Design

Status: approved design. Date: 2026-07-13.
Scope source: [Phase 0→8 decomposition](../../2026-07/week-28/2026-07-11-factory-phase-decomposition-design.md) §Phase 2;
status/sequencing: [`/docs/ROADMAP.md`](/docs/ROADMAP.md) §3 Phase 2.
Strategy source: [Autonomous Game Factory design](/docs/superpowers/specs/archive/2026-07/week-27/2026-07-04-autonomous-game-factory-design.md)
§Core model, §Intent compiler, §Human checkpoints.

## 1. Goal and non-goals

**Goal.** A prompt compiles into a **valid, bounded, reviewable `GameSpec`**
plus a **design checkpoint** — the first of the three product checkpoints
(Design approval). This phase introduces the central contract every subsequent
phase consumes.

It covers the whole of factory Phase 2 — all three sub-cycles named in the
decomposition doc:

1. the `GameSpec` schema + supported-envelope definition;
2. the intent compiler (prompt → `GameSpec` + human-readable design brief);
3. the structural spec-validation evaluator + design-checkpoint artifact.

**Non-goals (explicitly deferred).** No code, content, or asset generation
from the spec — the intent compiler explicitly does not generate game code or
assets. Capability *packs* are Phase 4; here only their selection/config
schema exists (config bodies are empty stubs). No checkpoint UI in the editor.
No server-side LLM calls — the server never talks to a model provider.

## 2. Decisions of record

Settled during brainstorming, binding for the plan:

- **The MCP-calling agent is the intent compiler's brain; the server is its
  bound.** The agent (Claude Code/Codex/OpenCode over MCP) authors the
  `GameSpec` draft from the user's prompt, guided by the schema riding in the
  tool descriptions and a `build-game-spec` MCP prompt. The server
  deterministically validates, bounds, normalizes, versions, and persists. No
  provider credentials or LLM calls inside the factory.
- **One spec for the whole phase.** All three sub-cycles are designed here; the
  plan may sequence them as milestones.
- **Checkpoint over MCP tools, brief as a file.** The server renders the spec
  into a markdown design brief; the human reads it and tells their agent;
  `recordDesignDecision` writes the decision durably into the P5 session
  ledger. No new UI.
- **Structure (Approach A).** `GameSpec` zod schemas + capability-selection
  schema + acceptance-criterion format in `@automata/contracts`; the
  deterministic engine (validate/normalize/version/brief) in a new package
  `packages/game-spec` (`@automata/game-spec`); MCP tools wired in
  `tools/editor-mcp-server` with persistence through `@automata/build-session`.
- **Spec lives with the game.** The finalized spec is written to
  `games/<id>/gamespec.json` — checked in, next to the project it governs, so
  later phases and generated artifacts can record `specVersion` without
  touching gitignored session state. Flow is `createGame` first (cheap
  scaffold), then spec compilation targets that game; sessions are already
  keyed by gameId.
- **Determinism boundary.** The LLM authoring step is not replayed; the
  recorded draft is the input. Everything server-side (validate, normalize,
  persist, render) is a pure function of recorded inputs, so P5's `replayStep`
  reproduces identical output hashes. This is how "prompt→spec runs under the
  seeded harness" is honored without pretending an LLM is seedable.

## 3. Architecture and data flow

```
@automata/contracts        GameSpec zod schemas + envelope bounds,
                           capability-selection schema + compatibility table,
                           acceptance-criterion format, spec tool defs
        ▲
@automata/game-spec        pure deterministic engine: validateGameSpec,
                           normalizeGameSpec, renderDesignBrief,
                           nextSpecVersion — no I/O
        ▲
@automata/build-session    persistence: atomic spec writes, hash-guarded
   (unchanged deps)        seeded steps, checkpoint decisions in the ledger
        ▲
tools/editor-mcp-server    compileGameSpec / getGameSpec / renderDesignBrief /
                           recordDesignDecision + build-game-spec prompt;
                           composes game-spec + build-session; adapter only
```

Dependency direction: `editor-mcp-server → {build-session, game-spec} →
contracts` (game-spec also uses `@automata/project` for `z`). `build-session`
stays spec-agnostic (its P5 dependencies are unchanged); `game-spec` imports
no session, editor, or engine internals — Phases 3–6 consumers read and
validate specs without touching session machinery. The MCP server is the only
place the two meet.

The flow, end to end:

1. **Scaffold.** Agent calls the existing `createGame`; the game directory and
   its session exist before any spec work.
2. **Draft.** The agent authors a `GameSpec` draft from the user's prompt. The
   full JSON schema rides in the `compileGameSpec` tool description (the P2
   pattern), so the agent knows shape and bounds before drafting.
3. **Compile.** `compileGameSpec(gameId, draft, prompt, translations[,
   changeReason])` runs validate → cross-field checks → compatibility checks →
   normalize. Failure returns typed findings and writes nothing. Success
   atomically writes `games/<id>/gamespec.json` and records a hash-guarded
   seeded step (source prompt kept as provenance). Identical re-runs return
   `cached: true`.
4. **Brief.** `renderDesignBrief(gameId)` deterministically renders the spec
   into a markdown brief (premise, mechanics, unsupported-ask translations,
   story outline, capability selection, budgets, acceptance criteria),
   persisted as a session artifact and a recorded step.
5. **Checkpoint.** The human reads the brief and instructs their agent;
   `recordDesignDecision(gameId, approve|reject, reason)` writes decision +
   spec content hash to the session ledger. **Approve freezes that
   specVersion.** Reject leaves the spec editable and records why.
6. **Post-approval change.** `compileGameSpec` on an approved spec requires
   `changeReason`, produces `specVersion + 1` with the reason in the spec's
   embedded version history, and flips the checkpoint back to pending —
   a changed spec must be re-approved.

## 4. `GameSpec` schema and supported envelope

All schemas are zod v4 `strictObject`s authored via `@automata/project`'s `z`
re-export, per the repo schema rules. Unknown keys are rejected everywhere;
**every envelope limit is a zod bound, so validation is envelope
enforcement.** Field inventory (bounds finalized against the engine surface
during implementation, structure binding now):

- **`specVersion`** — positive int. **`provenance`** — source prompt,
  translations (`{requested, translatedTo, reason}[]` — how "unsupported
  requests are translated and disclosed" becomes checkpoint-visible),
  created/updated timestamps, and the embedded version history
  (`{version, reason, date}[]`).
- **`identity`** — `id` (must equal the gameId per the registry convention),
  `title`, `logline`, `themes` (bounded list), `contentRating` (enum:
  `everyone | teen | mature`).
- **`direction`** — `visualStyle`, `audioStyle`, `dialogueTone` as
  length-bounded free strings (creative intent stays expressive); `camera` as
  an enum of what the engine actually supports.
- **`budgets`** — `targetMinutes` (≤ 120), `districtCount` (exactly 1),
  `interiorCount`, `characterCount`, `mainQuestCount`, `sideQuestCount`,
  `enemyTypeCount`, `assetBudget`, `buildTimeMinutes` — each with hard
  `.min()/.max()` encoding the founding design's supported envelope. Exceeding
  a bound is a schema failure, not a warning.
- **`capabilities`** — selections from the enum of the seven planned pack IDs
  (`interaction-inventory`, `dialogue-quests`, `schedules-relationships`,
  `combat-ai`, `economy-progression`, `hub-navigation-vehicle`, `save-load`),
  each with an empty-for-now `config` strictObject stub and a declared
  requirements slot. A static pairwise **compatibility table** in contracts
  defines the rule shape; Phase 4 packs take ownership of their real
  declarations later.
- **`world` / `cast` / `story` / `progression`** — deliberate stubs, per the
  decomposition: world = named locations (`kind: district | interior`); cast =
  named characters with role; story = ordered outline beats with required
  beginning and ending; progression = a small ordered milestones list. All
  cross-checked against budgets (locations vs `interiorCount`, cast length ≤
  `characterCount`, …).
- **`assets`** — `AssetRequirement[]` stubs: stable logical ID, kind enum,
  description; count ≤ `assetBudget`. The manifest side is Phase 5.
- **`acceptance`** — the acceptance-criterion format (a contract deliverable of
  this phase): `id`, `description`, `kind`
  (`structural | simulation | browser | manual`), and a machine-checkable
  `target` slot. Later phases generate evaluators from these.

## 5. `@automata/game-spec` — the deterministic engine

Pure functions, no I/O:

- **`validateGameSpec(draft)`** — the phase's **structural spec-validation
  evaluator** (its cross-cutting evaluator slice). Three layers: (1) zod
  schema/envelope issues; (2) cross-field budget consistency (cast vs
  `characterCount`, assets vs `assetBudget`, story beats vs quest counts);
  (3) capability compatibility (selected pairs against the table,
  config-vs-selection consistency). All failures come back as typed findings
  in the P5 findings shape — the same pipe every later evaluator reports
  through.
- **`normalizeGameSpec(draft)`** — applies defaults and canonical ordering;
  idempotent (`normalize(normalize(x)) === normalize(x)`) so spec content
  hashes are stable.
- **`renderDesignBrief(spec)`** — spec → markdown string, purely a function of
  the spec.
- **`nextSpecVersion(current, proposed, changeReason)`** — enforces
  immutability: an approved version never mutates; changes produce
  `specVersion + 1` with the recorded reason.

**Division of intelligence (explicit).** Normalizing vague requests,
preserving fantasy/tone/differentiators, spotting *semantic* contradictions,
and originality/content-policy judgment belong to the drafting agent, guided
by the schema and the `build-game-spec` MCP prompt. The server enforces
everything *structural* — it is the bound, not the brain.

## 6. MCP tool surface

Wired in `tools/editor-mcp-server` (workspace mode), persistence via
`@automata/build-session`:

| Tool | Behavior |
|---|---|
| `compileGameSpec` | Validate → findings on failure (nothing written); on success atomically write `games/<id>/gamespec.json` and record a hash-guarded seeded step. Identical inputs → `cached: true`. On an approved spec, requires `changeReason`, bumps the version, and invalidates the checkpoint. |
| `getGameSpec` | Current spec + version + checkpoint status. The spec JSON schema also rides in tool descriptions for the drafting agent. |
| `renderDesignBrief` | Renders and persists the brief as a session artifact; a recorded step. |
| `recordDesignDecision` | Writes `approve/reject` + reason + spec content hash to the session ledger. Approve freezes the version; approving against a spec whose hash changed since the brief was rendered fails. |

Plus the **`build-game-spec` MCP prompt** extending the existing `build-game`
prompt pattern: instructs the drafting agent on envelope, translation
disclosure, and the compile → brief → checkpoint workflow.

**The design-checkpoint artifact** = the pair (frozen `gamespec.json` version,
rendered brief) + the recorded decision in the durable ledger. Git carries the
spec file; P5's ledger carries the decision.

## 7. Error handling

- Invalid drafts return typed findings with JSON paths (zod issues mapped to
  the findings shape) and never write anything; the agent repairs and
  re-calls under the session's existing attempt budgets.
- Spec writes are atomic (build-session's store pattern) — a crash mid-compile
  cannot leave a torn `gamespec.json`.
- Mutating an approved version without `changeReason` is rejected with a
  specific finding. A version bump automatically flips checkpoint status to
  pending; the hash check in `recordDesignDecision` independently guarantees a
  stale approval can never cover a changed spec.
- Unknown capability IDs, incompatible pairs, and budget violations are all
  findings, not crashes.

## 8. Testing

TDD throughout, per AGENTS.md.

- **Unit (`@automata/contracts`, `@automata/game-spec`).** Schema bound cases
  (each budget's min/max edges), cross-field checks, compatibility-table
  cases, normalization idempotency + stable hashing, version-transition rules,
  brief-rendering snapshots.
- **Integration (`tools/editor-mcp-server`).** Full lifecycle over a real
  session: compile → brief → approve → attempted mutation (rejected) → bump
  with reason → re-approve. `cached: true` on identical re-compile.
  `replayStep` reproduces identical output hashes for compile and render
  steps.
- **Exit-criterion acceptance test.** Ten differently worded prompt fixtures,
  each paired with a recorded agent-authored draft (captured from real
  drafting sessions, checked in as fixtures), all compiling to valid, bounded
  specs with rendered briefs. Fixtures make the criterion CI-checkable; the
  live-agent path uses the exact same tools, so CI proves the deterministic
  half and a scripted live run demonstrates the rest at phase close.

## 9. Exit criteria

Matching the decomposition doc:

- Ten differently worded prompts produce valid, bounded, reviewable specs
  (CI: fixture acceptance test; close-out: scripted live run).
- The design checkpoint round-trips over MCP: brief rendered, decision
  recorded, approval freezes the version, any change re-opens the checkpoint.
- Spec compile and brief render replay deterministically from recorded inputs
  with identical output hashes.

## 10. Risks retired / carried

Retires **platform scope creep** at the contract level: the envelope is
machine-enforced zod bounds, and unsupported asks surface as recorded,
checkpoint-visible translations rather than silent approximations. Begins on
**content incoherence**: spec facts (cast, locations, beats, budgets) are
explicit and cross-checked. Carries forward: the pack `config` stubs are
empty — real pack schemas and compatibility declarations are Phase 4's to own;
the acceptance-criterion `target` slot is a shape whose evaluators arrive in
Phases 3–6.
