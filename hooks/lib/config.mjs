/** Plugin configuration: environment variables over library defaults. */

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * API key fallback for contexts that do not inherit the user's shell
 * environment (the Codex desktop app does not source ~/.zshrc). Reads the
 * first readable file from FAST_JEV_KEY_FILE or ~/.typesafe_key.
 */
function keyFromFile(env) {
  const candidates = [
    env.FAST_JEV_KEY_FILE,
    join(homedir(), '.typesafe_key'),
    join(homedir(), '.config', 'fast-jev-compaction', 'api_key'),
  ].filter(Boolean);
  for (const path of candidates) {
    try {
      const value = readFileSync(path, 'utf8').trim();
      if (value) return value;
    } catch {
      /* next candidate */
    }
  }
  return undefined;
}

function num(env, key) {
  const value = env[key];
  if (value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function configFromEnv(env = process.env) {
  const options = {
    minReductionRatio: num(env, 'FAST_JEV_MIN_REDUCTION') ?? 0.25,
    contextChars: num(env, 'FAST_JEV_CONTEXT_CHARS') ?? 60_000,
    model: env.FAST_JEV_MODEL || undefined,
    apiKey: env.TYPESAFE_API_KEY || keyFromFile(env),
    baseUrl: env.FAST_JEV_BASE_URL || undefined,
    goal: env.FAST_JEV_GOAL || undefined,
  };
  const compact = {};
  for (const [envKey, optionKey] of [
    ['FAST_JEV_KEEP_THRESHOLD', 'keepThreshold'],
    ['FAST_JEV_PRESERVE_RECENT', 'preserveRecentMessages'],
    ['FAST_JEV_MAX_STATE_TOKENS', 'maxStateTokens'],
    ['FAST_JEV_MAX_REQUEST_TOKENS', 'maxRequestTokens'],
    ['FAST_JEV_TRUNCATE_HEAD_CHARS', 'truncateHeadChars'],
  ]) {
    const value = num(env, envKey);
    if (value !== undefined) compact[optionKey] = value;
  }
  return { ...options, compact };
}

export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    process.stdin.on('error', () => resolve({}));
  });
}

export function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
