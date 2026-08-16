import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

test("deploy usa o perfil oficial do Supabase e restaura o ambiente ao terminar", () => {
  const script = read("scripts/supabase-deploy.ps1");

  assert.match(script, /\$previousSupabaseProfile\s*=\s*\$env:SUPABASE_PROFILE/i);
  assert.match(script, /\$env:SUPABASE_PROFILE\s*=\s*["']supabase["']/i);
  assert.match(script, /finally\s*\{[\s\S]*?SUPABASE_PROFILE/i);
  assert.match(script, /Remove-Item\s+Env:SUPABASE_PROFILE\s+-ErrorAction\s+SilentlyContinue/i);
});

test("login e atualizacao guiados neutralizam perfil personalizado invalido", () => {
  for (const path of ["scripts/supabase-login.ps1", "scripts/supabase-update.ps1"]) {
    const script = read(path);
    assert.match(script, /\$env:SUPABASE_PROFILE\s*=\s*["']supabase["']/i, path);
  }
});

test("atualizacao guiada usa o token informado em todos os subprocessos", () => {
  const script = read("scripts/supabase-update.ps1");

  assert.match(script, /\$env:SUPABASE_ACCESS_TOKEN\s*=\s*\$token/i);
  assert.match(
    script,
    /finally\s*\{[\s\S]*?Remove-Item\s+Env:SUPABASE_ACCESS_TOKEN\s+-ErrorAction\s+SilentlyContinue/i,
  );
});

test("atualizacao guiada preserva um vinculo existente com o mesmo projeto", () => {
  const script = read("scripts/supabase-update.ps1");

  assert.match(script, /\$linkedProjectPath\s*=\s*["']supabase\/\.temp\/project-ref["']/i);
  assert.match(script, /Test-Path\s+\$linkedProjectPath/i);
  assert.match(script, /Projeto ja vinculado/i);
  assert.match(script, /npx\s+supabase\s+link\s+--project-ref\s+\$ProjectRef/i);
});
