export type Category = 'kick-scooter' | 'scooter' | 'e-bike' | 'parts' | 'accessories';
export type ProductTag = 'waterproof' | 'heavy-rider' | 'two-up' | 'courier' | 'women' | 'beginner';
export type ProductBadge = '' | 'hit' | 'best-price' | 'value';
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
  tags: ProductTag[];
  badge: ProductBadge;
  updated_at: string;
};

export type ShopSettings = {
  shop_name: string;
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
export type InquiryPayload = { name: string; contact: string; city: string; message: string; items: CartItem[]; consent: true };
export type Inquiry = { id: string; total: number | null; status: string };
export type Filters = {
  category: Category | 'all';
  tag: ProductTag | 'all';
  license: License | 'all';
  stock: Stock | 'all';
  min: string;
  max: string;
  sort: 'featured' | 'price-asc' | 'price-desc' | 'name';
};

export const defaultSettings: ShopSettings = {
  shop_name: 'G-Partner', phone: '', telegram: '', address: '', hours: '',
  delivery: '', payment: '', legal_name: '', legal_details: '', warranty: '', inquiries_enabled: false,
};
export const defaultFilters: Filters = { category: 'all', tag: 'all', license: 'all', stock: 'all', min: '', max: '', sort: 'featured' };

export type AccountProfile = { name: string; contact: string; city: string };
/** Remembered once per browser: the shop asks for a destination, then stops asking. */
export type CityChoice = { name: string; asked: boolean };
export const popularCities = ['Москва', 'Санкт-Петербург', 'Краснодар', 'Екатеринбург', 'Новосибирск', 'Казань', 'Ростов-на-Дону', 'Сочи'];
export type AccountInquiry = {
  id: string;
  status: 'new' | 'contacted' | 'closed';
  total: number | null;
  created_at: string;
  city: string;
  items: { product_id: string; name: string; price: number | null; quantity: number }[];
};
export const categoryLabels: Record<Category, string> = {
  'kick-scooter': 'Электросамокаты', scooter: 'Электроскутеры', 'e-bike': 'Электровелосипеды',
  parts: 'Запчасти', accessories: 'Аксессуары',
};
/** Smart picks: the shop ticks them per product, shoppers browse by them. */
export const tagLabels: Record<ProductTag, string> = {
  waterproof: 'Защита от дождя', 'heavy-rider': 'Для большого веса', 'two-up': 'Удобен вдвоём',
  courier: 'Для курьеров', women: 'Для девушек', beginner: 'Новичкам',
};
export const tagHints: Record<ProductTag, string> = {
  waterproof: 'Не боятся дождя и луж', 'heavy-rider': 'Держат крупного райдера', 'two-up': 'Хватает места двоим',
  courier: 'Для работы и груза', women: 'Лёгкие и удобные', beginner: 'Просто освоить с нуля',
};
export const badgeLabels: Record<Exclude<ProductBadge, ''>, string> = {
  hit: 'Хит продаж', 'best-price': 'Лучшая цена', value: 'Цена-качество',
};
/** Rider requirements only apply to vehicles; parts and accessories never carry them. */
export const vehicleCategories: Category[] = ['kick-scooter', 'scooter', 'e-bike'];
export const licenseLabels = { required: 'С правами', 'not-required': 'Без прав', unknown: 'Требования уточняются' };
export const stockLabels = { 'in-stock': 'В наличии', preorder: 'Под заказ', 'out-of-stock': 'Нет в наличии' };
