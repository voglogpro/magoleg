import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import type { Product } from './types';

afterEach(cleanup);

/** Карточка из базы, созданной до появления привода и грузоподъёмности. */
const legacy = {
  id: 'old', name: 'Электросамокат Kugoo F3 PLUS', description: 'Описание', category: 'kick-scooter',
  license: 'not-required', license_verified: true, price: 72990, stock_status: 'in-stock',
  range_km: 55, speed_kmh: 50, power_w: 1000, weight_kg: 37, cargo_l: null,
  image_url: '/media/one.webp', images: ['/media/one.webp'], featured: true, published: true,
  tags: [], badge: '', updated_at: '2026-09-01',
} as unknown as Product;

describe('товары из прежней базы', () => {
  it('карточка рисуется, даже когда сервер не прислал привод и грузоподъёмность', () => {
    render(<ProductCard product={legacy} favorite={false} compared={false} inCart={false}
      onFavorite={vi.fn()} onCompare={vi.fn()} onAdd={vi.fn()} />);
    expect(screen.getByText('Kugoo F3 PLUS')).toBeInTheDocument();
    expect(screen.getByText('1000 Вт')).toBeInTheDocument();
  });
});
