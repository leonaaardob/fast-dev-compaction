/**
 * PreCompact hook: score the live transcript with Jev and stash the pruned
 * result before Codex compacts. Never blocks: exit 0 lets Codex fall back to
 * its built-in compaction, which is this port's equivalent of `next(event)`.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { configFromEnv, readStdin } from './lib/config.mjs';
import { parseRollout } from './lib/rollout.mjs';
import { renderMessages } from './lib/render.mjs';
import { contextPath, messagesPath, sweep, writeState } from './lib/state.mjs';

const { compactMessages, reductionRatio } = await import(
  new URL('../dist/index.js', import.meta.url)
);

function skip(sessionId, reason, extra = {}) {
  if (sessionId) writeState(sessionId, { status: 'skipped', reason, ...extra });
  sweep();
  process.exit(0);
}

const input = await readStdin();
const sessionId = input.session_id;

let messages;
try {
  if (!input.transcript_path) throw new Error('no transcript_path in hook input');
  messages = parseRollout(readFileSync(input.transcript_path, 'utf8'));
} catch (error) {
  skip(sessionId, `transcript unreadable: ${error instanceof Error ? error.message : String(error)}`);
}

const config = configFromEnv();

if (!config.apiKey) skip(sessionId, 'TYPESAFE_API_KEY is not configured');
if (messages.length < 2) skip(sessionId, 'transcript too short');

try {
  const result = await compactMessages(messages, {
    ...config.compact,
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    goal: config.goal,
  });
  const ratio = reductionRatio(result);
  const stats = { ...result.stats, reductionRatio: ratio };
  if (ratio < config.minReductionRatio) {
    skip(sessionId, `below ${Math.round(config.minReductionRatio * 100)}% minimum reduction`, { stats });
  }
  const rendered = renderMessages(result.messages);
  writeFileSync(contextPath(sessionId), rendered);
  writeFileSync(messagesPath(sessionId), JSON.stringify(result.messages, null, 2));
  writeState(sessionId, {
    status: 'ok',
    trigger: input.trigger,
    stats,
    decisions: result.decisions,
    contextFile: contextPath(sessionId),
    messagesFile: messagesPath(sessionId),
    contextChars: rendered.length,
  });
} catch (error) {
  skip(sessionId, error instanceof Error ? error.message : String(error));
}
sweep();
