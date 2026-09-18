export const SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';
export const DEFAULT_MODEL = 'jev-latest';
/** The HTTP request for one Jev call, for any fetch-like transport. */
export function buildJevRequest(params, state, questions) {
    return {
        url: params.baseUrl ?? SYSTEM_ONE_URL,
        method: 'POST',
        headers: {
            authorization: `Bearer ${params.apiKey}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            model: params.model ?? DEFAULT_MODEL,
            state,
            questions,
        }),
    };
}
/** Validates a Jev response body; throws on anything but an `answers` object. */
export function parseJevResponse(status, ok, text) {
    if (!ok) {
        throw new Error(`Jev request failed (${status}): ${text.slice(0, 200)}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(text);
    }
    catch {
        throw new Error('Jev returned malformed JSON');
    }
    if (parsed === null ||
        typeof parsed !== 'object' ||
        !('answers' in parsed) ||
        parsed.answers === null ||
        typeof parsed.answers !== 'object') {
        throw new Error('Jev response is missing answers');
    }
    return parsed;
}
/** The `noul` probability of one answer; throws when it is not there. */
export function noulAnswer(answers, name) {
    const answer = answers[name];
    if (!answer ||
        !('noul' in answer) ||
        typeof answer.noul !== 'number' ||
        !Number.isFinite(answer.noul)) {
        throw new Error(`Invalid Jev answer for ${name}`);
    }
    return answer.noul;
}
//# sourceMappingURL=request.js.map