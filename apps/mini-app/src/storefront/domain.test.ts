import { describe, expect, it } from 'vitest';
import { cargoLabel, cartTotal, catalogHref, effectiveLicense, filterProducts, money, parseFilters, phoneLink, plural, powerLabel, powerTotal, productImage, sanitizeCart, sanitizeIds, smartPicks, telegramLink } from './domain';
import { categoryLabels, defaultFilters, vehicleCategories, type Category, type Product } from './types';

const product: Product = { id: 'one', name: 'Модель один', description: 'Для города', category: 'scooter', license: 'not-required', license_verified: true, price: 10000, stock_status: 'in-stock', range_km: 40, speed_kmh: 25, power_w: 250, weight_kg: 18, cargo_l: 30, payload_kg: 120, drive: 'single', image_url: '/media/products/one.webp', images: ['/media/products/one.webp'], featured: false, published: true, tags: ['courier'], badge: '', updated_at: '2026-09-06' };

describe('catalogue filtering', () => {
  it('round-trips every category offered by the shared public and admin labels', () => {
    for (const category of Object.keys(categoryLabels) as Category[]) {
      expect(parseFilters(catalogHref({ category }).split('?')[1]).category).toBe(category);
    }
  });
  it('filters ATVs as vehicles without implying a verified driving-rights classification', () => {
    const atv: Product = { ...product, id: 'quad', category: 'atv', license: 'unknown', license_verified: false };
    expect(categoryLabels.atv).toBe('Квадроциклы');
    expect(vehicleCategories).toContain('atv');
    expect(filterProducts([product, atv], { ...defaultFilters, category: 'atv' })).toEqual([atv]);
    expect(filterProducts([atv], { ...defaultFilters, category: 'atv', license: 'not-required' })).toEqual([]);
  });
  it('never presents an unverified rights classification as confirmed', () => {
    const unchecked = { ...product, id: 'unchecked', license_verified: false };
    expect(effectiveLicense(unchecked)).toBe('unknown');
    expect(filterProducts([product, unchecked], { ...defaultFilters, license: 'not-required' })).toEqual([product]);
    expect(filterProducts([unchecked], { ...defaultFilters, license: 'unknown' })).toEqual([unchecked]);
  });
  it('combines category, availability and price without mutating products', () => {
    const another = { ...product, id: 'two', category: 'kick-scooter' as const };
    const unpublished = { ...product, id: 'hidden', published: false };
    const source = [another, product, unpublished];
    expect(filterProducts(source, { ...defaultFilters, category: 'scooter', stock: 'in-stock', min: '9000', max: '11000' })).toEqual([product]);
    expect(source[0]).toBe(another);
  });
  it('puts price-on-request last in either price sort and excludes it from price ranges', () => {
    const unknown = { ...product, id: 'unknown', price: null };
    const expensive = { ...product, id: 'expensive', price: 20000 };
    expect(filterProducts([unknown, product, expensive], { ...defaultFilters, sort: 'price-desc' }).map(item => item.id)).toEqual(['expensive', 'one', 'unknown']);
    expect(filterProducts([unknown, product], { ...defaultFilters, min: '0' })).toEqual([product]);
  });
  it('narrows the catalogue to a smart pick the shop ticked', () => {
    const other = { ...product, id: 'two', tags: [] };
    expect(filterProducts([product, other], { ...defaultFilters, tag: 'courier' })).toEqual([product]);
    expect(filterProducts([product, other], { ...defaultFilters, tag: 'women' })).toEqual([]);
  });
  it('round-trips shareable filter URLs and rejects invalid parameters', () => {
    const filters = { ...defaultFilters, category: 'scooter' as const, tag: 'courier' as const, license: 'required' as const, min: '5000', sort: 'price-asc' as const };
    expect(parseFilters(catalogHref(filters).split('?')[1])).toEqual(filters);
    expect(parseFilters('category=spaceship&tag=unicorn&license=free&min=-1&max=NaN&sort=code')).toEqual(defaultFilters);
    expect(parseFilters('filters=open')).toEqual(defaultFilters);
  });
});

