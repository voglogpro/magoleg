import type { Addon, CartLine, Product } from '../types';

export const cartLineKey = (product: Product, selectedAddons: Addon[]) =>
  `${product.id}:${selectedAddons.map((addon) => addon.id).sort().join(',')}`;

export function addCartLine(lines: CartLine[], product: Product, selectedAddons: Addon[] = []): CartLine[] {
  const key = cartLineKey(product, selectedAddons);
  const existing = lines.some((line) => cartLineKey(line.product, line.addons) === key);
  if (!existing) return [...lines, { product, quantity: 1, addons: selectedAddons }];
  return lines.map((line) => cartLineKey(line.product, line.addons) === key ? { ...line, quantity: line.quantity + 1 } : line);
}

export function changeCartLineQuantity(lines: CartLine[], lineKey: string, delta: number): CartLine[] {
  return lines
    .map((line) => cartLineKey(line.product, line.addons) === lineKey ? { ...line, quantity: line.quantity + delta } : line)
    .filter((line) => line.quantity > 0);
}
