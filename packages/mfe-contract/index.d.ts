/** Compile-time types only: independently built remotes need no shared runtime. */
export type MaybeAsync<T> = T | Promise<T>;
export type RemoteId = 'erp' | 'operations' | 'clinical';

export interface RemoteContextV1 {
  readonly contractVersion: 1;
  readonly basePath: string;
  /** Full current pathname + search, including basePath; never a fragment. */
  readonly path: string;
  readonly apiBaseUrl: string;
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

interface RemoteDeploymentBaseV1 {
  label: string;
  entry: string;
  apiBaseUrl: string;
}
export type RemoteDeploymentV1 = RemoteDeploymentBaseV1 & (
  | { id: 'erp'; basePath: '/erp'; kind: 'native-federation'; styles?: string }
  | { id: 'operations'; basePath: '/operations'; kind: 'module'; styles: string }
  | { id: 'clinical'; basePath: '/clinical'; kind: 'module'; styles: string }
);

export interface PlatformConfigV1 {
  schemaVersion: 1;
  remotes: RemoteDeploymentV1[];
}
