import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('AWS image builds and serves the complete Vue remote at its public prefix', () => {
  const dockerfile = read('deploy/aws/Dockerfile');
  assert.match(dockerfile, /FROM node:24-bookworm-slim AS builder/i);
  assert.match(dockerfile, /WORKDIR \/app\/apps\/mf2-vue-wendy/);
  assert.match(dockerfile, /RUN npm ci/);
  assert.match(dockerfile, /RUN npm run build:remote/);
  assert.match(dockerfile, /FROM nginx:1\.28-alpine/);
  assert.match(dockerfile, /COPY --from=builder \/app\/apps\/mf2-vue-wendy\/dist-remote\/ \/usr\/share\/nginx\/html\/remotes\/operations\//);
  assert.match(dockerfile, /HEALTHCHECK/);
  const nginx = read('deploy/aws/nginx.conf');
  assert.match(nginx, /include\s+\/etc\/nginx\/mime\.types/);
  assert.match(nginx, /application\/wasm\s+wasm/);
  assert.match(nginx, /location \/remotes\/operations\/\s*\{/);
  assert.match(nginx, /try_files\s+\$uri\s+=404/);
  assert.match(nginx, /add_header\s+Access-Control-Allow-Origin\s+"https:\/\/20-83-242-208\.sslip\.io"\s+always/);
  assert.doesNotMatch(nginx, /Access-Control-Allow-Credentials|Access-Control-Allow-Origin\s+["']?\*/);
  assert.match(nginx, /location\s+=\s+\/health/);
});

test('AWS compose declares the isolated frontend and external network', () => {
  const compose = read('deploy/aws/compose.yml');
  assert.match(compose, /name:\s*dental-operations-web/);
  assert.match(compose, /mf2-web:/);
  assert.match(compose, /context:\s*\.\.\/\.\./);
  assert.match(compose, /dockerfile:\s*deploy\/aws\/Dockerfile/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /external:\s*true/);
  assert.match(compose, /dental-net/);
  assert.doesNotMatch(compose, /\bports\s*:/);
  assert.equal(read('deploy/aws/env.template').trim(), 'COMPOSE_FILE=deploy/aws/compose.yml');
});

test('AWS workflow uses a dedicated SSH key and strict host verification', () => {
  const workflow = read('.github/workflows/deploy-aws.yml');
  for (const pattern of [/workflow_dispatch:/, /branches:\s*\[main, master\]/, /contents:\s*read/, /AWS_SSH_KEY:\s*\$\{\{ secrets\.AWS_SSH_KEY \}\}/, /umask 077/, /chmod 600/, /ssh-keyscan/, /StrictHostKeyChecking=yes/, /BatchMode=yes/, /trap .* EXIT/, /cd \/home\/ubuntu\/deploy\/microfrontends-web && git pull --ff-only && docker compose up -d --build --remove-orphans/]) assert.match(workflow, pattern);
  assert.doesNotMatch(workflow, /StrictHostKeyChecking=no|admin[_-]?key/i);
});
