/**
 * PostCompact hook: surface the Jev outcome as a system message, the Codex
 * equivalent of the Claude version's toast.
 */

import { emit, readStdin } from './lib/config.mjs';
import { readState } from './lib/state.mjs';

const input = await readStdin();
const state = input.session_id ? readState(input.session_id) : null;
if (!state) process.exit(0);

if (state.status === 'ok') {
  const s = state.stats ?? {};
  const parts = [
    s.kept > 0 ? `${s.kept} calls kept` : '',
    s.resultsDropped > 0 ? `${s.resultsDropped} results truncated` : '',
    s.callsDropped > 0 ? `${s.callsDropped} calls dropped` : '',
    s.pinned > 0 ? `${s.pinned} pinned` : '',
  ].filter(Boolean);
  emit({
    systemMessage: `fast-jev-compaction: ${Math.round((s.reductionRatio ?? 0) * 100)}% reduction; ${parts.join(', ') || 'no tool calls'}; state ~${s.stateTokens} tokens (${s.stateStage}) in ${s.requests} request(s). Verbatim kept history re-injected as context.`,
  });
} else {
  emit({
    systemMessage: `fast-jev-compaction: built-in summary used (${state.reason ?? 'unknown reason'})`,
  });
}
