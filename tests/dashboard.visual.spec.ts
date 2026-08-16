import { expect, test } from "@playwright/test";

test("tela inicial sem env mostra configuracao pendente sem overflow", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });

  await page.goto("/");

  await expect.poll(async () => page.locator("main").innerText(), {
    message: async () => {
      const pageState = await page.evaluate(() => ({
        scripts: document.scripts.length,
        nextScripts: [...document.scripts].filter((script) => script.src.includes("_next")).length,
        body: document.body.innerText.slice(0, 300),
      }));
      return `Tela nao saiu do loading. Erros: ${pageErrors.join(" | ") || "nenhum"}. Estado: ${JSON.stringify(pageState)}`;
    },
    timeout: 10_000,
  }).not.toBe("Carregando...");

  const mainText = await page.locator("main").innerText();
  expect(mainText).toMatch(/Configuração pendente|DMR Confirmação de Presença/);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);

  const viewport = page.viewportSize();
  const mainBox = await page.locator("main").boundingBox();
  expect(viewport).not.toBeNull();
  expect(mainBox).not.toBeNull();
  expect(mainBox!.x).toBeGreaterThanOrEqual(0);
  expect(mainBox!.x + mainBox!.width).toBeLessThanOrEqual(viewport!.width + 1);
});
