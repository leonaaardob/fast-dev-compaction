import type { JevAnswer, JevQuestions, JevResponse, JevState } from './types.js';
export declare const SYSTEM_ONE_URL = "https://api.typesafe.ai/v1/systemone";
export declare const DEFAULT_MODEL = "jev-latest";
export interface JevRequest {
    url: string;
    method: 'POST';
    headers: Record<string, string>;
    body: string;
}
/** The HTTP request for one Jev call, for any fetch-like transport. */
export declare function buildJevRequest(params: {
    apiKey: string;
    model?: string;
    baseUrl?: string;
}, state: JevState, questions: JevQuestions): JevRequest;
/** Validates a Jev response body; throws on anything but an `answers` object. */
export declare function parseJevResponse(status: number, ok: boolean, text: string): JevResponse;
/** The `noul` probability of one answer; throws when it is not there. */
export declare function noulAnswer(answers: Record<string, JevAnswer>, name: string): number;
//# sourceMappingURL=request.d.ts.map