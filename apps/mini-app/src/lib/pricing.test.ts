import { describe, expect, it } from 'vitest';
import { products } from '../data';
import { cartTotal, formatPrice, lineTotal } from './pricing';

describe('pricing helpers', () => {
  it('formats Russian ruble placeholders', () => {
    expect(formatPrice(86400)).toContain('86');
    expect(formatPrice(86400)).toContain('₽');
  });

  it('recalculates product, add-ons and quantity', () => {
    const line = {
      product: products[0],
      quantity: 2,
      addons: [{ id: 'lock', name: 'Lock', note: 'Demo', price: 2900 }],
    };
    expect(lineTotal(line)).toBe((products[0].price + 2900) * 2);
    expect(cartTotal([line])).toBe(lineTotal(line));
  });
});

