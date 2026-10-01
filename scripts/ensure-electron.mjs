// npm may skip Electron's own install script (newer npm versions gate dependency lifecycle scripts),
// which leaves node_modules/electron without its binary. Run before any desktop command.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const dir = dirname(require.resolve('electron/package.json'));

if (!existsSync(join(dir, 'dist')) || !existsSync(join(dir, 'path.txt'))) {
  console.log('Downloading the Electron binary (one time, ~100 MB)...');
  const r = spawnSync(process.execPath, [join(dir, 'install.js')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
