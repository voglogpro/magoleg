import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from './Account';
import { InquiryForm } from './InquiryForm';
import { defaultSettings } from './types';

const profile = { name: 'Анна', contact: '+79001234567', city: 'Краснодар' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fillSignIn(contact: string, password: string) {
  fireEvent.change(screen.getByLabelText('Логин, телефон или email'), { target: { value: contact } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('customer account', () => {
  it('restores the owner panel after a reload using the server session', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ username: 'owner', csrfToken: 'owner-token' }));
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    render(<Account account={null} csrfToken="" onChange={vi.fn()} />);
    const panel = await screen.findByRole('link', { name: /Панель управления/ });
    expect(panel).toHaveAttribute('href', '/admin');
    expect(panel).not.toHaveAttribute('target');
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith('/api/admin/session', expect.objectContaining({ credentials: 'same-origin' }));
    expect(storage).not.toHaveBeenCalled();
    storage.mockRestore();
  });
  it('ends a remembered owner session from the storefront', async () => {
    vi.mocked(fetch).mockImplementation(async path => path === '/api/admin/session'
      ? json({ username: 'owner', csrfToken: 'owner-token' }) : json({ ok: true }));
    render(<Account account={null} csrfToken="" onChange={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Выйти из аккаунта' }));
    await screen.findByLabelText('Пароль');
    expect(fetch).toHaveBeenCalledWith('/api/admin/logout', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'owner-token' }),
    }));
  });
  it('registers a shopper and reports the account to the storefront', async () => {
    vi.mocked(fetch).mockImplementation(async () => json({ role: 'customer', account: profile, csrfToken: 'token' }));
    const onChange = vi.fn();
    render(<Account account={null} csrfToken="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Анна' } });
    fireEvent.change(screen.getByLabelText('Телефон, email или @Telegram'), { target: { value: '+79001234567' } });
    fireEvent.change(screen.getByLabelText('Ваш город'), { target: { value: 'Краснодар' } });
    fireEvent.change(screen.getByLabelText(/Пароль/), { target: { value: 'двенадцать-символов' } });
    expect(screen.getByRole('checkbox', { name: /Даю/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/api/account/register'))).toBe(false);
    fireEvent.click(screen.getByRole('checkbox', { name: /Даю/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    const [path, options] = vi.mocked(fetch).mock.calls.find(([url]) => url === '/api/account/register')!;
    expect(path).toBe('/api/account/register');
    expect(JSON.parse(options!.body as string)).toEqual({ name: 'Анна', contact: '+79001234567', city: 'Краснодар', password: 'двенадцать-символов', consent: true, remember: true });
  });

  it('explains a rejected sign-in without making the shopper retype the password', async () => {
    vi.mocked(fetch).mockImplementation(async () => json({ error: 'Неверный логин или пароль.' }, 401));
    const onChange = vi.fn();
    render(<Account account={null} csrfToken="" onChange={onChange} />);
    fillSignIn('+79001234567', 'typed-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль.');
    expect(onChange).not.toHaveBeenCalled();
    // Only the login may be wrong: keep the password so one field can be fixed.
    expect(screen.getByLabelText('Пароль')).toHaveValue('typed-password');
  });

  it('sends the owner to the management panel instead of the shopper view', async () => {
    vi.mocked(fetch).mockImplementation(async () => json({ role: 'owner', username: 'owner', csrfToken: 'token' }));
    render(<Account account={null} csrfToken="" onChange={vi.fn()} />);
    fillSignIn('owner', 'owner-password');
    const panel = await screen.findByRole('link', { name: /Панель управления/ });
    expect(panel).toHaveAttribute('href', '/admin');
    expect(panel).not.toHaveAttribute('target');
  });

  it('keeps a returning shopper out of the sign-in form while the session is restored', () => {
    // Пустая форма входа у постоянного покупателя читается как «меня выкинуло из аккаунта».
    render(<Account account={null} csrfToken="" restoring onChange={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('восстанавливаем сессию');
    expect(screen.queryByLabelText('Пароль')).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows only the inquiries the server links to this account', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ inquiries: [
      { id: 'abcdef123456', status: 'contacted', total: 19900, created_at: '2026-09-06T10:00:00+00:00', city: 'Краснодар', items: [{ product_id: 'one', name: 'Городская модель', price: 19900, quantity: 1 }] },
    ] }));
    render(<Account account={profile} csrfToken="token" onChange={vi.fn()} />);
    expect(await screen.findByText('Заявка №abcdef12')).toBeInTheDocument();
    expect(screen.getByText('Магазин связался с вами')).toBeInTheDocument();
    expect(screen.getByText('Доставка в город Краснодар')).toBeInTheDocument();
    expect(screen.getByText('Городская модель')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/account/inquiries');
  });

  it('offers a signed-in shopper their saved contact without overwriting typed details', () => {
    const settings = { ...defaultSettings, inquiries_enabled: true };
    const { rerender } = render(<InquiryForm settings={settings} items={[{ product_id: 'one', quantity: 1 }]} />);
    fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Борис' } });
    rerender(<InquiryForm settings={settings} items={[{ product_id: 'one', quantity: 1 }]} account={profile} city="Краснодар" />);
    expect(screen.getByLabelText('Ваше имя')).toHaveValue('Борис');
    expect(screen.getByLabelText('Телефон, email или @Telegram')).toHaveValue('+79001234567');
    expect(screen.getByLabelText('Город доставки')).toHaveValue('Краснодар');
  });

  it('refuses to send an order without a destination city', async () => {
    const settings = { ...defaultSettings, inquiries_enabled: true };
    render(<InquiryForm settings={settings} items={[{ product_id: 'one', quantity: 1 }]} />);
    fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Борис' } });
    fireEvent.change(screen.getByLabelText('Телефон, email или @Telegram'), { target: { value: '+79001234567' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('город доставки');
    expect(fetch).not.toHaveBeenCalled();
  });
});
