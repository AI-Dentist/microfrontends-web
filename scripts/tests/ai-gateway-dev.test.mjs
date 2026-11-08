import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vue from '../../apps/mf2-vue-wendy/vite.config.js';
test('standalone development proxies API requests to the Gateway, not directly to services', async () => {
  assert.equal(vue.server?.proxy?.['/api']?.target, 'http://127.0.0.1:80');
  const angular = JSON.parse(await readFile(new URL('../../apps/mf-erp/angular.json', import.meta.url), 'utf8'));
  const options = angular.projects['dental-erp-mfe1'].architect['serve-original'].options;
  assert.equal(options.proxyConfig, 'proxy.conf.json');
  const proxy = JSON.parse(await readFile(new URL('../../apps/mf-erp/proxy.conf.json', import.meta.url), 'utf8'));
  assert.equal(proxy['/api/**'].target, 'http://127.0.0.1:80');
});
