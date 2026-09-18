import { JevClient } from './client.js';
import { compact } from './compact.js';
/** `compact` with a `JevClient` built from the options (key from `TYPESAFE_API_KEY` by default). */
export function compactMessages(messages, options = {}) {
    return compact(messages, new JevClient(options), options);
}
//# sourceMappingURL=messages.js.map