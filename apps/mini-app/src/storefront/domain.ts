import { defaultFilters, MAX_CART_MODELS, MAX_QUANTITY, type CartItem, type CityChoice, type Filters, type Product } from './types';

export const money = (value: number | null) => value === null ? 'Цена по запросу' : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
export const effectiveLicense = (product: Product) => product.license_verified === true ? product.license : 'unknown';
export const productImage = (value: string) => /^\/media\/[a-zA-Z0-9_./-]+$/.test(value) && !value.includes('..') ? value : '';
export const phoneLink = (value: string) => {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.length >= 7 && digits.length <= 15 ? `tel:${value.trim().startsWith('+') ? '+' : ''}${digits}` : '';
};
export const telegramLink = (value: string) => {
  const name = value.trim().replace(/^https:\/\/t\.me\//i, '').replace(/^@/, '');
  return /^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(name) ? `https://t.me/${name}` : '';
};

export function filterProducts(products: Product[], filters: Filters) {
  const minimum = filters.min.trim() ? Number(filters.min) : null;
  const maximum = filters.max.trim() ? Number(filters.max) : null;
  return products.filter(product => product.published
    && (filters.category === 'all' || product.category === filters.category)
    && (filters.license === 'all' || effectiveLicense(product) === filters.license)
    && (filters.stock === 'all' || product.stock_status === filters.stock)
    && (minimum === null || (product.price !== null && product.price >= minimum))
    && (maximum === null || (product.price !== null && product.price <= maximum)))
    .sort((a, b) => {
      if (filters.sort === 'name') return a.name.localeCompare(b.name, 'ru-RU');
      if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
        if (a.price === null) return b.price === null ? 0 : 1;
        if (b.price === null) return -1;
        return filters.sort === 'price-asc' ? a.price - b.price : b.price - a.price;
      }
      return Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name, 'ru-RU');
    });
}

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const get = (key: string, allowed: string[], fallback: string) => allowed.includes(params.get(key) ?? '') ? params.get(key)! : fallback;
  const amount = (key: string) => /^\d{1,9}(\.\d{1,2})?$/.test(params.get(key) ?? '') ? params.get(key)! : '';
  return {
    category: get('category', ['all', 'kick-scooter', 'scooter', 'e-bike', 'parts', 'accessories'], 'all') as Filters['category'],
    license: get('license', ['all', 'required', 'not-required', 'unknown'], 'all') as Filters['license'],
    stock: get('stock', ['all', 'in-stock', 'preorder', 'out-of-stock'], 'all') as Filters['stock'],
    min: amount('min'), max: amount('max'),
    sort: get('sort', ['featured', 'price-asc', 'price-desc', 'name'], 'featured') as Filters['sort'],
  };
}

export function catalogHref(patch: Partial<Filters> = {}) {
  const filters = { ...defaultFilters, ...patch };
  const params = new URLSearchParams();
  if (filters.category !== 'all') params.set('category', filters.category);
  if (filters.license !== 'all') params.set('license', filters.license);
  if (filters.stock !== 'all') params.set('stock', filters.stock);
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
