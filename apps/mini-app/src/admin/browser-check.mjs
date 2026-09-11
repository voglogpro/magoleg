/** Local-only admin UX regression. Every API request is mocked; no real products are deleted. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5192';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local preview only');
const catalogue = JSON.parse(await readFile(resolve('../../docs/catalog-kugoo.json'), 'utf8'));
const output = resolve('test-results/admin-session-delete');
const photo = await readFile(resolve('public/products/kugoo-2026/f3-plus-front-v1.webp'));
await mkdir(output, { recursive: true });
/** CHROMIUM_PATH позволяет запустить проверку на предустановленном браузере окружения. */
const launchOptions = { headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launchOptions);
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    let authenticated = false, confirmed = false, deleted = 0, saved = 0, failProducts = false;
    let settings = { shop_name: 'QA store', phone: '', telegram: '', address: '', hours: '', delivery: '', payment: '', warranty: '', legal_name: '', legal_details: '', inquiries_enabled: false };
    let products = catalogue.slice(0, 2).map(({ photo_files, ...card }, index) => ({
      ...card, id: `qa-${index}`, images: ['/media/qa-photo.webp'], image_url: '/media/qa-photo.webp', updated_at: '2026-09-06',
    }));
    const session = { username: 'qa-owner', csrfToken: 'local-test-token' };
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => confirmed ? dialog.accept() : dialog.dismiss());
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/media/qa-photo.webp', route => route.fulfill({ body: photo, contentType: 'image/png' }));
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
      if (path === '/api/admin/products' && failProducts) return route.fulfill({ status: 503, json: { error: 'QA: каталог временно недоступен.' } });
      if (path.startsWith('/api/admin/products/') && request.method() === 'PUT') {
        assert.equal(request.headers()['x-csrf-token'], session.csrfToken);
        const id = path.split('/').pop(), changed = { ...products.find(product => product.id === id), ...request.postDataJSON() };
        products = products.map(product => product.id === id ? changed : product); saved++;
        return route.fulfill({ json: { product: changed } });
      }
      if (path === '/api/admin/settings') {
        if (request.method() === 'PUT') { assert.equal(request.headers()['x-csrf-token'], session.csrfToken); settings = request.postDataJSON(); }
        return route.fulfill({ json: { settings } });
      }
      if (path === '/api/admin/inquiries') return route.fulfill({ json: { inquiries: [], total: 0, page: 1, total_pages: 0 } });
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
    assert.ok(await page.locator('.crm-tabs').evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'All CRM tabs fit without sideways scrolling');
    const remove = page.getByRole('button', { name: `Удалить товар «${products[0].name}»`, exact: true });
    await remove.click();
    assert.equal(deleted, 0);
    assert.equal(await page.locator('.crm-product-row').count(), 2);
    await page.locator('.crm-product-row').first().click();
    await page.locator('.crm-editor-head').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/editor-${width}.png`, fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByLabel('Вес устройства, кг', { exact: true }).scrollIntoViewIfNeeded();
    // Грузоподъёмность, привод и отметка «нет» для багажника доступны из формы карточки.
    await page.getByLabel('Грузоподъёмность, кг', { exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('combobox', { name: 'Привод', exact: true }).selectOption('dual');
    await page.getByRole('combobox', { name: 'Багажник', exact: true }).selectOption('none');
    assert.equal(await page.getByRole('combobox', { name: 'Багажник', exact: true }).inputValue(), 'none');
    const actionBox = await page.locator('.crm-editor-actions').boundingBox();
    assert.ok(actionBox.y >= 0 && actionBox.y + actionBox.height < 900, 'Save controls stay reachable midway through the editor');
    const tags = await page.locator('.crm-tag-grid .crm-checkbox').evaluateAll(els => els.slice(0, 2).map(el => el.getBoundingClientRect().top));
    assert.equal(tags[0], tags[1], 'Editor tags use two columns');
    await page.getByLabel('Название товара', { exact: true }).fill('QA updated model');
    await page.getByRole('combobox', { name: /^Категория/ }).selectOption('atv');
    await page.getByRole('button', { name: 'Магазин и документы', exact: true }).click();
    assert.equal(await page.getByLabel('Название товара', { exact: true }).inputValue(), 'QA updated model', 'Cancel preserves the unsaved draft');
    await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
    await page.getByText('Черновик сохранён. Покупатели его не видят.', { exact: true }).waitFor();
    assert.equal(saved, 1);
    assert.equal(products[0].category, 'atv', 'New ATV category is saved from the editor');
    assert.ok(await page.getByText('Черновик сохранён. Покупатели его не видят.', { exact: true }).evaluate(el => el === document.activeElement));
    confirmed = true;
    await page.locator('.crm-editor-head').getByRole('button', { name: 'Удалить товар', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.crm-product-row').length === 1);
    assert.equal(deleted, 1);
    await page.getByRole('button', { name: 'Магазин и документы', exact: true }).click();
    await page.getByLabel('Название магазина', { exact: true }).fill('QA updated store');
    await page.getByRole('button', { name: 'Сохранить информацию', exact: true }).click();
    await page.getByText('Информация магазина сохранена и доступна на сайте.', { exact: true }).waitFor();
    assert.ok(await page.getByText('Информация магазина сохранена и доступна на сайте.', { exact: true }).evaluate(el => el === document.activeElement && el.getBoundingClientRect().top >= 0));
    await page.getByRole('button', { name: 'Заявки', exact: true }).click();
    await page.getByText('Заявок пока нет', { exact: true }).waitFor();
    failProducts = true;
    await page.getByRole('button', { name: 'Товары', exact: true }).click();
    await page.getByText('QA: каталог временно недоступен.', { exact: false }).waitFor();
    assert.equal(await page.getByText('Каталог пока пуст', { exact: true }).count(), 0);
    failProducts = false;
    await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
    await page.waitForSelector('.crm-product-row');
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
    console.log(`${width}px: session, editor layout, unsaved cancel, save feedback, cancel/delete, settings, inquiries, retry, profile/logout passed`);
  }
} finally { await browser.close(); }