describe('smart picks', () => {
  const licensed: Product = { ...product, id: 'two', tags: [], license: 'required', stock_status: 'preorder' };
  it('offers picks the shop ticked and picks the products themselves imply', () => {
    const picks = smartPicks([product, licensed]);
    expect(picks.map(pick => pick.label)).toEqual(['Усиленные', 'Легкие', 'Для курьеров', 'Подростковая серия']);
    expect(picks.map(pick => pick.count)).toEqual([0, 0, 1, 0]);
    expect(picks[2].filters).toEqual({ tag: 'courier', sort: 'value' });
  });
  it('keeps four themes but never counts unpublished or unrelated products', () => {
    expect(smartPicks([{ ...product, published: false }]).map(pick => pick.count)).toEqual([0, 0, 0, 0]);
    expect(smartPicks([licensed]).every(pick => pick.count === 0)).toBe(true);
  });
  it('requires an explicit teen tag; budget and beginner tags never imply age suitability', () => {
    const items = [
      { ...licensed, id: 'teen', tags: ['teen'] as Product['tags'] },
      { ...licensed, id: 'beginner', tags: ['beginner'] as Product['tags'], price: 10000 },
      { ...licensed, id: 'cheap', price: 5000 },
    ];
    const pick = smartPicks(items).find(pick => pick.id === 'tag-teen')!;
    expect(pick.count).toBe(1);
    expect(pick.label).toBe('Подростковая серия');
    const filters = parseFilters(catalogHref(pick.filters).split('?')[1]);
    expect(filterProducts(items, filters).map(item => item.id)).toEqual(['teen']);
    expect(smartPicks(items).some(pick => ['stock-in-stock', 'budget-50000'].includes(pick.id))).toBe(false);
  });
  it('leaves rights requirements to the filter panel instead of naming a pick', () => {
    expect(smartPicks([product, licensed]).map(pick => pick.id).join()).not.toContain('license');
  });
  it('ranks a pick by value: cheaper, longer range and a roomier trunk win', () => {
    const cheap = { ...product, id: 'cheap', name: 'А', price: 10000, range_km: 20, cargo_l: 0 };
    const roomy = { ...product, id: 'roomy', name: 'Б', price: 20000, range_km: 100, cargo_l: 60 };
    const dear = { ...product, id: 'dear', name: 'В', price: 30000, range_km: 25, cargo_l: 5 };
    expect(filterProducts([dear, roomy, cheap], { ...defaultFilters, sort: 'value' }).map(item => item.id)).toEqual(['roomy', 'cheap', 'dear']);
  });
  it('keeps price-on-request below an otherwise identical priced model', () => {
    const priced = { ...product, id: 'priced', name: 'А' };
    const onRequest = { ...product, id: 'on-request', name: 'Б', price: null };
    expect(filterProducts([onRequest, priced], { ...defaultFilters, sort: 'value' }).map(item => item.id)).toEqual(['priced', 'on-request']);
  });
  it('counts models in readable Russian', () => {
    expect([1, 2, 5, 11, 21, 104].map(count => plural(count, ['модель', 'модели', 'моделей']))).toEqual(['модель', 'модели', 'моделей', 'моделей', 'модель', 'модели']);
  });
});

