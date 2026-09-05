import {
  ArrowLeft,
  ArrowLeftRight,
  BatteryCharging,
  Check,
  ChevronRight,
  CircleGauge,
  Grid2X2,
  Handshake,
  Heart,
  Home,
  MapPin,
  Menu as MenuIcon,
  MessageCircle,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Truck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { type CSSProperties, FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScooterVisual } from './components/ScooterVisual';
import { addons, products } from './data';
import { addCartLine, cartLineKey, changeCartLineQuantity } from './lib/cart';
import { cartTotal, formatPrice } from './lib/pricing';
import { hapticTap, prepareTelegram } from './lib/telegram';
import type { Addon, CartLine, Category, Product } from './types';

type View = 'home' | 'catalog' | 'info' | 'product' | 'compare' | 'cart' | 'checkout' | 'orders' | 'profile';
type Theme = 'light' | 'dark';
type InfoTopic = 'about' | 'city' | 'delivery' | 'selection' | 'contact';

const safeStorageGet = (kind: 'localStorage' | 'sessionStorage', key: string) => {
  try { return window[kind].getItem(key); } catch { return null; }
};
const safeStorageSet = (kind: 'localStorage' | 'sessionStorage', key: string, value: string) => {
  try { window[kind].setItem(key, value); } catch { /* Storage can be disabled inside a restricted WebView. */ }
};

const modelCountLabel = (count: number) => {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} моделей`;
  if (mod10 === 1) return `${count} модель`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} модели`;
  return `${count} моделей`;
};

const trackStoreEvent = (event: string, details: Record<string, unknown> = {}) => {
  const browser = window as Window & { dataLayer?: Record<string, unknown>[] };
  browser.dataLayer ??= [];
  browser.dataLayer.push({ event, ...details });
};

const scrollImmediately = (top = 0) => {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  root.scrollTop = top;
  document.body.scrollTop = top;
  window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  window.requestAnimationFrame(() => { root.style.scrollBehavior = previous; });
};

const categoryLabel = (id: Category) => categories.find((item) => item.id === id)?.label ?? '';

const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'Все модели' },
  { id: 'city', label: 'Город' },
  { id: 'cargo', label: 'Работа' },
  { id: 'compact', label: 'Компактные' },
];

function Header({ count, active, onHome, onCatalog, onInfo, onCart, onProfile }: { count: number; active: 'home' | 'catalog' | InfoTopic; onHome: () => void; onCatalog: () => void; onInfo: (topic: InfoTopic) => void; onCart: () => void; onProfile: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const focusSearch = () => {
    onCatalog();
    window.requestAnimationFrame(() => window.setTimeout(() => document.getElementById('catalog-search')?.focus(), 50));
  };
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', closeOnEscape); };
  }, [menuOpen]);
  const goTo = (action: () => void) => { setMenuOpen(false); action(); };
  return (
    <header className="app-header">
      <button className="icon-button menu-button" onClick={() => setMenuOpen(true)} aria-label="Открыть меню"><MenuIcon size={21} /></button>
      <button className="brand" onClick={onHome} aria-label="G-Partner, главная">
        <img className="brand-emblem" src="/brand/gpartner-mark-v2-512.png" alt="" width="48" height="48" />
        <span className="brand-lockup"><span className="brand-name"><b>G-</b>PARTNER</span><small>магазин электротехники</small></span>
      </button>
      <nav className="desktop-nav" aria-label="Навигация по сайту">
        <button className={active === 'catalog' ? 'is-active' : ''} onClick={onCatalog}>Каталог</button>
        <button className={active === 'about' ? 'is-active' : ''} onClick={() => onInfo('about')}>О магазине</button>
        <button className={active === 'city' ? 'is-active' : ''} onClick={() => onInfo('city')}>Большой Сочи</button>
        <button className={active === 'delivery' ? 'is-active' : ''} onClick={() => onInfo('delivery')}>Доставка и оплата</button>
        <button className={active === 'contact' ? 'is-active' : ''} onClick={() => onInfo('contact')}>Контакты</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button" onClick={focusSearch} aria-label="Открыть поиск"><Search size={21} /></button>
        <button className="icon-button" onClick={onProfile} aria-label="Профиль"><UserRound size={21} /></button>
        <button className="icon-button header-cart" onClick={onCart} aria-label={`Корзина, товаров: ${count}`}><ShoppingBag size={21} />{count > 0 && <b>{count}</b>}</button>
      </div>
      {menuOpen && createPortal(
        <div className="nav-backdrop" role="presentation" onClick={() => setMenuOpen(false)}>
          <nav className="nav-sheet" role="dialog" aria-modal="true" aria-label="Меню" onClick={(event) => event.stopPropagation()}>
            <div className="nav-sheet__head"><span><b>G-</b>PARTNER</span><button onClick={() => setMenuOpen(false)} aria-label="Закрыть меню"><X /></button></div>
            <button className={active === 'catalog' ? 'is-active' : ''} onClick={() => goTo(onCatalog)}><Grid2X2 size={19} />Каталог</button>
            <button className={active === 'about' ? 'is-active' : ''} onClick={() => goTo(() => onInfo('about'))}><Handshake size={19} />О магазине</button>
            <button className={active === 'city' ? 'is-active' : ''} onClick={() => goTo(() => onInfo('city'))}><MapPin size={19} />Большой Сочи</button>
            <button className={active === 'delivery' ? 'is-active' : ''} onClick={() => goTo(() => onInfo('delivery'))}><Truck size={19} />Доставка и оплата</button>
            <button className={active === 'contact' ? 'is-active' : ''} onClick={() => goTo(() => onInfo('contact'))}><MessageCircle size={19} />Контакты</button>
          </nav>
        </div>,
        document.body,
      )}
    </header>
  );
}

