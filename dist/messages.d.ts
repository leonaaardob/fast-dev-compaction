import { type JevClientOptions } from './client.js';
import type { CompactOptions, CompactResult, Message } from './types.js';
export type CompactMessagesOptions = CompactOptions & JevClientOptions;
/** `compact` with a `JevClient` built from the options (key from `TYPESAFE_API_KEY` by default). */
export declare function compactMessages(messages: readonly Message[], options?: CompactMessagesOptions): Promise<CompactResult>;
//# sourceMappingURL=messages.d.ts.map