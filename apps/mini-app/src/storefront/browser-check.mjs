/** Read-only browser regression suite. Mocks every API write; never creates a real inquiry. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5181';
const output = resolve(process.env.STOREFRONT_QA_OUTPUT || 'test-results/storefront');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const settings = { shop_name: 'G-Partner', city: 'Большой Сочи', phone: '+7 (900) 123-45-67', telegram: '@gpartner_shop', address: 'Тестовый адрес для автоматической проверки', hours: '10:00–18:00', delivery: 'Самовывоз и доставка по согласованию.', payment: 'После подтверждения магазина.', legal_name: 'Тестовый продавец', legal_details: 'Тестовые реквизиты, не опубликованы на реальном сайте.', warranty: 'По документам модели.', inquiries_enabled: true };
const seed = { name: 'Городская модель', description: 'Для поездок по городу. Тестовые данные браузерной проверки.', category: 'kick-scooter', license: 'not-required', license_verified: true, price: 19900, stock_status: 'in-stock', range_km: 25, speed_kmh: 25, power_w: 250, weight_kg: 18, image_url: '/media/test.webp', featured: true, published: true, updated_at: '2026-09-06' };
const products = [
  { ...seed, id: 'city', name: 'Городская модель' },
  { ...seed, id: 'cargo', name: 'Грузовой электроскутер с длинным названием', category: 'scooter', price: 119900, license: 'required', range_km: 80, power_w: 1500 },
  { ...seed, id: 'quote', name: 'Модель под заказ', category: 'scooter', price: null, stock_status: 'preorder', license_verified: false, featured: false },
  { ...seed, id: 'sold', name: 'Проданная модель', stock_status: 'out-of-stock', price: 34900, featured: false },
];
let assertions = 0;
const check = (condition, message) => { assert.ok(condition, message); assertions += 1; };

for (const width of [320, 390, 768, 900, 1440]) {
  const context = await browser.newContext({ viewport: { width, height: width < 900 ? 844 : 1000 } });
  // Storefront regression must not wait on Telegram's external network. This suite
  // covers shopping, not the native Telegram bridge; test that bridge on a device.
  await context.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '/* Telegram bridge excluded from the deterministic browser suite. */' }));
  const page = await context.newPage();
  const countIs = async (selector, expected) => {
    await page.waitForFunction(({ selector, expected }) => document.querySelectorAll(selector).length === expected, { selector, expected });
    return await page.locator(selector).count() === expected;
  };
  const errors = [];
  const submissions = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/settings', route => route.fulfill({ json: { settings } }));
  await page.route('**/api/products', route => route.fulfill({ json: { products } }));
  await page.route('**/media/test.webp', route => route.fulfill({ path: resolve('public/products/city-white.webp'), contentType: 'image/webp' }));
  await page.route('**/api/inquiries', async route => {
    submissions.push({ payload: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    await route.fulfill({ status: 201, json: { inquiry: { id: `QA-${width}`, status: 'new', total: 39800 } } });
  });
  await page.goto(base);
  await page.waitForSelector('.sf-product-card');
  await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
  check(await page.locator('.sf-choice-grid svg').count() === 0, `${width}: no decorative category icons`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: home no overflow`);
  await page.locator('.sf-choice-grid a').nth(1).click();
  await page.waitForURL(/category=scooter/);
  check(await countIs('.sf-product-card', 2), `${width}: transport category works`);
  await page.locator('.sf-filter-toggle').click();
  await page.locator('.sf-filter-options button').nth(1).click();
  check(await countIs('.sf-product-card', 1), `${width}: verified rights combine with category`);
  await page.locator('.sf-filter-panel__actions .sf-button').click();
  check(await page.locator('.sf-filter-panel').isHidden(), `${width}: close filters`);
  await page.locator('.sf-results-heading button').click();
  check(await countIs('.sf-product-card', 4), `${width}: reset all`);
  await page.locator('.sf-search input').fill('Грузовой');
  await page.locator('.sf-search button').click();
  check(await countIs('.sf-product-card', 1), `${width}: search`);
  await page.reload();
  await page.waitForSelector('.sf-product-card');
  check(await page.locator('.sf-product-card').count() === 1, `${width}: query survives reload`);
  await page.locator('.sf-results-heading button').click();
  await page.locator('.sf-view-toggle button').nth(1).click();
  check(await page.locator('.sf-product-grid--list').count() === 1, `${width}: list view`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: list no overflow`);
  await page.locator('.sf-view-toggle button').nth(0).click();
  await page.screenshot({ path: `${output}/catalog-${width}.png`, fullPage: true });
  const city = page.locator('.sf-product-card').filter({ has: page.locator('h3', { hasText: 'Городская модель' }) });
  await city.locator('.sf-favorite').click();
  check(await city.locator('.sf-favorite').getAttribute('aria-pressed') === 'true', `${width}: favorite`);
  for (let index = 0; index < 4; index++) await page.locator('.sf-compare-button').nth(index).click();
  check(await page.locator('.sf-compare-button[aria-pressed=true]').count() === 3, `${width}: compare capped at three`);
  await city.locator('.sf-button').click();
  await page.locator('.sf-header-actions a[href="#cart"]').click();
  await page.waitForURL(/#cart$/);
  await page.locator('.sf-quantity button').nth(1).click();
  check(await page.locator('.sf-quantity output').innerText() === '2', `${width}: cart quantity`);
  await page.reload();
  await page.waitForSelector('.sf-cart-item');
  check(await page.locator('.sf-quantity output').innerText() === '2', `${width}: cart persisted`);
  if (width === 390) {
    for (let index = 0; index < 18; index++) await page.locator('.sf-quantity button').nth(1).click();
    check(await page.locator('.sf-quantity output').innerText() === '20' && await page.locator('.sf-quantity button').nth(1).isDisabled(), 'quantity matches server maximum20');
    for (let index = 0; index < 18; index++) await page.locator('.sf-quantity button').nth(0).click();
  }
  await page.locator('[name=name]').fill('Проверка');
  await page.locator('[name=contact]').fill('+79001234567');
  await page.locator('[name=consent]').check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/cart-${width}.png`, fullPage: true });
  await page.locator('.sf-inquiry button[type=submit]').click();
  await page.waitForSelector('.sf-confirmation');
  check((await page.locator('.sf-confirmation').innerText()).includes(`QA-${width}`), `${width}: actual receipt`);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('gpartner.cart.v1')).length === 0), `${width}: successful inquiry clears sent cart`);
  check(submissions.length === 1 && submissions[0].key?.length >= 16 && submissions[0].payload.items[0].quantity === 2 && !('total' in submissions[0].payload), `${width}: safe actual payload + idempotency`);
  for (const route of ['compare', 'favorites', 'profile', 'menu', 'about', 'city', 'delivery', 'contact', 'guide', 'privacy', 'product/cargo']) {
    await page.goto(`${base}/#${route}`);
    await page.waitForSelector('.sf-page-heading');
    await page.waitForTimeout(90);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${route} no overflow`);
  }
  await page.screenshot({ path: `${output}/product-${width}.png`, fullPage: true });
  await page.goto(`${base}/#profile`);
  check(await page.locator('a[href="/admin"]').count() === 1, `${width}: owner entry`);
  check(await page.locator('a[href="/admin"]').getAttribute('target') === '_blank', `${width}: owner entry escapes Mini App frame`);
  check(errors.length === 0, `${width}: no runtime errors: ${errors.join('; ')}`);
  await context.close();
}

const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.route('**/api/settings', route => route.fulfill({ json: { settings: { ...settings, inquiries_enabled: false } } }));
await page.route('**/api/products', route => route.fulfill({ json: { products: [] } }));
await page.goto(`${base}/#catalog`);
await page.waitForSelector('.sf-empty');
check(await page.locator('.sf-product-card').count() === 0, 'no fabricated demo cards in empty catalogue');
await page.goto(`${base}/#guide`);
await page.waitForSelector('.sf-notice');
check(await page.locator('.sf-inquiry').count() === 0, 'disabled inquiries have no active form');
await page.unroute('**/api/products');
await page.route('**/api/products', route => route.fulfill({ status: 503, json: { error: 'Недоступно' } }));
await page.goto(`${base}/#catalog`);
await page.reload();
await page.waitForSelector('.sf-empty[role=alert]');
check(await page.locator('.sf-empty button').count() === 1, 'catalogue error offers retry');
await context.close();
await browser.close();
console.log(JSON.stringify({ assertions, screenshots: output, result: 'PASS' }));
