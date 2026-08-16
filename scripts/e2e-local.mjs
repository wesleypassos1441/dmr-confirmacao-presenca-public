import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const apiUrl = requiredEnv("API_URL");
const anonKey = requiredEnv("ANON_KEY");
const serviceRoleKey = requiredEnv("SERVICE_ROLE_KEY");
const botToken = requiredEnv("DMR_BOT_TOKEN");
const dashboardUrl = process.env.DASHBOARD_URL || "http://127.0.0.1:3002";
const functionsUrl = `${apiUrl}/functions/v1`;
const email = "e2e-admin@dmr.local";
const password = "TestPassword-Only!";
const companyName = "Empresa E2E Fluxo Completo";
const yesName = "Colaborador Sim E2E";
const noName = "Colaborador Não E2E";
const yesPhone = "5510900000005";
const noPhone = "5510900000006";
const alertPhone = "5510900000007";

const serviceHeaders = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  "Content-Type": "application/json",
};

await prepareAdmin();

const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

try {
  const schedule = saoPauloSchedule();
  await page.goto(dashboardUrl, { waitUntil: "networkidle" });
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("heading", { name: "Painel do Dia" }).waitFor();

  await page.getByRole("button", { name: "Empresas" }).click();
  const companyPanel = panelByHeading(page, "Nova empresa");
  await companyPanel.getByLabel("Nome").fill(companyName);
  await companyPanel.getByLabel("Endereço").fill("Rua do Teste");
  await companyPanel.getByLabel("Número").fill("100");
  await companyPanel.getByLabel("Bairro").fill("Centro");
  await companyPanel.getByLabel("Cidade").fill("Contagem");
  await companyPanel.getByRole("button", { name: "Criar empresa" }).click();

  const hoursPanel = panelByHeading(page, "Horários da empresa");
  await hoursPanel.getByLabel("Empresa").selectOption({ label: companyName });
  await hoursPanel.getByLabel("Entrada").fill(schedule.entry);
  await hoursPanel.getByLabel("Saída").fill(schedule.exit);
  await hoursPanel.getByRole("button", { name: "Adicionar horário" }).click();
  await hoursPanel.getByText(`${schedule.entry} as ${schedule.exit}`, { exact: false }).waitFor();

  await page.getByRole("button", { name: "Turnos" }).click();
  const shiftPanel = panelByHeading(page, "Novo turno");
  await shiftPanel.getByLabel("Empresa").selectOption({ label: companyName });
  await shiftPanel.getByLabel("Entrada/Saída").selectOption({ label: `${schedule.entry} as ${schedule.exit}` });
  await shiftPanel.getByLabel("Prioridade").selectOption("normal");
  await shiftPanel.getByRole("button", { name: "Criar turno" }).click();

  const preparedQueuePanel = panelByHeading(page, "Adicionar fila");
  await waitForSelectedOption(preparedQueuePanel.getByLabel("Entrada/Saída"), `${schedule.entry} as ${schedule.exit}`);
  assert.equal(
    await preparedQueuePanel.getByLabel("Empresa").locator("option:checked").textContent(),
    companyName,
  );
  assert.equal(
    await preparedQueuePanel.getByLabel("Entrada/Saída").locator("option:checked").textContent(),
    `${schedule.entry} as ${schedule.exit}`,
  );
  assert.equal(await preparedQueuePanel.getByLabel("Data da operação").inputValue(), schedule.date);
  const turnosTable = preparedQueuePanel.locator("xpath=following-sibling::section").first();
  await expectTextAbsent(turnosTable, schedule.dispatch);

  await page.getByRole("button", { name: "Colaboradores" }).click();
  const employeePanel = panelByHeading(page, "Novo colaborador");
  await createEmployee(employeePanel, companyName, yesName, yesPhone);
  await page.getByText(yesName, { exact: true }).waitFor();
  await createEmployee(employeePanel, companyName, noName, noPhone);
  await page.getByText(noName, { exact: true }).waitFor();

  await page.getByRole("button", { name: "Contatos de Alerta" }).click();
  const alertPanel = panelByHeading(page, "Novo contato de alerta");
  await alertPanel.getByLabel("Nome").fill("DMR E2E");
  await alertPanel.getByLabel("Telefone WhatsApp").fill(alertPhone);
  await alertPanel.getByRole("button", { name: "Criar contato" }).click();
  await page.getByText("DMR E2E", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Turnos" }).click();
  const queuePanel = panelByHeading(page, "Adicionar fila");
  await queuePanel.getByLabel("Empresa").selectOption({ label: companyName });
  await queuePanel.getByLabel("Entrada/Saída").selectOption({ label: `${schedule.entry} as ${schedule.exit}` });
  assert.equal(await queuePanel.getByLabel("Data da operação").inputValue(), schedule.date);
  await queuePanel.getByLabel("Horário de Disparo").fill(schedule.dispatch);
  await queuePanel.getByRole("button", { name: "Adicionar fila" }).click();

  await waitForDatabase("escala_colaboradores", "id", 2);
  await page.getByRole("columnheader", { name: "horário de disparo" }).waitFor();
  await page.getByText(schedule.dispatch, { exact: true }).waitFor();
  await page.getByText("Fila adicionada", { exact: true }).waitFor();
  await serviceRequest("/rest/v1/rpc/gerar_fila_confirmacoes", { method: "POST", body: {} });
  await waitForDatabase("fila_mensagens", "id", 2);

  const employees = await serviceRequest(
    `/rest/v1/colaboradores?select=id,nome,telefone_normalizado&nome=in.(${encodeURIComponent(yesName)},${encodeURIComponent(noName)})`,
  );
  assert.equal(employees.length, 2);

  const first = await nextMessage();
  assert.ok(first?.mensagem, "A primeira mensagem não foi disponibilizada ao bot.");
  assert.match(first.mensagem.mensagem, /1 - SIM/);
  assert.match(first.mensagem.mensagem, /2 - NÃO/);
  assert.match(first.mensagem.mensagem, new RegExp(companyName, "i"));
  await markSent(first.mensagem.id, "e2e-sent-1");
  await serviceRequest("/rest/v1/rpc/gerar_fila_confirmacoes", { method: "POST", body: {} });

  const second = await nextMessage();
  assert.ok(second?.mensagem, "A segunda mensagem não foi disponibilizada ao bot.");
  assert.notEqual(second.mensagem.telefone_destino, first.mensagem.telefone_destino);
  await markSent(second.mensagem.id, "e2e-sent-2");
  await serviceRequest("/rest/v1/rpc/gerar_fila_confirmacoes", { method: "POST", body: {} });

  const reminder = await nextMessage();
  assert.equal(reminder?.mensagem?.tipo, "lembrete_1");
  await markSent(reminder.mensagem.id, "e2e-sent-reminder-1");
  await serviceRequest("/rest/v1/rpc/gerar_fila_confirmacoes", { method: "POST", body: {} });

  const remindedEmployee = employees.find((employee) =>
    employee.telefone_normalizado === reminder.mensagem.telefone_destino
  );
  const otherEmployee = employees.find((employee) =>
    employee.telefone_normalizado !== reminder.mensagem.telefone_destino
  );
  assert.ok(remindedEmployee);
  assert.ok(otherEmployee);

  const invalidResponse = await registerIncoming(remindedEmployee.telefone_normalizado, "3", "e2e-incoming-invalid");
  assert.equal(invalidResponse.resposta, "incompreensivel");
  assert.match(invalidResponse.resposta_colaborador, /1 - Sim/);
  assert.match(invalidResponse.resposta_colaborador, /2 - Não/);

  const confirmedResponse = await registerIncoming(remindedEmployee.telefone_normalizado, "Pode contar comigo", "e2e-incoming-yes");
  assert.equal(confirmedResponse.resposta, "confirmado");

  const noResponse = await registerIncoming(otherEmployee.telefone_normalizado, "2", "e2e-incoming-no");
  assert.equal(noResponse.resposta, "nao_comparecera");

  const panelRows = await serviceRequest(
    `/rest/v1/escala_colaboradores?select=status_confirmacao,resposta_normalizada,respondido_em,colaboradores!inner(nome)&order=criado_em.asc`,
  );
  assert.deepEqual(
    panelRows.map((row) => row.status_confirmacao).sort(),
    ["confirmado", "nao_comparecera"],
  );
  assert.ok(panelRows.every((row) => row.respondido_em));

  const received = await serviceRequest("/rest/v1/mensagens_recebidas?select=whatsapp_message_id,status_interpretado,processada_em");
  assert.equal(received.length, 3);
  assert.ok(received.every((row) => row.processada_em));

  const alerts = await serviceRequest("/rest/v1/alertas_dmr?select=motivo,mensagem");
  assert.ok(alerts.some((alert) => alert.motivo === "nao_comparecera"));

  const queueRows = await serviceRequest(
    "/rest/v1/fila_mensagens?select=tipo,status,escala_colaborador_id,contato_alerta_dmr_id",
  );
  const collaboratorQueue = queueRows.filter((row) =>
    ["confirmacao_inicial", "lembrete_1", "lembrete_2"].includes(row.tipo)
  );
  assert.equal(collaboratorQueue.length, 5);
  assert.equal(collaboratorQueue.filter((row) => row.status === "enviada").length, 3);
  assert.equal(collaboratorQueue.filter((row) => row.status === "cancelada").length, 2);
  assert.equal(collaboratorQueue.filter((row) => row.status === "pendente").length, 0);

  await page.getByRole("button", { name: "Painel do Dia" }).click();
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("span.eyebrow").filter({ hasText: companyName }).waitFor();
  await page.locator("span.badge.confirmado").waitFor();
  await page.locator("span.badge.nao_comparecera").waitFor();
  await page.getByRole("cell", { name: "sim", exact: true }).waitFor();
  await page.getByRole("cell", { name: "nao", exact: true }).waitFor();

  console.log(JSON.stringify({
    success: true,
    company: companyName,
    schedule,
    queueMessagesChecked: collaboratorQueue.length,
    remindersCancelled: collaboratorQueue.filter((row) => row.status === "cancelada").length,
    incomingMessagesChecked: 3,
    finalStatuses: panelRows.map((row) => ({
      name: row.colaboradores.nome,
      status: row.status_confirmacao,
      response: row.resposta_normalizada,
    })),
    alertCreated: true,
    dashboardConfirmed: true,
  }, null, 2));
} catch (error) {
  await page.screenshot({ path: "artifacts/e2e-local-failure.png", fullPage: true }).catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}

function panelByHeading(page, heading) {
  return page.locator("section.panel").filter({ has: page.getByRole("heading", { name: heading, exact: true }) }).first();
}

async function createEmployee(panel, company, name, phone) {
  await panel.getByLabel("Empresa").selectOption({ label: company });
  await panel.getByLabel("Nome").fill(name);
  await panel.getByLabel("Telefone WhatsApp").fill(phone);
  await panel.getByRole("button", { name: "Criar colaborador" }).click();
}

async function prepareAdmin() {
  const authHeaders = { apikey: anonKey, "Content-Type": "application/json" };
  let auth = await jsonFetch(`${apiUrl}/auth/v1/signup`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ email, password }),
  }, [200, 400, 422]);
  if (!auth?.user?.id) {
    auth = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ email, password }),
    });
  }
  await serviceRequest("/rest/v1/usuarios_dashboard?on_conflict=auth_user_id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: {
      auth_user_id: auth.user.id,
      email,
      nome: "Administrador E2E",
      papel: "admin",
      ativo: true,
    },
  });
}

