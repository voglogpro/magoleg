/** Read-only visual review using the current public catalog. API writes are blocked. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const origin = 'https://bot-1787936996-1241-kponamarev.bothost.tech';
const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5183';
const output = 'test-results/reference-design';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
try {
  const request = await browser.newContext();
  const [productsResponse, settingsResponse] = await Promise.all([
    request.request.get(`${origin}/api/products`), request.request.get(`${origin}/api/settings`),
  ]);
  assert(productsResponse.ok() && settingsResponse.ok());
  const products = await productsResponse.json();
  const settings = await settingsResponse.json();
  const first = products.products.find(product => /M2\+/i.test(product.name)) || products.products[0];
  assert(first, 'A published product is needed for visual review');
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await context.route('**/api/**', async route => {
      if (route.request().method() !== 'GET') return route.abort();
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/products') return route.fulfill({ json: products });
      if (path === '/api/settings') return route.fulfill({ json: settings });
      return route.fulfill({ status: 401, json: { error: 'Unauthenticated review' } });
    });
    await context.route('**/media/**', route => route.fulfill({ path: `public/products/kugoo-2026/${
      (() => { const p = products.products.find(p => p.images?.some(url => route.request().url().endsWith(url)) || route.request().url().endsWith(p.image_url));
        return /M2\+/i.test(p?.name || '') ? 'm2-plus-front-v1.png' : /F3/i.test(p?.name || '') ? 'f3-plus-front-v1.png' : /WISH/i.test(p?.name || '') ? 'wish-01-se-front-v1.png' : 'v3-pro-max-front-v1.png'; })()
    }` }));
    await context.route('https://telegram.org/**', route => route.fulfill({ body: '' }));
    await context.addInitScript(({ id }) => {
      localStorage.setItem('gpartner.city.v1', JSON.stringify({ name: 'Москва', asked: true }));
      localStorage.setItem('gpartner.cart.v1', JSON.stringify([{ product_id: id, quantity: 1 }]));
    }, { id: first.id });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    for (const route of ['home', 'catalog', 'cart']) {
      await page.evaluate(route => { location.hash = route; }, route);
      await page.locator(`.sf-page-${route}`).waitFor();
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(img => img.decode().catch(() => {}))); window.scrollTo(0, 0); });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}/${route}: horizontal overflow`);
      await page.screenshot({ path: `${output}/${route}-${width}.png`, fullPage: true });
      if (route === 'cart') {
        await page.getByRole('button', { name: `Увеличить количество ${first.name}` }).click();
        assert.equal(await page.locator('.sf-quantity output').innerText(), '2');
        await page.getByRole('button', { name: `Уменьшить количество ${first.name}` }).click();
      }
    }
    assert.deepEqual(errors, [], `${width}: runtime errors`);
    console.log(`${width}: home, catalog, cart, quantities, overflow and runtime OK`);
    await context.close();
  }
} finally { await browser.close(); }
