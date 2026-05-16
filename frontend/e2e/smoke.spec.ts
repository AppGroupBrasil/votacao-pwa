import { test, expect } from "@playwright/test";

test("home carrega", async ({ page }) => {
  const r = await page.goto("/");
  expect(r?.status()).toBeLessThan(500);
  await expect(page).toHaveTitle(/Votação Online/i);
});

test("banner de cookies aparece e desaparece após aceitar", async ({ page }) => {
  await page.goto("/");
  const banner = page.getByRole("dialog", { name: /cookies/i });
  await expect(banner).toBeVisible();
  await banner.getByRole("button", { name: /entendi/i }).click();
  await expect(banner).not.toBeVisible();
});

test("página de privacidade abre", async ({ page }) => {
  await page.goto("/privacidade");
  await expect(page.getByRole("heading", { name: /Política de Privacidade/i })).toBeVisible();
});

test("página de termos abre", async ({ page }) => {
  await page.goto("/termos");
  await expect(page.getByRole("heading", { name: /Termos de Uso/i })).toBeVisible();
});

test("login rejeita credenciais inválidas", async ({ page }) => {
  await page.goto("/login");
  await page.locator('input[autocomplete="username"]').fill("nao_existe");
  await page.locator('input[autocomplete="current-password"]').fill("errado12345");
  await page.getByRole("button", { name: /entrar/i }).click();
  await expect(page.getByText(/Usuário ou senha incorretos/i)).toBeVisible({ timeout: 10_000 });
});

test("api healthz responde 200", async ({ request }) => {
  const r = await request.get("/api/healthz/");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.status).toBe("ok");
});
