// Normaliza flags de ferramentas de preview para o CLI do Wrangler.
// O servidor permanece no loopback, inclusive em ferramentas que passam --host.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const forwarded = [];
const input = process.argv.slice(2);
let ip = '127.0.0.1';
for (let i = 0; i < input.length; i++) {
  const arg = input[i];
  if (arg === '--strictPort' || arg.startsWith('--strictPort=')) continue;
  if (arg === '--host' || arg === '--ip') {
    if (input[i + 1] && !input[i + 1].startsWith('--')) i++;
  } else if (arg.startsWith('--host=') || arg.startsWith('--ip=')) { /* manter loopback */ }
  else forwarded.push(arg);
}
const wranglerBin = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const child = spawn(process.execPath, [wranglerBin, 'dev', '--ip', ip, ...forwarded], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
