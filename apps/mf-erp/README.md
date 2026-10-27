# ERP standalone and federated routes

Run the existing standalone application with `pnpm start`; `pnpm build` publishes
Native Federation `remoteEntry.json` exposing `./Routes`.

A compatible Angular shell must initialize Native Federation before bootstrap and
load `./Routes` on demand, not execute ERP's standalone bootstrap. The exposed module
exports `ERP_ROUTES` (also default) and `createErpRoutes({ graphqlUrl? })`. The factory
returns fresh host-relative routes with ERP providers at the route boundary:

```ts
const remote = await loadRemoteModule({ remoteEntry, exposedModule: './Routes' });
return remote.createErpRoutes({ graphqlUrl: validatedManifest.apiBaseUrl });
```

The optional URL flows through `provideErp(config)` to `provideErpGraphql(config)`.
Omitting it retains the standalone environment endpoint; no environment/global
mutation occurs. The host must validate operator configuration before passing it.
Existing per-request `kc_token` auth, permissions and financial behavior are unchanged.
ERP owns business navigation and styles; the shell owns global app navigation and
must load ERP's published global stylesheet (including its actual hashed filename
for production releases). Keep shared Angular and Native Federation versions
compatible with the shell. See `../shell/README.md` for runtime manifest and identity
limitations; production sign-in/logout infrastructure is not supplied here.
