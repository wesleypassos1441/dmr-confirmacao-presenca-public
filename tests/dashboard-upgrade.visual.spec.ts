import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const supabaseUrl = process.env.DMR_E2E_SUPABASE_URL ?? "";
const anonKey = process.env.DMR_E2E_SUPABASE_ANON_KEY ?? "";
const serviceRoleKey = process.env.DMR_E2E_SUPABASE_SERVICE_ROLE_KEY ?? "";
const enabled = Boolean(process.env.DMR_VISUAL_E2E && supabaseUrl && anonKey && serviceRoleKey);

test("fluxo operacional autenticado, substituicao e relatorio profissional", async ({ page, isMobile }, testInfo) => {
  test.setTimeout(120_000);
  test.skip(!enabled, "Defina DMR_VISUAL_E2E e as credenciais do Supabase local para executar este cenario.");
  test.skip(isMobile, "O cenario autenticado completo roda uma vez no projeto desktop.");

  const suffix = Date.now().toString().slice(-7);
  const email = `qa-${suffix}@dmr.local`;
  const password = `TestPassword-${suffix}!`;
  const companyName = `Empresa QA ${suffix}`;
  const service = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const createUserError = await createAuthUserWithRetry(service, {
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "Administrador QA" },
  });
  expect(createUserError).toBeNull();

  const operationDate = tomorrowInSaoPaulo();
  const operationDateBrazil = formatIsoDateBrazil(operationDate);
  const pageErrors: string[] = [];
  const responseErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    const localRealtimeUnavailable = text.includes("ws://127.0.0.1:54321/realtime/") && text.includes("503");
    if (message.type() === "error" && !text.startsWith("Failed to load resource:") && !localRealtimeUnavailable) pageErrors.push(text);
  });
  page.on("response", async (response) => {
    if (response.status() < 400 || response.url().endsWith("/favicon.ico")) return;
    const body = await response.text().catch(() => "");
    if (response.status() === 401 && response.url().startsWith(supabaseUrl) && body.includes("JWT issued at future")) return;
    responseErrors.push(`${response.status()} ${response.url()} ${body.slice(0, 400)}`);
  });

  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Painel do Dia" })).toBeVisible();

  await page.getByRole("button", { name: "Empresas", exact: true }).click();
  const companyPanel = page.getByRole("heading", { name: "Nova empresa" }).locator("..");
  await companyPanel.getByLabel("Nome", { exact: true }).fill(companyName);
  await companyPanel.getByLabel("Tipo de contratação").selectOption("freelancer");
  await companyPanel.getByLabel("Endereço", { exact: true }).fill("Rua da Qualidade");
  await companyPanel.getByLabel("Número", { exact: true }).fill("240");
  await companyPanel.getByLabel("Bairro", { exact: true }).fill("Centro");
  await companyPanel.getByLabel("Cidade", { exact: true }).fill("Betim");
  await companyPanel.getByRole("button", { name: "Criar empresa" }).click();

  const schedulePanel = page.getByRole("heading", { name: "Horários da empresa" }).locator("..");
  await expect(schedulePanel.getByLabel("Empresa")).toContainText(companyName);
  await schedulePanel.getByLabel("Empresa").selectOption({ label: companyName });
  await schedulePanel.getByLabel("Entrada").fill("14:00");
  await schedulePanel.getByLabel("Saída").fill("22:00");
  await schedulePanel.getByRole("button", { name: "Adicionar horário" }).click();
  await expect(schedulePanel).toContainText("14:00 as 22:00");

  const companyDetails = schedulePanel.locator("details").filter({ hasText: companyName });
  await companyDetails.evaluate((element: HTMLDetailsElement) => { element.open = true; });
  await companyDetails.getByRole("button", { name: "Editar jornada" }).click();
  const scheduleDialog = page.getByRole("dialog", { name: "Editar jornada" });
  const friday = scheduleDialog.locator(".weekly-schedule-row").filter({ hasText: "Sexta-feira" });
  await friday.getByRole("checkbox").check();
  await friday.getByLabel("Entrada").fill("13:00");
  await friday.getByLabel("Saída").fill("21:00");
  await scheduleDialog.getByRole("button", { name: "Salvar jornada" }).click();

  await companyDetails.getByRole("button", { name: "Adicionar exceção" }).click();
  const exceptionDialog = page.getByRole("dialog", { name: "Exceção de horário" });
  await exceptionDialog.getByLabel("Data").fill(operationDate);
  await exceptionDialog.getByLabel("Entrada excepcional").fill("14:00");
  await exceptionDialog.getByLabel("Saída excepcional").fill("22:00");
  await exceptionDialog.getByLabel("Preparar comunicado para os colaboradores após salvar").uncheck();
  await exceptionDialog.getByRole("button", { name: "Salvar exceção" }).click();

  await page.getByRole("button", { name: "Turnos", exact: true }).click();
  const shiftPanel = page.getByRole("heading", { name: "Novo turno" }).locator("..");
  await shiftPanel.getByLabel("Empresa").selectOption({ label: companyName });
  await expect(shiftPanel.getByLabel("Entrada/Saída")).toContainText("14:00 as 22:00");
  await shiftPanel.getByLabel("Entrada/Saída").selectOption({ label: "14:00 as 22:00" });
  await shiftPanel.getByLabel("Prioridade").selectOption("normal");
  await shiftPanel.getByRole("button", { name: "Criar turno" }).click();

  const queuePanel = page.getByRole("heading", { name: "Adicionar fila" }).locator("..");
  await queuePanel.getByLabel("Empresa").selectOption({ label: companyName });
  await queuePanel.getByLabel("Entrada/Saída").selectOption({ label: "14:00 as 22:00" });
  await queuePanel.getByLabel("Data da Operação (DD/MM/AAAA)").fill(operationDate);
  await queuePanel.getByLabel("Horário de Disparo").fill("09:00");

  const quickEntry = queuePanel.getByText("Adicionar colaboradores nesta equipe", { exact: true });
  await quickEntry.click();
  const singleForm = queuePanel.locator(".quick-team-entry form").nth(0);
  await singleForm.getByLabel("Nome").fill("Ana Operacional");
  await singleForm.getByLabel("Telefone WhatsApp").fill("10900000001");
  await singleForm.getByRole("button", { name: "Adicionar colaborador" }).click();

  const batchForm = queuePanel.locator(".quick-team-entry form").nth(1);
  await batchForm.getByLabel("Adicionar em lote").fill("Bruno Operacional: (31) 9 9999-0002\nCarla Operacional: 31 9 9999-0003");
  await batchForm.getByRole("button", { name: "Adicionar lote" }).click();
  await expect(queuePanel).toContainText("3 colaboradores selecionados");
  await queuePanel.getByRole("button", { name: "Adicionar fila" }).click();
  await expect(page.locator("table").last()).toContainText(companyName);

  const { data: company, error: companyError } = await service.from("empresas").select("id").eq("nome", companyName).single();
  expect(companyError).toBeNull();
  const { data: escala, error: escalaError } = await service.from("escalas").select("id").eq("empresa_id", company!.id).eq("data", operationDate).single();
  expect(escalaError).toBeNull();
  const { data: members, error: membersError } = await service
    .from("escala_colaboradores")
    .select("id,colaborador_id,colaboradores(nome)")
    .eq("escala_id", escala!.id);
  expect(membersError).toBeNull();
  expect(members).toHaveLength(3);

  const ana = members!.find((row) => relationName(row.colaboradores) === "Ana Operacional");
  const bruno = members!.find((row) => relationName(row.colaboradores) === "Bruno Operacional");
  expect(ana).toBeTruthy();
  expect(bruno).toBeTruthy();
  const { error: noShowError } = await service.from("escala_colaboradores").update({
    status_confirmacao: "nao_comparecera",
    resposta_normalizada: "nao",
    resposta_original: "2",
    respondido_em: new Date().toISOString(),
  }).eq("id", ana!.id);
  expect(noShowError).toBeNull();
  const { error: confirmedError } = await service.from("escala_colaboradores").update({
    status_confirmacao: "confirmado",
    resposta_normalizada: "sim",
    resposta_original: "1",
    respondido_em: new Date().toISOString(),
  }).eq("id", bruno!.id);
  expect(confirmedError).toBeNull();
  const { error: heartbeatError } = await service.from("bot_heartbeats").insert({
    bot_id: "qa-visual",
    status: "online",
    detalhes: { error: "Execution context was destroyed, most likely because of a navigation." },
  });
  expect(heartbeatError).toBeNull();

  await page.getByRole("button", { name: "Painel do Dia", exact: true }).click();
  await page.getByLabel("Data do painel").fill(operationDate);
  await page.getByRole("button", { name: "Atualizar dados" }).click();
  await expect(page.getByText("O WhatsApp Web foi recarregado e a conexão do bot foi interrompida.", { exact: false })).toBeVisible();

  const operationBoard = page.locator(".operation-board").filter({ hasText: companyName });
  await expect(operationBoard).toContainText("Disparos: 09:00");
  await operationBoard.getByRole("button", { name: "Editar horário de disparo" }).click();
  const dispatchDialog = page.getByRole("dialog", { name: "Editar horário de disparo" });
  await dispatchDialog.getByLabel("Novo horário de disparo").fill("08:45");
  await dispatchDialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(operationBoard).toContainText("Disparos: 08:45");

  const anaRow = operationBoard.getByRole("row").filter({ hasText: "Ana Operacional" });
  await anaRow.getByRole("button", { name: "Informar substituto" }).click();
  const substituteDialog = page.getByRole("dialog", { name: "Informar substituto" });
  await substituteDialog.getByLabel("Nome do colaborador substituto").fill("Daniel Substituto");
  await substituteDialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(anaRow).toContainText("substituído");
  await expect(anaRow).toContainText("Substituído por Daniel Substituto");

  const brunoRow = operationBoard.getByRole("row").filter({ hasText: "Bruno Operacional" });
  await brunoRow.getByRole("button", { name: "Marcar falso positivo" }).click();
  const treatmentDialog = page.getByRole("dialog", { name: "Tratar confirmação" });
  await treatmentDialog.getByLabel("Falso positivo: confirmou, mas depois informou que não poderá comparecer").check();
  await treatmentDialog.getByLabel("Motivo ou observação").fill("Indisponibilidade após confirmar");
  await treatmentDialog.getByRole("button", { name: "Salvar tratamento" }).click();
  await expect(brunoRow).toContainText("falso positivo");

  await operationBoard.getByRole("button", { name: "Criar comunicado" }).click();
  const announcementDialog = page.getByRole("dialog", { name: "Criar comunicado" });
  await announcementDialog.getByLabel("Assunto").fill("Aviso de acesso");
  await announcementDialog.getByLabel("Mensagem").fill("Olá {nome}. O acesso de {empresa} em {data} será pelo portão principal.");
  await expect(announcementDialog.locator(".announcement-preview")).toContainText("Aviso de acesso");
  await expect(announcementDialog.locator(".announcement-preview")).toContainText(companyName);
  await expect(announcementDialog.locator(".announcement-preview")).toContainText(operationDateBrazil);
  await announcementDialog.getByRole("button", { name: "Confirmar comunicado" }).click();

  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Relatorio operacional de presenca" })).toBeVisible();
  const reportDate = page.getByLabel("Data (DD/MM/AAAA)");
  const reportOperations = page.locator(".report-operations");
  await expect(reportDate).toHaveValue(operationDateBrazil);

  await reportDate.fill("01/01/2020");
  await expect(reportOperations).toContainText("Nenhum registro encontrado para esta data e categoria.");
  await reportDate.fill(operationDateBrazil);
  await expect(reportOperations).toContainText(companyName);
  await page.locator(".report-controls").getByRole("combobox", { name: "Empresa" }).selectOption({ label: companyName });
  await expect(reportOperations).toContainText(companyName);

  await page.getByRole("button", { name: /^Confirmados\s+0$/ }).click();
  await expect(reportOperations).toContainText("Nenhum registro encontrado");
  await expect(reportOperations).not.toContainText("Ana Operacional");
  await expect(reportOperations).not.toContainText("Carla Operacional");

  await page.getByRole("button", { name: /^Substituídos\s+1$/ }).click();
  await expect(reportOperations).toContainText("Ana Operacional");
  await expect(reportOperations).toContainText("Daniel Substituto");
  await expect(reportOperations).not.toContainText("Bruno Operacional");

  await page.getByRole("button", { name: /^Falsos positivos\s+1$/ }).click();
  await expect(reportOperations).toContainText("Bruno Operacional");
  await expect(reportOperations).toContainText("Indisponibilidade após confirmar");

  await page.getByRole("button", { name: /^Aguardando\s+1$/ }).click();
  await expect(reportOperations).toContainText("Carla Operacional");
  await expect(reportOperations).not.toContainText("Ana Operacional");

  await page.getByRole("button", { name: /^Todos\s+3$/ }).click();
  await expect(page.locator(".report-document")).toContainText(companyName);
  await expect(page.locator(".report-document")).toContainText("Daniel Substituto");
  await expect(page.locator(".report-document")).toContainText("Ana Operacional");

  const artifactDir = path.join(testInfo.outputDir, "dashboard-upgrade");
  await mkdir(artifactDir, { recursive: true });
  await page.screenshot({ path: path.join(artifactDir, "relatorio-dashboard.png"), fullPage: true });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: path.join(artifactDir, "relatorio-operacional.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
  });
  await page.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "Auditoria", exact: true }).click();
  const currentAuditRows = page.getByRole("row").filter({ hasText: email });
  await expect(currentAuditRows.filter({ hasText: 'colocou o comunicado "Aviso de acesso" na fila para 3 colaboradores' }).first()).toBeVisible();
  await expect(currentAuditRows.filter({ hasText: /marcou a confirmação de Bruno Operacional.*como falso positivo/ }).first()).toBeVisible();

  expect(pageErrors, pageErrors.join("\n")).toEqual([]);
  expect(responseErrors, responseErrors.join("\n")).toEqual([]);
});

function tomorrowInSaoPaulo() {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(tomorrow);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatIsoDateBrazil(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function relationName(value: unknown) {
  if (Array.isArray(value)) return String(value[0]?.nome ?? "");
  if (value && typeof value === "object") return String((value as { nome?: unknown }).nome ?? "");
  return "";
}

async function createAuthUserWithRetry(
  service: ReturnType<typeof createClient>,
  attributes: { email: string; password: string; email_confirm: boolean; user_metadata: { name: string } },
) {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const { error } = await service.auth.admin.createUser(attributes);
    if (!error) return null;
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  return lastError;
}
