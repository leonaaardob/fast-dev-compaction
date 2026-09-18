# fast-jev-compaction

Codex plugin that wraps session compaction with Jev decisions: before Codex
compacts, every tool call and result is scored in fast requests; after
compaction, the verbatim history Jev kept is re-injected as context. Also
usable as an npm library.

## What and why

Codex's built-in compaction asks a model to summarize old turns. A summary is
lossy: a file path, exact error, constraint, or command can disappear even
when it matters later. This plugin never rewrites anything. It only deletes
the tool calls and tool results Jev says are no longer needed, and it asks Jev
while showing it the whole conversation. User and assistant text stays
verbatim and in order.

The repository is both an npm package (`src/`) and a Codex plugin
(`hooks/`, `plugin.json`, `.codex-plugin/`, `skills/`) that uses the package
to preserve the Jev-pruned transcript around Codex's built-in compaction.

## How it works in Codex

Codex hooks cannot replace the compacted history the way Claude Code function
hooks can, so the plugin wraps compaction instead of intercepting it:

1. **`PreCompact`** (`hooks/pre-compact.mjs`) reads `transcript_path` from the
   hook input, replays the rollout JSONL — including `compacted` records, so
   the live history is what Codex sees, not the whole log — and converts it
   to the library's message model: `function_call`/`custom_tool_call`/
   `local_shell_call`/`tool_search_call`/`web_search_call` items become tool
   uses, their `*_output` items become tool results paired by `call_id`.
2. The transcript goes through `compactMessages()`: every `tool_use` is
   paired with its result, calls in the first or newest
   `preserveRecentMessages` messages are pinned, the whole conversation is
   fitted into `maxStateTokens` in staged reductions, and Jev answers two
   `noul` questions per non-pinned call — should the call stay, should the
   full result stay verbatim.
3. The pruned transcript, per-call decisions, and stats are written to
   `$PLUGIN_DATA/<session_id>.{json,context.md,messages.json}`.
4. Codex compacts with its built-in summarizer, then **`SessionStart`** hooks
   matching `source: compact` run (`hooks/session-start.mjs`): the verbatim
   kept history is emitted as `hookSpecificOutput.additionalContext`, capped
   at `FAST_JEV_CONTEXT_CHARS` with a pointer to the full file.
5. **`PostCompact`** (`hooks/post-compact.mjs`) reports the outcome as a
   `systemMessage`: kept/truncated/dropped counts, state size, request count.

When Jev fails, `TYPESAFE_API_KEY` is missing, the transcript can't be
fitted, or the estimated reduction is below `FAST_JEV_MIN_REDUCTION`, the
hooks exit cleanly and Codex's built-in summary runs unchanged — the same
fallback contract as the original plugin's `next(event)`.

## The library

```sh
npm install fast-jev-compaction
export TYPESAFE_API_KEY=...
```

```ts
import { compactMessages, reductionRatio, type Message } from 'fast-jev-compaction';

const result = await compactMessages(transcript, { preserveRecentMessages: 4 });
console.log(result.messages, result.decisions, result.stats);
```

`Message` (`{role, text, toolUses, toolResults}`) is agent-agnostic; the
Codex rollout adapter lives in `hooks/lib/rollout.mjs`. To bring your own
transport, implement `JevAsker` and call `compact(messages, asker, options)`.

## Install in Codex

Requires Node.js >= 18 on PATH (hooks run `node`) and a TypeSafe API key:

```sh
export TYPESAFE_API_KEY=<your key>
```

From this repository as a marketplace:

```sh
codex plugin marketplace add tamaratran/fast-jev-compaction
codex plugin add fast-jev-compaction@fast-jev-compaction
```

For a local checkout, point the personal marketplace at the clone or copy it
to `~/plugins/fast-jev-compaction` and add an entry to
`~/.agents/plugins/marketplace.json`.

Plugin-bundled hooks are not auto-trusted: open `/hooks` in Codex to review
and trust the three hook definitions, then start a new thread.

## Configuration

Environment variables replace the Claude version's `userConfig`:

| Variable | Default | Description |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | — | TypeSafe API key (required for Jev) |
| `FAST_JEV_MODEL` | `jev-latest` | Jev model name |
| `FAST_JEV_BASE_URL` | `https://api.typesafe.ai/v1/systemone` | System One endpoint |
| `FAST_JEV_KEEP_THRESHOLD` | `0.5` | Minimum keep probability for a call or result |
| `FAST_JEV_PRESERVE_RECENT` | `6` | Newest messages never touched (first is always kept) |
| `FAST_JEV_MAX_STATE_TOKENS` | `25000` | Estimated token ceiling for the Jev state |
| `FAST_JEV_MAX_REQUEST_TOKENS` | `30000` | Estimated ceiling for state plus questions |
| `FAST_JEV_TRUNCATE_HEAD_CHARS` | `300` | Characters kept on dropped results |
| `FAST_JEV_MIN_REDUCTION` | `0.25` | Below this ratio, skip reinjection |
| `FAST_JEV_CONTEXT_CHARS` | `60000` | Cap on re-injected `additionalContext` |
| `FAST_JEV_GOAL` | last 3 user prompts | Task description included in the state |

## Manual use

`hooks/cli.mjs` prunes any rollout file directly:

```sh
node hooks/cli.mjs ~/.codex/sessions/2026/09/18/rollout-*.jsonl \
  --context pruned.md --json pruned.json
```

## Limitations

- Codex hooks cannot substitute the compacted history; the plugin re-injects
  Jev's verbatim keep as `additionalContext` after the built-in summary runs.
  The Claude version's `compactAtPercent`/`turn.complete` trigger has no
  Codex equivalent — Codex schedules auto-compaction itself.
- The rollout format is not a stable interface; the adapter skips unknown
  records defensively and may need updates as Codex evolves.
- Only tool calls and results are candidates; text is never removed or
  shortened. Token sizes are estimates, not tokenizer counts.
- A probability is not a proof that a result is safe to drop; the assistant
  can always re-run the tool.

## Development

```sh
npm install
npm run typecheck        # library
npm run check:hooks      # node --check on every hook script
npm test                 # unit tests, fake Jev, no network
npm run build            # emit dist/ (checked in: hooks import it)
TYPESAFE_API_KEY="$(cat ~/.typesafe_key)" npm run demo
```

`dist/` is committed so the installed plugin runs without a build step.

## Repository layout

- `src/` — the compaction engine (TypeScript, platform-agnostic)
- `dist/` — compiled engine imported by the hooks at runtime
- `hooks/` — Codex lifecycle hooks (`hooks.json` + `.mjs` scripts + `lib/`)
- `skills/fast-jev-compaction/` — agent-facing usage docs
- `plugin.json` — portable Agent Plugins manifest
- `.codex-plugin/plugin.json` — Codex overlay manifest
- `.agents/plugins/marketplace.json` — repo marketplace (Git source)
- `tests/` — vitest suite (library + rollout adapter)
- `examples/demo.ts` — live-network library demo
