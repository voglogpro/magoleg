import { describe, expect, it } from 'vitest';
import { addons, products } from '../data';
import { addCartLine } from './cart';
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

  it('keeps the base model and the same model with options as separate configurations', () => {
    const base = addCartLine([], products[0], []);
    const configured = addCartLine(base, products[0], [addons[0]]);

    expect(configured).toHaveLength(2);
    expect(configured.map((line) => line.quantity)).toEqual([1, 1]);
    expect(cartTotal(configured)).toBe(products[0].price * 2 + addons[0].price);
  });
});
