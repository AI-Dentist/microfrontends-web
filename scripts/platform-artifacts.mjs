import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { realpath, writeFile } from 'node:fs/promises';
import { validateConfig } from '../apps/shell/src/runtime-config.mjs';
import { validatePublicInventory, runtimeAdapter } from './erp-public-inventory.mjs';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const artifacts = {
  erp: 'apps/mf-erp/dist/dental-erp-mfe1/browser', shell: 'apps/shell/dist/shell/browser',
  operations: 'apps/mf2-vue-wendy/dist-remote', clinical: 'apps/mf3-react-henry/dist-remote',
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };
export const release = '/releases/smoke/';

// Every listener is ephemeral and owned by this process. Missing assets never return HTML.
export async function serve(directory, { prefix = '/', spa = false, override = () => null, corsOrigin = () => '' } = {}) {
  const base = resolve(root, directory);
  const server = createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (corsOrigin()) res.setHeader('Access-Control-Allow-Origin', corsOrigin());
    res.setHeader('Vary', 'Origin');
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://loopback').pathname);
      const custom = override(pathname);
      if (custom) { res.writeHead(custom.status ?? 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(custom.body)); return; }
      if (!pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
      const relative = pathname.slice(prefix.length);
      let file = resolve(base, relative || 'index.html');
      if (!file.startsWith(base + sep) && file !== base) { res.writeHead(403); res.end(); return; }
      try { if (!(await stat(file)).isFile()) throw Error('Not a file'); }
      catch { if (spa && !extname(relative)) file = resolve(base, 'index.html'); else { res.writeHead(404); res.end(); return; } }
      const data = await readFile(file);
      res.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch { res.writeHead(500); res.end('Artifact unavailable'); }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(ok => { server.close(ok); server.closeAllConnections(); }) };
}

