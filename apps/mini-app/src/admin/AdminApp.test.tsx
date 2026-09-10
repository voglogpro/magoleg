import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AdminApp } from './AdminApp';
import type { Inquiry, Product, ShopSettings } from './api';
import { defaultSettings } from '../storefront/types';

const session = { username: 'test-owner', csrfToken: 'test-csrf-token' };
const settings: ShopSettings = { ...defaultSettings, shop_name: 'Test shop' };
const product: Product = { id: 'test-product', name: 'City 42', description: 'A genuine model description.', category: 'scooter', license: 'unknown', license_verified: false, price: 42000, stock_status: 'preorder', range_km: null, speed_kmh: null, power_w: null, weight_kg: null, cargo_l: null, payload_kg: null, drive: 'unknown', image_url: '/media/test.webp', images: ['/media/test.webp'], published: false, featured: false, tags: ['courier'], badge: 'hit', updated_at: '2026-09-06T12:00:00Z' };
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
  it('saves delivery estimates and separate legal documents with CSRF', async () => {
    render(<AdminApp/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Магазин и документы' }));
    fireEvent.change(await screen.findByLabelText('Город и адрес отправления'), { target: { value: 'Тестовый склад' } });
    fireEvent.change(screen.getByLabelText('Оценки доставки по городам'), { target: { value: 'Казань; 4; 7; по тарифам ТК' } });
    fireEvent.change(screen.getByLabelText('Адрес для возврата товаров'), { target: { value: 'Тестовый адрес возврата' } });
    fireEvent.change(screen.getByLabelText('Политика конфиденциальности'), { target: { value: 'Тестовая редакция политики' } });
    fireEvent.change(screen.getByLabelText('Согласие на обработку данных'), { target: { value: 'Отдельное согласие' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить информацию' }));
    await screen.findByText('Информация магазина сохранена и доступна на сайте.');
    const save = fetchMock.mock.calls.find(([url, options]) => url.endsWith('/settings') && options.method === 'PUT')!;
    expect(save[1].headers.get('X-CSRF-Token')).toBe(session.csrfToken);
    expect(JSON.parse(save[1].body)).toMatchObject({ delivery_origin: 'Тестовый склад', delivery_schedule: 'Казань; 4; 7; по тарифам ТК', return_address: 'Тестовый адрес возврата', privacy_document: 'Тестовая редакция политики', consent_document: 'Отдельное согласие' });
  });
  it('restores a saved session without asking for the password again', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/login'))).toBe(false);
  });
  it('allows disabling persistent sign-in on a shared device', async () => {
    authenticated = false;
    render(<AdminApp/>);
    fireEvent.change(await screen.findByLabelText('Логин'), { target: { value: 'owner' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'test-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /Оставаться в системе/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    await screen.findByText('Каталог пока пуст');
    const login = fetchMock.mock.calls.find(([url]) => url.endsWith('/login'))!;
    expect(JSON.parse(login[1].body).remember).toBe(false);
  });
  it('cancels deletion from the list without changing the catalogue', async () => {
    rows = [product];
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<AdminApp/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить товар «City 42»' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('City 42'));
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'DELETE')).toBe(false);
    expect(screen.getByText('City 42')).toBeInTheDocument();
  });
  it('deletes only the selected card with CSRF after confirmation', async () => {
    rows = [product, { ...product, id: 'other', name: 'Keep this model' }];
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: RequestInit) => options.method === 'DELETE'
      ? Promise.resolve(response({ ok: true })) : normal(url, options));
    render(<AdminApp/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить товар «City 42»' }));
    await screen.findByText('Товар «City 42» удалён из каталога и CRM.');
    expect(screen.queryByRole('button', { name: 'Удалить товар «City 42»' })).not.toBeInTheDocument();
    expect(screen.getByText('Keep this model')).toBeInTheDocument();
    const deletion = fetchMock.mock.calls.find(([, options]) => options.method === 'DELETE')!;
    expect(deletion[0]).toBe('/api/admin/products/test-product');
    expect(deletion[1].headers.get('X-CSRF-Token')).toBe(session.csrfToken);
  });
  it('keeps the card and reports a failed deletion', async () => {
    rows = [product];
    render(<AdminApp/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Удалить товар «City 42»' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unexpected test endpoint');
    expect(screen.getByText('City 42')).toBeInTheDocument();
  });
  it('reports a product load failure without claiming that the catalogue is empty', async () => {
    const normal = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url: string, options: RequestInit) => url.endsWith('/products')
      ? Promise.resolve(response({ error: 'Каталог временно недоступен.' }, 503)) : normal(url, options));
    render(<AdminApp/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Каталог временно недоступен.');
    expect(screen.queryByText('Каталог пока пуст')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Повторить загрузку' })).toBeEnabled();
  });
  it('clearly labels unpublishing and keeps the published model when it is cancelled', async () => {
    rows = [{ ...product, published: true }];
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<AdminApp/>);
    fireEvent.click(await screen.findByRole('button', { name: /City 42.*На сайте/ }));
    expect(screen.getByRole('button', { name: 'Сохранить публикацию' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Снять с сайта' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Снять товар с публикации'));
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'PUT')).toBe(false);
  });
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
    expect(JSON.parse(login[1].body)).toEqual({ username: 'test-owner', password: 'Test-only-password!', remember: true });
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Для публикации загрузите хотя бы одну фотографию товара');
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
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith('/settings') && options.method === 'PUT')).toHaveLength(0);
  });
  it('returns focus to the saved settings confirmation instead of leaving it above the viewport', async () => {
    render(<AdminApp/>);
    await screen.findByText('Каталог пока пуст');
    fireEvent.click(screen.getByRole('button', { name: 'Магазин и документы' }));
    fireEvent.change(await screen.findByLabelText('Название магазина'), { target: { value: 'Updated shop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить информацию' }));
    const notice = await screen.findByText('Информация магазина сохранена и доступна на сайте.');
    await waitFor(() => expect(notice).toHaveFocus());
  });
  it('updates an inquiry status using the server API', async () => {
    const inquiry: Inquiry = { id: 'inquiry-1', name: 'Test customer', contact: 'test@example.com', city: 'Казань', message: 'Please call back.', items: [{ product_id: product.id, name: product.name, price: 42000, quantity: 1, image_url: product.image_url }], total: 42000, status: 'new', created_at: '2026-09-06T12:00:00Z', updated_at: '2026-09-06T12:00:00Z' };
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
      const row: Inquiry = { id: `inquiry-${page}`, name: `Customer page ${page}`, contact: 'test@example.com', city: 'Москва', message: '', items: [], total: 0, status: 'new', created_at: '2026-09-06T12:00:00Z', updated_at: '2026-09-06T12:00:00Z' };
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