describe('persistent customer selections', () => {
  it('preserves kopeks and sums prices in integer minor units', () => {
    expect(money(42500.5).replace(/\s/g, '')).toBe('42500,50₽');
    expect(money(42500).replace(/\s/g, '')).toBe('42500₽');
    expect(cartTotal([{ product_id: 'one', quantity: 3 }], [{ ...product, price: 0.1 }]).knownTotal).toBe(0.3);
  });
  it('ignores corrupted, duplicate or excessive local cart quantities', () => {
    expect(sanitizeCart([{ product_id: 'one', quantity: 2 }, { product_id: 'one', quantity: 4 }, { product_id: 'bad', quantity: -1 }, { product_id: 'huge', quantity: 100 }, { product_id: 'str', quantity: '1' }, null])).toEqual([{ product_id: 'one', quantity: 2 }]);
    expect(sanitizeCart({ not: 'an array' })).toEqual([]);
    expect(sanitizeCart([{ product_id: 'max', quantity: 20 }, { product_id: 'over', quantity: 21 }])).toEqual([{ product_id: 'max', quantity: 20 }]);
    expect(sanitizeIds(['one', 'one', '', 7, 'two', 'three', 'four'], 3)).toEqual(['one', 'two', 'three']);
  });
  it('separates known totals, unknown prices and unavailable products', () => {
    expect(cartTotal([{ product_id: 'one', quantity: 2 }, { product_id: 'missing', quantity: 1 }], [product])).toEqual({ knownTotal: 20000, unknownPrices: 1, unavailable: 1 });
    expect(cartTotal([{ product_id: 'one', quantity: 2 }], [{ ...product, price: null }])).toEqual({ knownTotal: 0, unknownPrices: 2, unavailable: 0 });
  });
});

describe('safe media and contact links', () => {
  it('accepts only same-site uploaded media and shipped catalogue paths', () => {
    expect(productImage('/media/products/one.webp')).toBe('/media/products/one.webp');
    expect(productImage('/products/kugoo-current/m4-front.jpg')).toBe('/products/kugoo-current/m4-front.jpg');
    expect(productImage('/products/kugoo-current/m4-front.webp')).toBe('/products/kugoo-current/m4-front.webp');
    for (const bad of ['https://evil.test/a.png', '//evil.test/a', '/media/../secret', 'javascript:alert(1)', '/products/demo.jpg']) expect(productImage(bad)).toBe('');
  });
  it('validates telephone and Telegram destinations', () => {
    expect(phoneLink('+7 (900) 123-45-67')).toBe('tel:+79001234567');
    expect(phoneLink('help')).toBe('');
    expect(telegramLink('@gpartner_shop')).toBe('https://t.me/gpartner_shop');
    expect(telegramLink('https://t.me/gpartner_shop')).toBe('https://t.me/gpartner_shop');
    expect(telegramLink('https://evil.test/gpartner_shop')).toBe('');
    expect(telegramLink('javascript:alert(1)')).toBe('');
  });
});

describe('характеристики модели', () => {
  it('показывает мощность на один мотор, а при полном приводе — умножает на два', () => {
    expect(powerLabel({ power_w: 1100, drive: 'single' })).toBe('1100 Вт');
    expect(powerLabel({ power_w: 1100, drive: 'dual' })).toBe('2 × 1100 Вт');
    expect(powerTotal({ power_w: 1100, drive: 'dual' })).toBe(2200);
    expect(powerTotal({ power_w: 1100, drive: 'single' })).toBe(1100);
    expect(powerLabel({ power_w: null, drive: 'dual' })).toBe('');
    expect(powerTotal({ power_w: null, drive: 'dual' })).toBeNull();
  });

  it('отличает отсутствие багажника от неизвестного объёма', () => {
    expect(cargoLabel(null)).toBe('Уточняется');
    expect(cargoLabel(0)).toBe('Нет');
    expect(cargoLabel(30)).toBe('30 л');
  });

  it('фильтрует каталог по категориям прав A, M и «без прав»', () => {
    const models = [
      { ...product, id: 'a', license: 'a' as const },
      { ...product, id: 'm', license: 'm' as const },
      { ...product, id: 'none', license: 'not-required' as const },
      { ...product, id: 'draft', license: 'a' as const, license_verified: false },
    ];
    for (const [license, expected] of [['a', ['a']], ['m', ['m']], ['not-required', ['none']]] as const)
      expect(filterProducts(models, { ...defaultFilters, license }).map(item => item.id)).toEqual([...expected]);
    // Непроверенные документы никогда не выдаются за подтверждённую категорию.
    expect(filterProducts(models, { ...defaultFilters, license: 'unknown' }).map(item => item.id)).toEqual(['draft']);
    expect(parseFilters(catalogHref({ license: 'm' }).split('?')[1]).license).toBe('m');
  });
});
