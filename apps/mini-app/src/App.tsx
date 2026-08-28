import {
  ArrowLeft,
  BatteryCharging,
  Bike,
  Check,
  ChevronRight,
  CircleGauge,
  Clock3,
  MapPin,
  Minus,
  Moon,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ScooterVisual } from './components/ScooterVisual';
import { addons, products } from './data';
import { cartTotal, formatPrice } from './lib/pricing';
import { hapticTap, prepareTelegram } from './lib/telegram';
import type { Addon, CartLine, Category, Product } from './types';

type View = 'catalog' | 'product' | 'cart' | 'checkout';
type Theme = 'light' | 'dark';

const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'Все модели' },
  { id: 'city', label: 'Городские' },
  { id: 'cargo', label: 'Грузовые' },
  { id: 'compact', label: 'Компактные' },
];

function DemoNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`demo-notice ${compact ? 'demo-notice--compact' : ''}`} role="note">
      <i aria-hidden="true" />
      <span>{compact ? 'DEMO' : 'Демо-каталог · цены и наличие уточняются'}</span>
    </div>
  );
}

function Header({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  return (
    <header className="app-header">
      <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="GShop Ole G Shop Sochi, наверх">
        <span className="brand-mark">G</span>
        <span className="brand-copy"><strong>GSHOP</strong><small>OLE G SHOP · SOCHI</small></span>
      </button>
      <div className="header-actions">
        <DemoNotice compact />
        <button className="icon-button" onClick={onTheme} aria-label="Сменить тему">
          {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
        </button>
      </div>
    </header>
  );
}

function ProductCard({ product, onOpen, onAdd }: { product: Product; onOpen: () => void; onAdd: () => void }) {
  return (
    <article className="product-card">
      <button className="product-card__visual" onClick={onOpen} aria-label={`Демо-визуал ${product.id.toUpperCase()}. Открыть ${product.name}`}>
        <ScooterVisual product={product} compact />
      </button>
      <div className="product-card__body">
        <div className="eyebrow-row">
          <span className={`stock stock--${product.stockTone}`}>{product.stockLabel}</span>
          <span className="product-code">{product.id}</span>
        </div>
        <button className="product-title-button" onClick={onOpen}>
          <span className="product-kicker">{product.kicker}</span>
          <strong>{product.name}</strong>
        </button>
        <div className="spec-grid" aria-label="Характеристики">
          <span><BatteryCharging size={15} />{product.battery}</span>
          <span><MapPin size={15} />до {product.range} км</span>
          <span><CircleGauge size={15} />{product.speed} км/ч</span>
        </div>
        <div className="price-row">
          <div>
            <span className="demo-price-label">Демо-цена</span>
            <strong className="price">{formatPrice(product.price)}</strong>
          </div>
          <button className="add-button" onClick={onAdd} aria-label={`Добавить ${product.name} в корзину`}>
            <Plus size={20} />
          </button>
        </div>
        <p className="monthly">от {formatPrice(product.monthly)}/мес. <span>предварительно</span></p>
      </div>
    </article>
  );
}

function Catalog({ onOpen, onAdd }: { onOpen: (product: Product) => void; onAdd: (product: Product) => void }) {
  const [category, setCategory] = useState<Category>('all');
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => products.filter((product) => (category === 'all' || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase())),
    [category, query],
  );

  return (
    <main className="catalog">
      <section className="hero">
        <div className="hero__copy">
          <DemoNotice />
          <p className="overline">GSHOP · OLEGSHOP · БОЛЬШОЙ СОЧИ</p>
          <h1>Город работает.<br /><em>Вы — впереди.</em></h1>
          <p className="hero__lead">Электроскутеры для ежедневных маршрутов, серьёзной нагрузки и уверенного движения по городу.</p>
          <button className="hero__cta" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>
            Смотреть модели <ChevronRight size={18} />
          </button>
          <div className="zone-list" aria-label="Зоны работы">
            <span>Адлер</span><span>Сириус</span><span>Красная Поляна</span>
          </div>
        </div>
        <div className="hero__visual" aria-label="Концепт грузового электроскутера GShop">
          <div className="hero__visual-top"><span>G / CARGO 01</span><b>СОЗДАН ДЛЯ МАРШРУТА</b></div>
          <ScooterVisual product={products[1]} />
          <div className="hero__visual-bottom"><span>32 А·ч</span><span>до 80 км</span><span>до 220 кг</span></div>
        </div>
      </section>

      <section className="service-strip" aria-label="Ключевые характеристики каталога">
        <span><b>80<sup> км</sup></b><small>макс. запас хода</small></span>
        <span><b>220<sup> кг</sup></b><small>макс. нагрузка</small></span>
        <span><b>6 140<sup> ₽</sup></b><small>от · в месяц</small></span>
      </section>

      <section className="catalog-section" id="catalog">
        <div className="section-heading">
          <div><p className="overline">Модельный ряд</p><h2>Скутеры GShop</h2></div>
          <button className="filter-button" aria-label="Фильтры пока недоступны"><SlidersHorizontal size={19} /><span>Фильтры</span></button>
        </div>
        <label className="search-field">
          <Search size={20} aria-hidden="true" />
          <input id="catalog-search" name="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти модель" aria-label="Поиск по моделям" />
          {query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={18} /></button>}
        </label>
        <div className="category-tabs" role="tablist" aria-label="Категории">
          {categories.map((item) => (
            <button key={item.id} role="tab" aria-selected={category === item.id} className={category === item.id ? 'is-active' : ''} onClick={() => setCategory(item.id)}>{item.label}</button>
          ))}
        </div>
        <div className="catalog-meta"><span>{filtered.length} конфигурации</span><span>Данные демонстрационные</span></div>
        {filtered.length ? (
          <div className="product-grid">
            {filtered.map((product) => <ProductCard key={product.id} product={product} onOpen={() => onOpen(product)} onAdd={() => onAdd(product)} />)}
          </div>
        ) : (
          <div className="empty-state"><Bike size={36} /><h3>Ничего не нашли</h3><p>Попробуйте другой запрос или категорию.</p></div>
        )}
      </section>
      <section className="disclaimer-panel">
        <Clock3 size={20} />
        <div><strong>Предварительный расчёт</strong><p>Итоговые условия определяет банк. Все суммы в прототипе являются заглушками и не являются публичной офертой.</p></div>
      </section>
    </main>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="back-bar"><button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={22} /></button><strong>{title}</strong><span /></div>;
}

function ProductPage({ product, onBack, onAdd }: { product: Product; onBack: () => void; onAdd: (selected: Addon[]) => void }) {
  const [selected, setSelected] = useState<Addon[]>([]);
  const toggle = (addon: Addon) => setSelected((current) => current.some((item) => item.id === addon.id) ? current.filter((item) => item.id !== addon.id) : [...current, addon]);
  const total = product.price + selected.reduce((sum, addon) => sum + addon.price, 0);

  return (
    <main className="detail-page">
      <BackBar title="Модель" onBack={onBack} />
      <ScooterVisual product={product} />
      <section className="detail-content">
        <div className="eyebrow-row"><span className={`stock stock--${product.stockTone}`}>{product.stockLabel}</span><span className="product-code">{product.id}</span></div>
        <p className="product-kicker">{product.kicker}</p>
        <h1>{product.name}</h1>
        <p className="detail-description">{product.description}</p>
        <div className="detail-specs">
          <span><BatteryCharging /><small>Аккумулятор</small><strong>{product.battery}</strong></span>
          <span><MapPin /><small>Запас хода</small><strong>до {product.range} км</strong></span>
          <span><CircleGauge /><small>Скорость</small><strong>{product.speed} км/ч</strong></span>
          <span><PackageCheck /><small>Нагрузка</small><strong>до {product.payload} кг</strong></span>
        </div>
        <div className="feature-list">{product.features.map((feature) => <span key={feature}><Check size={17} />{feature}</span>)}</div>
        <div className="section-heading section-heading--small"><div><p className="overline">Комплект</p><h2>Дополнения</h2></div><span>{selected.length} выбрано</span></div>
        <div className="addon-list">
          {addons.map((addon) => {
            const active = selected.some((item) => item.id === addon.id);
            return <button key={addon.id} className={active ? 'addon is-active' : 'addon'} onClick={() => toggle(addon)} aria-pressed={active}><span className="addon-check">{active && <Check size={16} />}</span><span><strong>{addon.name}</strong><small>{addon.note}</small></span><b>+ {formatPrice(addon.price)}</b></button>;
          })}
        </div>
        <div className="finance-preview"><div><span>Демо-цена комплекта</span><strong>{formatPrice(total)}</strong></div><p>от {formatPrice(Math.round(total / 12))}/мес. · предварительно</p></div>
      </section>
      <div className="sticky-action"><div><small>Итого, демо</small><strong>{formatPrice(total)}</strong></div><button className="primary-button" onClick={() => onAdd(selected)}>В корзину <ChevronRight size={20} /></button></div>
    </main>
  );
}

function CartPage({ lines, onBack, onChange, onCheckout }: { lines: CartLine[]; onBack: () => void; onChange: (productId: string, delta: number) => void; onCheckout: () => void }) {
  const total = cartTotal(lines);
  return (
    <main className="plain-page">
      <BackBar title="Корзина" onBack={onBack} />
      <div className="page-body">
        <div className="section-heading"><div><p className="overline">Ваш выбор</p><h1>Корзина</h1></div><span>{lines.length} поз.</span></div>
        <DemoNotice />
        {lines.length ? <div className="cart-list">{lines.map((line) => (
          <article className="cart-line" key={line.product.id}>
            <ScooterVisual product={line.product} compact />
            <div className="cart-line__copy"><span>{line.product.kicker}</span><strong>{line.product.name}</strong><small>{line.addons.length ? `+ ${line.addons.length} дополнения` : 'Базовая комплектация'}</small><b>{formatPrice(line.product.price + line.addons.reduce((sum, addon) => sum + addon.price, 0))}</b></div>
            <div className="quantity"><button onClick={() => onChange(line.product.id, -1)} aria-label="Уменьшить"><Minus size={16} /></button><span>{line.quantity}</span><button onClick={() => onChange(line.product.id, 1)} aria-label="Увеличить"><Plus size={16} /></button></div>
          </article>
        ))}</div> : <div className="empty-state"><ShoppingBag size={36} /><h3>Корзина пуста</h3><p>Выберите электроскутер в каталоге.</p><button className="secondary-button" onClick={onBack}>В каталог</button></div>}
        {lines.length > 0 && <>
          <div className="summary-card"><p><span>Товары и дополнения</span><b>{formatPrice(total)}</b></p><p><span>Доставка</span><b className="muted">API не подключён</b></p><div><span>Итого до доставки</span><strong>{formatPrice(total)}</strong></div></div>
          <p className="legal-copy">Все цены демонстрационные. Перед отправкой заявки итог будет повторно рассчитан сервером после подключения API.</p>
        </>}
      </div>
      {lines.length > 0 && <div className="sticky-action sticky-action--single"><button className="primary-button" onClick={onCheckout}>Продолжить <ChevronRight size={20} /></button></div>}
    </main>
  );
}

function Checkout({ total, onBack }: { total: number; onBack: () => void }) {
  const [step, setStep] = useState(0);
  const steps = ['Контакты', 'Адрес', 'Итог'];
  return (
    <main className="plain-page checkout-page">
      <BackBar title="Оформление" onBack={step === 0 ? onBack : () => setStep((value) => value - 1)} />
      <div className="page-body">
        <div className="checkout-progress">{steps.map((label, index) => <span key={label} className={index <= step ? 'is-active' : ''}><i>{index < step ? <Check size={13} /> : index + 1}</i><small>{label}</small></span>)}</div>
        {step === 0 && <section className="form-section"><p className="overline">Шаг 1 из 3</p><h1>Как с вами связаться?</h1><p>Поля работают локально и никуда не отправляются.</p><label><span>Имя</span><input id="checkout-name" name="name" autoComplete="name" placeholder="Например, Сергей" /></label><label><span>Телефон</span><input id="checkout-phone" name="phone" autoComplete="tel" inputMode="tel" placeholder="+7 900 000-00-00" /></label><div className="consent-mock"><ShieldCheck size={20} /><span><strong>Согласия — заглушки</strong><small>Юридические тексты появятся после данных ИП и проверки юриста.</small></span></div></section>}
        {step === 1 && <section className="form-section"><p className="overline">Шаг 2 из 3</p><h1>Куда доставить?</h1><p>Яндекс Карты и расчёт доставки пока отключены.</p><label><span>Адрес</span><input id="checkout-address" name="address" autoComplete="street-address" placeholder="Город, улица, дом" /></label><div className="map-placeholder"><MapPin size={26} /><strong>Карта появится здесь</strong><span>Yandex Maps API · MOCK</span></div><div className="api-status"><span><i />Подсказки адресов</span><b>НЕ ПОДКЛЮЧЕНО</b></div><div className="api-status"><span><i />Расчёт доставки</span><b>НЕ ПОДКЛЮЧЕНО</b></div></section>}
        {step === 2 && <section className="form-section"><p className="overline">Шаг 3 из 3</p><h1>Проверка заказа</h1><p>Заявка не будет создана: финансовый провайдер работает как заглушка.</p><div className="summary-card"><p><span>Комплект</span><b>{formatPrice(total)}</b></p><p><span>Доставка</span><b className="muted">не рассчитана</b></p><div><span>Предварительный итог</span><strong>{formatPrice(total)}</strong></div></div><div className="broker-placeholder"><Zap size={22} /><div><strong>Анкета рассрочки</strong><p>FinanceProvider · MOCK</p></div><span>ОТКЛЮЧЕНА</span></div><p className="legal-copy">Предварительный расчёт. Итоговые условия определяет банк. Не является публичной офертой.</p></section>}
      </div>
      <div className="sticky-action sticky-action--single">
        {step < 2 ? <button className="primary-button" onClick={() => setStep((value) => value + 1)}>Продолжить <ChevronRight size={20} /></button> : <button className="primary-button" disabled>Интеграция отключена</button>}
      </div>
    </main>
  );
}

function BottomNav({ view, count, onCatalog, onCart }: { view: View; count: number; onCatalog: () => void; onCart: () => void }) {
  if (view === 'product' || view === 'checkout') return null;
  return <nav className="bottom-nav" aria-label="Основная навигация"><button className={view === 'catalog' ? 'is-active' : ''} onClick={onCatalog}><Bike size={21} /><span>Каталог</span></button><button className={view === 'cart' ? 'is-active cart-nav' : 'cart-nav'} onClick={onCart}><ShoppingBag size={21} /><span>Корзина</span>{count > 0 && <i>{count}</i>}</button></nav>;
}

export function App() {
  const [theme, setTheme] = useState<Theme>('dark');
  const [view, setView] = useState<View>('catalog');
  const [selectedProduct, setSelectedProduct] = useState<Product>(products[0]);
  const [cart, setCart] = useState<CartLine[]>([]);

  useEffect(() => {
    const app = prepareTelegram();
    if (app?.colorScheme) setTheme(app.colorScheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#070b16' : '#f4f7ff');
  }, [theme]);

  const navigate = (next: View) => { hapticTap(); setView(next); window.scrollTo(0, 0); };
  const openProduct = (product: Product) => { setSelectedProduct(product); navigate('product'); };
  const addToCart = (product: Product, selectedAddons: Addon[] = []) => {
    hapticTap();
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1, addons: selectedAddons.length ? selectedAddons : line.addons } : line);
      return [...current, { product, quantity: 1, addons: selectedAddons }];
    });
    navigate('cart');
  };
  const changeQuantity = (id: string, delta: number) => setCart((current) => current.map((line) => line.product.id === id ? { ...line, quantity: line.quantity + delta } : line).filter((line) => line.quantity > 0));
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div className="app-shell">
      {view === 'catalog' && <><Header theme={theme} onTheme={() => setTheme(theme === 'light' ? 'dark' : 'light')} /><Catalog onOpen={openProduct} onAdd={(product) => addToCart(product)} /></>}
      {view === 'product' && <ProductPage product={selectedProduct} onBack={() => navigate('catalog')} onAdd={(selected) => addToCart(selectedProduct, selected)} />}
      {view === 'cart' && <CartPage lines={cart} onBack={() => navigate('catalog')} onChange={changeQuantity} onCheckout={() => navigate('checkout')} />}
      {view === 'checkout' && <Checkout total={cartTotal(cart)} onBack={() => navigate('cart')} />}
      <BottomNav view={view} count={count} onCatalog={() => navigate('catalog')} onCart={() => navigate('cart')} />
    </div>
  );
}
