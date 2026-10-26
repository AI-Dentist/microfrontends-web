import { withNativeFederation, shareAll } from '@angular-architects/native-federation/config';

const sharedConfig = { singleton: true, strictVersion: true, requiredVersion: 'auto' };

// Publish every Angular secondary entry point so the shell and other remotes reuse ours.
const angularWithSecondaries = Object.fromEntries(
  ['@angular/common', '@angular/core', '@angular/forms', '@angular/platform-browser', '@angular/router'].map((pkg) => [
    pkg,
    { ...sharedConfig, includeSecondaries: { keepAll: true } },
  ]),
);

export default withNativeFederation({
  name: 'dental-erp-mfe1',

  exposes: {
    './Routes': './src/app/erp.routes.ts',
  },

  shared: {
    ...shareAll(sharedConfig, { overrides: angularWithSecondaries }),
  },

  skip: [
    'rxjs/ajax',
    'rxjs/fetch',
    'rxjs/testing',
    'rxjs/webSocket',
    // Runs isolated inside the local AI Web Worker; never shared with the shell.
    '@huggingface/transformers',
  ],

  features: {
    denseChunking: false,
    denseExternals: true,
    strictImports: false,
  },
});
