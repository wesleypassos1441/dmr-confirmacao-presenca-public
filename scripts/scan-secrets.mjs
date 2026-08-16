import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const ignored = new Set([
  'node_modules',
  '.next',
  '.netlify',
  'out',
  'dist',
  '.wwebjs_auth',
  '.wwebjs_cache',
  '.git',
]);
const secretPatterns = [
  /SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^ \n]+/i,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /DMR_BOT_TOKEN\s*=\s*[A-Za-z0-9_-]{16,}/i,
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    if (entry.isFile()) files.push(full);
  }
  return files;
}

const offenders = [];
for (const file of walk(root)) {
  const relative = path.relative(root, file);
  const normalized = relative.replaceAll(path.sep, '/');
  if (
    normalized === '.env.example' ||
    normalized === '.env.supabase.example' ||
    normalized === '.env' ||
    normalized === '.env.local' ||
    normalized === '.env.production' ||
    normalized === '.env.supabase' ||
    normalized === '.env.supabase.local' ||
    normalized.endsWith('/.env.local')
  ) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    if (pattern.test(text)) offenders.push(relative);
  }
}

assert.deepEqual(offenders, [], `Possiveis secrets encontrados: ${offenders.join(', ')}`);
console.log('secret scan passed');
