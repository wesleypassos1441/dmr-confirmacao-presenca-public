import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const script = readFileSync(new URL("../scripts/supabase-check.ps1", import.meta.url), "utf8");

test("checagem do Supabase limita a espera do Docker e permite deploy remoto", () => {
  assert.match(script, /WaitForExit\(\d+\)/);
  assert.match(script, /validacao local sera ignorada/i);
  assert.doesNotMatch(script, /throw "Abra o Docker Desktop/i);
});
