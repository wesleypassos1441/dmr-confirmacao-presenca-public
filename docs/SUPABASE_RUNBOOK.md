# Supabase Runbook

Fluxo principal no Windows:

```powershell
npm install
powershell -ExecutionPolicy Bypass -File scripts/supabase-check.ps1
npx supabase login
powershell -ExecutionPolicy Bypass -File scripts/supabase-link.ps1
powershell -ExecutionPolicy Bypass -File scripts/supabase-secrets-set.ps1
powershell -ExecutionPolicy Bypass -File scripts/supabase-deploy.ps1
```

Depois de criar o usuario no Supabase Auth:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-admin-create.ps1 -Email "email@exemplo.com"
```

O que `scripts/supabase-deploy.ps1` faz:

- checa Node, npm, Docker, Supabase CLI, migrations e functions;
- roda testes, typecheck e scan de secrets;
- tenta `npx supabase db push --dry-run`;
- aplica migrations com `npx supabase db push`;
- faz deploy das Edge Functions;
- lista as functions remotas.

As migrations criam tabelas, enums, indices, triggers, RLS, policies, funcoes SQL e cron `dmr_gerar_fila_confirmacoes_every_minute`.

Secrets enviados por script:

```text
DMR_BOT_TOKEN
APP_ORIGIN
DMR_ALLOWED_ORIGIN
ENVIRONMENT
```

Nao coloque `SUPABASE_SERVICE_ROLE_KEY` no Dashboard. No ambiente das Edge Functions do Supabase, `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sao fornecidos pelo proprio Supabase.

Teste local com Docker:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/supabase-local-reset.ps1
```

Em 2026-06-18, o Docker Desktop respondeu, mas falhou ao puxar imagens do Supabase com `meta.db: read-only file system`. Quando isso acontecer, reinicie o Docker Desktop e rode o comando novamente.
