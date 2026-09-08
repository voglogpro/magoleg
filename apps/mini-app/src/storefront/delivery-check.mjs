/** Local-only delivery/legal regression. Every API request uses fictional fixtures. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5192';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = resolve('test-results/delivery-documents');
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const settings = {
      shop_name: 'G-Partner', delivery_origin: 'Тестовый склад — не реальные условия',
      delivery_schedule: 'Казань; 4; 7; по тарифам перевозчика',
      legal_name: 'Тестовый продавец', legal_details: 'Тестовые данные браузерной проверки',
      phone: '+7 (900) 123-45-67', inquiries_enabled: false,
    };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(route.request().method(), 'GET', 'Public pages do not submit data');
      return route.fulfill({ json: path === '/api/settings' ? { settings } : path === '/api/products' ? { products: [] } : { account: null } });
    });
    await page.goto(base);
    await page.locator('.sf-city-options button').first().click();
    await page.locator('.sf-shop-benefits a[href="#delivery"]').click();
    await page.waitForURL(/#delivery$/);
    await page.getByLabel('Город получения').fill('  Казань  ');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    assert.match(await page.locator('.sf-delivery-result').innerText(), /Казань: 4–7 дн/);
    assert.match(await page.locator('.sf-delivery-result').innerText(), /не онлайн-расчёт СДЭК/);
    await page.reload();
    await page.waitForSelector('.sf-delivery-result');
    assert.equal(await page.getByLabel('Город получения').inputValue(), 'Казань');
    assert.equal(await page.locator('.sf-city-dialog').count(), 0);
    await page.screenshot({ path: `${output}/delivery-${width}.png`, fullPage: true });
    await page.getByLabel('Город получения').fill('Неизвестный город');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    assert.match(await page.locator('.sf-delivery-result').innerText(), /срок и стоимость уточняются/);
    assert.doesNotMatch(await page.locator('.sf-delivery-result').innerText(), /4–7/);
    assert.equal(await page.locator('a[href="https://www.cdek.ru/ru/calculate/"]').getAttribute('target'), '_blank');
    for (const topic of ['privacy', 'consent', 'offer', 'returns']) {
      await page.locator(`footer a[href="#${topic}"]`).click();
      await page.waitForURL(new RegExp(`#${topic}$`));
      await page.locator('.sf-document-draft').waitFor();
      assert.equal(await page.locator('.sf-document-draft').count(), 1);
      assert.equal(await page.locator('main [role="dialog"]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${topic} fits`);
      assert.ok((await page.locator('main').innerText()).includes('Тестовый продавец'));
    }
    await page.getByText(/Возврат товара не прекращает кредитный договор автоматически/).waitFor();
    await page.screenshot({ path: `${output}/returns-${width}.png`, fullPage: true });
    for (const topic of ['warranty', 'supply']) {
      await page.goto(`${base}/#home`);
      await page.locator(`.sf-shop-benefits a[href="#${topic}"]`).click();
      await page.waitForURL(new RegExp(`#${topic}$`));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    // Approved text is displayed as plain text, never executable markup.
    settings.privacy_document = '<img src=x onerror="window.unsafe=true">\nУтверждённая тестовая редакция';
    await page.goto(`${base}/#privacy`);
    await page.reload();
    await page.waitForSelector('.sf-document-body');
    assert.equal(await page.locator('.sf-document-body img').count(), 0);
    assert.equal(await page.locator('.sf-document-draft').count(), 0);
    assert.match(await page.locator('.sf-document-body').innerText(), /<img src=x/);
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: delivery, city persistence, seven page links, document drafts and safe custom text PASS`);
  }
} finally { await browser.close(); }
