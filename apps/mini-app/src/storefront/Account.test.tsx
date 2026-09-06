import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account } from './Account';
import { InquiryForm } from './InquiryForm';
import { defaultSettings } from './types';

const profile = { name: 'Анна', contact: '+79001234567' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function fillSignIn(contact: string, password: string) {
  fireEvent.change(screen.getByLabelText('Логин, телефон или email'), { target: { value: contact } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('customer account', () => {
  it('registers a shopper and reports the account to the storefront', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ role: 'customer', account: profile, csrfToken: 'token' }));
    const onChange = vi.fn();
    render(<Account account={null} csrfToken="" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Анна' } });
    fireEvent.change(screen.getByLabelText('Телефон, email или @Telegram'), { target: { value: '+79001234567' } });
    fireEvent.change(screen.getByLabelText(/Пароль/), { target: { value: 'двенадцать-символов' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    const [path, options] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe('/api/account/register');
    expect(JSON.parse(options!.body as string)).toEqual({ name: 'Анна', contact: '+79001234567', password: 'двенадцать-символов', consent: true });
  });

  it('explains a rejected sign-in without making the shopper retype the password', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: 'Неверный логин или пароль.' }, 401));
    const onChange = vi.fn();
    render(<Account account={null} csrfToken="" onChange={onChange} />);
    fillSignIn('+79001234567', 'typed-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль.');
    expect(onChange).not.toHaveBeenCalled();
    // Only the login may be wrong: keep the password so one field can be fixed.
    expect(screen.getByLabelText('Пароль')).toHaveValue('typed-password');
  });

  it('sends the owner to the management panel instead of the shopper view', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ role: 'owner', username: 'owner', csrfToken: 'token' }));
    const open = vi.fn();
    vi.stubGlobal('open', open);
    render(<Account account={null} csrfToken="" onChange={vi.fn()} />);
    fillSignIn('owner', 'owner-password');
    expect(await screen.findByRole('link', { name: /Панель управления/ })).toHaveAttribute('href', '/admin');
    expect(open).toHaveBeenCalledWith('/admin', '_blank', 'noopener');
  });

  it('shows only the inquiries the server links to this account', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ inquiries: [
      { id: 'abcdef123456', status: 'contacted', total: 19900, created_at: '2026-09-06T10:00:00+00:00', items: [{ product_id: 'one', name: 'Городская модель', price: 19900, quantity: 1 }] },
    ] }));
    render(<Account account={profile} csrfToken="token" onChange={vi.fn()} />);
    expect(await screen.findByText('Заявка №abcdef12')).toBeInTheDocument();
    expect(screen.getByText('Магазин связался с вами')).toBeInTheDocument();
    expect(screen.getByText('Городская модель')).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/account/inquiries');
  });

  it('offers a signed-in shopper their saved contact without overwriting typed details', () => {
    const settings = { ...defaultSettings, inquiries_enabled: true };
    const { rerender } = render(<InquiryForm settings={settings} items={[{ product_id: 'one', quantity: 1 }]} />);
    fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Борис' } });
    rerender(<InquiryForm settings={settings} items={[{ product_id: 'one', quantity: 1 }]} account={profile} />);
    expect(screen.getByLabelText('Ваше имя')).toHaveValue('Борис');
    expect(screen.getByLabelText('Телефон, email или @Telegram')).toHaveValue('+79001234567');
  });
});