function ProductCard({ product, index, favorite, compared, onFavorite, onCompare, onOpen, onAdd }: { product: Product; index: number; favorite: boolean; compared: boolean; onFavorite: () => void; onCompare: () => void; onOpen: () => void; onAdd: () => void }) {
  const [added, setAdded] = useState(false);
  const quickAdd = () => {
    setAdded(true);
    onAdd();
    window.setTimeout(() => setAdded(false), 1300);
  };
  return (
    <article className="product-card" data-reveal>
      <button className="product-card__visual" onClick={onOpen} aria-label={`Открыть ${product.name}`}>
        <span className="model-index">{String(index + 1).padStart(2, '0')}</span>
        {index < 2 && <span className="product-hit">Хит</span>}
        <ScooterVisual product={product} compact priority={index < 4} />
      </button>
      <div className="product-card__body">
        <div className="product-card__topline"><span className={`category-chip category-chip--${product.category}`}>{categoryLabel(product.category)}</span><span className={`stock stock--${product.stockTone}`}><i />{product.stockLabel}</span><div className="product-card__tools"><button className={`compare-button ${compared ? 'is-active' : ''}`} aria-label={compared ? 'Убрать из сравнения' : 'Добавить к сравнению'} aria-pressed={compared} onClick={onCompare}><ArrowLeftRight size={17} /></button><button className={`favorite-button ${favorite ? 'is-active' : ''}`} aria-label={favorite ? 'Удалить из избранного' : 'Добавить в избранное'} aria-pressed={favorite} onClick={onFavorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button></div></div>
        <h3>{product.name}</h3>
        <p className="product-use-case">{product.useCase}</p>
        <dl className="product-facts">
          <div><dt>Ход</dt><dd>до {product.range} км</dd></div>
          <div><dt>Скорость</dt><dd>{product.speed} км/ч</dd></div>
          <div><dt>Батарея</dt><dd>{product.battery}</dd></div>
        </dl>
        <div className="product-card__footer">
          <div className="price-block"><small>Предварительная цена</small><strong>{formatPrice(product.price)}</strong><span>от {formatPrice(product.monthly)}/мес.*</span></div>
          <div className="card-actions"><button className="details-button" onClick={onOpen}>Подробнее</button><button className={`quick-buy ${added ? 'is-added' : ''}`} onClick={quickAdd} aria-label={added ? 'Добавлено в корзину' : `Добавить ${product.name} в корзину`}>{added ? <Check size={18} /> : <ShoppingBag size={18} />}<span className="quick-buy__label">{added ? 'Добавлено' : 'В корзину'}</span></button></div>
        </div>
      </div>
    </article>
  );
}

function ContactLead() {
  const [sent, setSent] = useState(false);
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); hapticTap(); setSent(true); };
  if (sent) return <div className="contact-success" role="status"><Check size={22} /><div><strong>Запрос сохранён</strong><span>В режиме предпросмотра данные остаются в этом браузере и не отправляются менеджеру.</span></div></div>;
  return <form className="contact-form" id="contact-lead" onSubmit={submit}><label htmlFor="consultation-phone"><span>Телефон для связи</span><input id="consultation-phone" name="phone" required inputMode="tel" autoComplete="tel" placeholder="+7 900 000-00-00" /></label><button className="primary-button" type="submit">Получить консультацию <ChevronRight size={19} /></button></form>;
}

type StoreInfo = {
  eyebrow: string;
  title: string;
  body: string;
  metrics: { value: string; label: string }[];
  facts: { title: string; text: string }[];
  note: string;
};

const infoContent: Record<Exclude<InfoTopic, 'selection' | 'contact'>, StoreInfo> = {
  about: {
    eyebrow: 'О магазине',
    title: 'Не просто продаём — подбираем технику под ваш маршрут.',
    body: 'G-Partner — магазин электроскутеров в Большом Сочи. Мы собрали компактную линейку для города, ежедневной работы и перевозки груза, чтобы выбор не превращался в бесконечное сравнение.',
    metrics: [
      { value: '04', label: 'модели в стартовой линейке' },
      { value: '03', label: 'сценария использования' },
      { value: 'СОЧИ', label: 'регион работы магазина' },
    ],
    facts: [
      { title: 'Разбираем задачу', text: 'Уточняем маршрут, рельеф, запас хода, нагрузку и место хранения.' },
      { title: 'Сравниваем по делу', text: 'Показываем различия в характеристиках и не перегружаем лишними параметрами.' },
      { title: 'Согласовываем получение', text: 'Менеджер подтверждает наличие, комплектацию, итоговую цену и способ получения.' },
    ],
    note: 'На сайте можно спокойно выбрать модель и оставить заявку. Онлайн-оплаты нет — сначала вы получаете подтверждённое предложение.',
  },
  city: {
    eyebrow: 'Большой Сочи',
    title: 'Подбираем электроскутеры с учётом города, а не только цифр.',
    body: 'Большой Сочи — это подъёмы, протяжённые маршруты и разные условия в каждом районе. Поэтому при подборе мы смотрим не только на заявленный запас хода, но и на реальную задачу владельца.',
    metrics: [
      { value: '04', label: 'района Большого Сочи' },
      { value: '70+', label: 'км хода у старших моделей' },
      { value: '220', label: 'кг максимальной нагрузки' },
    ],
    facts: [
      { title: 'География', text: 'Центральный, Хостинский, Адлерский и Лазаревский районы.' },
      { title: 'Рельеф и расстояние', text: 'Учитываем подъёмы, длину регулярного маршрута и требуемый запас батареи.' },
      { title: 'Получение техники', text: 'Доступность доставки или другого способа получения уточняется по вашему адресу.' },
    ],
    note: 'Назовите район и примерный ежедневный маршрут — менеджер предложит подходящие модели и предупредит о важных ограничениях.',
  },
  delivery: {
    eyebrow: 'Получение техники',
    title: 'Понятные условия до оплаты.',
    body: 'После выбора модели менеджер проверяет наличие и комплектацию, уточняет адрес и согласовывает удобный способ получения. Предварительная цена на витрине помогает сравнить модели.',
    metrics: [
      { value: '01', label: 'заявка на выбранную модель' },
      { value: '00 ₽', label: 'списаний на сайте' },
      { value: '100%', label: 'деталей до согласования' },
    ],
    facts: [
      { title: 'Выбор', text: 'Добавьте модель в корзину или оставьте запрос на консультацию.' },
      { title: 'Подтверждение', text: 'Менеджер уточнит наличие, итоговую стоимость и доступную комплектацию.' },
      { title: 'Получение', text: 'Способ, адрес и время согласовываются индивидуально после подтверждения заказа.' },
    ],
    note: 'Цены и характеристики на витрине пока являются демонстрационными и не считаются публичной офертой.',
  },
};

