import { describe, expect, it } from 'vitest';

import { parseRollout } from '../hooks/lib/rollout.mjs';

function line(type: string, payload: unknown): string {
  return JSON.stringify({ timestamp: '2026-01-01T00:00:00Z', type, payload });
}

const userMsg = (text: string) => ({
  type: 'message',
  role: 'user',
  content: [{ type: 'input_text', text }],
});
const asstMsg = (text: string) => ({
  type: 'message',
  role: 'assistant',
  content: [{ type: 'output_text', text }],
});
const devMsg = (text: string) => ({
  type: 'message',
  role: 'developer',
  content: [{ type: 'input_text', text }],
});
const fnCall = (id: string, name: string, args: unknown) => ({
  type: 'function_call',
  call_id: id,
  name,
  arguments: JSON.stringify(args),
});
const customCall = (id: string, name: string, input: string) => ({
  type: 'custom_tool_call',
  call_id: id,
  name,
  input,
});
const fnOut = (id: string, output: unknown) => ({
  type: 'function_call_output',
  call_id: id,
  output,
});
const customOut = (id: string, text: string) => ({
  type: 'custom_tool_call_output',
  call_id: id,
  output: [{ type: 'input_text', text }],
});

describe('parseRollout', () => {
  it('maps messages, calls, and outputs to library messages', () => {
    const rollout = [
      line('session_meta', { session_id: 's1' }),
      line('response_item', userMsg('fix the test')),
      line('response_item', devMsg('big instructions')),
      line('response_item', asstMsg('looking')),
      line('response_item', fnCall('c1', 'Read', { file_path: 'a.ts' })),
      line('response_item', fnOut('c1', 'file a contents')),
      line('response_item', customCall('c2', 'exec', 'ls -la')),
      line('response_item', customOut('c2', 'total 0')),
      line('event_msg', { type: 'item_completed', item: fnCall('dup', 'x', {}) }),
      line('response_item', asstMsg('done')),
    ].join('\n');

    const messages = parseRollout(rollout);
    expect(messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(messages[0].text).toBe('fix the test');
    // assistant text merged with its call; results pair by call_id
    expect(messages[1].toolUses.map((t) => t.tool_use_id)).toEqual(['c1']);
    expect(messages[1].toolUses[0].input).toEqual({ file_path: 'a.ts' });
    expect(messages[2].toolResults?.map((r) => r.text)).toEqual(['file a contents']);
    expect(messages[3].toolUses[0].input).toEqual({ input: 'ls -la' });
    expect(messages[4].toolResults?.map((r) => r.text)).toEqual(['total 0']);
    expect(messages[5].text).toBe('done');
  });

  it('replays compacted records so only live history remains', () => {
    const rollout = [
      line('response_item', userMsg('old prompt')),
      line('response_item', fnCall('old', 'Read', {})),
      line('response_item', fnOut('old', 'old output')),
      line('compacted', {
        message: '',
        replacement_history: [userMsg('summary of old work'), devMsg('ctx')],
      }),
      line('response_item', asstMsg('new answer')),
      line('response_item', fnCall('c9', 'Bash', { command: 'npm test' })),
      line('response_item', fnOut('c9', 'PASS')),
    ].join('\n');

    const messages = parseRollout(rollout);
    expect(messages).toHaveLength(3);
    expect(messages[0].text).toBe('summary of old work');
    expect(messages[1].toolUses[0].tool_use_id).toBe('c9');
    expect(messages[2].toolResults?.[0].text).toBe('PASS');
  });

  it('skips malformed lines and unknown records', () => {
    const rollout = [
      'not json',
      line('response_item', { type: 'reasoning', summary: [] }),
      line('world_state', { full: true }),
      line('response_item', userMsg('hi')),
    ].join('\n');
    expect(parseRollout(rollout)).toHaveLength(1);
  });
});
