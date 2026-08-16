import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  acquireRuntimeLock,
  markBrowserProfileClean,
} from "../apps/whatsapp-bot/src/runtime-lock.ts";

test("bot impede uma segunda instancia enquanto a primeira esta ativa", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dmr-bot-lock-"));
  const lockPath = path.join(directory, "bot.lock");
  const release = acquireRuntimeLock(lockPath, {
    pid: 1234,
    isProcessRunning: (pid) => pid === 1234,
  });

  assert.throws(
    () => acquireRuntimeLock(lockPath, {
      pid: 5678,
      isProcessRunning: (pid) => pid === 1234,
    }),
    /Bot WhatsApp ja esta em execucao/,
  );

  release();
  const releaseAgain = acquireRuntimeLock(lockPath, {
    pid: 5678,
    isProcessRunning: () => false,
  });
  releaseAgain();
  await rm(directory, { recursive: true, force: true });
});

test("bot recupera lock deixado por processo que nao existe mais", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dmr-bot-stale-lock-"));
  const lockPath = path.join(directory, "bot.lock");
  await writeFile(lockPath, "1234", "utf8");

  const release = acquireRuntimeLock(lockPath, {
    pid: 5678,
    isProcessRunning: () => false,
  });
  release();
  await rm(directory, { recursive: true, force: true });
});

test("bot remove estado de navegador encerrado incorretamente antes de abrir", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "dmr-browser-profile-"));
  const preferencesPath = path.join(directory, "Preferences");
  await writeFile(preferencesPath, JSON.stringify({
    profile: { exit_type: "Crashed", exited_cleanly: false },
    dmr: { preservado: true },
  }), "utf8");

  markBrowserProfileClean(preferencesPath);

  const preferences = JSON.parse(await readFile(preferencesPath, "utf8"));
  assert.equal(preferences.profile.exit_type, "Normal");
  assert.equal(preferences.profile.exited_cleanly, true);
  assert.equal(preferences.dmr.preservado, true);
  await rm(directory, { recursive: true, force: true });
});
