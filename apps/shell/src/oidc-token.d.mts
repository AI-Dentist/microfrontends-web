import type { OidcConfigV1 } from '../../../packages/mfe-contract/index.js';
export interface OidcMetadata {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly jwks_uri: string;
  readonly end_session_endpoint: string;
}
export interface VerifiedTokens {
  readonly subject: string;
  readonly roles: readonly string[];
  readonly expiresAt: number;
  readonly idClaims: Readonly<Record<string, unknown>>;
  readonly accessToken: string;
  readonly idToken?: string;
  readonly refreshToken?: string;
}
export function trustedMetadata(oidc: OidcConfigV1, metadata: unknown): OidcMetadata;
/** jwks must come exclusively from trustedMetadata(oidc, discovery).jwks_uri. */
export function verifyTokenSet(tokens: unknown, options: {
  oidc: OidcConfigV1;
  jwks: unknown;
  crypto: Crypto;
  now: number;
  nonce: string;
  refresh?: boolean;
  previous?: VerifiedTokens;
}): Promise<VerifiedTokens>;
