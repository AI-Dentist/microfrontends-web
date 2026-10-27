import type { PlatformConfigV1 } from '../../../packages/mfe-contract/index.js';

/** Throws on malformed input. Defaults to browser location, or https://localhost/ in Node. */
export function validateConfig(input: unknown, pageUrl?: string | URL): PlatformConfigV1;
