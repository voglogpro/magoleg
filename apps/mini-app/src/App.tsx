import {
  ArrowLeft,
  BatteryCharging,
  Check,
  ChevronRight,
  CircleGauge,
  MapPin,
  Minus,
  Moon,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Sun,
  X,
} from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ScooterVisual } from './components/ScooterVisual';
import { addons, products } from './data';
import { cartTotal, formatPrice } from './lib/pricing';
import { hapticTap, prepareTelegram } from './lib/telegram';
import type { Addon, CartLine, Category, Product } from './types';

type View = 'catalog' | 'product' | 'cart' | 'checkout';
type Theme = 'light' | 'dark';

const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'Все модели' },
  { id: 'city', label: 'Город' },
  { id: 'cargo', label: 'Работа' },
  { id: 'compact', label: 'Компактные' },
];

function Header({ theme, count, onTheme, onCart }: { theme: Theme; count: number; onTheme: () => void; onCart: () => void }) {
  return (
    <header className="app-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="GShop, наверх">
        <span className="brand-name">GSHOP</span>
        <span className="brand-by">by OLEG</span>
      </button>
      <div className="header-actions">
        <span className="location"><i />Сочи</span>
        <button className="icon-button" onClick={onTheme} aria-label="Сменить тему">{theme === 'light' ? <Moon size={19} /> : <Sun size={19} />}</button>
        <button className="icon-button header-cart" onClick={onCart} aria-label={`Корзина, товаров: ${count}`}><ShoppingBag size={19} />{count > 0 && <b>{count}</b>}</button>
      </div>
    </header>
  );
}

function ProductCard({ product, index, onOpen }: { product: Product; index: number; onOpen: () => void }) {
  return (
    <article className="product-card">
      <button className="product-card__visual" onClick={onOpen} aria-label={`Открыть ${product.name}`}>
        <span className="model-index">{String(index + 1).padStart(2, '0')}</span>
        <ScooterVisual product={product} compact />
      </button>
      <div className="product-card__body">
        <div className="product-card__topline"><span className={`stock stock--${product.stockTone}`}><i />{product.stockLabel}</span><span>{product.kicker}</span></div>
        <h3>{product.name}</h3>
        <p className="product-purpose">{product.description}</p>
        <dl className="product-facts">
          <div><dt>Ход</dt><dd>до {product.range} км</dd></div>
          <div><dt>Скорость</dt><dd>{product.speed} км/ч</dd></div>
          <div><dt>Нагрузка</dt><dd>до {product.payload} кг</dd></div>
        </dl>
        <div className="product-card__footer">
          <div className="price-block"><small>Предварительная цена</small><strong>{formatPrice(product.price)}</strong><span>от {formatPrice(product.monthly)}/мес.*</span></div>
          <button className="text-action" onClick={onOpen}>Подробнее <ChevronRight size={18} /></button>
        </div>
      </div>
    </article>
  );
}

