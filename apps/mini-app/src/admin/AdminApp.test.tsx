import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminApp } from './AdminApp';
import type { Inquiry, Product, ShopSettings } from './api';

const session = { username: 'test-owner', csrfToken: 'test-csrf-token' };
const settings: ShopSettings = { shop_name: 'Test shop', phone: '', telegram: '', address: '', hours: '', delivery: '', payment: '', legal_name: '', legal_details: '', warranty: '', inquiries_enabled: false };
const product: Product = { id: 'test-product', name: 'City 42', description: 'A genuine model description.', category: 'scooter', license: 'unknown', license_verified: false, price: 42000, stock_status: 'preorder', range_km: null, speed_kmh: null, power_w: null, weight_kg: null, image_url: '/media/test.webp', published: false, featured: false, updated_at: '2026-09-06T12:00:00Z' };
let authenticated = true;
let rows: Product[] = [];
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  authenticated = true; rows = [];
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  fetchMock.mockReset().mockImplementation(async (url: string, options: RequestInit) => {
    if (url.endsWith('/session')) return authenticated ? response(session) : response({ error: 'Войдите в кабинет.' }, 401);
    if (url.endsWith('/login')) return response(session);
    if (url.endsWith('/products') && options.method === 'GET') return response({ products: rows });
    if (url.endsWith('/products') && options.method === 'POST') return response({ product: { ...product, ...JSON.parse(String(options.body)) } });
    if (url.endsWith('/settings')) return response({ settings });
    if (url.includes('/inquiries?')) return response({ inquiries: [], total: 0, page: 1, page_size: 50, total_pages: 0 });
    if (url.includes('/inquiries/') && options.method === 'PATCH') return response({ ok: true });
    if (url.endsWith('/logout')) return response({ ok: true });
    return response({ error: 'Unexpected test endpoint' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('admin CRM', () => {
  it('starts with blank login fields and submits credentials without browser storage', async () => {
    authenticated = false;
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<AdminApp/>);
    const username = await screen.findByLabelText('Логин');
    const password = screen.getByLabelText('Пароль');
    expect(username).toHaveValue(''); expect(password).toHaveValue(''); expect(password).toHaveAttribute('type', 'password');
    fireEvent.change(username, { target: { value: 'test-owner' } });
    fireEvent.change(password, { target: { value: 'Test-only-password!' } });
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Каталог пока пуст');
    const login = fetchMock.mock.calls.find(([url]) => url.endsWith('/login'))!;
    expect(login[1].credentials).toBe('same-origin');
    expect(JSON.parse(login[1].body)).toEqual({ username: 'test-owner', password: 'Test-only-password!' });
    expect(storageSpy).not.toHaveBeenCalled(); storageSpy.mockRestore();
  });
  it('saves an incomplete card as a private draft with a CSRF header', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }));
    fireEvent.change(screen.getByLabelText('Название товара'), { target: { value: 'New model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить черновик' }));
    await screen.findByText('Черновик сохранён. Покупатели его не видят.');
    const save = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/products') && options.method === 'POST')!;
    expect(save[1].headers.get('X-CSRF-Token')).toBe(session.csrfToken);
    expect(JSON.parse(save[1].body)).toMatchObject({ name: 'New model', published: false, price: null });
  });
  it('shows actionable missing-field errors instead of publishing an incomplete card', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }));
    fireEvent.change(screen.getByLabelText('Название товара'), { target: { value: 'New model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Опубликовать' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Для публикации загрузите фотографию товара');
    expect(fetchMock.mock.calls.filter(([, options]) => options.method === 'POST')).toHaveLength(0);
  });
  it('does not discard unsaved edits when the owner cancels navigation', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Добавить товар' }));
    fireEvent.change(screen.getByLabelText('Название товара'), { target: { value: 'Unsaved model' } });
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Магазин и документы' }));
    expect(window.confirm).toHaveBeenCalled();
    expect(screen.getByLabelText('Название товара')).toHaveValue('Unsaved model');
  });
  it('requires legal details and contact before enabling inquiries', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Магазин и документы' }));
    fireEvent.click(await screen.findByLabelText('Принимать заявки с сайта'));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить информацию' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('укажите продавца, реквизиты');
    expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/settings') && options.method === 'PUT')).toHaveLength(0);
  });
  it('updates an inquiry status using the server API', async () => {
    const inquiry: Inquiry = { id: 'inquiry-1', name: 'Test customer', contact: 'test@example.com', message: 'Please call back.', items: [{ product_id: product.id, name: product.name, price: 42000, quantity: 1, image_url: product.image_url }], total: 42000, status: 'new', created_at: '2026-09-06T12:00:00Z', updated_at: '2026-09-06T12:00:00Z' };
    const defaultMock = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: RequestInit) => url.includes('/inquiries?') ? Promise.resolve(response({ inquiries: [inquiry], total: 1, page: 1, page_size: 50, total_pages: 1 })) : defaultMock(url, options));
    render(<AdminApp/>); await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Заявки' }));
    fireEvent.change(await screen.findByLabelText('Статус заявки inquiry-1'), { target: { value: 'contacted' } });
    await screen.findByText('Статус заявки обновлён.');
    expect(fetchMock.mock.calls.find(([url, options]) => url.endsWith('/inquiries/inquiry-1') && options.method === 'PATCH')?.[1].body).toBe(JSON.stringify({ status: 'contacted' }));
  });
  it('paginates inquiries and filters all records on the server, resetting the page', async () => {
    const defaultMock = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: RequestInit) => {
      if (!url.includes('/inquiries?')) return defaultMock(url, options);
      const query = new URL(url, 'https://test.invalid').searchParams;
      const page = Number(query.get('page'));
      const total = query.get('status') === 'new' ? 1 : 1001;
      const row: Inquiry = { id: `inquiry-${page}`, name: `Customer page ${page}`, contact: 'test@example.com', message: '', items: [], total: 0, status: 'new', created_at: '2026-09-06T12:00:00Z', updated_at: '2026-09-06T12:00:00Z' };
      return Promise.resolve(response({ inquiries: [row], total, page, page_size: 50, total_pages: Math.ceil(total / 50) }));
    });
    render(<AdminApp/>); await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Заявки' }));
    await screen.findByText('Customer page 1');
    expect(screen.getByText('Всего заявок: 1001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await screen.findByText('Customer page 2');
    fireEvent.change(screen.getByLabelText('Статус заявки', { exact: true }), { target: { value: 'new' } });
    await screen.findByText('Всего заявок: 1');
    expect(screen.getByText('Customer page 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Далее' })).toBeDisabled();
    expect(fetchMock.mock.calls.some(([url]) => url.includes('page=1&page_size=50&status=new'))).toBe(true);
  });
  it('does not misrepresent a failed inquiry load as an empty inbox', async () => {
    const defaultMock = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: RequestInit) => url.includes('/inquiries?') ? Promise.resolve(response({ error: 'Попробуйте обновить заявки.' }, 503)) : defaultMock(url, options));
    render(<AdminApp/>); await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Заявки' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Попробуйте обновить заявки.');
    expect(screen.queryByText('Заявок пока нет')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeEnabled();
  });
  it('logs out through the server and returns to the blank login form', async () => {
    render(<AdminApp/>); await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));
    await waitFor(() => expect(screen.getByLabelText('Логин')).toHaveValue(''));
    expect(fetchMock.mock.calls.find(([url]) => url.endsWith('/logout'))?.[1].headers.get('X-CSRF-Token')).toBe(session.csrfToken);
  });
});
