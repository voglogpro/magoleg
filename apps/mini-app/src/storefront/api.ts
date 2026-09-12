import { defaultSettings, paymentStatusFields, paymentStatuses, type AccountInquiry, type AccountProfile, type Inquiry, type InquiryPayload, type Product, type ShopSettings } from './types';

export class StoreApiError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeout = window.setTimeout(abort, 20000);
  try {
    const response = await fetch(path, { ...options, signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json', ...options.headers } });
    let data: unknown;
    try { data = await response.json(); } catch { throw new StoreApiError('Сервис временно недоступен. Попробуйте ещё раз.', response.status); }
    if (!response.ok) {
      const body = data as { error?: string | { message?: string }; message?: string };
      const detail = typeof body.error === 'string' ? body.error : body.error?.message;
      const fallback = response.status === 429 ? 'Слишком много попыток. Подождите немного и повторите.' : 'Не удалось выполнить запрос. Попробуйте ещё раз.';
      throw new StoreApiError(detail || body.message || fallback, response.status);
    }
    return data as T;
  } catch (reason) {
    if (reason instanceof StoreApiError || options.signal?.aborted) throw reason;
    throw new StoreApiError(options.method === 'POST'
      ? 'Не удалось подтвердить отправку. Проверьте соединение и повторите с теми же данными — повторная попытка защищена от дублирования заявки.'
      : 'Не удалось подключиться к магазину. Проверьте соединение и повторите попытку.', 0);
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}

export async function getProducts(signal?: AbortSignal) {
  const data = await request<{ products: Product[] }>('/api/products', { signal });
  if (!Array.isArray(data.products)) throw new StoreApiError('Каталог временно недоступен.', 502);
  return data.products.filter(product => product && typeof product.id === 'string' && typeof product.name === 'string' && product.published);
}

export async function getSettings(signal?: AbortSignal): Promise<ShopSettings> {
  const data = await request<{ settings: Partial<ShopSettings> }>('/api/settings', { signal });
  if (!data.settings || typeof data.settings !== 'object') throw new StoreApiError('Информация о магазине временно недоступна.', 502);
  const raw = data.settings as Record<string, unknown>;
  const settings: ShopSettings = {
    ...defaultSettings,
    ...Object.fromEntries(Object.keys(defaultSettings).filter(key => typeof raw[key] === 'string').map(key => [key, raw[key]])),
    inquiries_enabled: raw.inquiries_enabled === true,
  };
  // Незнакомый статус оплаты трактуется как «не подключено»: витрина не обещает лишнего.
  for (const key of paymentStatusFields) if (!paymentStatuses.includes(settings[key])) settings[key] = 'off';
  return settings;
}

type SignInResult = { role: 'owner' | 'customer'; account?: AccountProfile; username?: string; csrfToken: string };
export type OwnerSession = { username: string; csrfToken: string };

export async function getOwnerSession(signal?: AbortSignal): Promise<OwnerSession | null> {
  try {
    const session = await request<OwnerSession>('/api/admin/session', { signal });
    return typeof session.username === 'string' && typeof session.csrfToken === 'string' ? session : null;
  } catch (reason) {
    if (reason instanceof StoreApiError && [401, 503].includes(reason.status)) return null;
    throw reason;
  }
}

export function signOutOwner(csrfToken: string) {
  return accountRequest<{ ok: true }>('/api/admin/logout', {}, csrfToken);
}

async function accountRequest<T>(path: string, body: unknown, csrfToken = ''): Promise<T> {
  try {
    return await request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: JSON.stringify(body),
    });
  } catch (reason) {
    if (reason instanceof StoreApiError && reason.status === 0) {
      throw new StoreApiError('Не удалось связаться с магазином. Проверьте соединение и повторите попытку.', 0);
    }
    throw reason;
  }
}

/** Shared sign-in: the server decides whether the credentials belong to the shop owner. */
export function signIn(contact: string, password: string, remember = true) {
  return accountRequest<SignInResult>('/api/account/login', { contact, password, remember });
}

export function registerAccount(name: string, contact: string, city: string, password: string, remember = true, consent = false) {
  return accountRequest<SignInResult>('/api/account/register', { name, contact, city, password, consent, remember });
}

export function signOut(csrfToken: string) {
  return accountRequest<{ ok: true }>('/api/account/logout', {}, csrfToken);
}

export async function getAccount(signal?: AbortSignal) {
  return request<{ account: AccountProfile | null; csrfToken?: string }>('/api/account', { signal });
}

export async function getAccountInquiries(signal?: AbortSignal) {
  const data = await request<{ inquiries: AccountInquiry[] }>('/api/account/inquiries', { signal });
  return Array.isArray(data.inquiries) ? data.inquiries : [];
}

export function customerRequest<T>(path: 'cart' | 'preferences', body?: unknown, csrfToken = '', signal?: AbortSignal) {
  return request<T>(`/api/account/${path}`, { method: body === undefined ? 'GET' : 'POST', signal,
    headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export async function submitInquiry(payload: InquiryPayload, idempotencyKey: string): Promise<Inquiry> {
  const data = await request<{ inquiry: Inquiry }>('/api/inquiries', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload),
  });
  if (!data.inquiry?.id) throw new StoreApiError('Не удалось получить подтверждение заявки. Свяжитесь с магазином перед повторной отправкой.', 502);
  return data.inquiry;
}
