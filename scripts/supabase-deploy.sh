#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/.."

sh scripts/supabase-check.sh
npm test
npm run typecheck
npm run secrets:scan

npx supabase db push --dry-run || echo "Dry-run indisponivel; seguindo para db push."
npx supabase db push

npx supabase functions deploy bot-next-message --no-verify-jwt
npx supabase functions deploy bot-mark-sent --no-verify-jwt
npx supabase functions deploy bot-register-incoming --no-verify-jwt
npx supabase functions deploy bot-register-error --no-verify-jwt
npx supabase functions deploy bot-health --no-verify-jwt
