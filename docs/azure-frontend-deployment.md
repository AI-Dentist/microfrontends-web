# Deploy Shell and ERP on Azure

The Azure edge terminates TLS at `https://20-83-242-208.sslip.io`. This repository supplies `shell-web:80` and `mf-erp-web:80` on external `dental-net`; neither service publishes a host port. The coordinator owns the network, Caddy, Gateway, SSH keys, host bootstrap and rollout.

## Coordinator setup

1. Place this public repository at `/home/azureuser/deploy/microfrontends-web` and create/connect `dental-net` to the edge.
2. Copy the approved non-secret `deploy/azure/env.template` to root `.env` on that server; it only selects `COMPOSE_FILE=deploy/azure/compose.yml`. Root `.env` is ignored by Git and Docker. Template naming follows deploy-contract decision L7, not `.env.example`.
3. Configure GitHub Actions secret `AZURE_SSH_KEY` using the dedicated CI key, never an administrator private key. The public-repo workflow runs `git pull --ff-only && docker compose up -d --build --remove-orphans` from the deployment root on push to main/master or workflow_dispatch.
4. Preserve `/remotes/erp/*` to `mf-erp-web:80`; route other frontend requests to `shell-web:80`. `/api/*` and `/mcp` belong to the Gateway, not the static containers. Only the edge publishes 80/443.

## Build-time production manifest

`deploy/azure/Dockerfile` has final targets `shell-web` and `mf-erp-web`. Node 24 builds both Angular apps with pinned pnpm 10.32.1 and frozen app lockfiles. The shell image copies the ERP build output into its builder and runs:

```sh
node deploy/azure/write-platform-config.mjs <erp-browser-output> <shell-browser-output>
```

The generator requires exactly one actual `styles-*.css` plus `remoteEntry.json`, validates the manifest with the existing schema-v1 HTTPS validator, then writes `/platform-config.json` into the shell output. Missing/ambiguous styles fail the build without replacing the previous manifest. It never guesses a hash or changes schema/security validation.

ERP entry/CSS use the Azure `/remotes/erp/` prefix. Operations ESM/CSS use `https://100-60-248-245.sslip.io/remotes/operations/remote.js` and `remote.css`. API bases are same-origin Gateway paths. Required Clinical points to Azure `/remotes/clinical/remote.js` and `remote.css`, explicitly returning 503 until GCP is deployed; module failure stays local to its session. Static missing assets return real 404, not SPA HTML; shell deep links use SPA fallback. Manifest delivery is no-store; stable remote paths use no-store rather than falsely claiming immutable releases.

No OIDC issuer is invented: until the coordinator supplies the approved GCP OIDC configuration, Home and static artifacts work, but sign-in is visibly unconfigured and protected application navigation remains fail-closed. No dev token bypass is added. Full live auth, CSP, model downloads and provider integrations remain operator validation, not implied by image/fixture checks.

## Verification and rollout

```sh
docker compose --env-file deploy/azure/env.template -f deploy/azure/compose.yml config
docker build -f deploy/azure/Dockerfile --target shell-web -t dental-shell-web .
docker build -f deploy/azure/Dockerfile --target mf-erp-web -t dental-mf-erp-web .
```

Verify internal `/health`, the public manifest, entry, actual hashed CSS, JS/WASM assets and real missing-file errors. Images copy complete outputs (chunks, workers, fonts and WASM), not only entrypoints. The root Docker context excludes local dependencies/caches, credentials and secret paths.

The workflow scans the SSH host key then uses strict checking against that scan; the initial scan is trust-on-first-scan, not independent host identity proof. Coordinate host identity and CI permissions separately. Pushes trigger deployment, but this repository work does not itself bootstrap or inspect a live server. Retain prior images/artifacts for rollback; fixed-path redeployments can require a fresh browser session and coordinated shell/ERP rollout.