// Generates only public build output; it never fetches APIs or remote assets.
export async function generatePublicRelease({ shellDir, erpDir, shellBaseUrl, erpBaseUrl, config, inventory }) {
  const require = createRequire(resolve(root, 'apps/shell/package.json'));
  const ts = require('typescript');
  const buildRequire = createRequire(await realpath(require.resolve('@angular/build/package.json')));
  const { parse } = await import(pathToFileURL(buildRequire.resolve('parse5')).href);
  const { transform } = buildRequire('lightningcss');
  const hash = value => createHash('sha256').update(value).digest('hex');
  function base(value) {
    if (typeof value !== 'string' || /[\\\\%?#\s]/u.test(value) || /(?:^|\/)\.\.?\//u.test(value)) throw Error('Invalid public base URL');
    const url = new URL(value);
    if (url.username || url.password || !url.pathname.endsWith('/') || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw Error('Invalid public base URL');
    return url;
  }
  const shellBase = base(shellBaseUrl), erpBase = base(erpBaseUrl);
  if (shellBase.href === erpBase.href) throw Error('Public bases must be distinct');
  const publicBootConfig = validateConfig(config, shellBase.href);
  // The runtime validator permits queries for online use; a persisted public
  // snapshot must not retain query credentials or opaque operator data.
  for (const remote of publicBootConfig.remotes) {
    for (const value of [remote.entry, remote.styles, remote.apiBaseUrl, ...Object.values(remote.serviceBaseUrls ?? {})].filter(Boolean)) {
      if (new URL(value).search || value.includes('?')) throw Error('Public configuration URLs must not have queries');
    }
  }
  const contexts = [
    { base: shellBase, dir: await realpath(resolve(shellDir)), imports: new Map() },
    { base: erpBase, dir: await realpath(resolve(erpDir)), imports: new Map() },
  ];
  const inventoryState = inventory === undefined ? null : await validatePublicInventory(inventory, [
    { root: 'shell', baseUrl: shellBase.href, directory: contexts[0].dir },
    { root: 'erp', baseUrl: erpBase.href, directory: contexts[1].dir },
  ]);
  const assets = new Map(), queue = [];
  function enqueue(reference, parent, context, bare = false) {
    if (typeof reference === 'string' && reference.startsWith('data:')) return;
    if (typeof reference !== 'string' || !reference || /[\\\\%?#\s]/u.test(reference)) throw Error(`Invalid public reference in ${parent}`);
    if (/(?:^|\/)\.\.?\.(?:\/|$)/u.test(reference) || /%2e|%2f|%5c/iu.test(reference)) throw Error(`Traversal in public reference from ${parent}`);
    if (bare && !reference.startsWith('.') && !reference.startsWith('/') && !/^[a-z]+:/iu.test(reference)) {
      const mapped = context.imports.get(reference);
      if (!mapped) throw Error(`Unresolved bare import ${reference} in ${parent}`);
      reference = mapped;
      parent = context.base.href;
    }
    const url = new URL(reference, parent);
    const owner = contexts.find(c => url.href.startsWith(c.base.href));
    if (!owner || url.username || url.password || url.search || url.hash || /(?:^|\/)(?:api|graphql|auth|token|private)(?:\/|$)/iu.test(url.pathname) || /(?:^|\/)platform-config\.json$/iu.test(url.pathname) || /\.map$/iu.test(url.pathname)) throw Error(`Forbidden public reference in ${parent}`);
    const relative = decodeURIComponent(url.pathname.slice(owner.base.pathname.length));
    if (!relative || relative.split('/').some(part => !part || part === '.' || part === '..')) throw Error(`Invalid asset path ${url.href}`);
    if (inventoryState && !inventoryState.declared.has(url.href)) throw Error('Undeclared inventory target');
    if (!assets.has(url.href)) { assets.set(url.href, null); queue.push({ url, owner, relative }); }
  }
  if (inventoryState) for (const url of inventoryState.declared.keys()) enqueue(url, url, contexts[0]);
  // Federation records are roots even when the host loads them dynamically.
  for (const context of contexts) {
    const entryUrl = new URL('remoteEntry.json', context.base).href;
    let entryBytes = inventoryState?.verifiedBytes.get(entryUrl);
    if (inventoryState && !entryBytes) throw Error('Undeclared inventory target');
    if (!inventoryState) {
      const entryPath = await realpath(resolve(context.dir, 'remoteEntry.json'));
      if (!entryPath.startsWith(context.dir + sep)) throw Error('Federation entry escapes build root');
      entryBytes = await readFile(entryPath);
    }
    const federation = JSON.parse(entryBytes.toString('utf8'));
    if (federation.$version !== 'v4' || !Array.isArray(federation.shared) || !Array.isArray(federation.exposes)) throw Error('Unsupported federation metadata');
    enqueue('remoteEntry.json', context.base.href, context);
    for (const shared of federation.shared) {
      if (!shared.entries || typeof shared.entries !== 'object' || Array.isArray(shared.entries)) throw Error('Unsupported federation shared entry');
      for (const [name, file] of Object.entries(shared.entries)) {
        if (context.imports.has(name)) throw Error(`Duplicate federation import ${name}`);
        context.imports.set(name, file);
        enqueue(file, context.base.href, context);
      }
    }
    for (const exposed of federation.exposes) enqueue(exposed.outFileName, context.base.href, context);
  }
  enqueue('index.html', shellBase.href, contexts[0]);
  const erp = publicBootConfig.remotes.find(remote => remote.id === 'erp');
  if (erp.entry !== new URL('remoteEntry.json', erpBase).href) throw Error('ERP entry does not match public base');
  if (erp.styles) enqueue(erp.styles, erpBase.href, contexts[1]);
  else {
    const styles = (await readdir(contexts[1].dir)).filter(name => /^styles(?:-[\w-]+)?\.css$/u.test(name));
    if (styles.length !== 1) throw Error('Expected exactly one ERP stylesheet');
    enqueue(styles[0], erpBase.href, contexts[1]);
  }
  while (queue.length) {
    const { url, owner, relative } = queue.shift();
    let bytes = inventoryState?.verifiedBytes.get(url.href);
    if (inventoryState && !bytes) throw Error('Undeclared inventory target');
    if (!inventoryState) {
      const file = await realpath(resolve(owner.dir, relative));
      if (!file.startsWith(owner.dir + sep) || !(await stat(file)).isFile()) throw Error(`Asset escapes build root: ${url.href}`);
      bytes = await readFile(file);
    }
    const text = bytes.toString('utf8');
    const extension = extname(relative).toLowerCase();
    const kind = extension.slice(1) || 'asset';
    assets.set(url.href, { url: url.href, sha256: hash(bytes), kind });
    const add = ref => enqueue(ref, url.href, owner);
    function javascript(code) {
      const source = ts.createSourceFile(relative, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      if (source.parseDiagnostics.length) throw Error(`Invalid JavaScript: ${url.href}`);
      function admittedComputed(call) {
        if (!inventoryState || extension === '.html') return false;
        const key = `${url.href}\n${hash(call.getText(source))}`;
        if (!inventoryState.sites.has(key)) {
          if ([...inventoryState.sites.keys()].some(site => site.startsWith(`${url.href}\n`))) throw Error('Inventory loader expression mismatch');
          return false;
        }
        // A publisher-declared native options-provider factory default. This
        // identifies its fallback site, not an active runtime guard.
        const arrow = call.parent;
        const property = arrow?.parent;
        const object = property?.parent;
        const arg = call.arguments[0];
        const factoryReturn = object?.parent;
        const factory = ts.isParenthesizedExpression(factoryReturn) ? factoryReturn.parent : factoryReturn;
        const fields = ts.isObjectLiteralExpression(object) ? new Set(object.properties.filter(ts.isPropertyAssignment).map(p => p.name.getText(source))) : new Set();
        const nativeFactory = ts.isArrowFunction(arrow) && arrow.body === call && arrow.parameters.length === 1 && ts.isIdentifier(arrow.parameters[0].name)
          && ts.isPropertyAssignment(property) && property.name.getText(source) === 'loadModuleFn'
          && fields.has('setImportMapFn') && fields.has('reloadBrowserFn')
          && (ts.isArrowFunction(factory) || ts.isReturnStatement(factory))
          && ts.isCallExpression(arg) && ts.isPropertyAccessExpression(arg.expression) && arg.expression.name.text === 'createScriptURL'
          && arg.arguments.length === 1 && ts.isIdentifier(arg.arguments[0]) && arg.arguments[0].text === arrow.parameters[0].name.text;
        if (nativeFactory) { inventoryState.sites.delete(key); return true; }
        // Supported synthetic contract: a fallback arrow assigned to a local,
        // selected through options.loadModuleFn ?? fallback in the same factory.
        // This is a candidate declaration, not proof of active runtime binding.
        const variable = arrow?.parent;
        if (!ts.isArrowFunction(arrow) || arrow.body !== call || !ts.isVariableDeclaration(variable) || !ts.isIdentifier(variable.name)) return false;
        let fn = variable.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        if (!fn || !fn.body) return false;
        const optionNames = new Set(fn.parameters.filter(p => ts.isIdentifier(p.name)).map(p => p.name.text));
        let selected = false;
        function scan(node) {
          if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken && ts.isPropertyAccessExpression(node.left) && ts.isIdentifier(node.left.expression) && optionNames.has(node.left.expression.text) && node.left.name.text === 'loadModuleFn' && ts.isIdentifier(node.right) && node.right.text === variable.name.text && ts.isPropertyAssignment(node.parent) && node.parent.name.getText(source) === 'loadModuleFn' && ts.isReturnStatement(node.parent.parent.parent)) selected = true;
          ts.forEachChild(node, scan);
        }
        scan(fn.body);
        if (!selected) return false;
        inventoryState.sites.delete(key);
        return true;
      }
      function moduleRef(node) {
        if (!node || !ts.isStringLiteralLike(node)) throw Error(`Unresolved computed import in ${url.href}`);
        enqueue(node.text, url.href, owner, true);
      }
      function visit(node) {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) moduleRef(node.moduleSpecifier);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]))) {
          if (!admittedComputed(node)) throw Error(`Unresolved computed import in ${url.href}`);
        } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) moduleRef(node.arguments[0]);
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.[1]?.getText(source) === 'import.meta.url') {
          if (!ts.isStringLiteralLike(node.arguments[0])) throw Error(`Unresolved computed asset URL in ${url.href}`);
          add(node.arguments[0].text);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    function css(code, declarations = false) {
      const result = transform({ filename: url.href, code: Buffer.from(declarations ? `x{${code}}` : code), analyzeDependencies: true });
      if (result.warnings.length) throw Error(`Invalid or unsupported CSS: ${url.href}`);
      for (const dependency of result.dependencies ?? []) {
        if (!['import', 'url'].includes(dependency.type)) throw Error(`Unsupported CSS reference: ${url.href}`);
        // Legacy font selectors stay client-side; no nonempty query is discarded.
        add(dependency.url.replace(/\.(eot|svg)\?#(?:iefix|primeicons)$/iu, '.$1'));
      }
    }
    if (extension === '.js' || extension === '.mjs') javascript(text);
    else if (extension === '.css') css(text);
    else if (extension === '.html') {
      const errors = [];
      const document = parse(text, { onParseError: error => errors.push(error.code) });
      if (errors.some(error => error !== 'missing-doctype')) throw Error(`Invalid HTML: ${url.href}`);
      function walk(node) {
        const attrs = Object.fromEntries((node.attrs ?? []).map(a => [a.name, a.value]));
        const tag = node.tagName;
        if (attrs.style) css(attrs.style, true);
        if (['srcset', 'imagesrcset', 'poster', 'data', 'action', 'formaction', 'background'].some(name => name in attrs)) throw Error(`Unsupported HTML reference in ${url.href}`);
        if (tag === 'base' && (!attrs.href || new URL(attrs.href, url).href !== owner.base.href || attrs.target)) throw Error(`Invalid HTML base in ${url.href}`);
        if (tag === 'script') {
          const type = (attrs.type ?? '').trim().toLowerCase();
          const code = (node.childNodes ?? []).map(child => child.value ?? '').join('');
          if (attrs.src) {
            if (type && type !== 'module' && !/^(?:text|application)\/(?:java|ecma)script$/u.test(type)) throw Error(`Unsupported script type in ${url.href}`);
            add(attrs.src);
          } else if (type === 'importmap') {
            const map = JSON.parse(code);
            if (!map || typeof map !== 'object' || Array.isArray(map) || Object.keys(map).some(key => key !== 'imports') || !map.imports || typeof map.imports !== 'object' || Array.isArray(map.imports)) throw Error(`Unsupported import map in ${url.href}`);
            for (const [name, target] of Object.entries(map.imports)) {
              if (name.endsWith('/') || typeof target !== 'string' || owner.imports.has(name)) throw Error(`Unsupported import map entry in ${url.href}`);
              enqueue(target, url.href, owner);
              owner.imports.set(name, new URL(target, url).href);
            }
          } else if (!type || type === 'module' || /^(?:text|application)\/(?:java|ecma)script$/u.test(type)) javascript(code);
          else if (type !== 'application/json' && type !== 'application/ld+json') throw Error(`Unsupported script type in ${url.href}`);
        } else if (tag === 'style') css((node.childNodes ?? []).map(child => child.value ?? '').join(''));
        else if (tag === 'link') {
          const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/u);
          if (attrs.href && rel.some(value => ['stylesheet', 'modulepreload', 'preload', 'manifest', 'icon', 'apple-touch-icon'].includes(value))) add(attrs.href);
          else if (attrs.href && !rel.every(value => ['preconnect', 'dns-prefetch'].includes(value))) throw Error(`Unsupported link in ${url.href}`);
        } else if (tag === 'img' && attrs.src) add(attrs.src);
        else if (attrs.src || (attrs.href && tag !== 'a' && tag !== 'base')) throw Error(`Unsupported HTML reference in ${url.href}`);
        for (const child of node.childNodes ?? []) walk(child);
        if (node.content) walk(node.content);
      }
      walk(document);
    } else if (extension === '.json') {
      if (relative !== 'remoteEntry.json') throw Error(`Unsupported JSON asset: ${url.href}`);
    } else if (extension === '.webmanifest') {
      const manifest = JSON.parse(text);
      for (const icon of [...(manifest.icons ?? []), ...(manifest.screenshots ?? [])]) add(icon.src);
    }
  }
  const sorted = [...assets.values()].sort((a, b) => a.url < b.url ? -1 : a.url > b.url ? 1 : 0);
  if (inventoryState?.sites.size) throw Error('Unconsumed inventory loader site');
  const runtimePolicy = inventoryState ? { adapter: runtimeAdapter, targets: sorted.filter(asset => /\.(?:m?js)$/u.test(new URL(asset.url).pathname)).map(asset => asset.url) } : undefined;
  const payload = { schemaVersion: 1, publicBootConfig, assets: sorted, ...(runtimePolicy ? { runtimePolicy } : {}) };
  return { schemaVersion: 1, version: hash(JSON.stringify(payload)), publicBootConfig, assets: sorted, ...(runtimePolicy ? { runtimePolicy } : {}) };
}

export async function startPlatform() {
  const servers = [];
  try {
    for (const [id, dir] of Object.entries(artifacts)) {
      await stat(resolve(root, dir, id === 'erp' ? 'remoteEntry.json' : id === 'shell' ? 'index.html' : 'remote.js'));
    }
    const styles = (await readdir(resolve(root, artifacts.erp))).filter(name => /^styles(?:-[\w-]+)?\.css$/.test(name));
    if (styles.length !== 1) throw Error(`Expected one ERP production stylesheet; found ${styles.length}`);
    let shell;
    const remotes = {};
    for (const id of ['erp', 'operations', 'clinical']) {
      remotes[id] = await serve(artifacts[id], { prefix: release, corsOrigin: () => shell?.origin });
      servers.push(remotes[id]);
    }
    const manifest = { schemaVersion: 1, remotes: [
      { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation', entry: `${remotes.erp.origin}${release}remoteEntry.json`, styles: `${remotes.erp.origin}${release}${styles[0]}`, apiBaseUrl: '/api/erp/graphql' },
      ...[['operations', '/api/agendamiento', 'Operations'], ['clinical', '/api/expediente', 'Clinical']].map(([id, apiBaseUrl, label]) => ({ id, label, basePath: `/${id}`, kind: 'module', entry: `${remotes[id].origin}${release}remote.js`, styles: `${remotes[id].origin}${release}remote.css`, apiBaseUrl })),
    ] };
    shell = await serve(artifacts.shell, { spa: true, override: path => path === '/platform-config.json' ? { body: manifest } : path.startsWith('/api/') ? { status: 503, body: { error: 'Configure a real gateway; artifact server never forwards API traffic' } } : null });
    servers.push(shell);
    return { shell, remotes, manifest, close: () => Promise.all(servers.map(server => server.close())) };
  } catch (error) { await Promise.all(servers.map(server => server.close())); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.length > 2) {
  const usage = 'Usage: node scripts/platform-artifacts.mjs --shell-dir DIR --erp-dir DIR --shell-base-url URL --erp-base-url URL --config FILE --output FILE [--inventory FILE]';
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') console.log(usage);
    else {
      const names = ['--shell-dir', '--erp-dir', '--shell-base-url', '--erp-base-url', '--config', '--output'];
      if (args.length !== names.length * 2 && args.length !== (names.length + 1) * 2) throw Error('Expected explicit public release inputs');
      const values = {};
      for (let i = 0; i < args.length; i += 2) {
        if (![...names, '--inventory'].includes(args[i]) || values[args[i]] || !args[i + 1] || args[i + 1].startsWith('--')) throw Error('Invalid public release arguments');
        values[args[i]] = args[i + 1];
      }
      if (names.some(name => !values[name])) throw Error('Expected explicit public release inputs');
      const config = JSON.parse(await readFile(values['--config'], 'utf8'));
      const inventory = values['--inventory'] ? JSON.parse(await readFile(values['--inventory'], 'utf8')) : undefined;
      const result = await generatePublicRelease({ shellDir: values['--shell-dir'], erpDir: values['--erp-dir'], shellBaseUrl: values['--shell-base-url'], erpBaseUrl: values['--erp-base-url'], config, inventory });
      await writeFile(values['--output'], `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
    }
  } catch (error) {
    console.error(`Public release generation failed: ${error.message}`);
    process.exitCode = 1;
  }
}
