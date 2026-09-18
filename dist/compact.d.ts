import type { CallAnswer, CallDecision, CompactOptions, CompactResult, JevAsker, JevQuestions, Message, ResolvedCompactOptions, ToolCall } from './types.js';
export declare const DEFAULT_OPTIONS: ResolvedCompactOptions;
export declare function resolveOptions(options?: CompactOptions): ResolvedCompactOptions;
/** The two `noul` questions asked about one call: keep the call, keep its result. */
export declare function questionsFor(call: ToolCall): JevQuestions;
/**
 * Splits the candidate calls into batches whose questions, together with the
 * (always complete) state, fit one request.
 */
export declare function batchCalls(calls: readonly ToolCall[], stateTokens: number, options: Pick<ResolvedCompactOptions, 'maxRequestTokens'>): ToolCall[][];
export declare function decideCall(call: Pick<ToolCall, 'id' | 'tool' | 'pinned'>, answer: CallAnswer, options: Pick<ResolvedCompactOptions, 'keepThreshold'>): CallDecision;
/**
 * Rebuilds the conversation from the decisions. A dropped call disappears
 * together with its result; a dropped result keeps a bounded head and note.
 * Messages that lose all their content are removed; untouched messages are
 * returned as the same objects they came in as.
 */
export declare function applyDecisions(messages: readonly Message[], decisions: readonly CallDecision[], calls: readonly ToolCall[], headChars: number): Message[];
/** Characters of text, tool input and tool output a message holds. */
export declare function messageChars(message: Message): number;
export declare function reductionRatio(result: Pick<CompactResult, 'stats'>): number;
/**
 * Compacts a transcript by asking Jev, for every tool call outside the pinned
 * first and newest messages, whether the call and whether its result must
 * stay. The whole history (results omitted, fitted into `maxStateTokens`) is
 * sent as state with every batch of questions. Throws when Jev fails or the
 * history cannot be fitted; the caller decides whether to fall back.
 */
export declare function compact(messages: readonly Message[], asker: JevAsker, options?: CompactOptions): Promise<CompactResult>;
//# sourceMappingURL=compact.d.ts.map