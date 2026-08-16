import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const loginScript = await readFile(new URL("../scripts/whatsapp-login.ps1", import.meta.url), "utf8");
const startScript = await readFile(new URL("../scripts/start-bot.ps1", import.meta.url), "utf8");
const launcher = await readFile(new URL("../Ligar Bot DMR.cmd", import.meta.url), "utf8");
const supervisor = await readFile(new URL("../scripts/bot-supervisor.ps1", import.meta.url), "utf8");
const resetScript = await readFile(new URL("../scripts/reset-whatsapp-session.ps1", import.meta.url), "utf8");

test("login visual encerra o navegador da sessao antes de liberar o bot", () => {
  assert.match(loginScript, /Get-CimInstance\s+Win32_Process/i);
  assert.match(loginScript, /IndexOf\(\$sessionPath/i);
  assert.match(loginScript, /Stop-Process\s+-Id/i);
  assert.match(loginScript, /A sessao visual foi encerrada/i);

  const stopPosition = loginScript.indexOf("Stop-Process -Id");
  const instructionPosition = loginScript.indexOf("scripts/start-bot.ps1");
  assert.ok(stopPosition >= 0 && stopPosition < instructionPosition);
});

test("inicio do bot bloqueia concorrencia com navegador visual da mesma sessao", () => {
  assert.match(startScript, /WHATSAPP_SESSION_ID/i);
  assert.match(startScript, /Get-CimInstance\s+Win32_Process/i);
  assert.match(startScript, /Feche a janela de login do WhatsApp/i);
  assert.match(startScript, /Exit-BotRuntime -Code \$RESTART_EXIT_CODE/i);
});

test("inicio do bot explica como recuperar perfil bloqueado no Windows", () => {
  assert.match(startScript, /EBUSY/i);
  assert.match(startScript, /reset-whatsapp-session\.ps1/i);
});

test("executavel reinicia automaticamente apenas falhas recuperaveis", () => {
  assert.match(launcher, /start-bot-background\.ps1/i);
  assert.match(supervisor, /RESTART_EXIT_CODE\s*=\s*75/i);
  assert.match(supervisor, /RECOVERABLE_EXIT_CODES\s*=\s*@\(75,\s*134\)/i);
  assert.match(supervisor, /if\s*\(\$RECOVERABLE_EXIT_CODES\s+-contains\s+\$exitCode\)/i);
  assert.match(supervisor, /consecutiveRestarts/i);
  assert.match(supervisor, /retryDelaySeconds/i);
  assert.match(supervisor, /Start-Sleep\s+-Seconds\s+\$retryDelaySeconds/i);
});

test("troca de sessao preserva env em UTF-8 sem BOM", () => {
  assert.match(resetScript, /new-object System\.Text\.UTF8Encoding\(\$false\)/i);
  assert.match(resetScript, /\[System\.IO\.File\]::WriteAllText/);
  assert.doesNotMatch(resetScript, /Set-Content[^\r\n]+-Encoding UTF8/i);
});