function StoreInfoPage({ topic, onHome, onChoose }: { topic: InfoTopic; onHome: () => void; onChoose: (category: Category) => void }) {
  if (topic === 'selection') return <main className="store-info-page">
    <section className="info-page-hero info-page-hero--compact"><button className="info-breadcrumb" onClick={onHome}>Главная <ChevronRight size={14} /> Подбор модели</button><p>Быстрый подбор</p><h1>Для чего нужен электроскутер?</h1><span>Выберите основной сценарий — каталог откроется с подходящей категорией.</span></section>
    <section className="info-page-content"><div className="info-choice-grid info-choice-grid--page">
      <button onClick={() => onChoose('city')}><MapPin size={24} /><span><strong>Для города</strong><small>Ежедневные поездки и личные маршруты</small></span><ChevronRight size={19} /></button>
      <button onClick={() => onChoose('cargo')}><PackageCheck size={24} /><span><strong>Для работы</strong><small>Груз, доставка и продолжительные смены</small></span><ChevronRight size={19} /></button>
      <button onClick={() => onChoose('compact')}><Grid2X2 size={24} /><span><strong>Компактный</strong><small>Манёвренность и удобное хранение</small></span><ChevronRight size={19} /></button>
    </div></section>
  </main>;

  if (topic === 'contact') return <main className="store-info-page">
    <section className="info-page-hero"><button className="info-breadcrumb" onClick={onHome}>Главная <ChevronRight size={14} /> Контакты</button><p>Связаться с магазином</p><h1>Расскажите, какая техника вам нужна.</h1><span>Укажите телефон — после подключения API запрос будет передан менеджеру G-Partner.</span></section>
    <section className="info-page-content info-page-content--contact"><div><p className="section-number">КОНСУЛЬТАЦИЯ</p><h2>Обсудим маршрут, нагрузку и бюджет</h2><p>Можно начать с вопроса без оформления заказа. Сейчас форма работает как демонстрация и не отправляет данные.</p></div><ContactLead /></section>
  </main>;

  const content = infoContent[topic];
  return <main className="store-info-page">
    <section className="info-page-hero">
      <button className="info-breadcrumb" onClick={onHome}>Главная <ChevronRight size={14} /> {content.eyebrow}</button>
      <div><p>{content.eyebrow}</p><h1>{content.title}</h1><span>{content.body}</span></div>
      <img src="/brand/gpartner-mark-v2-512.png" alt="" width="220" height="220" />
    </section>
    <section className="info-page-content">
      <div className="info-metrics">{content.metrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div>
      <div className="info-document-layout">
        <div><p className="section-number">КАК РАБОТАЕТ G-PARTNER</p><h2>Информация о магазине</h2><div className="info-feature-grid">{content.facts.map((fact, index) => <article key={fact.title}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{fact.title}</strong><p>{fact.text}</p></div></article>)}</div></div>
        <aside><p className="section-number">ВАЖНО ДО ЗАКАЗА</p><h3>Условия и статус информации</h3><p>{content.note}</p><ul><li><Check size={16} />Цена подтверждается менеджером</li><li><Check size={16} />Онлайн-оплата пока отключена</li><li><Check size={16} />Заявка не обязывает к покупке</li></ul><button className="primary-button" onClick={() => onChoose('all')}>Открыть каталог <ChevronRight size={18} /></button></aside>
      </div>
    </section>
  </main>;
}

function Catalog({ screen, compared, onInfo, onCatalog, onOpen, onQuickAdd, onToggleCompare, onCompare }: { screen: 'home' | 'catalog'; compared: Set<string>; onInfo: (topic: InfoTopic) => void; onCatalog: () => void; onOpen: (product: Product) => void; onQuickAdd: (product: Product) => void; onToggleCompare: (product: Product) => void; onCompare: () => void }) {
  const [category, setCategory] = useState<Category>(() => (safeStorageGet('sessionStorage', 'gshop-category') as Category | null) ?? 'all');
  const [query, setQuery] = useState(() => safeStorageGet('sessionStorage', 'gshop-query') ?? '');
  const [sort, setSort] = useState<'popular' | 'price'>(() => safeStorageGet('sessionStorage', 'gshop-sort') === 'price' ? 'price' : 'popular');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minRange, setMinRange] = useState(() => Number(safeStorageGet('sessionStorage', 'gshop-range') ?? 0));
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(safeStorageGet('localStorage', 'gshop-favorites') ?? '[]') as string[]); } catch { return new Set(); }
  });
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterCloseRef = useRef<HTMLButtonElement>(null);
  const filterSheetRef = useRef<HTMLElement>(null);
  const categoryShowcase = useMemo(
    () => categories.filter((item) => item.id !== 'all').map((item) => ({ ...item, product: products.find((product) => product.category === item.id) ?? products[0] })),
    [],
  );
  const filtered = useMemo(() => {
    const result = products.filter((product) => (category === 'all' || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase()) && product.range >= minRange);
    return sort === 'price' ? [...result].sort((a, b) => a.price - b.price) : result;
  }, [category, query, minRange, sort]);
  const chooseRoute = (next: Category) => { setCategory(next); onCatalog(); };
  const moveCategoryTab = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? categories.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + categories.length) % categories.length;
    setCategory(categories[nextIndex].id);
    (event.currentTarget.parentElement?.children[nextIndex] as HTMLElement | undefined)?.focus();
  };
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    elements.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [category, query, minRange, screen]);

  useEffect(() => {
    if (!filtersOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setFiltersOpen(false); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(filterSheetRef.current?.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])') ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => filterCloseRef.current?.focus());
    window.addEventListener('keydown', handleDialogKeys);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleDialogKeys); filterTriggerRef.current?.focus(); };
  }, [filtersOpen]);

  useEffect(() => {
    safeStorageSet('sessionStorage', 'gshop-category', category);
    safeStorageSet('sessionStorage', 'gshop-query', query);
    safeStorageSet('sessionStorage', 'gshop-sort', sort);
    safeStorageSet('sessionStorage', 'gshop-range', String(minRange));
  }, [category, query, sort, minRange]);

  useEffect(() => { safeStorageSet('localStorage', 'gshop-favorites', JSON.stringify([...favorites])); }, [favorites]);
  const toggleFavorite = (id: string) => {
    hapticTap();
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <main className={`catalog catalog--${screen}`}>
      {screen === 'home' && <>
      <section className="hero home-hero">
        <div className="hero-campaign-media" aria-hidden="true"><img src="/products/hero-campaign-v2.jpg" alt="" width="1672" height="936" fetchPriority="high" /></div>
        <div className="hero__intro">
          <p className="section-number">Электротранспорт · Большой Сочи</p>
          <h1><span>МАГАЗИН</span><br /><em>ЭЛЕКТРОТРАНСПОРТА</em></h1>
          <p className="hero__lead">Продажа электроскутеров для города, работы и перевозки грузов в Большом Сочи. Поможем сравнить модели и уточним наличие.</p>
          <button className="hero-featured" onClick={() => onOpen(categoryShowcase[1].product)}><span className="hero-featured__visual" aria-hidden="true"><ScooterVisual product={categoryShowcase[1].product} compact /></span><span>ХИТ КАТАЛОГА</span><strong>{categoryShowcase[1].product.name}</strong><small>{categoryShowcase[1].product.range} км запас хода · до {categoryShowcase[1].product.payload} кг · {formatPrice(categoryShowcase[1].product.price)}*</small><ChevronRight size={18} /></button>
          <div className="hero__actions">
            <button className="primary-button" onClick={() => chooseRoute('all')}><span className="button-label--full">ОТКРЫТЬ КАТАЛОГ</span><span className="button-label--compact">КАТАЛОГ</span><ChevronRight size={19} /></button>
            <button className="hero-secondary" onClick={() => onInfo('selection')}><span className="button-label--full">Помочь с выбором</span><span className="button-label--compact">Подбор</span></button>
          </div>
          <ul className="home-trust" aria-label="Преимущества магазина">
            <li><Check size={16} /><span><strong>Подбор по маршруту</strong><small>учтём рельеф и нагрузку</small></span></li>
            <li><MapPin size={16} /><span><strong>Работаем в Сочи</strong><small>условия уточнит менеджер</small></span></li>
            <li><PackageCheck size={16} /><span><strong>Без онлайн-оплаты</strong><small>сначала подтверждение</small></span></li>
          </ul>
          <div className="hero-mobile-cta">
            <button className="primary-button" onClick={() => chooseRoute('all')}>Смотреть каталог<ChevronRight size={18} /></button>
          </div>
        </div>
        <div className="quick-launcher" aria-label="Быстрые действия">
          <button onClick={() => chooseRoute('city')}><MapPin size={22} /><span><strong>Для города</strong><small>Ежедневные маршруты</small></span><ChevronRight size={18} /></button>
          <button onClick={() => chooseRoute('cargo')}><PackageCheck size={22} /><span><strong>Для работы</strong><small>Груз и доставка</small></span><ChevronRight size={18} /></button>
          <button onClick={() => chooseRoute('compact')}><Grid2X2 size={22} /><span><strong>Компактные</strong><small>Манёвренные модели</small></span><ChevronRight size={18} /></button>
          <button onClick={() => onInfo('about')}><Handshake size={22} /><span><strong>О магазине</strong><small>Документы и условия</small></span><ChevronRight size={18} /></button>
        </div>
      </section>
      <div className="hero-pill-row" aria-label="Быстрый выбор по сценарию">
        <button className="is-active" onClick={() => chooseRoute('city')}><span className="hero-pill-row__icon"><MapPin size={15} /></span><span>Город</span></button>
        <button onClick={() => chooseRoute('cargo')}><span className="hero-pill-row__icon"><PackageCheck size={15} /></span><span>Работа</span></button>
        <button onClick={() => chooseRoute('compact')}><span className="hero-pill-row__icon"><Grid2X2 size={15} /></span><span>Компактные</span></button>
      </div>
      <ul className="home-trust-grid" aria-label="Преимущества магазина">
        <li><span className="home-trust-grid__icon"><Check size={17} /></span><span><strong>Подбор по маршруту</strong><small>учтём рельеф и нагрузку</small></span></li>
        <li><span className="home-trust-grid__icon"><PackageCheck size={17} /></span><span><strong>Без онлайн-оплаты</strong><small>сначала подтверждение</small></span></li>
        <li><span className="home-trust-grid__icon"><MapPin size={17} /></span><span><strong>Работаем в Сочи</strong><small>условия уточнит менеджер</small></span></li>
      </ul>
      <section className="home-categories" data-reveal>
        <div className="home-section-head"><div><p className="section-number">ПОПУЛЯРНЫЕ КАТЕГОРИИ</p><h2>Выберите сценарий</h2></div><button onClick={() => chooseRoute('all')}>Смотреть все <ChevronRight size={18} /></button></div>
        <div className="category-photo-grid">
          {categoryShowcase.map((item) => (
            <button key={item.id} className="category-photo-card" onClick={() => chooseRoute(item.id)}>
              <img src={item.product.image} alt="" />
              <span className="category-photo-card__badge">до {item.product.range} км</span>
              <span className="category-photo-card__label"><strong>{item.label}</strong><small>{item.product.useCase}</small></span>
            </button>
          ))}
        </div>
      </section>
      <section className="home-smart-grid" data-reveal>
        <div className="home-section-head"><div><p className="section-number">НА ЗАМЕТКУ</p><h2>Полезные разделы</h2></div></div>
        <div className="smart-grid">
          <button onClick={() => onInfo('about')}><span className="smart-grid__icon"><Handshake size={22} /></span><strong>О магазине</strong><small>Документы и условия</small></button>
          <button onClick={() => onInfo('city')}><span className="smart-grid__icon"><MapPin size={22} /></span><strong>Большой Сочи</strong><small>География работы</small></button>
          <button onClick={() => onInfo('delivery')}><span className="smart-grid__icon"><Truck size={22} /></span><strong>Доставка и оплата</strong><small>Порядок оформления</small></button>
          <button onClick={() => onInfo('selection')}><span className="smart-grid__icon"><SlidersHorizontal size={22} /></span><strong>Помочь с выбором</strong><small>Подбор модели</small></button>
        </div>
      </section>
      <section className="home-commerce" data-reveal>
        <div className="home-section-head">
          <div><p className="section-number">ПОПУЛЯРНЫЕ МОДЕЛИ</p><h2>Электроскутеры в каталоге</h2><span>Сравните запас хода, скорость и допустимую нагрузку.</span></div>
          <button onClick={() => chooseRoute('all')}>Все модели <ChevronRight size={18} /></button>
        </div>
        <div className="product-grid product-grid--market home-product-grid">{products.map((product) => <ProductCard key={product.id} product={product} index={products.indexOf(product)} favorite={favorites.has(product.id)} compared={compared.has(product.id)} onFavorite={() => toggleFavorite(product.id)} onCompare={() => onToggleCompare(product)} onOpen={() => onOpen(product)} onAdd={() => onQuickAdd(product)} />)}</div>
      </section>
      <section className="home-service-band" data-reveal>
        <button onClick={() => onInfo('about')}><Handshake size={23} /><span><strong>О G-Partner</strong><small>Информация о магазине</small></span><ChevronRight size={18} /></button>
        <button onClick={() => onInfo('city')}><MapPin size={23} /><span><strong>Большой Сочи</strong><small>География работы</small></span><ChevronRight size={18} /></button>
        <button onClick={() => onInfo('delivery')}><Truck size={23} /><span><strong>Получение и оплата</strong><small>Порядок оформления</small></span><ChevronRight size={18} /></button>
        <button onClick={() => onInfo('contact')}><Wrench size={23} /><span><strong>Нужна помощь?</strong><small>Задать вопрос менеджеру</small></span><ChevronRight size={18} /></button>
      </section>
      <footer className="site-footer home-footer"><div className="footer-brand"><img src="/brand/gpartner-mark-v2-512.png" alt="" width="44" height="44" /><strong><b>G-</b>PARTNER</strong></div><p>Магазин электротранспорта в Большом Сочи.</p><small>Цены и характеристики уточняются и не являются публичной офертой.</small></footer>
      </>}

      {screen === 'catalog' && <>
      <section className="catalog-intro">
        <div><p className="section-number">G-PARTNER · КАТАЛОГ</p><h1>ЭЛЕКТРОСКУТЕРЫ<br /><em>ДЛЯ СОЧИ</em></h1></div>
        <p>Сравнивайте основные параметры и выбирайте технику под маршрут. Финальную цену и наличие подтвердит менеджер.</p>
      </section>
      <section className="catalog-section" id="catalog" data-reveal>
        <div className="catalog-result-line"><strong>Модельный ряд</strong><span>{modelCountLabel(filtered.length)}</span></div>
        <div className="catalog-tools">
          <label className="search-field" htmlFor="catalog-search"><Search size={19} aria-hidden="true" /><input id="catalog-search" name="catalog-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти модель" aria-label="Поиск по моделям" />{query && <button onClick={() => setQuery('')} aria-label="Очистить поиск"><X size={18} /></button>}</label>
          <div className="catalog-filter-row"><button ref={filterTriggerRef} className={minRange > 0 ? 'has-active' : ''} aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={18} />{minRange > 0 ? 'Фильтры · 1' : 'Фильтры'}{minRange > 0 && <i />}</button><button onClick={() => setSort((value) => value === 'popular' ? 'price' : 'popular')}>{sort === 'popular' ? 'По популярности' : 'Сначала дешевле'} <ChevronRight size={17} /></button></div>
          <div className="category-tabs" role="tablist" aria-label="Категории">{categories.map((item, index) => <button key={item.id} role="tab" tabIndex={category === item.id ? 0 : -1} aria-selected={category === item.id} className={category === item.id ? 'is-active' : ''} onKeyDown={(event) => moveCategoryTab(event, index)} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div>
        </div>
        <div className="catalog-note"><i /><span>Важно</span><span>цены и наличие уточняются</span></div>
        <div className="product-grid product-grid--market">{filtered.map((product) => <ProductCard key={product.id} product={product} index={products.indexOf(product)} favorite={favorites.has(product.id)} compared={compared.has(product.id)} onFavorite={() => toggleFavorite(product.id)} onCompare={() => onToggleCompare(product)} onOpen={() => onOpen(product)} onAdd={() => onQuickAdd(product)} />)}</div>
        {!filtered.length && <div className="empty-state"><h3>Модель не найдена</h3><p>Измените запрос или выберите другую категорию.</p></div>}
      </section>

      {filtersOpen && createPortal(<div className="filter-backdrop" role="presentation" onClick={() => setFiltersOpen(false)}><section ref={filterSheetRef} id="catalog-filters" className="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title" onClick={(event) => event.stopPropagation()}><div className="filter-sheet__head"><div><small>Каталог</small><h3 id="filter-title">Фильтры</h3></div><button ref={filterCloseRef} onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры"><X /></button></div><fieldset><legend>Минимальный запас хода</legend><div className="filter-options">{[0, 50, 70].map((value) => <button type="button" key={value} className={minRange === value ? 'is-active' : ''} aria-pressed={minRange === value} onClick={() => setMinRange(value)}>{value === 0 ? 'Любой' : `от ${value} км`}</button>)}</div></fieldset><fieldset><legend>Назначение</legend><div className="filter-options">{categories.map((item) => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div></fieldset><div className="filter-sheet__actions"><button className="secondary-button" onClick={() => { setMinRange(0); setCategory('all'); }}>Сбросить</button><button className="primary-button" onClick={() => setFiltersOpen(false)}>Показать: {filtered.length}</button></div></section></div>, document.body)}

      <footer className="site-footer catalog-footer"><div className="footer-brand"><img src="/brand/gpartner-mark-v2-512.png" alt="" width="44" height="44" /><strong><b>G-</b>PARTNER</strong></div><p>Магазин электротранспорта в Большом Сочи.</p><small>Цены и характеристики уточняются и не являются публичной офертой.</small></footer>
      </>}
      {compared.size > 0 && <div className="compare-dock" role="status"><div><ArrowLeftRight size={19} /><span><strong>Сравнение моделей</strong><small>{compared.size} из 3 выбрано</small></span></div><button onClick={onCompare} disabled={compared.size < 2}>Сравнить <ChevronRight size={17} /></button></div>}
    </main>
  );
}

function BackBar({ title, onBack }: { title: string; onBack: () => void }) {
  return <div className="back-bar"><button className="icon-button" onClick={onBack} aria-label="Назад"><ArrowLeft size={21} /></button><strong>{title}</strong><span /></div>;
}

function ComparePage({ selected, onBack, onOpen, onRemove }: { selected: Product[]; onBack: () => void; onOpen: (product: Product) => void; onRemove: (product: Product) => void }) {
  const rows: { label: string; value: (product: Product) => string }[] = [
    { label: 'Назначение', value: (product) => product.useCase },
    { label: 'Предварительная цена', value: (product) => formatPrice(product.price) },
    { label: 'Запас хода', value: (product) => `до ${product.range} км` },
    { label: 'Скорость', value: (product) => `${product.speed} км/ч` },
    { label: 'Нагрузка', value: (product) => `до ${product.payload} кг` },
    { label: 'Аккумулятор', value: (product) => product.battery },
    { label: 'Зарядка', value: (product) => product.chargeTime },
    { label: 'Масса', value: (product) => `${product.weight} кг` },
    { label: 'Колёсная схема', value: (product) => product.wheelLayout },
    { label: 'Габариты', value: (product) => product.dimensions },
  ];
  return <main className="plain-page compare-page"><BackBar title="Сравнение" onBack={onBack} /><div className="compare-page__body"><header><p className="section-number">ВЫБОР БЕЗ ДОГАДОК</p><h1>Сравните модели</h1><p>Главные различия собраны в одной таблице. Точные цены и наличие подтвердит менеджер.</p></header><div className="compare-table" style={{ '--compare-count': selected.length } as CSSProperties}><div className="compare-table__corner"><span>Параметр</span></div>{selected.map((product) => <article className="compare-product" key={product.id}><button className="compare-remove" onClick={() => onRemove(product)} aria-label={`Убрать ${product.name} из сравнения`}><X size={16} /></button><button className="compare-product__visual" onClick={() => onOpen(product)}><ScooterVisual product={product} compact /></button><small>{product.kicker}</small><strong>{product.name}</strong><button className="compare-details" onClick={() => onOpen(product)}>Подробнее <ChevronRight size={15} /></button></article>)}{rows.map((row) => <div className="compare-row" key={row.label}><strong>{row.label}</strong>{selected.map((product) => <span key={product.id}>{row.value(product)}</span>)}</div>)}</div></div></main>;
}

function ProductPage({ product, compared, onBack, onAdd, onConsult, onToggleCompare }: { product: Product; compared: boolean; onBack: () => void; onAdd: (selected: Addon[]) => void; onConsult: (selected: Addon[]) => void; onToggleCompare: () => void }) {
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
        <div className="detail-primary-actions"><button className="primary-button" onClick={() => onAdd(selected)}>В корзину <ChevronRight size={19} /></button><button className="secondary-button" onClick={() => onConsult(selected)}><MessageCircle size={18} />Уточнить наличие</button></div>
        <div className="detail-specs">
          <span><BatteryCharging /><small>Аккумулятор</small><strong>{product.battery}</strong></span>
          <span><MapPin /><small>Запас хода</small><strong>до {product.range} км</strong></span>
          <span><CircleGauge /><small>Скорость</small><strong>{product.speed} км/ч</strong></span>
          <span><PackageCheck /><small>Нагрузка</small><strong>до {product.payload} кг</strong></span>
        </div>
        <div className="decision-actions decision-actions--single"><button className="secondary-button" onClick={onToggleCompare}><ArrowLeftRight size={18} />{compared ? 'Модель добавлена к сравнению' : 'Добавить модель к сравнению'}</button></div>
        <div className="fit-grid">
          <div><span>Подойдёт, если</span><p>{product.category === 'cargo' ? 'нужна усиленная рама для груза и длинных смен.' : 'нужен электроскутер для регулярных городских маршрутов.'}</p></div>
          <div><span>Стоит сравнить, если</span><p>{product.category === 'compact' ? 'часто ездите далеко или перевозите тяжёлый груз.' : 'главный приоритет — минимальный вес и хранение в квартире.'}</p></div>
        </div>
        <div className="feature-list">{product.features.map((feature) => <span key={feature}><Check size={17} />{feature}</span>)}</div>
        <section className="product-assurance" aria-label="Условия покупки"><article><Truck size={21} /><span><strong>Получение в Большом Сочи</strong><small>Способ и срок согласует менеджер</small></span></article><article><ShieldCheck size={21} /><span><strong>Цена до оплаты</strong><small>Сначала подтверждаем наличие и комплект</small></span></article><article><Wrench size={21} /><span><strong>Поддержка по модели</strong><small>Документы и условия предоставим до покупки</small></span></article></section>
        <div className="section-title section-title--compact"><span>Комплект</span><div><p>Опции</p><h2>Добавить к модели</h2></div></div>
        <div className="addon-list">{addons.map((addon) => { const active = selected.some((item) => item.id === addon.id); return <button key={addon.id} className={active ? 'addon is-active' : 'addon'} onClick={() => toggle(addon)} aria-pressed={active}><span className="addon-check">{active && <Check size={16} />}</span><span><strong>{addon.name}</strong><small>{addon.note}</small></span><b>+ {formatPrice(addon.price)}</b></button>; })}</div>
        <section className="product-disclosures"><details open><summary>Полные характеристики <ChevronRight size={18} /></summary><dl><div><dt>Масса</dt><dd>{product.weight} кг</dd></div><div><dt>Габариты</dt><dd>{product.dimensions}</dd></div><div><dt>Колёсная схема</dt><dd>{product.wheelLayout}</dd></div><div><dt>Время зарядки</dt><dd>{product.chargeTime}</dd></div><div><dt>Аккумулятор</dt><dd>{product.battery}</dd></div></dl></details><details><summary>Доставка и получение <ChevronRight size={18} /></summary><p>Самовывоз или доставка по Большому Сочи. Район, срок и стоимость получения менеджер подтвердит вместе с наличием модели.</p></details><details><summary>Гарантия и документы <ChevronRight size={18} /></summary><p>Перед покупкой менеджер предоставит актуальные условия гарантии, комплектацию и документацию именно для выбранной модели.</p></details></section>
        <p className="finance-note">* Пример предварительного расчёта. Срок, первоначальный взнос и точные условия определяет финансовый партнёр.</p>
      </section>
      <div className="sticky-action"><div><small>Комплект</small><strong>{formatPrice(total)}</strong></div><button className="primary-button" onClick={() => onAdd(selected)}>В корзину <ChevronRight size={20} /></button></div>
    </main>
  );
}

function CartPage({ lines, onBack, onChange, onCheckout, onCatalog, onOpen }: { lines: CartLine[]; onBack: () => void; onChange: (lineKey: string, delta: number) => void; onCheckout: () => void; onCatalog: () => void; onOpen: (product: Product) => void }) {
  const total = cartTotal(lines);
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  return (
    <main className="plain-page cart-page">
      <BackBar title="Корзина" onBack={onBack} />
      <div className="cart-page__body">
        <header className="cart-page__heading"><div><p className="section-number">ВАШ ЗАКАЗ</p><h1>Корзина</h1></div><span>{count ? `${count} ${count === 1 ? 'товар' : count < 5 ? 'товара' : 'товаров'}` : 'Товаров пока нет'}</span></header>
        {lines.length ? <div className="cart-commerce-layout">
          <section className="cart-items-panel" aria-label="Товары в корзине">
            <div className="cart-items-panel__head"><h2>Товары</h2><span>{count} шт.</span></div>
            <div className="cart-list">{lines.map((line) => {
              const key = cartLineKey(line.product, line.addons);
              const unitPrice = line.product.price + line.addons.reduce((sum, addon) => sum + addon.price, 0);
              const configuration = line.addons.length ? line.addons.map((addon) => addon.name).join(', ') : 'базовая комплектация';
              return <article className="cart-line cart-line--shop" key={key}>
                <button className="cart-line__visual" onClick={() => onOpen(line.product)} aria-label={`Открыть ${line.product.name}`}><ScooterVisual product={line.product} compact /></button>
                <div className="cart-line__copy"><span className={`stock stock--${line.product.stockTone}`}><i />{line.product.stockLabel}</span><button className="cart-line__name" onClick={() => onOpen(line.product)}>{line.product.name}</button><small>до {line.product.range} км · {line.product.speed} км/ч · до {line.product.payload} кг</small>{line.addons.length ? <ul className="cart-options">{line.addons.map((addon) => <li key={addon.id}><span>{addon.name}</span><b>+ {formatPrice(addon.price)}</b></li>)}</ul> : <small>Базовая комплектация</small>}<b className="cart-line__unit">{formatPrice(unitPrice)} / шт.</b></div>
                <div className="cart-line__aside"><strong>{formatPrice(unitPrice * line.quantity)}</strong><div className="cart-line__controls"><div className="quantity"><button onClick={() => onChange(key, -1)} aria-label={`Уменьшить количество ${line.product.name}, ${configuration}`}><Minus size={16} /></button><span>{line.quantity}</span><button onClick={() => onChange(key, 1)} aria-label={`Увеличить количество ${line.product.name}, ${configuration}`}><Plus size={16} /></button></div><button className="cart-remove" onClick={() => onChange(key, -line.quantity)} aria-label={`Удалить ${line.product.name} из корзины`}><Trash2 size={18} /></button></div></div>
              </article>;
            })}</div>
          </section>
          <aside className="cart-order-summary"><p className="section-number">ИТОГО</p><h2>Ваш заказ</h2><div className="cart-summary-rows"><p><span>Товары, {count} шт.</span><b>{formatPrice(total)}</b></p><p><span>Получение</span><b>уточнит менеджер</b></p></div><div className="cart-summary-total"><span>Предварительная сумма</span><strong>{formatPrice(total)}</strong></div><p className="cart-payment-note"><ShieldCheck size={20} /><span><strong>Оплата после подтверждения</strong><small>Менеджер уточнит наличие, комплектацию и итоговую стоимость.</small></span></p><button className="primary-button" onClick={onCheckout}>Оформить заявку <ChevronRight size={20} /></button><button className="cart-continue" onClick={onCatalog}>Продолжить покупки</button><small className="cart-legal">Оформление заявки не обязывает к покупке.</small></aside>
        </div> : <section className="empty-cart">
          <div className="empty-cart__main"><span><ShoppingBag size={36} /></span><p className="section-number">КОРЗИНА ПУСТА</p><h2>Добавьте электроскутер</h2><p>Сравните модели по запасу хода, скорости и нагрузке. Выбранный товар появится здесь вместе с итоговой стоимостью.</p><button className="primary-button" onClick={onCatalog}>Перейти в каталог <ChevronRight size={19} /></button></div>
          <div className="cart-recommendations"><div><p className="section-number">ПОПУЛЯРНЫЕ МОДЕЛИ</p><h2>С чего начать</h2></div>{products.slice(0, 3).map((product) => <button key={product.id} onClick={() => onOpen(product)}><ScooterVisual product={product} compact /><span><small>{product.kicker}</small><strong>{product.name}</strong><b>{formatPrice(product.price)}*</b></span><ChevronRight size={18} /></button>)}</div>
        </section>}
      </div>
    </main>
  );
}

function Checkout({ total, onBack }: { total: number; onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'full' | 'finance'>('full');
  const [contact, setContact] = useState<'call' | 'telegram'>('call');
  const submit = (event: FormEvent) => { event.preventDefault(); hapticTap(); trackStoreEvent('lead_submitted', { total, delivery, payment, contact }); setSent(true); };
  return (
    <main className="plain-page checkout-page">
      <BackBar title="Предложение" onBack={onBack} />
      <div className="page-body">
        {sent ? <section className="success-state"><span><Check size={26} /></span><p>Режим предпросмотра</p><h1>Форма заполнена.</h1><p>Сейчас данные остаются в браузере и не отправляются менеджеру. Приём заявок будет подключён перед запуском.</p><button className="secondary-button" onClick={onBack}>Вернуться к выбору</button></section> : <form className="lead-form" onSubmit={submit}>
          <div className="section-title"><span>04</span><div><p>Без обязательств</p><h1>Получить подтверждение цены</h1></div></div>
          <p className="form-intro">Оставьте контакт. Менеджер уточнит наличие, комплектацию и итоговую стоимость.</p>
          <div className="summary-line"><span>Выбранная комплектация</span><strong>{formatPrice(total)}</strong></div>
          <label htmlFor="lead-name"><span>Имя</span><input id="lead-name" name="name" required autoComplete="name" placeholder="Ваше имя" /></label>
          <label htmlFor="lead-phone"><span>Телефон</span><input id="lead-phone" name="phone" required autoComplete="tel" inputMode="tel" placeholder="+7 900 000-00-00" /></label>
          <fieldset><legend>Как связаться?</legend><div className="choice-row"><button type="button" aria-pressed={contact === 'call'} className={contact === 'call' ? 'is-active' : ''} onClick={() => setContact('call')}>Позвонить</button><button type="button" aria-pressed={contact === 'telegram'} className={contact === 'telegram' ? 'is-active' : ''} onClick={() => setContact('telegram')}>Написать в Telegram</button></div></fieldset>
          <fieldset><legend>Как хотите получить?</legend><div className="choice-row"><button type="button" aria-pressed={delivery === 'pickup'} className={delivery === 'pickup' ? 'is-active' : ''} onClick={() => setDelivery('pickup')}>Самовывоз</button><button type="button" aria-pressed={delivery === 'delivery'} className={delivery === 'delivery' ? 'is-active' : ''} onClick={() => setDelivery('delivery')}>Доставка</button></div></fieldset>
          {delivery === 'delivery' && <label htmlFor="lead-address"><span>Адрес</span><input id="lead-address" name="address" required autoComplete="street-address" placeholder="Район, улица, дом" /></label>}
          <fieldset><legend>Вариант оплаты</legend><div className="choice-row"><button type="button" aria-pressed={payment === 'full'} className={payment === 'full' ? 'is-active' : ''} onClick={() => setPayment('full')}>Полностью</button><button type="button" aria-pressed={payment === 'finance'} className={payment === 'finance' ? 'is-active' : ''} onClick={() => setPayment('finance')}>Рассрочка</button></div></fieldset>
          <label htmlFor="lead-comment"><span>Комментарий <small>необязательно</small></span><textarea id="lead-comment" name="comment" rows={3} placeholder="Например: нужна модель для доставки в Адлере" /></label>
          <button className="primary-button form-submit" type="submit">Получить подтверждение <ChevronRight size={19} /></button>
          <p className="legal-copy">Заявка не обязывает к покупке. Сейчас данные остаются в вашем браузере и не передаются.</p>
        </form>}
      </div>
    </main>
  );
}

function PlaceholderPage({ kind, onBack }: { kind: 'orders' | 'profile'; onBack: () => void }) {
  const orders = kind === 'orders';
  return <main className="plain-page placeholder-page"><BackBar title={orders ? 'Заказы' : 'Профиль'} onBack={onBack} /><div className="page-body"><div className="placeholder-visual">{orders ? <ReceiptText size={34} /> : <UserRound size={34} />}</div><p className="section-number">РАЗДЕЛ В РАЗРАБОТКЕ</p><h1>{orders ? 'Заказов пока нет' : 'Профиль G-Partner'}</h1><p>{orders ? 'Здесь появятся статусы заявок, комплектации и история обращений.' : 'Здесь появятся ваши контакты, избранное и настройки.'}</p><button className="primary-button" onClick={onBack}>{orders ? 'Перейти в каталог' : 'Вернуться в магазин'} <ChevronRight size={18} /></button></div></main>;
}

function BottomNav({ view, count, onHome, onCatalog, onCart, onOrders, onProfile }: { view: View; count: number; onHome: () => void; onCatalog: () => void; onCart: () => void; onOrders: () => void; onProfile: () => void }) {
  if (view === 'product' || view === 'compare' || view === 'cart' || view === 'checkout') return null;
  const homeActive = view === 'home';
  const catalogActive = view === 'catalog';
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <button className={homeActive ? 'is-active' : ''} aria-current={homeActive ? 'page' : undefined} onClick={onHome}><Home size={20} /><span>Главная</span></button>
      <button className={catalogActive ? 'is-active' : ''} aria-current={catalogActive ? 'page' : undefined} onClick={onCatalog}><Grid2X2 size={20} /><span>Каталог</span></button>
      <button onClick={onCart}><ShoppingBag size={20} /><span>Корзина</span>{count > 0 && <i key={count}>{count}</i>}</button>
      <button className={view === 'orders' ? 'is-active' : ''} aria-current={view === 'orders' ? 'page' : undefined} onClick={onOrders}><ReceiptText size={20} /><span>Заказы</span></button>
      <button className={view === 'profile' ? 'is-active' : ''} aria-current={view === 'profile' ? 'page' : undefined} onClick={onProfile}><UserRound size={20} /><span>Профиль</span></button>
    </nav>
  );
}

export function App() {
  const [view, setView] = useState<View>('home');
  const [theme, setTheme] = useState<Theme>(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const [isTelegram, setIsTelegram] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product>(products[0]);
  const [cart, setCart] = useState<CartLine[]>(() => {
    try {
      const stored = JSON.parse(safeStorageGet('localStorage', 'gshop-cart') ?? '[]') as CartLine[];
      return Array.isArray(stored) ? stored.filter((line) => line?.product?.id && Number.isFinite(line.quantity) && line.quantity > 0) : [];
    } catch { return []; }
  });
  const [compared, setCompared] = useState<Set<string>>(() => {
    try { return new Set((JSON.parse(safeStorageGet('localStorage', 'gshop-compare') ?? '[]') as string[]).slice(0, 3)); } catch { return new Set(); }
  });
  const [infoTopic, setInfoTopic] = useState<InfoTopic>('about');
  const lastStoreView = useRef<'home' | 'catalog'>('home');
  const storeScroll = useRef({ home: 0, catalog: 0 });
  useEffect(() => {
    const app = prepareTelegram();
    const telegramContext = Boolean(app?.initData);
    setIsTelegram(telegramContext);
    if (telegramContext) {
      const syncTheme = () => { if (app?.colorScheme) setTheme(app.colorScheme); };
      syncTheme();
      app?.onEvent?.('themeChanged', syncTheme);
      return () => app?.offEvent?.('themeChanged', syncTheme);
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const syncSystemTheme = () => setTheme(media.matches ? 'dark' : 'light');
    syncSystemTheme();
    media.addEventListener?.('change', syncSystemTheme);
    return () => media.removeEventListener?.('change', syncSystemTheme);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#1a1a1a'); }, [theme]);
  useEffect(() => { safeStorageSet('localStorage', 'gshop-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { safeStorageSet('localStorage', 'gshop-compare', JSON.stringify([...compared])); }, [compared]);
  const navigate = (next: View) => {
    if (view === 'home' || view === 'catalog') {
      storeScroll.current[view] = window.scrollY;
      lastStoreView.current = view;
    }
    hapticTap();
    setView(next);
    scrollImmediately();
  };
  const openProduct = (product: Product) => { trackStoreEvent('product_view', { product_id: product.id, product_name: product.name }); setSelectedProduct(product); navigate('product'); };
  const returnToStore = () => {
    const target = lastStoreView.current;
    hapticTap();
    setView(target);
    window.setTimeout(() => scrollImmediately(storeScroll.current[target]), 0);
  };
  const addToCart = (product: Product, selectedAddons: Addon[] = [], openCart = true) => { hapticTap(); trackStoreEvent('add_to_cart', { product_id: product.id, addons: selectedAddons.map((addon) => addon.id) }); setCart((current) => addCartLine(current, product, selectedAddons)); if (openCart) navigate('cart'); };
  const consultProduct = (product: Product, selectedAddons: Addon[]) => { addToCart(product, selectedAddons, false); navigate('checkout'); };
  const changeQuantity = (lineKey: string, delta: number) => setCart((current) => changeCartLineQuantity(current, lineKey, delta));
  const toggleCompare = (product: Product) => {
    hapticTap();
    setCompared((current) => {
      const next = new Set(current);
      if (next.has(product.id)) next.delete(product.id);
      else if (next.size < 3) next.add(product.id);
      trackStoreEvent('compare_toggle', { product_id: product.id, selected: next.has(product.id), count: next.size });
      return next;
    });
  };
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const showHome = () => { hapticTap(); setView('home'); lastStoreView.current = 'home'; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const showCatalog = () => { hapticTap(); setView('catalog'); lastStoreView.current = 'catalog'; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const showInfo = (topic: InfoTopic) => {
    if (view === 'home' || view === 'catalog') {
      storeScroll.current[view] = window.scrollY;
      lastStoreView.current = view;
    }
    hapticTap();
    setInfoTopic(topic);
    setView('info');
    scrollImmediately();
  };
  const openCategory = (category: Category) => { safeStorageSet('sessionStorage', 'gshop-category', category); showCatalog(); };
  const storeVisible = view === 'home' || view === 'catalog' || view === 'info';
  return <div className="app-shell">
    {storeVisible && <Header count={count} active={view === 'info' ? infoTopic : view} onHome={showHome} onCatalog={showCatalog} onInfo={showInfo} onCart={() => navigate('cart')} onProfile={() => navigate('profile')} />}
    {(view === 'home' || view === 'catalog') && <Catalog screen={view} compared={compared} onInfo={showInfo} onCatalog={showCatalog} onOpen={openProduct} onQuickAdd={(product) => addToCart(product, [], false)} onToggleCompare={toggleCompare} onCompare={() => navigate('compare')} />}
    {view === 'info' && <StoreInfoPage topic={infoTopic} onHome={showHome} onChoose={openCategory} />}
    {view === 'product' && <ProductPage product={selectedProduct} compared={compared.has(selectedProduct.id)} onBack={returnToStore} onAdd={(selected) => addToCart(selectedProduct, selected)} onConsult={(selected) => consultProduct(selectedProduct, selected)} onToggleCompare={() => toggleCompare(selectedProduct)} />}
    {view === 'compare' && <ComparePage selected={products.filter((product) => compared.has(product.id))} onBack={returnToStore} onOpen={openProduct} onRemove={toggleCompare} />}
    {view === 'cart' && <CartPage lines={cart} onBack={returnToStore} onChange={changeQuantity} onCheckout={() => navigate('checkout')} onCatalog={showCatalog} onOpen={openProduct} />}
    {view === 'checkout' && <Checkout total={cartTotal(cart)} onBack={() => navigate('cart')} />}
    {view === 'orders' && <PlaceholderPage kind="orders" onBack={showCatalog} />}
    {view === 'profile' && <PlaceholderPage kind="profile" onBack={showHome} />}
    <BottomNav view={view} count={count} onHome={showHome} onCatalog={showCatalog} onCart={() => navigate('cart')} onOrders={() => navigate('orders')} onProfile={() => navigate('profile')} />
  </div>;
}
