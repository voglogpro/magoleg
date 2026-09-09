export type Category = 'kick-scooter' | 'scooter' | 'e-bike' | 'atv' | 'parts' | 'accessories';
export type ProductTag = 'waterproof' | 'heavy-rider' | 'two-up' | 'courier' | 'women' | 'beginner' | 'teen';
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
  cargo_l: number | null;
  image_url: string;
  images: string[];
  featured: boolean;
  published: boolean;
  tags: ProductTag[];
  badge: ProductBadge;
  updated_at: string;
};

/** Способ расчёта объявляется рабочим только после подтверждения владельцем в CRM. */
export type PaymentStatus = 'off' | 'preparing' | 'on';
export const paymentStatuses: PaymentStatus[] = ['off', 'preparing', 'on'];
export const paymentStatusFields = ['payment_card', 'payment_installment', 'payment_invoice', 'payment_on_delivery'] as const;

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
  delivery_origin: string;
  delivery_schedule: string;
  return_address: string;
  privacy_document: string;
  consent_document: string;
  offer_document: string;
  returns_document: string;
  payment_card: PaymentStatus;
  payment_installment: PaymentStatus;
  payment_invoice: PaymentStatus;
  payment_on_delivery: PaymentStatus;
  payment_provider: string;
  payment_installment_partner: string;
  payment_receipt: string;
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
  sort: 'featured' | 'value' | 'price-asc' | 'price-desc' | 'name';
};

export const defaultSettings: ShopSettings = {
  shop_name: 'G-Partner', phone: '', telegram: '', address: '', hours: '',
  delivery: '', payment: '', legal_name: '', legal_details: '', warranty: '', inquiries_enabled: false,
  delivery_origin: '', delivery_schedule: '', return_address: '',
  privacy_document: '', consent_document: '', offer_document: '', returns_document: '',
  payment_card: 'preparing', payment_installment: 'preparing', payment_invoice: 'preparing',
  payment_on_delivery: 'off', payment_provider: '', payment_installment_partner: '', payment_receipt: '',
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
  atv: 'Квадроциклы', parts: 'Запчасти', accessories: 'Аксессуары',
};
/** Smart picks: the shop ticks them per product, shoppers browse by them. */
export const tagLabels: Record<ProductTag, string> = {
  waterproof: 'Защита от дождя', 'heavy-rider': 'Усиленные', 'two-up': 'Удобен вдвоём',
  courier: 'Для курьеров', women: 'Легкие', beginner: 'Новичкам', teen: 'Подростковая серия',
};
export const tagHints: Record<ProductTag, string> = {
  waterproof: 'Проверьте класс защиты модели', 'heavy-rider': 'Максимальный запас прочности, мощные моторы и повышенная грузоподъемность.', 'two-up': 'Хватает места двоим',
  courier: 'Надежный и выносливый транспорт для коммерческого использования и работы.', women: 'Стильные и маневренные модели. Оптимальный баланс веса для динамичных поездок.', beginner: 'Просто освоить с нуля',
  teen: 'Безопасная, яркая и технологичная техника для молодых райдеров.',
};
// Keep existing database tags intact; the old women tag already denoted lightweight models.
// Beginner is NOT an age classification: teenager models require an explicit owner selection.
export const activePickTags: ProductTag[] = ['heavy-rider', 'women', 'courier', 'teen'];
export const activePickLabels = Object.fromEntries(activePickTags.map(tag => [tag, tagLabels[tag]])) as Record<string, string>;
/** A named catalogue filter a shopper can open in one tap, with the number of models behind it. */
export type SmartPick = { id: string; label: string; hint: string; filters: Partial<Filters>; count: number };
export const badgeLabels: Record<Exclude<ProductBadge, ''>, string> = {
  hit: 'Хит продаж', 'best-price': 'Лучшая цена', value: 'Цена-качество',
};
/** Rider requirements only apply to vehicles; parts and accessories never carry them. */
export const vehicleCategories: Category[] = ['kick-scooter', 'scooter', 'e-bike', 'atv'];
export const licenseLabels = { required: 'С правами', 'not-required': 'Без прав', unknown: 'Требования уточняются' };
export const stockLabels = { 'in-stock': 'В наличии', preorder: 'Под заказ', 'out-of-stock': 'Нет в наличии' };
