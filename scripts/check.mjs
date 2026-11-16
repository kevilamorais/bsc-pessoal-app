import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const files = [];
async function scan(relative) {
  for (const entry of await readdir(new URL(relative, root), { withFileTypes: true })) {
    const filename = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) await scan(`${filename}/`);
    else if (/\.(m?js)$/.test(filename)) files.push(filename);
  }
}
for (const dir of ['src/', 'public/', 'scripts/', 'tests/']) await scan(dir);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL(file, root))], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; console.error(result.stderr || result.stdout); }
}
const html = await readFile(new URL('public/index.html', root), 'utf8');
if (/\son\w+\s*=/i.test(html) || /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html)) {
  console.error('A interface deve usar scripts externos, sem handlers inline.'); failed = true;
}
const configText = await readFile(new URL('wrangler.jsonc', root), 'utf8');
const config = JSON.parse(configText);
if (config.d1_databases?.[0]?.binding !== 'DB' || config.assets?.binding !== 'ASSETS') {
  console.error('Bindings DB e ASSETS precisam permanecer configurados.'); failed = true;
}
if (config.vars?.AUTH_MODE !== 'access') { console.error('O projeto deve publicar com AUTH_MODE=access.'); failed = true; }
if (failed) process.exitCode = 1;
else console.log(`Sintaxe verificada em ${files.length} arquivos JS. Configuração e CSP compatíveis.`);
