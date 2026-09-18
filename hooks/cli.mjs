#!/usr/bin/env node
/**
 * Manual CLI: prune a Codex rollout file with Jev.
 *
 *   node hooks/cli.mjs <rollout.jsonl> [--context out.md] [--json out.json]
 *
 * Prints stats to stderr and the rendered pruned transcript to stdout.
 */

import { readFileSync, writeFileSync } from 'node:fs';

import { configFromEnv } from './lib/config.mjs';
import { renderMessages } from './lib/render.mjs';
import { parseRollout } from './lib/rollout.mjs';

const { compactMessages, reductionRatio } = await import(
  new URL('../dist/index.js', import.meta.url)
);

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error('usage: cli.mjs <rollout.jsonl> [--context out.md] [--json out.json]');
  process.exit(2);
}
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const config = configFromEnv();
if (!config.apiKey) {
  console.error('fast-jev-compaction: TYPESAFE_API_KEY is not configured');
  process.exit(1);
}
const messages = parseRollout(readFileSync(file, 'utf8'));
const result = await compactMessages(messages, {
  ...config.compact,
  apiKey: config.apiKey,
  model: config.model,
  baseUrl: config.baseUrl,
  goal: config.goal,
});
const rendered = renderMessages(result.messages);
const out = flag('--context');
if (out) writeFileSync(out, rendered); else process.stdout.write(`${rendered}\n`);
const json = flag('--json');
if (json) writeFileSync(json, JSON.stringify(result.messages, null, 2));
const s = result.stats;
console.error(
  `fast-jev-compaction: ${Math.round(reductionRatio(result) * 100)}% reduction; ` +
    `${s.kept} kept, ${s.resultsDropped} truncated, ${s.callsDropped} dropped, ${s.pinned} pinned; ` +
    `state ~${s.stateTokens} tokens (${s.stateStage}) in ${s.requests} request(s)`,
);
