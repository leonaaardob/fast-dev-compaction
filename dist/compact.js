import { noulAnswer } from './request.js';
import { collectToolCalls, estimateTokens, fitState } from './state.js';
export const DEFAULT_OPTIONS = {
    goal: '',
    keepThreshold: 0.5,
    preserveRecentMessages: 6,
    maxStateTokens: 25_000,
    maxRequestTokens: 30_000,
    truncateHeadChars: 300,
};
/** Tokens the request envelope (`model`, key names) adds around state and questions. */
const REQUEST_OVERHEAD_TOKENS = 20;
function finite(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function resolveOptions(options = {}) {
    return {
        goal: options.goal ?? DEFAULT_OPTIONS.goal,
        keepThreshold: finite(options.keepThreshold, DEFAULT_OPTIONS.keepThreshold),
        preserveRecentMessages: Math.max(0, Math.floor(finite(options.preserveRecentMessages, DEFAULT_OPTIONS.preserveRecentMessages))),
        maxStateTokens: Math.max(1, finite(options.maxStateTokens, DEFAULT_OPTIONS.maxStateTokens)),
        maxRequestTokens: Math.max(1, finite(options.maxRequestTokens, DEFAULT_OPTIONS.maxRequestTokens)),
        truncateHeadChars: Math.max(0, Math.floor(finite(options.truncateHeadChars, DEFAULT_OPTIONS.truncateHeadChars))),
    };
}
/** The two `noul` questions asked about one call: keep the call, keep its result. */
export function questionsFor(call) {
    return {
        [`call_${call.id}`]: {
            type: 'noul',
            instructions: `Tool call ${call.id} (${call.tool}) should stay in the history: knowing this call was made, with its input, still matters for what the assistant does next`,
        },
        [`result_${call.id}`]: {
            type: 'noul',
            instructions: `The full output of tool call ${call.id} (${call.tool}, ${call.resultChars} chars) should stay in the history verbatim: the assistant still needs its contents and re-running the tool would not do`,
        },
    };
}
/**
 * Splits the candidate calls into batches whose questions, together with the
 * (always complete) state, fit one request.
 */
export function batchCalls(calls, stateTokens, options) {
    const budget = options.maxRequestTokens - stateTokens - REQUEST_OVERHEAD_TOKENS;
    const batches = [];
    let current = [];
    let currentTokens = 0;
    for (const call of calls) {
        const tokens = estimateTokens(JSON.stringify(questionsFor(call)));
        if (current.length > 0 && currentTokens + tokens > budget) {
            batches.push(current);
            current = [];
            currentTokens = 0;
        }
        if (current.length === 0 && tokens > budget) {
            throw new Error(`state leaves no room for questions (~${stateTokens} of ${options.maxRequestTokens} tokens)`);
        }
        current.push(call);
        currentTokens += tokens;
    }
    if (current.length > 0)
        batches.push(current);
    return batches;
}
export function decideCall(call, answer, options) {
    const base = { id: call.id, tool: call.tool, ...answer };
    if (call.pinned)
        return { ...base, action: 'keep', reason: 'pinned' };
    if (answer.keepResult >= options.keepThreshold) {
        return { ...base, action: 'keep', reason: 'kept' };
    }
    if (answer.keepCall >= options.keepThreshold) {
        return { ...base, action: 'drop_result', reason: 'result_dropped' };
    }
    return { ...base, action: 'drop_call', reason: 'call_dropped' };
}
async function askBatch(asker, state, batch) {
    const questions = Object.assign({}, ...batch.map(questionsFor));
    const { answers } = await asker.ask(state, questions);
    return new Map(batch.map((call) => [
        call.id,
        {
            keepCall: noulAnswer(answers, `call_${call.id}`),
            keepResult: noulAnswer(answers, `result_${call.id}`),
        },
    ]));
}
function truncatedResultText(text, isError, headChars) {
    if (text.length <= headChars + 120)
        return text;
    const head = headChars > 0 ? `${text.slice(0, headChars)}\n` : '';
    return `${head}[fast-jev-compaction truncated ${text.length - headChars} chars of this tool result${isError ? ' (error)' : ''}; re-run the tool if needed]`;
}
/**
 * Rebuilds the conversation from the decisions. A dropped call disappears
 * together with its result; a dropped result keeps a bounded head and note.
 * Messages that lose all their content are removed; untouched messages are
 * returned as the same objects they came in as.
 */
export function applyDecisions(messages, decisions, calls, headChars) {
    const byId = new Map(calls.map((call) => [call.id, call]));
    const actions = new Map();
    for (const decision of decisions) {
        const call = byId.get(decision.id);
        if (call && decision.action !== 'keep')
            actions.set(call.tool_use_id, decision.action);
    }
    const kept = [];
    for (const message of messages) {
        const touched = message.toolUses.some((tool) => actions.has(tool.tool_use_id)) ||
            (message.toolResults ?? []).some((result) => actions.has(result.tool_use_id));
        if (!touched) {
            kept.push(message);
            continue;
        }
        const toolUses = message.toolUses
            .filter((tool) => actions.get(tool.tool_use_id) !== 'drop_call')
            .map((tool) => {
            if (actions.get(tool.tool_use_id) !== 'drop_result')
                return tool;
            const text = truncatedResultText(tool.text ?? '', tool.isError ?? false, headChars);
            if ((tool.text ?? '') === text)
                return tool;
            const copy = {
                tool_use_id: tool.tool_use_id,
                tool: tool.tool,
                input: tool.input,
                text,
            };
            if (tool.isError)
                copy.isError = true;
            return copy;
        });
        const toolResults = (message.toolResults ?? [])
            .filter((result) => actions.get(result.tool_use_id) !== 'drop_call')
            .map((result) => {
            if (actions.get(result.tool_use_id) !== 'drop_result')
                return result;
            const text = truncatedResultText(result.text, result.isError ?? false, headChars);
            return text === result.text
                ? result
                : {
                    tool_use_id: result.tool_use_id,
                    text,
                    isError: result.isError,
                };
        });
        if (!message.toolUses.some((tool) => actions.get(tool.tool_use_id) === 'drop_call') &&
            !(message.toolResults ?? []).some((result) => actions.get(result.tool_use_id) === 'drop_call') &&
            toolUses.every((tool, index) => tool === message.toolUses[index]) &&
            toolResults.every((result, index) => result === message.toolResults?.[index])) {
            kept.push(message);
            continue;
        }
        if (message.text.trim().length === 0 && toolUses.length === 0 && toolResults.length === 0) {
            continue;
        }
        const rebuilt = { role: message.role, text: message.text, toolUses };
        if (toolResults.length > 0)
            rebuilt.toolResults = toolResults;
        kept.push(rebuilt);
    }
    return kept;
}
/** Characters of text, tool input and tool output a message holds. */
export function messageChars(message) {
    let total = message.text.length;
    for (const tool of message.toolUses) {
        try {
            total += JSON.stringify(tool.input).length;
        }
        catch {
            total += 20;
        }
    }
    for (const result of message.toolResults ?? [])
        total += result.text.length;
    return total;
}
export function reductionRatio(result) {
    const { charsBefore, charsAfter } = result.stats;
    return charsBefore === 0 ? 0 : (charsBefore - charsAfter) / charsBefore;
}
function count(decisions, reason) {
    return decisions.filter((decision) => decision.reason === reason).length;
}
/**
 * Compacts a transcript by asking Jev, for every tool call outside the pinned
 * first and newest messages, whether the call and whether its result must
 * stay. The whole history (results omitted, fitted into `maxStateTokens`) is
 * sent as state with every batch of questions. Throws when Jev fails or the
 * history cannot be fitted; the caller decides whether to fall back.
 */
export async function compact(messages, asker, options = {}) {
    const started = Date.now();
    const resolved = resolveOptions(options);
    const calls = collectToolCalls(messages, resolved.preserveRecentMessages);
    const candidates = calls.filter((call) => !call.pinned);
    const charsBefore = messages.reduce((sum, message) => sum + messageChars(message), 0);
    let fitted = { tokens: 0, stage: '' };
    let batches = [];
    const answers = new Map();
    if (candidates.length > 0) {
        const state = fitState(messages, calls, resolved);
        fitted = state;
        batches = batchCalls(candidates, state.tokens, resolved);
        const answered = await Promise.all(batches.map((batch) => askBatch(asker, state.state, batch)));
        for (const map of answered)
            for (const [id, answer] of map)
                answers.set(id, answer);
    }
    const decisions = calls.map((call) => decideCall(call, answers.get(call.id) ?? { keepCall: 1, keepResult: 1 }, resolved));
    const kept = applyDecisions(messages, decisions, calls, resolved.truncateHeadChars);
    return {
        messages: kept,
        decisions,
        stats: {
            messagesBefore: messages.length,
            messagesAfter: kept.length,
            charsBefore,
            charsAfter: kept.reduce((sum, message) => sum + messageChars(message), 0),
            calls: calls.length,
            kept: count(decisions, 'kept'),
            resultsDropped: count(decisions, 'result_dropped'),
            callsDropped: count(decisions, 'call_dropped'),
            pinned: count(decisions, 'pinned'),
            stateTokens: fitted.tokens,
            stateStage: fitted.stage,
            requests: batches.length,
            ms: Date.now() - started,
        },
    };
}
//# sourceMappingURL=compact.js.map