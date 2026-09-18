import type { FittedState, Message, ResolvedCompactOptions, ToolCall } from './types.js';
export declare const STATE_CONTEXT = "A coding assistant conversation is being compacted to free context. `history` is the whole conversation so far, oldest first; tool outputs are replaced by a short `result` note and long texts may be abridged. Each question asks whether one tool call, or the full output of that call, still needs to stay in the history verbatim. Whatever is not kept is deleted permanently, but the assistant can always re-run a tool or re-read a file.";
/**
 * Estimates tokens without a tokenizer: a word costs one token per six
 * letters, a digit half a token, any other symbol nine tenths. Calibrated
 * against the usage Jev reports for real transcripts, where it lands 2–18%
 * above the true count; a plain characters-per-token ratio undercounts the
 * JSON-heavy states by up to 40%.
 */
export declare function estimateTokens(text: string): number;
export declare function truncate(text: string, limit: number): string;
export declare function isPinned(index: number, total: number, preserveRecentMessages: number): boolean;
/**
 * Pairs every tool_use with its tool_result by `tool_use_id`. Calls without a
 * result are not candidates (there is nothing to drop yet).
 */
export declare function collectToolCalls(messages: readonly Message[], preserveRecentMessages: number): ToolCall[];
/** The last three user prompts, as the default `goal`. */
export declare function goalFromMessages(messages: readonly Message[]): string;
/**
 * Builds the Jev state from the whole conversation and shrinks it in stages
 * until it fits `maxStateTokens`: tool inputs are truncated, then long texts
 * are abridged oldest-first (pinned messages last), then old messages collapse
 * to a one-line note, then old tool calls shrink to one line each, then old
 * messages that carry no call are left out, then runs of old call-only
 * messages are folded into one entry. Throws when even that is too big.
 */
export declare function fitState(messages: readonly Message[], calls: readonly ToolCall[], options: Pick<ResolvedCompactOptions, 'maxStateTokens' | 'preserveRecentMessages' | 'goal'>): FittedState;
//# sourceMappingURL=state.d.ts.map