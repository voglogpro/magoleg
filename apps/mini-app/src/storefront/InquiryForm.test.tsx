import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InquiryForm } from './InquiryForm';
import { defaultSettings } from './types';

const enabled = { ...defaultSettings, inquiries_enabled: true, legal_name: 'Тестовый продавец' };
const items = [{ product_id: 'one', quantity: 2 }];

beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function completeForm() {
  fireEvent.change(screen.getByLabelText('Ваше имя'), { target: { value: 'Анна' } });
  fireEvent.change(screen.getByLabelText('Телефон, email или @Telegram'), { target: { value: '+79001234567' } });
  const city = screen.queryByLabelText('Город доставки');
  if (city) fireEvent.change(city, { target: { value: 'Москва' } });
  fireEvent.click(screen.getByRole('checkbox'));
}

describe('guest inquiry', () => {
  it('does not expose an enabled submission form when inquiries are closed', () => {
    render(<InquiryForm settings={defaultSettings} items={items} />);
    expect(screen.getByText('Приём заявок пока закрыт')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Перейти к оплате' })).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends only item IDs and quantities and shows the real server receipt', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ inquiry: { id: 'GP-123', total: 20000, status: 'new' } }), { status: 201 }));
    render(<InquiryForm settings={enabled} items={items} />);
    completeForm();
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    expect(await screen.findByText('GP-123')).toBeInTheDocument();
    expect(screen.getByText('Заявка получена')).toBeInTheDocument();
    const call = vi.mocked(fetch).mock.calls[0];
    const options = call[1]!;
    expect(call[0]).toBe('/api/inquiries');
    expect(JSON.parse(options.body as string)).toEqual({ name: 'Анна', contact: '+79001234567', city: 'Москва', message: '', items, consent: true });
    expect((options.headers as Record<string, string>)['Idempotency-Key']).toMatch(/^[\da-f-]{36}$/);
    expect(screen.queryByRole('button', { name: 'Перейти к оплате' })).not.toBeInTheDocument();
  });
  it('keeps the same idempotency key on a network retry and does not claim success', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Соединение прервано'));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { id: 'GP-retry', total: 20000, status: 'new' } }), { status: 201 }));
    render(<InquiryForm settings={enabled} items={items} />);
    completeForm();
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    expect(await screen.findByText(/Не удалось подтвердить отправку/)).toBeInTheDocument();
    expect(screen.queryByText('Заявка получена')).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    await screen.findByText('GP-retry');
    const calls = vi.mocked(fetch).mock.calls;
    expect((calls[0][1]!.headers as Record<string, string>)['Idempotency-Key']).toEqual((calls[1][1]!.headers as Record<string, string>)['Idempotency-Key']);
  });
  it('keeps the payment button locked until the shopper accepts the documents', async () => {
    const { rerender } = render(<InquiryForm settings={enabled} items={items} />);
    const pay = screen.getByRole('button', { name: 'Перейти к оплате' });
    expect(pay).toBeDisabled();
    expect(screen.getByText(/кнопка оплаты станет активной/)).toBeInTheDocument();
    for (const [name, href] of [['«Публичной оферты»', '#offer'], ['«Политики конфиденциальности»', '#privacy'], ['«Согласие на обработку персональных данных»', '#consent']] as const) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByRole('button', { name: 'Перейти к оплате' })).toBeEnabled();
    expect(screen.queryByText(/кнопка оплаты станет активной/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    rerender(<InquiryForm settings={enabled} items={items} blocked />);
    expect(screen.getByRole('button', { name: 'Перейти к оплате' })).toBeDisabled();
  });
  it('refuses an incomplete order and never calls the server', async () => {
    render(<InquiryForm settings={enabled} items={items} />);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(fetch).not.toHaveBeenCalled();
  });
  it('tells the shopper that delivery is already in the price', () => {
    render(<InquiryForm settings={enabled} items={items} />);
    expect(screen.getByText(/Доставка по России включена в стоимость товара/)).toBeInTheDocument();
  });
  it('assigns a new idempotency key when a rejected payload is edited', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Уточните контакт' }), { status: 400 }));
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ inquiry: { id: 'GP-edited', total: 20000, status: 'new' } }), { status: 201 }));
    render(<InquiryForm settings={enabled} items={items} />);
    completeForm();
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    await screen.findByText('Уточните контакт');
    fireEvent.change(screen.getByLabelText('Телефон, email или @Telegram'), { target: { value: 'anna@example.com' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Заявка в магазин' }));
    await screen.findByText('GP-edited');
    const calls = vi.mocked(fetch).mock.calls;
    expect((calls[0][1]!.headers as Record<string, string>)['Idempotency-Key']).not.toEqual((calls[1][1]!.headers as Record<string, string>)['Idempotency-Key']);
  });
});
