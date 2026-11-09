# Deploy the Operations frontend on AWS

The coordinator owns host bootstrap, TLS routing, secrets and rollout. This repository supplies the static image and deployment workflow; it does not provision the host or expose a host port.

## Coordinator quick path

1. Create the external Docker network `dental-net` on AWS and connect the existing TLS edge to it. Route HTTPS `https://100-60-248-245.sslip.io/remotes/operations/` to `mf2-web:80`, preserving the path.
2. In `/home/ubuntu/deploy/microfrontends-web`, create the actual root `.env` using `deploy/aws/env.template`. Configure the GitHub Actions secret `AWS_SSH_KEY` with the dedicated deploy user's key. Keep both out of version control.
3. After approving rollout, dispatch the AWS workflow or push to `main`/`master`. It fast-forwards the host checkout and rebuilds the Compose service. The host must already have Docker Compose, repository access and permission to run Docker.
4. Check `/health` through the internal service and verify `remote.js`, `remote.css`, and a missing asset at the public prefix (the latter must return 404). Confirm the Azure shell can load the remote.

The image serves the complete Vue `dist-remote` with its existing relative base. Static responses, including errors, permit the shell origin `https://20-83-242-208.sslip.io` without credentials. API routing is unchanged. The external edge owns HTTPS and certificates; Compose publishes no host ports.

The workflow obtains the SSH host key with `ssh-keyscan` and uses strict checking against that ephemeral result. This prevents accepting a different key during the connection, but does **not** independently authenticate the initial scan; the coordinator must account for that trust-on-first-scan risk in the deployment environment.
