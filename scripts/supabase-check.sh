#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

echo "== Node.js =="
node -e "const major=Number(process.versions.node.split('.')[0]); console.log(process.versions.node); if (major < 20) process.exit(1)"

echo "== npm =="
npm -v

echo "== Docker =="
docker --version
docker info >/dev/null

echo "== Supabase CLI =="
npx supabase --version

echo "== Estrutura =="
test -f supabase/config.toml
test -d supabase/migrations
test -d supabase/functions

echo "== Login Supabase =="
npx supabase projects list || echo "Login pendente. Rode: npx supabase login"

echo "Check concluido."
