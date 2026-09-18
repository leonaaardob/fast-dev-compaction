/**
 * Codex rollout JSONL -> library Message[].
 *
 * A rollout file is append-only: `response_item` records carry the visible
 * conversation, `event_msg` records duplicate them as UI events (skipped), and
 * a `compacted` record means "everything before me was replaced by
 * `replacement_history`". Replaying the file and resetting on each `compacted`
 * record yields the live transcript Codex would compact.
 *
 * The rollout format is not a stable interface (Codex docs say so themselves),
 * so every record is parsed defensively: unknown types are skipped, never
 * fatal.
 */

const CALL_TYPES = new Set([
  'function_call',
  'custom_tool_call',
  'local_shell_call',
  'tool_search_call',
  'web_search_call',
]);

const OUTPUT_TYPES = new Set([
  'function_call_output',
  'custom_tool_call_output',
  'local_shell_call_output',
  'tool_search_output',
]);

function textOfContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const item of content) {
    if (item && typeof item === 'object' && typeof item.text === 'string') {
      parts.push(item.text);
    }
  }
  return parts.join('');
}

function textOfOutput(output) {
  if (typeof output === 'string') return output;
  if (Array.isArray(output)) return textOfContent(output);
  if (output && typeof output === 'object') {
    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }
  return '';
}

function callInput(item) {
  // function_call: `arguments` is a JSON string; custom_tool_call: `input` is a
  // raw string (often source code); local_shell/web calls: `action` object.
  const raw = item.arguments ?? item.input ?? item.action ?? {};
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* not JSON: keep the raw payload */
    }
    return { input: raw };
  }
  return {};
}

function pushCall(messages, call) {
  const last = messages[messages.length - 1];
  // Merge into the preceding assistant message: one assistant turn in the
  // library model holds its text and every tool_use together.
  if (last && last.role === 'assistant') {
    last.toolUses.push(call);
  } else {
    messages.push({ role: 'assistant', text: '', toolUses: [call] });
  }
}

function pushResult(messages, result) {
  const last = messages[messages.length - 1];
  if (last && last.role === 'user' && !last.text && last.toolResults) {
    last.toolResults.push(result);
  } else {
    messages.push({ role: 'user', text: '', toolUses: [], toolResults: [result] });
  }
}

function appendItem(messages, item) {
  if (!item || typeof item !== 'object') return;
  switch (item.type) {
    case 'message':
    case 'agent_message': {
      const role = item.role === 'assistant' || item.type === 'agent_message' ? 'assistant' : item.role === 'user' ? 'user' : null;
      if (!role) return; // developer/system instructions are re-injected by Codex
      const text = textOfContent(item.content ?? item.message);
      if (!text) return;
      messages.push({ role, text, toolUses: [] });
      return;
    }
    default:
      break;
  }
  if (CALL_TYPES.has(item.type)) {
    const id = item.call_id ?? item.id;
    if (typeof id !== 'string' || !id) return;
    pushCall(messages, {
      tool_use_id: id,
      tool: typeof item.name === 'string' ? item.name : item.type,
      input: callInput(item),
    });
    return;
  }
  if (OUTPUT_TYPES.has(item.type)) {
    const id = item.call_id ?? item.id;
    if (typeof id !== 'string' || !id) return;
    pushResult(messages, { tool_use_id: id, text: textOfOutput(item.output) });
  }
  // reasoning, realtime_item, ghost entries, ... : not conversation content.
}

/**
 * Parses rollout JSONL text into library messages, replaying `compacted`
 * records so the result is the live history, not the whole log.
 */
export function parseRollout(text) {
  const messages = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record;
    try {
      record = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!record || typeof record !== 'object') continue;
    if (record.type === 'compacted') {
      messages.length = 0;
      const replacement = record.payload?.replacement_history;
      if (Array.isArray(replacement)) {
        for (const item of replacement) appendItem(messages, item);
      }
      continue;
    }
    if (record.type === 'response_item') {
      appendItem(messages, record.payload);
    }
    // session_meta, turn_context, world_state, event_msg, token_usage_record:
    // metadata and duplicated UI events, never conversation content.
  }
  return messages;
}
