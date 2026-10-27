import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, it, expect } from 'vitest';

const root = process.cwd();
const angular = JSON.parse(readFileSync(resolve(root, 'angular.json'), 'utf8'));
const targets = angular.projects['dental-erp-mfe1'].architect;

describe('T2 Native Federation configuration contract', () => {
  it('explicitly selects the authoritative .js configuration using the installed builder API', async () => {
    const schema = JSON.parse(readFileSync(resolve(root, 'node_modules/@angular-architects/native-federation/src/builders/build/schema.json'), 'utf8'));
    expect(schema.properties.federationConfigPath.type).toBe('string');
    expect(targets.build.options.federationConfigPath).toBe('federation.config.js');
    expect(targets.serve.options.federationConfigPath).toBe('federation.config.js');
    expect(existsSync(resolve(root, 'federation.config.js'))).toBe(true);
    const { default: config } = await import(/* @vite-ignore */ pathToFileURL(resolve(root, 'federation.config.js')).href);
    expect(config.name).toBe('dental-erp-mfe1');
    expect(config.exposes).toEqual({ './Routes': { file: './src/app/erp.routes.ts' } });
    // withNativeFederation consumes skip entries while normalizing shared modules.
    expect(config.shared).not.toHaveProperty('@huggingface/transformers');
    expect(config.shared['@angular/core'].singleton).toBe(true);
    expect(readFileSync(resolve(root, 'federation.config.mjs'), 'utf8').trim()).toBe("export { default } from './federation.config.js';");
  });

  it('sets wrapper and original dev server to port 4201', () => {
    expect(targets.serve.options.port).toBe(4201);
    expect(targets['serve-original'].options.port).toBe(4201);
  });

  it('targets only the ms-erp GraphQL endpoint in both environments', () => {
    for (const file of ['environment.ts', 'environment.development.ts']) {
      expect(readFileSync(resolve(root, 'src/environments', file), 'utf8')).toContain("graphqlUrl: 'http://localhost:8080/graphql'");
    }
  });
});
