import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const helperPath = new URL("../scripts/bot-runtime-exit-code.ps1", import.meta.url).pathname
  .replace(/^\/(.:)/, "$1")
  .replaceAll("/", "\\");

async function runPowerShell(script) {
  const { stdout } = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
  return stdout.trim();
}

test("supervisor recupera codigo 75 gravado pelo processo do bot", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dmr-exit-code-"));
  const markerPath = join(directory, "exit-code.txt");

  try {
    const result = await runPowerShell(`
      . '${helperPath}'
      Write-BotRuntimeExitCode -Path '${markerPath}' -Code 75
      Resolve-BotRuntimeExitCode -WatchdogTriggered $false -ProcessExitCode $null -Path '${markerPath}'
    `);
    assert.equal(result, "75");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("supervisor transforma codigo ausente em falha explicita", async () => {
  const directory = await mkdtemp(join(tmpdir(), "dmr-exit-code-"));
  const markerPath = join(directory, "missing.txt");

  try {
    const result = await runPowerShell(`
      . '${helperPath}'
      Resolve-BotRuntimeExitCode -WatchdogTriggered $false -ProcessExitCode $null -Path '${markerPath}'
    `);
    assert.equal(result, "1");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