function Catalog({ onOpen }: { onOpen: (product: Product) => void }) {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const featured = products[1];
  const filtered = useMemo(() => products.filter((product) => (category === 'all' || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase())), [category, query]);
  const chooseRoute = (next: Category) => { setCategory(next); document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' }); };

  return (
    <main className="catalog">
      <section className="hero">
        <div className="hero__intro">
          <p className="section-number">ЭЛЕКТРОТРАНСПОРТ / СОЧИ</p>
          <h1>Скутер под<br />ваш маршрут.</h1>
          <p className="hero__lead">Подберём модель под рельеф Сочи, ежедневный пробег и рабочую нагрузку.</p>
          <div className="hero__actions">
            <button className="primary-button" onClick={() => chooseRoute('all')}>Подобрать скутер <ChevronRight size={19} /></button>
            <button className="secondary-button" onClick={() => chooseRoute('city')}>Смотреть модели</button>
          </div>
        </div>
        <div className="hero-product">
          <div className="hero-product__head"><span>Флагман / Cargo X</span><span>01—04</span></div>
          <ScooterVisual product={featured} />
          <div className="hero-product__facts">
            <div><strong>{featured.range}</strong><span>км<br />запас хода</span></div>
            <div><strong>{featured.payload}</strong><span>кг<br />нагрузка</span></div>
            <div><strong>5</strong><span>ч<br />зарядка*</span></div>
          </div>
        </div>
        <p className="hero-footnote">* Характеристики и цены в прототипе демонстрационные. Финальные данные подтвердит менеджер.</p>
      </section>

      <section className="route-section" aria-labelledby="route-title">
        <div className="section-title"><span>01</span><div><p>Задача</p><h2 id="route-title">Для какого маршрута?</h2></div></div>
        <div className="route-list">
          <button onClick={() => chooseRoute('city')}><span>Город</span><small>Ежедневные поездки</small><ChevronRight /></button>
          <button onClick={() => chooseRoute('cargo')}><span>Работа</span><small>Груз и длинная смена</small><ChevronRight /></button>
          <button onClick={() => chooseRoute('compact')}><span>Хранение</span><small>Компактная база</small><ChevronRight /></button>
        </div>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-title"><span>02</span><div><p>Модельный ряд</p><h2>Скутеры GShop</h2></div></div>
        <div className="catalog-tools">
          <div className="category-tabs" role="tablist" aria-label="Категории">{categories.map((item) => <button key={item.id} role="tab" aria-selected={category === item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
          <label className="search-field"><Search size={19} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти модель" aria-label="Поиск по моделям" />{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={18} /></button>}</label>
        </div>
        <div className="catalog-note"><i /><span>Прототип каталога</span><span>цены и наличие уточняются</span></div>
        <div className="product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} index={products.indexOf(product)} onOpen={() => onOpen(product)} />)}</div>
        {!filtered.length && <div className="empty-state"><h3>Модель не найдена</h3><p>Измените запрос или выберите другую категорию.</p></div>}
      </section>

      <section className="service-section">
        <div className="section-title section-title--light"><span>03</span><div><p>GShop в Сочи</p><h2>От выбора до первого маршрута.</h2></div></div>
        <div className="service-list">
          <div><b>01</b><span><strong>Подбор</strong><small>Сопоставим пробег, рельеф и нагрузку.</small></span></div>
          <div><b>02</b><span><strong>Тест-драйв</strong><small>Уточните доступные модели и время у менеджера.</small></span></div>
          <div><b>03</b><span><strong>Получение</strong><small>Доступные варианты доставки появятся после подключения API.</small></span></div>
        </div>
        <p className="brand-story">GShop — OleGShop, магазин электротранспорта в Сочи.</p>
      </section>
    </main>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="back-bar"><button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={21} /></button><strong>{title}</strong><span /></div>;
}

function ProductPage({ product, onBack, onAdd }: { product: Product; onBack: () => void; onAdd: (selected: Addon[]) => void }) {
  const [selected, setSelected] = useState<Addon[]>([]);
  const toggle = (addon: Addon) => setSelected((current) => current.some((item) => item.id === addon.id) ? current.filter((item) => item.id !== addon.id) : [...current, addon]);
  const total = product.price + selected.reduce((sum, addon) => sum + addon.price, 0);

  return (
    <main className="detail-page">
      <BackBar title="Модель" onBack={onBack} />
      <section className="detail-visual"><span className="model-index">{product.id.slice(-2)}</span><ScooterVisual product={product} /></section>
      <section className="detail-content">
        <div className="product-card__topline"><span className={`stock stock--${product.stockTone}`}><i />{product.stockLabel}</span><span>{product.kicker}</span></div>
        <h1>{product.name}</h1>
        <p className="detail-description">{product.description}</p>
        <div className="detail-price"><small>Предварительная цена</small><strong>{formatPrice(product.price)}</strong><span>от {formatPrice(product.monthly)}/мес.*</span></div>
        <div className="detail-specs">
          <span><BatteryCharging /><small>Аккумулятор</small><strong>{product.battery}</strong></span>
          <span><MapPin /><small>Запас хода</small><strong>до {product.range} км</strong></span>
          <span><CircleGauge /><small>Скорость</small><strong>{product.speed} км/ч</strong></span>
          <span><PackageCheck /><small>Нагрузка</small><strong>до {product.payload} кг</strong></span>
        </div>
        <div className="fit-grid">
          <div><span>Подойдёт, если</span><p>{product.category === 'cargo' ? 'нужна усиленная рама для груза и длинных смен.' : 'нужен электроскутер для регулярных городских маршрутов.'}</p></div>
          <div><span>Стоит сравнить, если</span><p>{product.category === 'compact' ? 'часто ездите далеко или перевозите тяжёлый груз.' : 'главный приоритет — минимальный вес и хранение в квартире.'}</p></div>
        </div>
        <div className="feature-list">{product.features.map((feature) => <span key={feature}><Check size={17} />{feature}</span>)}</div>
        <div className="section-title section-title--compact"><span>Комплект</span><div><p>Опции</p><h2>Добавить к модели</h2></div></div>
        <div className="addon-list">{addons.map((addon) => { const active = selected.some((item) => item.id === addon.id); return <button key={addon.id} className={active ? 'addon is-active' : 'addon'} onClick={() => toggle(addon)} aria-pressed={active}><span className="addon-check">{active && <Check size={16} />}</span><span><strong>{addon.name}</strong><small>{addon.note}</small></span><b>+ {formatPrice(addon.price)}</b></button>; })}</div>
        <p className="finance-note">* Пример предварительного расчёта. Срок, первоначальный взнос и точные условия определяет финансовый партнёр.</p>
      </section>
      <div className="sticky-action"><div><small>Комплект</small><strong>{formatPrice(total)}</strong></div><button className="primary-button" onClick={() => onAdd(selected)}>Выбрать <ChevronRight size={20} /></button></div>
    </main>
  );
}

function CartPage({ lines, onBack, onChange, onCheckout }: { lines: CartLine[]; onBack: () => void; onChange: (productId: string, delta: number) => void; onCheckout: () => void }) {
  const total = cartTotal(lines);
  return (
    <main className="plain-page">
      <BackBar title="Ваш выбор" onBack={onBack} />
      <div className="page-body">
        <div className="section-title"><span>03</span><div><p>Заявка</p><h1>Выбранные модели</h1></div></div>
        {lines.length ? <div className="cart-list">{lines.map((line) => <article className="cart-line" key={line.product.id}><ScooterVisual product={line.product} compact /><div className="cart-line__copy"><span>{line.product.kicker}</span><strong>{line.product.name}</strong><small>{line.addons.length ? `Опций: ${line.addons.length}` : 'Базовая комплектация'}</small><b>{formatPrice((line.product.price + line.addons.reduce((sum, addon) => sum + addon.price, 0)) * line.quantity)}</b></div><div className="quantity"><button onClick={() => onChange(line.product.id, -1)} aria-label="Уменьшить"><Minus size={16} /></button><span>{line.quantity}</span><button onClick={() => onChange(line.product.id, 1)} aria-label="Увеличить"><Plus size={16} /></button></div></article>)}</div> : <div className="empty-state"><ShoppingBag size={34} /><h3>Пока ничего не выбрано</h3><p>Вернитесь в каталог и откройте подходящую модель.</p><button className="secondary-button" onClick={onBack}>В каталог</button></div>}
        {lines.length > 0 && <div className="summary-card"><p><span>Модели и опции</span><b>{formatPrice(total)}</b></p><p><span>Доставка</span><b className="muted">уточнит менеджер</b></p><div><span>Предварительно</span><strong>{formatPrice(total)}</strong></div></div>}
      </div>
      {lines.length > 0 && <div className="sticky-action sticky-action--single"><button className="primary-button" onClick={onCheckout}>Получить предложение <ChevronRight size={20} /></button></div>}
    </main>
  );
}

function Checkout({ total, onBack }: { total: number; onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const submit = (event: FormEvent) => { event.preventDefault(); hapticTap(); setSent(true); };
  return (
    <main className="plain-page checkout-page">
      <BackBar title="Предложение" onBack={onBack} />
      <div className="page-body">
        {sent ? <section className="success-state"><span><Check size={26} /></span><p>Локальный прототип</p><h1>Форма готова к подключению API.</h1><p>Сейчас данные никуда не отправлены. После подключения менеджер сможет подтвердить наличие и итоговую цену.</p><button className="secondary-button" onClick={onBack}>Вернуться к выбору</button></section> : <form className="lead-form" onSubmit={submit}>
          <div className="section-title"><span>04</span><div><p>Без обязательств</p><h1>Получить подтверждение цены</h1></div></div>
          <p className="form-intro">Оставьте контакт. Менеджер уточнит наличие, комплектацию и итоговую стоимость.</p>
          <div className="summary-line"><span>Выбранная комплектация</span><strong>{formatPrice(total)}</strong></div>
          <label><span>Имя</span><input required autoComplete="name" placeholder="Ваше имя" /></label>
          <label><span>Телефон</span><input required autoComplete="tel" inputMode="tel" placeholder="+7 900 000-00-00" /></label>
          <fieldset><legend>Как хотите получить?</legend><div className="choice-row"><button type="button" className={delivery === 'pickup' ? 'is-active' : ''} onClick={() => setDelivery('pickup')}>Самовывоз</button><button type="button" className={delivery === 'delivery' ? 'is-active' : ''} onClick={() => setDelivery('delivery')}>Доставка</button></div></fieldset>
          {delivery === 'delivery' && <label><span>Адрес</span><input autoComplete="street-address" placeholder="Район, улица, дом" /></label>}
          <fieldset><legend>Вариант оплаты</legend><div className="choice-row"><button type="button">Полностью</button><button type="button">Рассрочка</button></div></fieldset>
          <button className="primary-button form-submit" type="submit">Получить подтверждение <ChevronRight size={19} /></button>
          <p className="legal-copy">Заявка не обязывает к покупке. В прототипе форма работает локально и не передаёт персональные данные.</p>
        </form>}
      </div>
    </main>
  );
}

function BottomNav({ view, count, onCatalog, onCart }: { view: View; count: number; onCatalog: () => void; onCart: () => void }) {
  if (view === 'product' || view === 'checkout') return null;
  return <nav className="bottom-nav" aria-label="Основная навигация"><button className={view === 'catalog' ? 'is-active' : ''} onClick={onCatalog}><Search size={20} /><span>Каталог</span></button><button className={view === 'cart' ? 'is-active' : ''} onClick={onCart}><ShoppingBag size={20} /><span>Выбрано</span>{count > 0 && <i>{count}</i>}</button></nav>;
}

export function App() {
  const [view, setView] = useState<View>('catalog');
  const [theme, setTheme] = useState<Theme>('light');
  const [selectedProduct, setSelectedProduct] = useState<Product>(products[0]);
  const [cart, setCart] = useState<CartLine[]>([]);
  useEffect(() => { const app = prepareTelegram(); if (app?.colorScheme) setTheme(app.colorScheme); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090b12' : '#f4f6fa'); }, [theme]);
  const navigate = (next: View) => { hapticTap(); setView(next); window.scrollTo(0, 0); };
  const openProduct = (product: Product) => { setSelectedProduct(product); navigate('product'); };
  const addToCart = (product: Product, selectedAddons: Addon[] = []) => { setCart((current) => { const existing = current.find((line) => line.product.id === product.id); if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1, addons: selectedAddons.length ? selectedAddons : line.addons } : line); return [...current, { product, quantity: 1, addons: selectedAddons }]; }); navigate('cart'); };
  const changeQuantity = (id: string, delta: number) => setCart((current) => current.map((line) => line.product.id === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0));
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <div className="app-shell">{view === 'catalog' && <><Header theme={theme} count={count} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} onCart={() => navigate('cart')} /><Catalog onOpen={openProduct} /></>}{view === 'product' && <ProductPage product={selectedProduct} onBack={() => navigate('catalog')} onAdd={(selected) => addToCart(selectedProduct, selected)} />}{view === 'cart' && <CartPage lines={cart} onBack={() => navigate('catalog')} onChange={changeQuantity} onCheckout={() => navigate('checkout')} />}{view === 'checkout' && <Checkout total={cartTotal(cart)} onBack={() => navigate('cart')} />}<BottomNav view={view} count={count} onCatalog={() => navigate('catalog')} onCart={() => navigate('cart')} /></div>;
}
