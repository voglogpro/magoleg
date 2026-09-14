import { activePickTags, categoryLabels, defaultFilters, MAX_CART_MODELS, MAX_QUANTITY, tagHints, tagLabels, type CartItem, type Category, type CityChoice, type Filters, type Product, type SmartPick } from './types';

/** Мощность указывается на один мотор: полный привод показывается как «2 × 1100 Вт». */
export const powerLabel = (product: Pick<Product, 'power_w' | 'drive'>) =>
  product.power_w === null ? '' : product.drive === 'dual' ? `2 × ${product.power_w} Вт` : `${product.power_w} Вт`;
export const powerTotal = (product: Pick<Product, 'power_w' | 'drive'>) =>
  product.power_w === null ? null : product.drive === 'dual' ? product.power_w * 2 : product.power_w;
/** Ноль литров — это осознанная отметка «багажника нет», а не неизвестное значение. */
export const cargoLabel = (value: number | null) => value === null ? 'Уточняется' : value === 0 ? 'Нет' : `${value} л`;

export const money = (value: number | null) => value === null ? 'Цена по запросу' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
export const effectiveLicense = (product: Product) => product.license_verified === true ? product.license : 'unknown';
export const productImage = (value: string) => (/^\/media\/[a-zA-Z0-9_./-]+$/.test(value)
  || /^\/products\/kugoo-current\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(value)) && !value.includes('..') ? value : '';
export const phoneLink = (value: string) => {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 15 ? `tel:${value.trim().startsWith('+') ? '+' : ''}${digits}` : '';
};
export const telegramLink = (value: string) => {
  const name = value.trim().replace(/^https:\/\/t\.me\//i, '').replace(/^@/, '');
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name) ? `https://t.me/${name}` : '';
};

/**
 * «Выгодные сначала»: a cheaper price, a longer range and a roomier trunk each push a model up.
 * Every metric is scaled inside the current result set, so the order answers "what is the best
 * deal among these models", not "which number is the biggest in the shop". An unknown metric
 * scores zero, which keeps price-on-request models from floating to the top of a value ranking.
 */
function valueScores(products: Product[]) {
  const spread = (read: (product: Product) => number | null) => {
    const values = products.map(read).filter((value): value is number => value !== null);
    return values.length ? { min: Math.min(...values), max: Math.max(...values) } : null;
  };
  const scale = (value: number | null, range: { min: number; max: number } | null, higherIsBetter: boolean) => {
    if (value === null || range === null) return 0;
    if (range.max === range.min) return 1;
    const share = (value - range.min) / (range.max - range.min);
    return higherIsBetter ? share : 1 - share;
  };
  const price = spread(product => product.price);
  const range = spread(product => product.range_km);
  const cargo = spread(product => product.cargo_l);
  return new Map(products.map(product => [product.id,
    0.5 * scale(product.price, price, false) + 0.3 * scale(product.range_km, range, true) + 0.2 * scale(product.cargo_l, cargo, true)]));
}

export function filterProducts(products: Product[], filters: Filters) {
  const minimum = filters.min.trim() ? Number(filters.min) : null;
  const maximum = filters.max.trim() ? Number(filters.max) : null;
  const matched = products.filter(product => product.published
    && (filters.category === 'all' || product.category === filters.category)
    && (filters.tag === 'all' || product.tags.includes(filters.tag))
    && (filters.license === 'all' || effectiveLicense(product) === filters.license)
    && (filters.stock === 'all' || product.stock_status === filters.stock)
    && (!filters.sale || (product.old_price != null && product.price != null && product.old_price > product.price))
    && (minimum === null || (product.price !== null && product.price >= minimum))
    && (maximum === null || (product.price !== null && product.price <= maximum)));
  const scores = filters.sort === 'value' ? valueScores(matched) : null;
  return matched.sort((a, b) => {
      if (scores) return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || a.name.localeCompare(b.name, 'ru-RU');
      if (filters.sort === 'name') return a.name.localeCompare(b.name, 'ru-RU');
      if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
        if (a.price === null) return b.price === null ? 0 : 1;
        if (b.price === null) return -1;
        return filters.sort === 'price-asc' ? a.price - b.price : b.price - a.price;
      }
      return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, 'ru-RU');
    });
}

export const plural = (count: number, forms: [string, string, string]) => {
  const tail = count % 100 >= 11 && count % 100 <= 14 ? 0 : count % 10;
  return forms[tail === 1 ? 0 : tail >= 2 && tail <= 4 ? 1 : 2];
};

