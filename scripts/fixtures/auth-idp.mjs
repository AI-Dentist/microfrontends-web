// Synthetic in-process OpenID Connect Identity Provider for platform smoke tests.
// Generates an ephemeral RSA key pair in memory (never written to disk).
import { webcrypto as crypto } from 'node:crypto';

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');

export async function createSyntheticIdp({
  issuer = 'https://idp.smoke.invalid/',
  clientId = 'dental-platform-shell',
  redirectUri = null,
  apiAudiences = ['dental-api'],
  roles = ['ADMIN', 'ODONTOLOGO', 'RECEPCIONISTA', 'CAJERO'],
  onViolation = null,
} = {}) {
  let configuredRedirectUri = redirectUri;
  const issuerUrl = new URL(issuer);
  const issuerOrigin = issuerUrl.origin;
  const basePath = issuer.replace(/\/$/u, '');

  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const exportedPublic = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicJwk = {
    ...exportedPublic,
    kid: 'smoke-rs256-key-1',
    alg: 'RS256',
    use: 'sig',
  };

  const metadata = {
    issuer,
    authorization_endpoint: `${basePath}/auth`,
    token_endpoint: `${basePath}/token`,
    jwks_uri: `${basePath}/certs`,
    end_session_endpoint: `${basePath}/logout`,
    code_challenge_methods_supported: ['S256'],
    response_types_supported: ['code'],
  };

  async function signToken(claims, kid = publicJwk.kid) {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const data = `${encode(header)}.${encode(claims)}`;
    const sig = Buffer.from(
      await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keyPair.privateKey, new TextEncoder().encode(data))
    ).toString('base64url');
    return `${data}.${sig}`;
  }

  let latestAccessToken = null;
  const issuedAccessTokens = new Set();
  const authCodes = new Map(); // code -> { codeChallenge, nonce, redirectUri, clientId, used: false }

  async function createTokenSet(nonce) {
    const nowSec = Math.floor(Date.now() / 1000);
    const sub = 'smoke-user-principal';
    const common = {
      iss: issuer,
      sub,
      iat: nowSec,
      exp: nowSec + 3600,
    };

    const accessToken = await signToken({
      ...common,
      aud: apiAudiences,
      azp: clientId,
      realm_access: { roles },
    });
    issuedAccessTokens.add(accessToken);
    latestAccessToken = accessToken;

    const idToken = await signToken({
      ...common,
      aud: clientId,
      azp: clientId,
      ...(nonce ? { nonce } : {}),
    });

    return {
      token_type: 'Bearer',
      access_token: accessToken,
      id_token: idToken,
      refresh_token: `synthetic-smoke-refresh-token-${crypto.randomUUID()}`,
    };
  }

  return {
    issuer,
    clientId,
    apiAudiences,
    metadata,
    jwk: publicJwk,
    getAccessToken: () => latestAccessToken,
    hasIssuedToken: tok => issuedAccessTokens.has(tok),
    setRedirectUri: uri => { configuredRedirectUri = uri; },
    createTokenSet,
    signToken,
    async handleRoute(route, request, url) {
      if (url.origin !== issuerOrigin) return false;

      const corsHeaders = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, OPTIONS',
      };

      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return true;
      }

      if (url.pathname === '/.well-known/openid-configuration') {
        await route.fulfill({
          status: 200,
          json: metadata,
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        });
        return true;
      }

      if (url.pathname === '/certs') {
        await route.fulfill({
          status: 200,
          json: { keys: [publicJwk] },
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        });
        return true;
      }

      if (url.pathname === '/auth') {
        const responseType = url.searchParams.get('response_type');
        const reqClientId = url.searchParams.get('client_id');
        const reqRedirectUri = url.searchParams.get('redirect_uri');
        const codeChallengeMethod = url.searchParams.get('code_challenge_method');
        const codeChallenge = url.searchParams.get('code_challenge');
        const nonce = url.searchParams.get('nonce');
        const state = url.searchParams.get('state');

        if (responseType !== 'code') {
          const v = `IdP /auth: invalid response_type "${responseType}", expected "code"`;
          onViolation?.(v);
          await route.fulfill({ status: 400, json: { error: 'unsupported_response_type', error_description: v } });
          return true;
        }

        if (reqClientId !== clientId) {
          const v = `IdP /auth: invalid client_id "${reqClientId}", expected "${clientId}"`;
          onViolation?.(v);
          await route.fulfill({ status: 400, json: { error: 'unauthorized_client', error_description: v } });
          return true;
        }

        if (configuredRedirectUri && reqRedirectUri !== configuredRedirectUri) {
          const v = `IdP /auth: invalid redirect_uri "${reqRedirectUri}", expected "${configuredRedirectUri}"`;
          onViolation?.(v);
          await route.fulfill({ status: 400, json: { error: 'invalid_request', error_description: v } });
          return true;
        }

        if (codeChallengeMethod !== 'S256') {
          const v = `IdP /auth: invalid code_challenge_method "${codeChallengeMethod}", expected "S256"`;
          onViolation?.(v);
          await route.fulfill({ status: 400, json: { error: 'invalid_request', error_description: v } });
          return true;
        }

        if (!codeChallenge) {
          const v = 'IdP /auth: missing code_challenge';
          onViolation?.(v);
          await route.fulfill({ status: 400, json: { error: 'invalid_request', error_description: v } });
          return true;
        }

        const code = crypto.randomUUID();
        authCodes.set(code, {
          codeChallenge,
          nonce,
          redirectUri: reqRedirectUri,
          clientId: reqClientId,
          used: false,
        });

        const redirect = new URL(reqRedirectUri);
        redirect.searchParams.set('code', code);
        if (state) redirect.searchParams.set('state', state);

        await route.fulfill({
          status: 302,
          headers: {
            location: redirect.href,
          },
        });
        return true;
      }

      if (url.pathname === '/token') {
        const postData = request.postData() || '';
        const params = new URLSearchParams(postData);
        const grantType = params.get('grant_type');
        const reqClientId = params.get('client_id');

        if (reqClientId !== clientId) {
          const v = `IdP /token: client_id "${reqClientId}" does not match "${clientId}"`;
          onViolation?.(v);
          await route.fulfill({
            status: 400,
            json: { error: 'invalid_client', error_description: v },
            headers: { ...corsHeaders, 'content-type': 'application/json' },
          });
          return true;
        }

        if (grantType === 'authorization_code') {
          const reqRedirectUri = params.get('redirect_uri');
          const code = params.get('code');
          const codeVerifier = params.get('code_verifier');

          if (!code || !authCodes.has(code)) {
            const v = `IdP /token: unknown or missing code "${code}"`;
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }

          const entry = authCodes.get(code);

          if (entry.used) {
            const v = `IdP /token: code "${code}" has already been used`;
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }

          // Single-use enforcement
          entry.used = true;

          if (entry.redirectUri && reqRedirectUri !== entry.redirectUri) {
            const v = `IdP /token: redirect_uri mismatch "${reqRedirectUri}" vs "${entry.redirectUri}"`;
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }

          if (!codeVerifier) {
            const v = 'IdP /token: missing code_verifier';
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }

          // Verify base64url(SHA-256(code_verifier)) === stored code_challenge
          const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
          const computedChallenge = Buffer.from(hashBuffer).toString('base64url');

          if (computedChallenge !== entry.codeChallenge) {
            const v = `IdP /token: code_verifier hash "${computedChallenge}" does not match challenge "${entry.codeChallenge}"`;
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }

          const tokens = await createTokenSet(entry.nonce);
          await route.fulfill({
            status: 200,
            json: tokens,
            headers: { ...corsHeaders, 'content-type': 'application/json' },
          });
          return true;
        }

        if (grantType === 'refresh_token') {
          const refreshToken = params.get('refresh_token');
          if (!refreshToken) {
            const v = 'IdP /token: missing refresh_token';
            onViolation?.(v);
            await route.fulfill({
              status: 400,
              json: { error: 'invalid_grant', error_description: v },
              headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
            return true;
          }
          const tokens = await createTokenSet();
          await route.fulfill({
            status: 200,
            json: tokens,
            headers: { ...corsHeaders, 'content-type': 'application/json' },
          });
          return true;
        }

        const v = `IdP /token: unsupported grant_type "${grantType}"`;
        onViolation?.(v);
        await route.fulfill({
          status: 400,
          json: { error: 'unsupported_grant_type', error_description: v },
          headers: { ...corsHeaders, 'content-type': 'application/json' },
        });
        return true;
      }

      if (url.pathname === '/logout') {
        const postLogout = url.searchParams.get('post_logout_redirect_uri') || '/';
        await route.fulfill({
          status: 302,
          headers: {
            location: postLogout,
          },
        });
        return true;
      }

      return false;
    },
  };
}
