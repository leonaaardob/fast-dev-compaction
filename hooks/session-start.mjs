/**
 * SessionStart hook (source = compact): after Codex compacts, re-inject the
 * verbatim history Jev kept as additional context. This is the Codex
 * equivalent of the Claude Code version's message replacement: the built-in
 * summary still runs, but nothing Jev judged necessary is lost to it.
 */

import { readFileSync } from 'node:fs';

import { configFromEnv, emit, readStdin } from './lib/config.mjs';
import { capContext } from './lib/render.mjs';
import { readState, sweep } from './lib/state.mjs';

const input = await readStdin();
if (input.source !== 'compact' || !input.session_id) process.exit(0);

const state = readState(input.session_id);
if (!state || state.status !== 'ok' || !state.contextFile) process.exit(0);

let rendered;
try {
  rendered = readFileSync(state.contextFile, 'utf8');
} catch {
  process.exit(0);
}

const { contextChars } = configFromEnv();
const { stats } = state;
const header = [
  'Codex just compacted this conversation. Before it ran, fast-jev-compaction scored every tool call with Jev and kept what still matters. Below is the verbatim pre-compaction history it preserved: exact file contents, errors, and command outputs the summary above may have dropped. Tool calls absent here were judged stale; the assistant can re-run them if needed.',
  `Full pruned transcript: ${state.messagesFile} (${stats?.kept ?? '?'}/${stats?.calls ?? '?'} calls kept, ${Math.round((stats?.reductionRatio ?? 0) * 100)}% reduction).`,
  '',
].join('\n');

emit({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: header + capContext(rendered, contextChars, state.contextFile),
  },
});
sweep();
