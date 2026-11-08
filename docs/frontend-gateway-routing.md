# Frontend Gateway routing

Hosted remotes use the Shell contract's `apiBaseUrl` / `getAccessToken()` capabilities. Defaults are same-origin Gateway public routes, not private backend ports:

| Surface | Gateway prefix |
| --- | --- |
| Angular ERP GraphQL | `/api/erp/graphql` |
| ERP report exports | `/api/v1/reports/export` |
| React clinical REST | `/api/expediente` |
| Vue agenda/stock/ML | `/api/agendamiento` |

Standalone development forwards `/api` to the Gateway at `http://127.0.0.1:80`: Angular uses `proxy.conf.json`, Vue/React use Vite's API proxy. Alternatively serve remotes through the Shell. `VITE_MS3_API_BASE_URL` remains an optional explicit Gateway base override. Existing client factories accept deployment-specific Gateway URLs and read current host credentials on each request. No hardcoded private service port is used by default API calls. Explicit isolated test backend overrides are not default runtime configuration.

Regression checks: `node --test apps/mf2-vue-wendy/test/*.test.mjs`, `node --test apps/mf3-react-henry/test/*.test.js apps/mf3-react-henry/test/*.test.mjs`, `cd apps/mf-erp && pnpm test --watch=false`, and `node scripts/platform.mjs build` (also builds remote Vue/React artifacts).
