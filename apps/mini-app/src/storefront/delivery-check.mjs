/** Local-only delivery/legal regression. Every API request uses fictional fixtures. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const base = process.env.STOREFRONT_QA_URL || 'http://127.0.0.1:5192';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const output = resolve('test-results/delivery-documents');
await mkdir(output, { recursive: true });
/** CHROMIUM_PATH позволяет запустить проверку на предустановленном браузере окружения. */
const launchOptions = { headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) };
const browser = await chromium.launch(launchOptions);
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const settings = {
      shop_name: 'G-Partner', delivery_origin: 'Тестовый склад — не реальные условия',
      delivery_schedule: 'Казань; 4; 7; по тарифам перевозчика',
      legal_name: '', legal_details: '', contacts_document: '',
      phone: '+7 (900) 123-45-67', inquiries_enabled: false,
      payment_sbp: 'on', payment_card: 'off', payment_installment: 'off', payment_invoice: 'off',
      payment_on_delivery: 'off', payment_provider: '', payment_installment_partner: '', payment_receipt: '',
    };
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      assert.equal(route.request().method(), 'GET', 'Public pages do not submit data');
      return route.fulfill({ json: path === '/api/settings' ? { settings } : path === '/api/products' ? { products: [] } : { account: null } });
    });
    await page.goto(base);
    // Один тап по городу сохраняет выбор и не уводит страницу вниз.
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator('.sf-city-options button').first().click();
    assert.equal(await page.locator('.sf-city-dialog').count(), 0, 'Первое нажатие закрывает выбор города');
    assert.match(await page.locator('.sf-city-bar').innerText(), /Москва/);
    assert.equal(await page.evaluate(() => Math.round(scrollY)), 0, 'Страница остаётся на месте после выбора города');
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).position), 'static');
    await page.locator('.sf-shop-benefits a[href="#delivery"]').click();
    await page.waitForURL(/#delivery$/);
    await page.getByLabel('Город получения').fill('  Казань  ');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    assert.match(await page.locator('.sf-delivery-result').innerText(), /Казань: 4–7 дн/);
    assert.match(await page.locator('.sf-delivery-result').innerText(), /Точная оценка магазина/);
    // Города без отдельной строки получают оценку своего федерального округа.
    await page.getByLabel('Город получения').fill('Владивосток');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    assert.match(await page.locator('.sf-delivery-result').innerText(), /Владивосток: 2–3 недели/);
    assert.match(await page.locator('.sf-delivery-result').innerText(), /не онлайн-расчёт СДЭК/);
    assert.equal(await page.locator('.sf-zone-grid .sf-zone-card').count(), 7);
    // Самовывоз не предлагается как способ получения — оферта прямо это фиксирует.
    assert.match(await page.locator('main').innerText(), /Самовывоз со склада продавца не предусмотрен/);
    assert.doesNotMatch(await page.locator('main').innerText(), /География, сроки и стоимость/);
    await page.getByLabel('Город получения').fill('Казань');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    await page.reload();
    await page.waitForSelector('.sf-delivery-result');
    assert.equal(await page.getByLabel('Город получения').inputValue(), 'Казань');
    assert.equal(await page.locator('.sf-city-dialog').count(), 0);
    await page.screenshot({ path: `${output}/delivery-${width}.png`, fullPage: true });
    await page.getByLabel('Город получения').fill('Неизвестный город');
    await page.getByRole('button', { name: 'Показать сроки' }).click();
    assert.match(await page.locator('.sf-delivery-result').innerText(), /срок и стоимость уточняются/);
    assert.doesNotMatch(await page.locator('.sf-delivery-result').innerText(), /4–7/);
    assert.equal(await page.locator('a[href="https://www.cdek.ru/ru/calculate/"]').count(), 0);
    // Подвал несёт только обязательные документы и строку реквизитов продавца.
    assert.equal(await page.locator('footer nav a').count(), 3);
    assert.match(await page.locator('.sf-footer__legal').innerText(), /ИНН 231518680513.+ОГРНИП 326237500411962/s);
    for (const topic of ['offer', 'privacy', 'returns']) {
      await page.locator(`footer a[href="#${topic}"]`).click();
      await page.waitForURL(new RegExp(`#${topic}$`));
      await page.locator('.sf-info-section').first().waitFor();
      assert.equal(await page.locator('main [role="dialog"]').count(), 0);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: ${topic} fits`);
    }
    // Утверждённые редакции публикуются без пометки «базовый проект»; возврат ещё черновик.
    await page.goto(`${base}/#offer`);
    await page.locator('.sf-info-section').first().waitFor();
    assert.equal(await page.locator('.sf-document-draft').count(), 0);
    assert.match(await page.locator('main').innerText(), /Свиридовой А\.Ю\./);
    assert.match(await page.locator('main').innerText(), /ОГРНИП: 326237500411962/);
    await page.goto(`${base}/#consent`);
    await page.locator('.sf-info-section').first().waitFor();
    assert.equal(await page.locator('.sf-document-draft').count(), 0);
    assert.match(await page.locator('main').innerText(), /infog-partner@mail\.ru/);
    await page.goto(`${base}/#returns`);
    await page.locator('.sf-document-draft').waitFor();
    await page.getByText(/Возврат товара не прекращает кредитный договор автоматически/).waitFor();
    await page.screenshot({ path: `${output}/returns-${width}.png`, fullPage: true });
    // Зона оплаты: неподключённый способ никогда не выглядит рабочим.
    await page.goto(`${base}/#payment`);
    await page.locator('.sf-pay-grid').waitFor();
    const payment = await page.locator('main').innerText();
    // Работает только СБП; способы, которые магазин не подключил, не показываются вовсе.
    assert.match(payment, /Система быстрых платежей/);
    assert.match(payment, /(^|\n)Доступно(\n|$)/);
    assert.doesNotMatch(payment, /Рассрочка и кредит|Оплата при получении|Банковской картой/);
    assert.match(payment, /никогда не просит номер карты/);
    assert.equal(await page.locator('.sf-pay-card').count(), 1);
    assert.equal(await page.locator('.sf-steps li').count(), 4);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}: оплата помещается`);
    await page.screenshot({ path: `${output}/payment-${width}.png`, fullPage: true });
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
    console.log(`${width}px: округа доставки, один тап по городу, оплата, документы и безопасный пользовательский текст PASS`);
  }
} finally { await browser.close(); }
