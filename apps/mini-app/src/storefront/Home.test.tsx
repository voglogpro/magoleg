import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { CategoryTiles, ContinueChoice, TelegramPromo } from './Home';
import { defaultSettings, type Product, type ShopSettings } from './types';

afterEach(cleanup);

const model = (patch: Partial<Product>): Product => ({
  id: 'id', name: 'Модель', description: '', category: 'kick-scooter', license: 'unknown',
  license_verified: false, price: 50000, stock_status: 'in-stock', range_km: null, speed_kmh: null,
  power_w: null, weight_kg: null, cargo_l: null, image_url: '', images: [], featured: false,
  published: true, tags: [], badge: '', updated_at: '2026-09-09', ...patch,
});
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('первый шаг воронки — тип транспорта', () => {
  it('показывает только категории с опубликованными товарами и цену «от»', () => {
    render(<CategoryTiles products={[
      model({ id: 'a', price: 42000 }), model({ id: 'b', price: 32900 }),
      model({ id: 'c', category: 'scooter', price: 94900 }),
      model({ id: 'd', category: 'atv', published: false, price: 10 }),
    ]} />);
    const tiles = screen.getAllByRole('link').filter(link => link.className.includes('sf-cat-tile'));
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveTextContent('Электросамокаты');
    expect(tiles[0]).toHaveTextContent('2 модели');
    expect(tiles[0].textContent).toMatch(/от\s*32\s*900/);
    expect(tiles[0]).toHaveAttribute('href', '#catalog?category=kick-scooter');
    expect(screen.queryByText('Квадроциклы')).toBeNull();
  });

  it('не выдумывает цену, когда она по запросу', () => {
    render(<CategoryTiles products={[model({ price: null })]} />);
    expect(screen.getByText('1 модель')).toBeInTheDocument();
    expect(screen.queryByText(/^от/)).toBeNull();
  });

  it('исчезает, пока каталог пуст', () => {
    const { container } = render(<CategoryTiles products={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

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
