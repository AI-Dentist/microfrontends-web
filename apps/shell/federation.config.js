import { withNativeFederation, shareAll } from '@angular-architects/native-federation/config';
const shared = { singleton: true, strictVersion: true, requiredVersion: 'auto' };
export default withNativeFederation({
  name: 'dental-platform-shell',
  shared: shareAll(shared, { overrides: Object.fromEntries(
    ['@angular/common', '@angular/core', '@angular/platform-browser', '@angular/router'].map(pkg => [pkg, { ...shared, includeSecondaries: { keepAll: true } }])
  ) }),
  skip: ['rxjs/ajax', 'rxjs/fetch', 'rxjs/testing', 'rxjs/webSocket',
    '@angular/platform-browser/animations', '@angular/platform-browser/animations/async'],
  // The compile-time contract lives outside this standalone Angular workspace;
  // Sheriff dependency pruning cannot traverse it. Keep this small explicit set.
  features: { ignoreUnusedDeps: false, denseChunking: false, denseExternals: true, strictImports: false },
});
