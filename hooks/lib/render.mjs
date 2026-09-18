/**
 * Renders the pruned transcript as verbatim context for `additionalContext`.
 * Nothing is paraphrased: text stays as recorded, tool inputs are the JSON
 * payloads, tool results are the raw outputs. Overlong single results are
 * abridged head+tail so one file read cannot crowd out the rest.
 */

const RESULT_HEAD = 8000;
const RESULT_TAIL = 2000;

function abridge(text, head, tail) {
  if (text.length <= head + tail + 80) return text;
  return `${text.slice(0, head)}\n[… ${text.length - head - tail} chars omitted …]\n${text.slice(-tail)}`;
}

export function renderMessages(messages) {
  const parts = [];
  for (const message of messages) {
    const label = message.role === 'user' ? 'user' : 'assistant';
    if (message.text) parts.push(`## ${label}\n${message.text}`);
    for (const use of message.toolUses ?? []) {
      let input;
      try {
        input = JSON.stringify(use.input);
      } catch {
        input = '[unserializable input]';
      }
      parts.push(`## ${label} · tool call ${use.tool}\n${input}`);
    }
    for (const result of message.toolResults ?? []) {
      parts.push(`## tool result\n${abridge(result.text, RESULT_HEAD, RESULT_TAIL)}`);
    }
  }
  return parts.join('\n\n');
}

/** Head+tail cap for the whole context block; the middle points at the file. */
export function capContext(text, maxChars, filePath) {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.6);
  const tail = Math.floor(maxChars * 0.3);
  return `${text.slice(0, head)}\n\n[… ${text.length - head - tail} chars omitted; full pruned transcript: ${filePath} …]\n\n${text.slice(-tail)}`;
}
