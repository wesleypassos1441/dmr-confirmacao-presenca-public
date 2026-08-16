import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const script = readFileSync("scripts/control-bot-window.ps1", "utf8");

test("Mostrar Bot reinicia uma sessao invisivel no Edge visual", () => {
  assert.match(script, /WHATSAPP_HEADLESS/);
  assert.match(script, /WHATSAPP_HEADLESS=false/);
  assert.match(script, /--headless/);
  assert.match(script, /stop-bot-background\.ps1/);
  assert.match(script, /start-bot-background\.ps1/);
  assert.match(script, /wait-and-show-bot-window\.ps1/);
});
