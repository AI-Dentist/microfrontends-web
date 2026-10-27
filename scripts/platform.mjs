import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startPlatform } from './platform-artifacts.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const apps = { erp: 'mf-erp', shell: 'shell', operations: 'mf2-vue-wendy', clinical: 'mf3-react-henry' };
const help = 'Usage: node scripts/platform.mjs <install|build|test|dev|help> [erp|shell|operations|clinical]\n';
const [command = 'help', app, ...extra] = process.argv.slice(2);
if (extra.length || (app && !Object.hasOwn(apps, app)) || !['install', 'build', 'test', 'dev', 'help', '--help'].includes(command) || (app && ['dev', 'help', '--help'].includes(command))) {
  process.stderr.write(`Invalid command or application selection.\n${help}`);
  process.exitCode = 2;
} else if (['help', '--help'].includes(command)) {
  process.stdout.write(help);
} else if (command === 'dev') {
  const platform = await startPlatform();
  console.log(`Built-artifact composition: ${platform.shell.origin} (Ctrl+C to stop)`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await platform.close(); });
} else {
  let child;
  const stop = signal => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    if (!child?.pid) return;
    if (process.platform === 'win32') spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop(signal));
  for (const id of app ? [app] : Object.keys(apps)) {
    const manager = ['erp', 'shell'].includes(id) ? 'pnpm' : 'npm';
    const commands = command === 'install' ? [[manager, manager === 'pnpm' ? 'install' : 'ci']]
      : command === 'build' ? [[manager, 'run', 'build'], ...(['operations', 'clinical'].includes(id) ? [[manager, 'run', 'build:remote']] : [])]
      : id === 'erp' ? [['pnpm', 'test', '--watch=false']]
      : [[process.execPath, '--test', 'test/*.test.mjs']];
    for (const [bin, ...args] of commands) {
      if (process.exitCode) break;
      console.log(`[${id}] ${bin} ${args.join(' ')}`);
      const code = await new Promise(resolve => {
        child = spawn(bin, args, { cwd: `${root}/apps/${apps[id]}`, stdio: 'inherit', shell: process.platform === 'win32', detached: process.platform !== 'win32' });
        child.once('error', error => { console.error(error.message); resolve(1); });
        child.once('exit', code => resolve(code ?? 1));
      });
      child = undefined;
      if (code) process.exitCode = code;
    }
    if (process.exitCode) break;
  }
}
