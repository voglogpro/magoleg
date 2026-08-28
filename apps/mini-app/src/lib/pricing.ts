import type { CartLine } from '../types';

export const formatPrice = (value: number) =>
  new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value) + ' ₽';

export const lineTotal = (line: CartLine) =>
  (line.product.price + line.addons.reduce((sum, addon) => sum + addon.price, 0)) * line.quantity;

export const cartTotal = (lines: CartLine[]) => lines.reduce((sum, line) => sum + lineTotal(line), 0);

