import { createServer } from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
