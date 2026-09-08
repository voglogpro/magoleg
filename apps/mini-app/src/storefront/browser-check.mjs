/** Read-only browser regression suite. Mocks every API write; never creates a real inquiry. */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5181';
const output = resolve(process.env.STOREFRONT_QA_OUTPUT || 'test-results/storefront');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const settings = { shop_name: 'G-Partner', phone: '+7 (900) 123-45-67', telegram: '@gpartner_shop', address: 'Тестовый адрес для автоматической проверки', hours: '10:00–18:00', delivery: 'Самовывоз и доставка по согласованию.', payment: 'После подтверждения магазина.', legal_name: 'Тестовый продавец', legal_details: 'Тестовые реквизиты, не опубликованы на реальном сайте.', warranty: 'По документам модели.', inquiries_enabled: true };
const seed = { name: 'Городская модель', description: 'Для поездок по городу. Тестовые данные браузерной проверки.', category: 'kick-scooter', license: 'not-required', license_verified: true, price: 19900, stock_status: 'in-stock', range_km: 25, speed_kmh: 25, power_w: 250, weight_kg: 18, cargo_l: 30, image_url: '/media/test.webp', images: ['/media/test.webp', '/media/test-2.webp'], featured: true, published: true, tags: [], badge: '', updated_at: '2026-09-06' };
const products = [
  { ...seed, id: 'city', name: 'Городская модель', images: ['/media/test.webp'] },
  { ...seed, id: 'cargo', name: 'Грузовой электроскутер с длинным названием', category: 'scooter', price: 119900, license: 'required', range_km: 80, power_w: 1500, tags: ['courier', 'heavy-rider'], badge: 'hit' },
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
  await page.route('**/media/test-2.webp', route => route.fulfill({ path: resolve('public/products/city-dark.webp'), contentType: 'image/webp' }));
  let accountState = { account: null };
  await page.route('**/api/account', route => route.fulfill({ json: accountState }));
  await page.route('**/api/admin/session', route => route.fulfill({ status: 401, json: { error: 'Войдите в кабинет.' } }));
  await page.route('**/api/account/logout', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/api/account/inquiries', route => route.fulfill({ json: { inquiries: [] } }));
  await page.route('**/api/account/login', async route => {
    const body = route.request().postDataJSON();
    if (body?.contact === 'owner' && body?.password === 'owner-password') await route.fulfill({ json: { role: 'owner', username: 'owner', csrfToken: 'qa-token' } });
    else await route.fulfill({ status: 401, json: { error: 'Неверный логин или пароль.' } });
  });
  await page.route('**/api/account/register', route => route.fulfill({
    json: { role: 'customer', account: { name: 'Проверка', contact: '+79001234567', city: 'Краснодар' }, csrfToken: 'qa-token' },
  }));
  await page.route('**/api/inquiries', async route => {
    submissions.push({ payload: route.request().postDataJSON(), key: route.request().headers()['idempotency-key'] });
    await route.fulfill({ status: 201, json: { inquiry: { id: `QA-${width}`, status: 'new', total: 39800 } } });
  });
  await page.goto(base);
  await page.waitForSelector('.sf-city-dialog');
  check(await page.locator('.sf-city-dialog').isVisible(), `${width}: a first visit is asked for its city`);
  await page.locator('.sf-city-options button').first().click();
  await page.waitForSelector('.sf-product-card');
  check((await page.locator('.sf-city-bar').innerText()).includes('Москва'), `${width}: the chosen city stays on screen`);
  await page.reload();
  await page.waitForSelector('.sf-product-card');
  check(await page.locator('.sf-city-dialog').count() === 0, `${width}: the city is asked only once`);
  await page.screenshot({ path: `${output}/home-${width}.png`, fullPage: true });
  check(await page.locator('.sf-search').count() === 0, `${width}: no catalogue search field`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: home no overflow`);
  check(await page.locator('.sf-home-selection').count() === 0, `${width}: home no longer repeats the catalogue tab`);
  check(await page.locator('.sf-home-picks .sf-pick-card').count() === 3, `${width}: picks lead the home page`);
  check(await page.locator('.sf-home-picks .sf-pick-art svg').count() === 3, `${width}: every pick carries its own icon`);
  check(await page.locator('.sf-home-picks .sf-pick-art img').count() === 0, `${width}: a pick tile never borrows a product photo`);
  check(await page.locator('.sf-badge').first().innerText() === 'Хит продаж', `${width}: the shop badge rides on the card`);
  await page.locator('.sf-pick-card').first().click();
  await page.waitForURL(/tag=.*sort=value|sort=value.*tag=/);
  check(await countIs('.sf-product-card', 1), `${width}: a smart pick narrows the catalogue`);
  await page.goto(`${base}/#picks`);
  await page.waitForSelector('.sf-pick-card');
  check(await countIs('.sf-pick-card', 3), `${width}: the picks page offers every selection that has models`);
  check(await page.evaluate(() => [...document.querySelectorAll('.sf-pick-card')].every(link => !link.href.includes('license'))), `${width}: rights are a filter, not a pick`);
  const inStock = page.locator('.sf-pick-card').filter({ hasText: 'В наличии сейчас' });
  check((await inStock.innerText()).includes('2 модели'), `${width}: a pick counts its models`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: picks no overflow`);
  await page.screenshot({ path: `${output}/picks-${width}.png`, fullPage: true });
  await inStock.click();
  await page.waitForURL(/stock=in-stock/);
  check(await countIs('.sf-product-card', 2), `${width}: a pick the products imply filters the catalogue`);
  await page.locator('.sf-results-heading button').click();
  await page.goto(`${base}/#catalog?category=scooter`);
  await page.waitForSelector('.sf-catalog');
  check(await page.locator('.sf-catalog .sf-category-tabs button').count() === 7, `${width}: every catalogue category including ATVs is offered`);
  check(await countIs('.sf-product-card', 2), `${width}: transport category works`);
  await page.locator('.sf-filter-toggle').click();
  check(await page.locator('.sf-filter-panel > div').first().locator('.sf-filter-options button').count() === 7, `${width}: every smart pick is filterable`);
  await page.locator('.sf-filter-panel > div').nth(1).locator('.sf-filter-options button').nth(1).click();
  check(await countIs('.sf-product-card', 1), `${width}: verified rights combine with category`);
  await page.locator('.sf-filter-panel__actions .sf-button').click();
  check(await page.locator('.sf-filter-panel').isHidden(), `${width}: close filters`);
  check(await page.locator('.sf-filter-toggle .sf-count').innerText() === '2', `${width}: filter icon counts hidden filters`);
  await page.locator('.sf-results-heading button').click();
  check(await countIs('.sf-product-card', 4), `${width}: reset all`);
  await page.locator('.sf-quick-stock input').check();
  check(await countIs('.sf-product-card', 2), `${width}: quick availability filter`);
  await page.reload();
  await page.waitForSelector('.sf-product-card');
  check(await page.locator('.sf-quick-stock input').isChecked(), `${width}: availability filter survives reload in URL`);
  await page.locator('.sf-quick-stock input').uncheck();
  check(await countIs('.sf-product-card', 4), `${width}: availability filter resets`);
  await page.locator('.sf-category-tabs button').filter({ hasText: 'Квадроциклы' }).click();
  check(await countIs('.sf-product-card', 0), `${width}: empty ATV category never substitutes unrelated vehicles`);
  check(await page.locator('.sf-empty').isVisible(), `${width}: useful empty-category response`);
  await page.locator('.sf-results-heading button').click();
  await page.goto(`${base}/#catalog?filters=open`);
  await page.waitForSelector('.sf-product-card');
  check(await page.locator('.sf-filter-panel').isVisible(), `${width}: home filter icon opens the panel`);
  await page.locator('.sf-filter-panel__actions .sf-button').click();
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
  check(await page.locator('.sf-inquiry [name=city]').inputValue() === 'Москва', `${width}: the order carries the chosen city`);
  await page.locator('[name=consent]').check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: `${output}/cart-${width}.png`, fullPage: true });
  await page.locator('.sf-inquiry button[type=submit]').click();
  await page.waitForSelector('.sf-confirmation');
  check((await page.locator('.sf-confirmation').innerText()).includes(`QA-${width}`), `${width}: actual receipt`);
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('gpartner.cart.v1')).length === 0), `${width}: successful inquiry clears sent cart`);
  check(submissions.length === 1 && submissions[0].key?.length >= 16 && submissions[0].payload.items[0].quantity === 2 && !('total' in submissions[0].payload), `${width}: safe actual payload + idempotency`);
  check(submissions[0].payload.city === 'Москва', `${width}: the shop learns where the order goes`);
  for (const route of ['compare', 'favorites', 'profile', 'menu', 'about', 'delivery', 'contact', 'guide', 'privacy', 'product/cargo']) {
    await page.goto(`${base}/#${route}`);
    await page.waitForSelector('.sf-page-heading');
    await page.waitForTimeout(90);
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${route} no overflow`);
  }
  check(await page.locator('.sf-gallery__track > *').count() === 2, `${width}: the product page shows every photo of the model`);
  check((await page.locator('.sf-gallery__counter').innerText()) === '1 / 2', `${width}: the gallery counts from the first photo`);
  await page.locator('.sf-gallery__thumbs button').nth(1).click();
  await page.waitForFunction(() => document.querySelector('.sf-gallery__counter')?.textContent === '2 / 2');
  check(await page.locator('.sf-gallery__thumbs button').nth(1).getAttribute('aria-pressed') === 'true', `${width}: a thumbnail moves the gallery and marks itself current`);
  await page.waitForTimeout(400);  // let the smooth scroll settle before the screenshot
  await page.screenshot({ path: `${output}/product-${width}.png`, fullPage: true });
  await page.goto(`${base}/#product/city`);
  await page.waitForSelector('.sf-product-detail');
  check(await page.locator('.sf-gallery').count() === 0, `${width}: a single-photo model keeps the plain photo`);
  await page.goto(`${base}/#profile`);
  await page.waitForSelector('.sf-login-form');
  await page.locator('.sf-login-form [name=contact]').fill('owner');
  await page.locator('.sf-login-form [name=password]').fill('wrong-password');
  await page.locator('.sf-login-form button[type=submit]').click();
  await page.waitForSelector('.sf-account-card .sf-error');
  check((await page.locator('.sf-account-card .sf-error').innerText()).includes('Неверный'), `${width}: rejected sign-in explains itself`);
  await page.locator('.sf-account-tabs button').nth(1).click();
  await page.locator('.sf-login-form [name=name]').fill('Проверка');
  await page.locator('.sf-login-form [name=contact]').fill('+79001234567');
  await page.locator('.sf-login-form [name=city]').fill('Краснодар');
  await page.locator('.sf-login-form [name=password]').fill('qa-account-password');
  accountState = { account: { name: 'Проверка', contact: '+79001234567', city: 'Краснодар' }, csrfToken: 'qa-token' };
  await page.locator('.sf-login-form button[type=submit]').click();
  await page.waitForSelector('.sf-history-title');
  check((await page.locator('.sf-account-card').innerText()).includes('+79001234567'), `${width}: registered shopper sees their account`);
  accountState = { account: null };
  await page.locator('.sf-account-leave').click();
  await page.waitForSelector('.sf-account-tabs');
  await page.locator('.sf-account-tabs button').nth(0).click();
  await page.locator('.sf-login-form [name=contact]').fill('owner');
  await page.locator('.sf-login-form [name=password]').fill('owner-password');
  await page.locator('.sf-login-form button[type=submit]').click();
  await page.waitForSelector('.sf-account-card a[href="/admin"]');
  check(await page.locator('.sf-account-card a[href="/admin"]').getAttribute('target') === '_blank', `${width}: owner panel escapes Mini App frame`);
  await page.goto(`${base}/#home`);
  await page.waitForSelector('.sf-product-card');
  check(await page.locator('.sf-bottom-nav a[href="#favorites"]').count() === 0, `${width}: favourites left the bottom bar`);
  check(await page.locator('.sf-header-actions a[href="#favorites"]').isVisible(), `${width}: favourites sit beside the cart`);
  check(!(await page.locator('.sf-store').innerText()).includes('Сочи'), `${width}: no single-city claim`);
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
