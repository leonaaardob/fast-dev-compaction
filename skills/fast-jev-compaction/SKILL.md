---
name: fast-jev-compaction
description: Jev-guided verbatim compaction for Codex sessions. Use when the user asks to prune or compact a Codex rollout transcript, to inspect what Jev kept or dropped around a compaction, or to debug this plugin's PreCompact/SessionStart hooks.
---

# Fast Jev Compaction

This plugin wraps Codex's built-in compaction with TypeSafe's Jev model.
Instead of trusting a lossy summary alone, it scores every tool call and tool
result before compaction and re-injects the verbatim history Jev kept
afterwards.

## How it works in Codex

- `PreCompact` hook (`hooks/pre-compact.mjs`): parses the session rollout
  (`transcript_path` from the hook input), replays `compacted` records to
  rebuild the live history, runs `compactMessages()` from `dist/`, and writes
  the pruned transcript plus decisions into `$PLUGIN_DATA/<session_id>.*`.
- `SessionStart` hook (`hooks/session-start.mjs`, matcher `compact`): emits
  `hookSpecificOutput.additionalContext` containing the verbatim kept history,
  capped by `FAST_JEV_CONTEXT_CHARS`.
- `PostCompact` hook (`hooks/post-compact.mjs`): reports the outcome as a
  `systemMessage` (kept/truncated/dropped counts, state size, request count).

Hooks never block compaction. When Jev fails, the key is missing, or the
reduction is below `FAST_JEV_MIN_REDUCTION`, Codex's built-in summary runs
unchanged — the same fallback contract as the original `next(event)`.

## Manual use

Prune any rollout file by hand (needs `TYPESAFE_API_KEY`):

```sh
node "<plugin-root>/hooks/cli.mjs" ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl \
  --context pruned.md --json pruned.json
```

`<plugin-root>` is this plugin's install directory (the parent of `skills/`).
The rendered transcript goes to stdout when `--context` is omitted; stats go
to stderr.

## Configuration (environment variables)

| Variable | Default | Purpose |
| --- | --- | --- |
| `TYPESAFE_API_KEY` | — | Required for Jev requests |
| `FAST_JEV_KEY_FILE` | `~/.typesafe_key` | Key file fallback when env is unset |
| `FAST_JEV_MODEL` | `jev-latest` | Jev model name |
| `FAST_JEV_BASE_URL` | System One endpoint | API endpoint override |
| `FAST_JEV_KEEP_THRESHOLD` | `0.5` | Keep probability threshold |
| `FAST_JEV_PRESERVE_RECENT` | `6` | Newest messages never touched |
| `FAST_JEV_MAX_STATE_TOKENS` | `25000` | State budget per Jev request |
| `FAST_JEV_MAX_REQUEST_TOKENS` | `30000` | State + questions budget |
| `FAST_JEV_TRUNCATE_HEAD_CHARS` | `300` | Head kept on dropped results |
| `FAST_JEV_MIN_REDUCTION` | `0.25` | Below this, skip reinjection |
| `FAST_JEV_CONTEXT_CHARS` | `60000` | Cap on re-injected context |
| `FAST_JEV_GOAL` | last user prompts | Task description for Jev |

## State files

`$PLUGIN_DATA/<session_id>.json` holds status (`ok`/`skipped`), stats, and
per-call Jev decisions; `.context.md` is the rendered kept history;
`.messages.json` is the full pruned transcript. Files older than 48h are
swept on each hook run.
