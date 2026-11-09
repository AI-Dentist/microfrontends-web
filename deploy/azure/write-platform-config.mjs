import { readdir, access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateConfig } from '../../apps/shell/src/runtime-config.mjs';

const azure = 'https://20-83-242-208.sslip.io';
const aws = 'https://100-60-248-245.sslip.io';

/** Build-time, operator-owned config. No inferred issuer, credentials or dev auth. */
export async function writeProductionConfig(erpDirectory, shellDirectory) {
  const styles = (await readdir(erpDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && /^styles-[A-Za-z0-9_-]+\.css$/.test(entry.name))
    .map(entry => entry.name);
  if (styles.length !== 1) throw Error('Expected exactly one hashed ERP stylesheet');
  await access(resolve(erpDirectory, 'remoteEntry.json'));
  const config = {
    schemaVersion: 1,
    remotes: [
      { id: 'erp', label: 'ERP', basePath: '/erp', kind: 'native-federation',
        entry: azure + '/remotes/erp/remoteEntry.json',
        styles: azure + '/remotes/erp/' + styles[0], apiBaseUrl: '/api/erp/graphql' },
      { id: 'operations', label: 'Operations', basePath: '/operations', kind: 'module',
        entry: aws + '/remotes/operations/remote.js', styles: aws + '/remotes/operations/remote.css',
        apiBaseUrl: '/api/agendamiento', serviceBaseUrls: { erp: '/api/erp/graphql' } },
      { id: 'clinical', label: 'Clinical', basePath: '/clinical', kind: 'module',
        entry: azure + '/remotes/clinical/remote.js', styles: azure + '/remotes/clinical/remote.css',
        apiBaseUrl: '/api/expediente',
        serviceBaseUrls: { agenda: '/api/agendamiento', erp: '/api/erp/graphql' } },
    ],
  };
  validateConfig(config, azure + '/');
  await writeFile(resolve(shellDirectory, 'platform-config.json'), JSON.stringify(config, null, 2) + '\n');
  return styles[0];
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 4) throw Error('Usage: node deploy/azure/write-platform-config.mjs <erp-output> <shell-output>');
    const style = await writeProductionConfig(process.argv[2], process.argv[3]);
    console.log('Wrote production platform-config.json using ' + style);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
