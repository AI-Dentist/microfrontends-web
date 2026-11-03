/** Compile-time types only: independently built remotes need no shared runtime. */
export type MaybeAsync<T> = T | Promise<T>;
export type RemoteId = 'erp' | 'operations' | 'clinical';

export interface RemoteContextV1 {
  readonly contractVersion: 1;
  readonly basePath: string;
  /** Full current pathname + search, including basePath; never a fragment. */
  readonly path: string;
  readonly apiBaseUrl: string;
  /** Extra public API bases this remote may call, keyed by service; absent when none are configured. */
  readonly serviceBaseUrls?: Readonly<Partial<Record<RemoteServiceV1, string>>>;
  /** Runtime capability: read on demand, never serialize or persist the token. */
  readonly getAccessToken: () => string | null;
  readonly onNavigate: (path: string) => void;
}

export interface RemoteInstanceV1 {
  update(nextContext: RemoteContextV1): MaybeAsync<void>;
  unmount(): MaybeAsync<void>;
}

export interface RemoteModuleV1 {
  readonly contractVersion: 1;
  mount(container: HTMLElement, context: RemoteContextV1): MaybeAsync<RemoteInstanceV1>;
}

export type RemoteServiceV1 = 'erp' | 'agenda' | 'clinical';
interface RemoteDeploymentBaseV1 {
  label: string;
  entry: string;
  apiBaseUrl: string;
  serviceBaseUrls?: Partial<Record<RemoteServiceV1, string>>;
}
export type RemoteDeploymentV1 = RemoteDeploymentBaseV1 & (
  | { id: 'erp'; basePath: '/erp'; kind: 'native-federation'; styles?: string }
  | { id: 'operations'; basePath: '/operations'; kind: 'module'; styles: string }
  | { id: 'clinical'; basePath: '/clinical'; kind: 'module'; styles: string }
);

export interface OidcConfigV1 {
  issuer: string;
  clientId: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  scopes: string[];
  apiAudiences: string[];
}

export interface PlatformConfigV1 {
  schemaVersion: 1;
  remotes: RemoteDeploymentV1[];
  /** Public client configuration; absence explicitly disables real authentication. */
  oidc?: OidcConfigV1;
}
