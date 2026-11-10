import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('clinical image builds and serves the complete remote on port 8080', () => {
  const docker = read('./Dockerfile');
  for (const value of ['FROM node:24-bookworm-slim AS builder', 'apps/mf3-react-henry/package*.json', 'npm ci', 'npm run build:remote', 'FROM nginx:1.28-alpine', 'deploy/gcp/nginx.conf /etc/nginx/conf.d/default.conf', '/app/apps/mf3-react-henry/dist-remote/ /usr/share/nginx/html/remotes/clinical/', 'EXPOSE 8080', 'HEALTHCHECK', 'http://127.0.0.1:8080/health']) assert.ok(docker.includes(value), value);
});

test('nginx limits CORS and serves only existing clinical assets with default caching', () => {
  const nginx = read('./nginx.conf');
  assert.match(nginx, /listen 8080;/);
  assert.equal((nginx.match(/add_header/g) || []).length, 1);
  assert.match(nginx, /add_header Access-Control-Allow-Origin "https:\/\/20-83-242-208\.sslip\.io" always;/);
  assert.doesNotMatch(nginx, /\*/);
  assert.match(nginx, /location = \/health\s*\{[^}]*return 200/s);
  assert.match(nginx, /location \/remotes\/clinical\/\s*\{\s*try_files \$uri =404;/);
  assert.match(nginx, /location \/\s*\{\s*return 404;/);
  assert.doesNotMatch(nginx, /index\.html|Cache-Control|expires|etag\s+off/i);
});

test('GCP deploy workflow uses a dedicated SSH key and exact rollout command', () => {
  const workflow = read('../../.github/workflows/deploy-gcp.yml');
  for (const value of ['branches: [main]', 'contents: read', 'secrets.GCP_SSH_KEY', 'umask 077', 'mktemp -d', 'trap ', 'chmod 600', 'UserKnownHostsFile=', 'StrictHostKeyChecking=accept-new', 'BatchMode=yes', 'gcpuser@35.237.1.132', "'cd ~/deploy/microfrontends-web && git pull --ff-only && docker build -f deploy/gcp/Dockerfile -t docker.io/dental/mf3-react-henry:prod . && docker save docker.io/dental/mf3-react-henry:prod | sudo k3s ctr images import - && sudo k3s kubectl -n dental-erp-prod rollout restart deployment/mf3-react-henry'"]) assert.ok(workflow.includes(value), value);
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=no|workflow_dispatch|rsync|ssh-keyscan/);
});