async function nextMessage() {
  return edgeRequest("bot-next-message", {});
}

async function markSent(id, whatsappMessageId) {
  const result = await edgeRequest("bot-mark-sent", {
    fila_mensagem_id: id,
    whatsapp_message_id: whatsappMessageId,
  });
  assert.equal(result.sucesso, true);
}

async function registerIncoming(phone, message, id) {
  return edgeRequest("bot-register-incoming", {
    telefone_origem: phone,
    mensagem_original: message,
    whatsapp_message_id: id,
    recebida_em: new Date().toISOString(),
  });
}

async function edgeRequest(name, body) {
  return jsonFetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-dmr-bot-token": botToken,
    },
    body: JSON.stringify(body),
  });
}

async function serviceRequest(path, options = {}) {
  const headers = { ...serviceHeaders, ...(options.headers || {}) };
  const body = options.body === undefined
    ? undefined
    : typeof options.body === "string"
      ? options.body
      : JSON.stringify(options.body);
  return jsonFetch(`${apiUrl}${path}`, { ...options, headers, body });
}

async function jsonFetch(url, options = {}, expectedStatuses = [200, 201, 204]) {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!expectedStatuses.includes(response.status)) {
    throw new Error(`${options.method || "GET"} ${url} retornou ${response.status}: ${text}`);
  }
  return data;
}

async function waitForDatabase(table, column, minimum) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const rows = await serviceRequest(`/rest/v1/${table}?select=${column}`);
    if (rows.length >= minimum) return rows;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Tempo excedido aguardando ${minimum} registros em ${table}.`);
}

async function expectTextAbsent(locator, text) {
  const content = await locator.textContent();
  assert.equal(content?.includes(text), false, `O texto "${text}" apareceu antes da fila ser adicionada.`);
}

async function waitForSelectedOption(locator, expectedText) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const selected = await locator.locator("option:checked").textContent().catch(() => null);
    if (selected === expectedText) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Tempo excedido aguardando opção selecionada: ${expectedText}`);
}

function saoPauloSchedule() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const nowMinutes = Number(values.hour) * 60 + Number(values.minute);
  const entryMinutes = Math.min(23 * 60 + 59, nowMinutes + 120);
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    dispatch: formatMinutes(Math.max(0, nowMinutes - 250)),
    entry: formatMinutes(entryMinutes),
    exit: formatMinutes(Math.min(23 * 60 + 59, entryMinutes + 240)),
  };
}

function formatMinutes(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}
