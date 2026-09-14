import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

const product: Product = {
  id: 'scooter', name: 'Kugoo Test', description: 'Test model', category: 'kick-scooter',
  license: 'not-required', license_verified: true, price: 49900, stock_status: 'in-stock',
  range_km: 40, speed_kmh: 25, power_w: 500, weight_kg: 20, cargo_l: null,
  payload_kg: 120, drive: 'single', image_url: '/media/front.webp',
  images: ['/media/front.webp', '/media/side.webp'], published: true, featured: true,
  tags: [], badge: '', updated_at: '2026-09-11',
};

afterEach(cleanup);

describe('catalogue product photos', () => {
  it('shows every photo as a swipeable slide without requiring the detail page', () => {
    const { container } = render(<ProductCard product={product} favorite={false} compared={false} inCart={false}
      onFavorite={vi.fn()} onCompare={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByLabelText(`Фотографии: ${product.name}`)).toBeInTheDocument();
    expect(container.querySelectorAll('.sf-card-gallery__track > a')).toHaveLength(2);
    expect(container.querySelectorAll('.sf-card-gallery__dots > span')).toHaveLength(2);
  });

  it('keeps a single-photo product as a normal link', () => {
    const single = { ...product, images: ['/media/front.webp'] };
    const { container } = render(<ProductCard product={single} favorite={false} compared={false} inCart={false}
      onFavorite={vi.fn()} onCompare={vi.fn()} onAdd={vi.fn()} />);
    expect(container.querySelector('.sf-card-gallery')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: `Подробнее: ${single.name}` })).toHaveAttribute('href', '#product/scooter');
  });

  it('shows a CRM discount with the old price crossed out', () => {
    const { container } = render(<ProductCard product={{ ...product, old_price: 59900 }} favorite={false} compared={false} inCart={false}
      onFavorite={vi.fn()} onCompare={vi.fn()} onAdd={vi.fn()} />);
    expect(container.querySelector('del')).toHaveTextContent('59 900 ₽');
    expect(container.querySelector('.sf-product-price')).toHaveTextContent('49 900 ₽');
    expect(container.querySelector('.sf-price-before em')).toHaveTextContent('−17%');
  });

  it('shows payment amounts without a separate finance button', () => {
    render(<ProductCard product={product} favorite={false} compared={false} inCart={false} financeAvailable
      onFavorite={vi.fn()} onCompare={vi.fn()} onAdd={vi.fn()} />);
    const finance = screen.getByLabelText('Предварительный расчёт оплаты частями');
    expect(finance).not.toHaveTextContent('Долями');
    expect(finance).toHaveTextContent('12 × 4 159 ₽');
    expect(screen.queryByRole('button', { name: /рассрочку|кредит/i })).toBeNull();
  });
});
