import type { JevAsker, JevQuestions, JevResponse, JevState } from './types.js';
export interface JevClientOptions {
    /** Defaults to `process.env.TYPESAFE_API_KEY`. */
    apiKey?: string;
    /** Defaults to `jev-latest`. */
    model?: string;
    /** Defaults to the System One endpoint. */
    baseUrl?: string;
    /** Defaults to the global `fetch`. */
    fetch?: typeof fetch;
}
/** Asks Jev over HTTP with the global `fetch` (or an injected one). */
export declare class JevClient implements JevAsker {
    private readonly apiKey;
    private readonly model;
    private readonly baseUrl;
    private readonly fetcher;
    constructor(options?: JevClientOptions);
    ask(state: JevState, questions: JevQuestions): Promise<JevResponse>;
}
//# sourceMappingURL=client.d.ts.map