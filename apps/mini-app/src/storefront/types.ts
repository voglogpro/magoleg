export type Category = 'kick-scooter' | 'scooter';
export type License = 'required' | 'not-required' | 'unknown';
export type Stock = 'in-stock' | 'preorder' | 'out-of-stock';

export type Product = {
  id: string;
  name: string;
  description: string;
  category: Category;
  license: License;
  license_verified: boolean;
  price: number | null;
  stock_status: Stock;
  range_km: number | null;
  speed_kmh: number | null;
  power_w: number | null;
  weight_kg: number | null;
  image_url: string;
  featured: boolean;
  published: boolean;
  updated_at: string;
};

export type ShopSettings = {
  shop_name: string;
  city: string;
  phone: string;
  telegram: string;
  address: string;
  hours: string;
  delivery: string;
  payment: string;
  legal_name: string;
  legal_details: string;
  warranty: string;
  inquiries_enabled: boolean;
};

export type CartItem = { product_id: string; quantity: number };
export const MAX_QUANTITY = 20;
export const MAX_CART_MODELS = 30;
export type InquiryPayload = { name: string; contact: string; message: string; items: CartItem[]; consent: true };
export type Inquiry = { id: string; total: number | null; status: string };
export type Filters = {
  category: Category | 'all';
  license: License | 'all';
  stock: Stock | 'all';
  query: string;
  min: string;
  max: string;
  sort: 'featured' | 'price-asc' | 'price-desc' | 'name';
};

export const defaultSettings: ShopSettings = {
  shop_name: 'G-Partner', city: 'Большой Сочи', phone: '', telegram: '', address: '', hours: '',
  delivery: '', payment: '', legal_name: '', legal_details: '', warranty: '', inquiries_enabled: false,
};
export const defaultFilters: Filters = { category: 'all', license: 'all', stock: 'all', query: '', min: '', max: '', sort: 'featured' };
export const categoryLabels = { 'kick-scooter': 'Электросамокаты', scooter: 'Электроскутеры' };
export const licenseLabels = { required: 'С правами', 'not-required': 'Без прав', unknown: 'Требования уточняются' };
export const stockLabels = { 'in-stock': 'В наличии', preorder: 'Под заказ', 'out-of-stock': 'Нет в наличии' };
