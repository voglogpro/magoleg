import { describe, expect, it } from 'vitest';
import { formatPrice, mediaSource } from './api';
import { productDraft, uploadSizeError, validateProduct, validateUpload } from './product-form';

describe('admin publication validation', () => {
  it('accepts an ATV draft and keeps documentary requirements unverified by default', () => {
    const result = validateProduct({ ...productDraft(), name: 'Quad 42', category: 'atv' }, false);
    expect(result.errors).toEqual([]);
    expect(result.payload.category).toBe('atv');
    expect(result.payload.license).toBe('unknown');
    expect(result.payload.license_verified).toBe(false);
    expect(validateProduct({ ...productDraft(), name: 'Quad 42', category: 'atv', license: 'not-required' }, false).errors).toHaveLength(1);
  });
  it('keeps unknown numeric specifications empty rather than zero', () => {
    const result = validateProduct({ ...productDraft(), name: 'City 42' }, false);
    expect(result.errors).toEqual([]);
    expect(result.payload.price).toBeNull();
    expect(result.payload.range_km).toBeNull();
    expect(result.payload.published).toBe(false);
  });
  it('validates a discount price separately from the current price', () => {
    const sale = validateProduct({ ...productDraft(), name: 'City 42', price: '49900', old_price: '59900' }, false);
    expect(sale.errors).toEqual([]);
    expect(sale.payload.old_price).toBe(59900);
    expect(validateProduct({ ...productDraft(), name: 'City 42', price: '49900', old_price: '49900' }, false).errors).toContain('Цена до скидки должна быть выше текущей цены товара.');
    expect(validateProduct({ ...productDraft(), name: 'City 42', old_price: '59900' }, false).errors).toContain('Цена до скидки должна быть выше текущей цены товара.');
  });
  it('preserves kopecks in prices instead of rounding the displayed amount', () => {
    expect(formatPrice(42500.5).replace(/\s/g, '')).toBe('42500,50₽');
    expect(formatPrice(42500.51).replace(/\s/g, '')).toBe('42500,51₽');
  });
  it('requires a description, uploaded photo and positive price to publish', () => {
    expect(validateProduct({ ...productDraft(), name: 'City 42' }, true).errors).toHaveLength(3);
    expect(validateProduct({ ...productDraft(), name: 'City 42', description: 'A real transport description.', images: ['/media/test.webp'], price: '42000' }, true).errors).toEqual([]);
  });
  it('does not classify rights without documentary verification', () => {
    expect(validateProduct({ ...productDraft(), name: 'City 42', license: 'not-required' }, false).errors).toHaveLength(1);
    expect(validateProduct({ ...productDraft(), name: 'City 42', license: 'required', license_verified: true }, false).errors).toEqual([]);
  });
  it('rejects malformed, negative and overly precise prices', () => {
    for (const price of ['NaN', '-1', '0', '12.123']) expect(validateProduct({ ...productDraft(), name: 'City 42', price }, false).errors.length).toBeGreaterThan(0);
    expect(validateProduct({ ...productDraft(), name: 'City 42', price: '12,50' }, false).payload.price).toBe(12.5);
  });
  it('restricts previews to server-uploaded images', () => {
    expect(mediaSource('/media/0123.webp')).toBe('/media/0123.webp');
    expect(mediaSource('/products/kugoo-current/m4-front.jpg')).toBe('/products/kugoo-current/m4-front.jpg');
    for (const source of ['https://third-party.example/image.jpg', 'javascript:alert(1)', '/media/../secret', '/media/x.svg?token=secret']) expect(mediaSource(source)).toBe('');
  });
  it('checks image type, size and empty uploads', () => {
    expect(validateUpload(new File(['x'], 'image.webp', { type: 'image/webp' }))).toBeNull();
    expect(validateUpload(new File(['x'], 'vector.svg', { type: 'image/svg+xml' }))).toContain('JPG');
    expect(validateUpload(new File([], 'empty.jpg', { type: 'image/jpeg' }))).not.toBeNull();
    expect(uploadSizeError(new File(['x'], 'small.webp', { type: 'image/webp' }))).toBeNull();
    expect(uploadSizeError(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }))).toContain('8');
  });
});
