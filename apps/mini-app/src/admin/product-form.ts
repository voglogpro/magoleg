import type { Product } from './api';

const numericFields = ['price', 'old_price', 'range_km', 'speed_kmh', 'power_w', 'weight_kg', 'cargo_l', 'payload_kg'] as const;
type NumericField = typeof numericFields[number];
export type ProductDraft = Omit<Product, 'id' | 'updated_at' | NumericField> & Record<NumericField, string>;
export type ProductPayload = Omit<Product, 'id' | 'updated_at'>;

export function productDraft(product?: Product): ProductDraft {
  return {
    name: product?.name ?? '', description: product?.description ?? '',
    category: product?.category ?? 'scooter', license: product?.license ?? 'unknown',
    stock_status: product?.stock_status ?? 'preorder', image_url: product?.image_url ?? '',
    images: product?.images ?? [],
    published: product?.published ?? false, featured: product?.featured ?? false,
    tags: product?.tags ?? [], badge: product?.badge ?? '',
    license_verified: product?.license_verified ?? false,
    price: product?.price == null ? '' : String(product.price),
    old_price: product?.old_price == null ? '' : String(product.old_price),
    range_km: product?.range_km == null ? '' : String(product.range_km),
    speed_kmh: product?.speed_kmh == null ? '' : String(product.speed_kmh),
    power_w: product?.power_w == null ? '' : String(product.power_w),
    weight_kg: product?.weight_kg == null ? '' : String(product.weight_kg),
    cargo_l: product?.cargo_l == null ? '' : String(product.cargo_l),
    payload_kg: product?.payload_kg == null ? '' : String(product.payload_kg),
    drive: product?.drive ?? 'unknown',
  };
}

export function validateProduct(draft: ProductDraft, publish: boolean): { errors: string[]; payload: ProductPayload } {
  const errors: string[] = [];
  const numbers = {} as Record<NumericField, number | null>;
  for (const field of numericFields) {
    const value = draft[field].trim();
    const parsed = value === '' ? null : Number(value.replace(',', '.'));
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) errors.push('Числовые характеристики и цена должны быть неотрицательными числами.');
    numbers[field] = parsed;
  }
  if (numbers.price !== null && (numbers.price <= 0 || Math.abs(numbers.price * 100 - Math.round(numbers.price * 100)) > 0.000001)) errors.push('Цена должна быть больше нуля и содержать не больше двух знаков после запятой.');
  if (numbers.old_price !== null && (numbers.old_price <= 0 || Math.abs(numbers.old_price * 100 - Math.round(numbers.old_price * 100)) > 0.000001)) errors.push('Цена до скидки должна быть больше нуля и содержать не больше двух знаков после запятой.');
  if (numbers.old_price !== null && (numbers.price === null || numbers.old_price <= numbers.price)) errors.push('Цена до скидки должна быть выше текущей цены товара.');
  if (draft.name.trim().length < 2) errors.push('Укажите название товара — не менее двух символов.');
  if (publish && draft.description.trim().length < 10) errors.push('Для публикации нужно описание — не менее 10 символов.');
  if (publish && !draft.images.length) errors.push('Для публикации загрузите хотя бы одну фотографию товара.');
  if (publish && (numbers.price === null || numbers.price <= 0)) errors.push('Для публикации укажите цену больше нуля.');
  if (draft.license !== 'unknown' && !draft.license_verified) errors.push('Подтвердите проверку документов для категории по водительским правам или выберите «Не проверено».');
  if (numbers.payload_kg !== null && numbers.weight_kg !== null && numbers.payload_kg < numbers.weight_kg) errors.push('Грузоподъёмность меньше веса самого устройства — проверьте значения.');
  return {
    errors: [...new Set(errors)],
    // The cover is always the first photo of the gallery, so a card never advertises a lost image.
    payload: { ...draft, ...numbers, name: draft.name.trim(), description: draft.description.trim(), image_url: draft.images[0] ?? '', published: publish },
  };
}

export function validateUpload(file: File): string | null {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Поддерживаются только JPG, PNG и WebP.';
  if (!file.size) return 'Этот файл пустой. Выберите другую фотографию.';
  return null;
}

/** Checked after the browser has fitted the photo, so only a genuinely huge file is refused. */
export function uploadSizeError(file: File): string | null {
  return file.size > 8 * 1024 * 1024 ? 'Фотография больше 8 МБ даже после сжатия. Выберите другой файл.' : null;
}
