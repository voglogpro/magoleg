export type Category = 'all' | 'city' | 'cargo' | 'compact';

export type Product = {
  id: string;
  category: Exclude<Category, 'all'>;
  name: string;
  kicker: string;
  price: number;
  oldPrice?: number;
  monthly: number;
  range: number;
  speed: number;
  battery: string;
  payload: number;
  stockLabel: string;
  stockTone: 'available' | 'limited' | 'preorder';
  color: string;
  colorSoft: string;
  image: string;
  imageAlt: string;
  visualVariant: 'step' | 'cargo' | 'compact';
  description: string;
  features: string[];
};

export type Addon = {
  id: string;
  name: string;
  note: string;
  price: number;
};

export type CartLine = {
  product: Product;
  quantity: number;
  addons: Addon[];
};
