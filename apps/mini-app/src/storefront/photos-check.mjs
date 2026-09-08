/** Local-only visual check of the real Kugoo assets; all catalogue data is mocked. */
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5192';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local preview only');
const manifest = resolve('../../docs/catalog-kugoo.json');
const cards = JSON.parse(await readFile(manifest, 'utf8'));
const media = new Map();
const products = cards.map(({ photo_files, ...card }, index) => {
  const images = photo_files.map((file, angle) => {
    const url = `/media/${String(index * 2 + angle + 1).padStart(32, '0')}.webp`;
    media.set(url, resolve('../../docs', file));
    return url;
  });
  // Publication here is only a browser fixture; no request writes to any CRM.
  return { ...card, id: `kugoo-${index}`, published: true, images, image_url: images[0], updated_at: '2026-09-06' };
});
const output = resolve('test-results/kugoo-photos');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://telegram.org/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    await page.route('**/api/**', route => {
      assert.equal(route.request().method(), 'GET', 'No writes from the photo review');
      const path = new URL(route.request().url()).pathname;
      const json = path === '/api/products' ? { products }
        : path === '/api/settings' ? { settings: {} } : { account: null };
      return route.fulfill({ json });
    });
    await page.route('**/media/**', route => {
      const path = media.get(new URL(route.request().url()).pathname);
      assert.ok(path, 'Only prepared product photos');
      return route.fulfill({ path, contentType: 'image/png' });
    });
    await page.goto(base);
    await page.locator('.sf-city-options button').first().click();
    await page.waitForSelector('.sf-home-picks .sf-pick-card');
    const benefits = page.locator('.sf-shop-benefits');
    assert.equal(await benefits.locator('li').count(), 3);
    assert.equal((await benefits.innerText()).replace(/\s+/g, ' ').trim(), 'Доставка от 3-х дней Гарантия 12 месяцев Прямые поставки');
    const benefitBounds = await benefits.boundingBox();
    const pickBounds = await page.locator('.sf-home-picks').boundingBox();
    assert.ok(benefitBounds.y + benefitBounds.height <= pickBounds.y, 'Store promises sit above the smart picks without overlap');
    assert.ok(await benefits.evaluate(node => node.scrollWidth <= node.clientWidth), 'Benefits fit on narrow screens');
    assert.equal(await page.locator('.sf-home-picks a').filter({ hasText: 'В наличии сейчас' }).count(), 0);
    await benefits.screenshot({ path: `${output}/benefits-${width}.png` });
    const picks = await page.locator('.sf-home-picks .sf-pick-card').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
    }));
    assert.equal(picks.length, 4, 'Four useful selections for the four real product fixtures');
    if (width < 700) {
      assert.equal(picks[0].y, picks[1].y, 'First row has two tiles');
      assert.equal(picks[2].y, picks[3].y, 'Second row has two tiles');
      assert.ok(picks[2].y >= picks[0].bottom, 'Rows never overlap');
      assert.ok(picks.every(pick => pick.x >= 0 && pick.right <= width), 'All picks are visible without horizontal scrolling');
    }
    await page.locator('.sf-home-picks').screenshot({ path: `${output}/picks-${width}.png` });
    await page.goto(`${base}/#catalog`);
    await page.waitForSelector('.sf-product-card');
    assert.equal(await page.locator('.sf-product-card').count(), 4);
    const dimensions = await page.locator('.sf-product-card').evaluateAll(nodes => nodes.map(node => ({
      width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height,
      body: node.querySelector('.sf-product-card__body').getBoundingClientRect().height,
    })));
    assert.ok(dimensions.every(card => card.body < 310), 'Product summaries remain compact without full descriptions');
    if (width >= 1150) assert.ok(dimensions.every(card => card.width < 260), 'Desktop marketplace-sized cards');
    for (const button of await page.locator('.sf-card-actions > *').all()) {
      const bounds = await button.boundingBox();
      assert.ok(bounds.width >= 44 && bounds.height >= 44, 'Accessible compact card actions');
    }
    console.log(JSON.stringify({ width, cards: dimensions }));
    for (const photo of await page.locator('.sf-product-card .sf-product-photo img').all()) {
      await photo.scrollIntoViewIfNeeded();
      await photo.evaluate(image => image.decode());
      assert.equal(await photo.evaluate(image => getComputedStyle(image).objectFit), 'contain');
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: `${output}/catalog-${width}.png`, fullPage: true });
    for (let index = 0; index < products.length; index++) {
      await page.goto(`${base}/#product/kugoo-${index}`);
      await page.waitForSelector('.sf-gallery');
      await page.getByRole('button', { name: 'Фото 2', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sf-gallery__counter')?.textContent === '2 / 2');
      await page.locator('.sf-gallery__track img').nth(1).evaluate(image => image.decode());
      await page.getByRole('button', { name: 'Фото 1', exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.sf-gallery__counter')?.textContent === '1 / 2');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width}: no horizontal overflow`);
      await page.screenshot({ path: `${output}/product-${index}-${width}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    await page.close();
    console.log(`${width}px: four cards, eight photos, gallery navigation and layout passed`);
  }
} finally {
  await browser.close();
}
