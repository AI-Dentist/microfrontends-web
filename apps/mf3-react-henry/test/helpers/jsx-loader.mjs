import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

export async function load(url, context, nextLoad) {
  if (url.endsWith('.jsx')) {
    const filePath = fileURLToPath(url);
    const raw = await readFile(filePath, 'utf8');
    const sanitized = raw
      .replace(/import\.meta\.env\.DEV/g, 'true')
      .replace(/import\.meta\.env/g, '({ DEV: true })');
    const { code } = await transformWithOxc(sanitized, filePath, {
      jsx: {
        runtime: 'automatic',
      },
    });
    return {
      format: 'module',
      shortCircuit: true,
      source: code,
    };
  }
  if (url.endsWith('.css')) {
    return {
      format: 'module',
      shortCircuit: true,
      source: 'export default {};',
    };
  }
  return nextLoad(url, context);
}
