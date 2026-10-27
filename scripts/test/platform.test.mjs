import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const help = 'Usage: node scripts/platform.mjs <install|build|test|dev|help> [erp|shell|operations|clinical]\n';
const run = (...args) => spawnSync(process.execPath, ['scripts/platform.mjs', ...args], { encoding: 'utf8' });
test('help and default invocation do not start apps', () => {
  for (const args of [[], ['help'], ['--help']]) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, help);
    assert.equal(result.stderr, '');
  }
});
test('unknown commands and app selections fail before side effects', () => {
  for (const args of [['wat'], ['build', 'unknown'], ['test', 'shell', 'extra'], ['dev', 'erp']]) {
    const result = run(...args);
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `Invalid command or application selection.\n${help}`);
  }
});
