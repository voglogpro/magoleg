import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ContinueChoice, TelegramPromo } from './Home';
import { defaultSettings, type Product, type ShopSettings } from './types';

afterEach(cleanup);

const model = (patch: Partial<Product>): Product => ({
  id: 'id', name: 'Модель', description: '', category: 'kick-scooter', license: 'unknown',
  license_verified: false, price: 50000, stock_status: 'in-stock', range_km: null, speed_kmh: null,
  power_w: null, weight_kg: null, cargo_l: null, payload_kg: null, drive: 'unknown', image_url: '', images: [], featured: false,
  published: true, tags: [], badge: '', updated_at: '2026-09-09', ...patch,
});
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('возврат покупателя в воронку', () => {
  it('молчит, пока покупатель ничего не выбрал', () => {
    const { container } = render(<ContinueChoice chosen={{ favorites: 0, compare: 0, cart: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ведёт в корзину, когда там уже есть товар', () => {
    render(<ContinueChoice chosen={{ favorites: 2, compare: 1, cart: 1 }} />);
    expect(screen.getByRole('link', { name: /Оформить заявку/ })).toHaveAttribute('href', '#cart');
    expect(screen.getByRole('link', { name: /В избранном/ })).toHaveTextContent('2');
  });

  it('ведёт к сравнению, когда отложены две модели и корзина пуста', () => {
    render(<ContinueChoice chosen={{ favorites: 0, compare: 2, cart: 0 }} />);
    expect(screen.getByRole('link', { name: /Сравнить модели/ })).toHaveAttribute('href', '#compare');
    expect(screen.queryByText('В корзине')).toBeNull();
  });
});

describe('канал со скидками', () => {
  it('не приглашает в канал, которого магазин не указал', () => {
    const { container } = render(<TelegramPromo settings={withSettings()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('ведёт в опубликованный канал магазина и не обещает конкретных скидок', () => {
    render(<TelegramPromo settings={withSettings({ telegram_channel: '@gpartner_sale' })} />);
    const link = screen.getByRole('link', { name: 'Подписаться на канал' });
    expect(link).toHaveAttribute('href', 'https://t.me/gpartner_sale');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText(/Магазин объявляет акции/)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
