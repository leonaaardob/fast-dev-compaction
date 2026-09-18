/** Per-session state files under the plugin data directory. */

import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const MAX_AGE_MS = 48 * 60 * 60 * 1000;

export function dataDir(env = process.env) {
  const dir = env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA || join(tmpdir(), 'fast-jev-compaction');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function safeName(sessionId) {
  return String(sessionId || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
}

export function statePath(sessionId, env = process.env) {
  return join(dataDir(env), `${safeName(sessionId)}.json`);
}

export function contextPath(sessionId, env = process.env) {
  return join(dataDir(env), `${safeName(sessionId)}.context.md`);
}

export function messagesPath(sessionId, env = process.env) {
  return join(dataDir(env), `${safeName(sessionId)}.messages.json`);
}

export function writeState(sessionId, state, env = process.env) {
  const path = statePath(sessionId, env);
  writeFileSync(path, JSON.stringify({ ...state, session_id: sessionId, written: new Date().toISOString() }, null, 2));
  return path;
}

export function readState(sessionId, env = process.env) {
  try {
    const parsed = JSON.parse(readFileSync(statePath(sessionId, env), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Best-effort cleanup of state files older than MAX_AGE_MS. */
export function sweep(env = process.env) {
  const dir = env.PLUGIN_DATA || env.CLAUDE_PLUGIN_DATA;
  if (!dir) return;
  const cutoff = Date.now() - MAX_AGE_MS;
  try {
    for (const name of readdirSync(dir)) {
      if (!/^fast-jev|\.json$|\.context\.md$|\.messages\.json$/.test(name)) continue;
      const path = join(dir, name);
      try {
        const { mtimeMs } = statSync(path);
        if (mtimeMs < cutoff) rmSync(path, { force: true });
      } catch {
        /* gone already */
      }
    }
  } catch {
    /* dir gone */
  }
}
