import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const configPath = resolve(root, 'dist/server/wrangler.json');
let config;
try { config = JSON.parse(readFileSync(configPath, 'utf8')); }
catch { console.error('请先运行 npm run build，再初始化本地数据库。'); process.exit(1); }
for (const db of config.d1_databases ?? []) db.migrations_dir = resolve(root, 'drizzle');
mkdirSync(resolve(root, '.sites-runtime'), { recursive: true });
const localConfig = resolve(root, '.sites-runtime/local-db.json');
writeFileSync(localConfig, JSON.stringify(config, null, 2));
const result = spawnSync(process.execPath, [
  '--import', pathToFileURL(resolve(root, 'scripts/sites-env.mjs')).href,
  resolve(root, 'node_modules/wrangler/bin/wrangler.js'),
  'd1', 'migrations', 'apply', 'DB', '--local', '--config', localConfig,
  '--persist-to', resolve(root, '.wrangler/state'),
], { cwd: root, input: 'y\n', encoding: 'utf8', env: { ...process.env, CI: 'true' } });
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
