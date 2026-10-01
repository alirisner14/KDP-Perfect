// Starts the Vite dev server and opens the Electron shell pointed at it (hot reload in the desktop window).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const electronPath = require('electron'); // resolves to the electron executable

const server = await createServer({ server: { port: 5173, strictPort: true } });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

const child = spawn(electronPath, ['.'], { stdio: 'inherit', env: { ...process.env, KDP_DEV_SERVER_URL: url } });
const shutdown = async (code) => {
  await server.close();
  process.exit(code ?? 0);
};
child.on('exit', shutdown);
process.on('SIGINT', () => child.kill());
