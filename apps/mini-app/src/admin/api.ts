import type { Category, Drive, License, ProductBadge, ProductTag } from '../storefront/types';

export type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  license: License;
  price: number | null;
  stock_status: 'in-stock' | 'preorder' | 'out-of-stock';
  range_km: number | null;
  speed_kmh: number | null;
  power_w: number | null;
  weight_kg: number | null;
  cargo_l: number | null;
  payload_kg: number | null;
  drive: Drive;
  image_url: string;
  images: string[];
  published: boolean;
  featured: boolean;
  license_verified: boolean;
  tags: ProductTag[];
  badge: ProductBadge;
  updated_at: string;
};

export type { ShopSettings } from '../storefront/types';

export type Inquiry = {
  id: string;
  name: string;
  contact: string;
  city: string;
  cdek_pvz?: string;
  payment_method?: 'sbp' | 'dolyame' | 'installment' | 'credit';
  message: string;
  items: { product_id: string; name: string; price: number; quantity: number; image_url: string }[];
  total: number;
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
  updated_at: string;
};

export type AdminSession = { username: string; csrfToken: string };

export class AdminApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'AdminApiError';
  }
}

/** Credentials remain in an HttpOnly server cookie, never in browser storage. */
export async function adminRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; csrfToken?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const headers = new Headers({ Accept: 'application/json' });
  if (options.csrfToken) headers.set('X-CSRF-Token', options.csrfToken);
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method, body, headers, credentials: 'same-origin', cache: 'no-store', signal: options.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new AdminApiError('Не удалось связаться с сервером. Проверьте соединение и повторите попытку.', 0);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const fallback = response.status === 401
      ? 'Сеанс завершён. Войдите снова.'
      : response.status === 429
        ? 'Слишком много попыток. Подождите несколько минут.'
        : 'Сервер не смог выполнить действие. Повторите попытку.';
    throw new AdminApiError(typeof result?.error === 'string' ? result.error : fallback, response.status);
  }
  if (response.status !== 204 && result === null) {
    throw new AdminApiError('Сервер вернул неожиданный ответ. Проверьте, запущена ли новая версия приложения.', response.status);
  }
  return result as T;
}

export const formatPrice = (value: number | null) => value === null
  ? 'Цена не указана'
  : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 2 }).format(value);

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Дата не указана' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function mediaSource(value: string) {
  return (/^\/media\/[a-zA-Z0-9_.-]+$/.test(value)
    || /^\/products\/kugoo-current\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/.test(value)) && !value.includes('..') ? value : '';
}