/**
 * Smart picks are ordinary catalogue filters with a shopper-friendly name: mostly the ones the
 * shop ticks per product. All four requested themes stay visible; empty themes say they are
 * coming soon rather than implying stock. Rights requirements stay in the filter panel only — as a
 * pick they read like a promise about the law, which the shop does not want to make.
 *
 * Every pick opens the catalogue ranked by value. Its tile carries a drawn icon rather than a
 * product photo: the tile names an audience, and a photo of one model would misrepresent it.
 */
export function smartPicks(products: Product[]): SmartPick[] {
  return activePickTags.map(tag => ({
    id: `tag-${tag}`, label: tagLabels[tag], hint: tagHints[tag], filters: { tag, sort: 'value' },
    count: filterProducts(products, { ...defaultFilters, tag }).length,
  }));
}

/**
 * Первый шаг воронки: покупатель выбирает тип транспорта. Пустые категории не показываются —
 * плитка без товаров ведёт в пустой каталог. Цена «от» берётся только из опубликованных цен.
 */
export function categorySummary(products: Product[]) {
  return (Object.keys(categoryLabels) as Category[]).flatMap(category => {
    const items = products.filter(product => product.published && product.category === category);
    if (!items.length) return [];
    const prices = items.map(product => product.price).filter((price): price is number => price !== null);
    return [{ category, label: categoryLabels[category], count: items.length, from: prices.length ? Math.min(...prices) : null }];
  });
}

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const get = (key: string, allowed: string[], fallback: string) => allowed.includes(params.get(key) ?? '') ? params.get(key)! : fallback;
  const amount = (key: string) => /^\d{1,9}(\.\d{1,2})?$/.test(params.get(key) ?? '') ? params.get(key)! : '';
  return {
    category: get('category', ['all', ...Object.keys(categoryLabels)], 'all') as Filters['category'],
    tag: get('tag', ['all', ...Object.keys(tagLabels)], 'all') as Filters['tag'],
    license: get('license', ['all', 'a', 'm', 'not-required', 'required', 'unknown'], 'all') as Filters['license'],
    stock: get('stock', ['all', 'in-stock', 'preorder', 'out-of-stock'], 'all') as Filters['stock'],
    sale: params.get('sale') === '1',
    min: amount('min'), max: amount('max'),
    sort: get('sort', ['featured', 'value', 'price-asc', 'price-desc', 'name'], 'featured') as Filters['sort'],
  };
}

export function catalogHref(patch: Partial<Filters> = {}) {
  const filters = { ...defaultFilters, ...patch };
  const params = new URLSearchParams();
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.tag !== 'all') params.set('tag', filters.tag);
  if (filters.license !== 'all') params.set('license', filters.license);
  if (filters.stock !== 'all') params.set('stock', filters.stock);
  if (filters.sale) params.set('sale', '1');
  if (filters.min) params.set('min', filters.min);
  if (filters.max) params.set('max', filters.max);
  if (filters.sort !== 'featured') params.set('sort', filters.sort);
  return `#catalog${params.size ? `?${params}` : ''}`;
}

export function sanitizeCity(value: unknown): CityChoice {
  const record = value && typeof value === 'object' ? value as Partial<CityChoice> : {};
  const name = typeof record.name === 'string' ? record.name.trim().slice(0, 80) : '';
  return { name, asked: record.asked === true || Boolean(name) };
}

export function sanitizeIds(value: unknown, limit = 200): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 128))].slice(0, limit) : [];
}

export function sanitizeCart(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is CartItem => {
    if (!item || typeof item !== 'object' || typeof item.product_id !== 'string' || !item.product_id || item.product_id.length > 128 || seen.has(item.product_id)) return false;
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) return false;
    seen.add(item.product_id);
    return true;
  }).slice(0, MAX_CART_MODELS).map(({ product_id, quantity }) => ({ product_id, quantity }));
}

export function cartTotal(cart: CartItem[], products: Product[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  let knownTotalKopeks = 0;
  let unknownPrices = 0;
  let unavailable = 0;
  for (const item of cart) {
    const product = byId.get(item.product_id);
    if (!product || product.stock_status === 'out-of-stock') unavailable += item.quantity;
    if (!product || product.price === null) unknownPrices += item.quantity;
    else knownTotalKopeks += Math.round(product.price * 100) * item.quantity;
  }
  return { knownTotal: knownTotalKopeks / 100, unknownPrices, unavailable };
}
