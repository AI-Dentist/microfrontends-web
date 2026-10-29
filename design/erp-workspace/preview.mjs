// Standalone, read-only transport for the single fictional prototype artifact.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const artifact = new URL('01-unified-workspace.html', import.meta.url);
const routes = new Set(['/', '/01-unified-workspace.html']);
const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export async function startPreview() {
  // Fail before announcing readiness if the one owned artifact is unavailable.
  await readFile(artifact);
  const server = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Content-Security-Policy', policy);
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    // Match the raw target exactly: no decoding, normalization or filesystem mapping.
    if (!routes.has(request.url)) {
      response.writeHead(404);
      response.end();
      return;
    }
    try {
      const html = await readFile(artifact);
      response.writeHead(200, { 'Content-Length': html.length });
      response.end(request.method === 'HEAD' ? undefined : html);
    } catch {
      response.writeHead(500);
      response.end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      accept();
    });
  });
  let closing;
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close() {
      closing ??= new Promise((accept, reject) => {
        server.close(error => error ? reject(error) : accept());
        server.closeAllConnections();
      });
      return closing;
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const preview = await startPreview();
    console.log(`Interactive ERP preview ready: ${preview.url}`);
    const stop = () => preview.close().catch(() => { process.exitCode = 1; });
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  } catch {
    console.error('Unable to start the ERP preview.');
    process.exitCode = 1;
  }
}
