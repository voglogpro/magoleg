/** Local-only admin UX regression. Every API request is mocked; no real products are deleted. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5192';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local preview only');
const catalogue = JSON.parse(await readFile(resolve('../../docs/catalog-kugoo.json'), 'utf8'));
const output = resolve('test-results/admin-session-delete');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let authenticated = false, confirmed = false, deleted = 0;
    let products = catalogue.slice(0, 2).map(({ photo_files, ...card }, index) => ({
      ...card, id: `qa-${index}`, images: [], updated_at: '2026-09-06',
    }));
    const session = { username: 'qa-owner', csrfToken: 'local-test-token' };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => confirmed ? dialog.accept() : dialog.dismiss());
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (path === '/api/admin/session') return route.fulfill({ status: authenticated ? 200 : 401, json: authenticated ? session : { error: 'Войдите в кабинет.' } });
      if (path === '/api/admin/login') {
        assert.equal(request.postDataJSON().remember, true);
        authenticated = true;
        return route.fulfill({ json: session });
      }
      if (path === '/api/admin/logout') {
        assert.equal(request.headers()['x-csrf-token'], session.csrfToken);
        authenticated = false;
        return route.fulfill({ json: { ok: true } });
      }
      if (path.startsWith('/api/admin/products/') && request.method() === 'DELETE') {
        assert.ok(confirmed);
        assert.equal(request.headers()['x-csrf-token'], session.csrfToken);
        const id = path.split('/').pop();
        assert.equal(id, 'qa-0');
        products = products.filter(product => product.id !== id); deleted++;
        return route.fulfill({ json: { ok: true } });
      }
      assert.equal(request.method(), 'GET');
      return route.fulfill({ json: path === '/api/admin/products' || path === '/api/products' ? { products }
        : path === '/api/settings' ? { settings: {} } : { account: null } });
    });
    await page.goto(`${base}/admin`);
    await page.getByLabel('Логин', { exact: true }).fill('qa-owner');
    await page.getByLabel('Пароль', { exact: true }).fill('qa-password-not-a-real-secret');
    assert.ok(await page.getByRole('checkbox', { name: /Оставаться в системе/ }).isChecked());
    await page.screenshot({ path: `${output}/login-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.waitForSelector('.crm-product-row');
    await page.reload();
    await page.waitForSelector('.crm-product-row');
    assert.equal(await page.getByLabel('Пароль', { exact: true }).count(), 0);
    const remove = page.getByRole('button', { name: `Удалить товар «${products[0].name}»`, exact: true });
    await remove.click();
    assert.equal(deleted, 0);
    assert.equal(await page.locator('.crm-product-row').count(), 2);
    await page.locator('.crm-product-row').first().click();
    await page.locator('.crm-editor-head').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    confirmed = true;
    await page.locator('.crm-editor-head').getByRole('button', { name: 'Удалить товар', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.crm-product-row').length === 1);
    assert.equal(deleted, 1);
    await page.goto(`${base}/#profile`);
    const closeCity = page.getByRole('button', { name: 'Выбрать позже', exact: true });
    await closeCity.click();
    await closeCity.waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: /Панель управления/ }).waitFor();
    await page.reload();
    await page.getByRole('link', { name: /Панель управления/ }).waitFor();
    await page.getByRole('button', { name: 'Выйти из аккаунта', exact: true }).click();
    await page.getByLabel('Пароль', { exact: true }).waitFor();
    assert.equal(authenticated, false);
    assert.deepEqual(errors, []);
    await context.close();
    console.log(`${width}px: saved login, owner profile reload, cancel/delete, logout passed`);
  }
} finally { await browser.close(); }
