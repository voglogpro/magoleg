import {
  ArrowLeft,
  BatteryCharging,
  Check,
  ChevronRight,
  CircleGauge,
  Grid2X2,
  Handshake,
  Heart,
  Home,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ScooterVisual } from './components/ScooterVisual';
import { addons, products } from './data';
import { addCartLine, cartLineKey, changeCartLineQuantity } from './lib/cart';
import { cartTotal, formatPrice } from './lib/pricing';
import { hapticTap, prepareTelegram } from './lib/telegram';
import type { Addon, CartLine, Category, Product } from './types';

type View = 'home' | 'catalog' | 'product' | 'cart' | 'checkout' | 'orders' | 'profile';
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

const scrollImmediately = (top = 0) => {
  const root = document.documentElement;
  const previous = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  root.scrollTop = top;
  document.body.scrollTop = top;
  window.scrollTo({ top, left: 0, behavior: 'instant' as ScrollBehavior });
  window.requestAnimationFrame(() => { root.style.scrollBehavior = previous; });
};

const categories: { id: Category; label: string }[] = [
  { id: 'all', label: 'Все модели' },
  { id: 'city', label: 'Город' },
  { id: 'cargo', label: 'Работа' },
  { id: 'compact', label: 'Компактные' },
];

function Header({ count, active, onHome, onCatalog, onInfo, onCart, onProfile }: { count: number; active: 'home' | 'catalog'; onHome: () => void; onCatalog: () => void; onInfo: (topic: InfoTopic) => void; onCart: () => void; onProfile: () => void }) {
  const focusSearch = () => {
    onCatalog();
    window.requestAnimationFrame(() => window.setTimeout(() => document.getElementById('catalog-search')?.focus(), 50));
  };
  return (
    <header className="app-header">
      <button className="brand" onClick={onHome} aria-label="G-Partner, главная">
        <span className="brand-name"><b>G-</b>PARTNER</span>
        <Handshake className="brand-mark" size={24} aria-hidden="true" />
      </button>
      <nav className="desktop-nav" aria-label="Навигация по сайту">
        <button className={active === 'catalog' ? 'is-active' : ''} onClick={onCatalog}>Каталог</button>
        <button onClick={() => onInfo('about')}>О магазине</button>
        <button onClick={() => onInfo('city')}>Большой Сочи</button>
        <button onClick={() => onInfo('delivery')}>Доставка и оплата</button>
        <button onClick={() => onInfo('contact')}>Контакты</button>
      </nav>
      <div className="header-actions">
        <button className="icon-button" onClick={focusSearch} aria-label="Открыть поиск"><Search size={21} /></button>
        <button className="icon-button" onClick={onProfile} aria-label="Профиль"><UserRound size={21} /></button>
        <button className="icon-button header-cart" onClick={onCart} aria-label={`Корзина, товаров: ${count}`}><ShoppingBag size={21} />{count > 0 && <b>{count}</b>}</button>
      </div>
    </header>
  );
}

function ProductCard({ product, index, favorite, onFavorite, onOpen, onAdd }: { product: Product; index: number; favorite: boolean; onFavorite: () => void; onOpen: () => void; onAdd: () => void }) {
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
        <ScooterVisual product={product} compact />
      </button>
      <div className="product-card__body">
        <div className="product-card__topline"><span className={`stock stock--${product.stockTone}`}><i />{product.stockLabel}</span><button className={`favorite-button ${favorite ? 'is-active' : ''}`} aria-label={favorite ? 'Удалить из избранного' : 'Добавить в избранное'} aria-pressed={favorite} onClick={onFavorite}><Heart size={18} fill={favorite ? 'currentColor' : 'none'} /></button></div>
        <h3>{product.name}</h3>
        <dl className="product-facts">
          <div><dt>Ход</dt><dd>до {product.range} км</dd></div>
          <div><dt>Скорость</dt><dd>{product.speed} км/ч</dd></div>
          <div><dt>Батарея</dt><dd>{product.battery}</dd></div>
        </dl>
        <div className="product-card__footer">
          <div className="price-block"><small>Предварительная цена</small><strong>{formatPrice(product.price)}</strong><span>от {formatPrice(product.monthly)}/мес.*</span></div>
          <div className="card-actions"><button className="details-button" onClick={onOpen}>Подробнее</button><button className={`quick-buy ${added ? 'is-added' : ''}`} onClick={quickAdd}>{added ? <><Check size={17} /> Добавлено</> : 'В корзину'}</button></div>
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

function InfoSheet({ topic, onClose, onChoose }: { topic: InfoTopic; onClose: () => void; onChoose: (category: Category) => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const handleKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])') ?? [])];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeys);
    window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', handleKeys); opener?.focus(); };
  }, [onClose]);

  return createPortal(
    <div className="info-backdrop" role="presentation" onClick={onClose}>
      <section ref={sheetRef} className="info-sheet" role="dialog" aria-modal="true" aria-labelledby="info-sheet-title" onClick={(event) => event.stopPropagation()}>
        <div className="info-sheet__head">
          <span>{topic === 'selection' ? 'Быстрый подбор' : topic === 'contact' ? 'Консультация' : infoContent[topic].eyebrow}</span>
          <button ref={closeRef} onClick={onClose} aria-label="Закрыть"><X size={21} /></button>
        </div>
        {topic === 'selection' ? <>
          <h2 id="info-sheet-title">Для чего нужен скутер?</h2>
          <p>Выберите главный сценарий — каталог сразу покажет подходящие модели.</p>
          <div className="info-choice-grid">
            <button onClick={() => onChoose('city')}><MapPin size={21} /><span><strong>Для города</strong><small>Ежедневные поездки</small></span><ChevronRight size={18} /></button>
            <button onClick={() => onChoose('cargo')}><PackageCheck size={21} /><span><strong>Для работы</strong><small>Груз и длинные смены</small></span><ChevronRight size={18} /></button>
            <button onClick={() => onChoose('compact')}><Grid2X2 size={21} /><span><strong>Компактный</strong><small>Хранение и манёвренность</small></span><ChevronRight size={18} /></button>
          </div>
        </> : topic === 'contact' ? <>
          <h2 id="info-sheet-title">Расскажите о своём маршруте.</h2>
          <p>Сейчас форма работает в режиме предпросмотра: сообщение не отправляется менеджеру.</p>
          <ContactLead />
        </> : <>
          <h2 id="info-sheet-title">{infoContent[topic].title}</h2>
          <p>{infoContent[topic].body}</p>
          <div className="info-metrics">{infoContent[topic].metrics.map((metric) => <div key={metric.label}><strong>{metric.value}</strong><span>{metric.label}</span></div>)}</div>
          <div className="info-feature-grid">{infoContent[topic].facts.map((fact, index) => <article key={fact.title}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{fact.title}</strong><p>{fact.text}</p></div></article>)}</div>
          <p className="info-note"><Check size={18} />{infoContent[topic].note}</p>
          <button className="primary-button" onClick={() => onChoose('all')}>Открыть каталог <ChevronRight size={18} /></button>
        </>}
      </section>
    </div>,
    document.body,
  );
}

function Catalog({ screen, infoTopic, onCloseInfo, onInfo, onCatalog, onOpen, onQuickAdd }: { screen: 'home' | 'catalog'; infoTopic: InfoTopic | null; onCloseInfo: () => void; onInfo: (topic: InfoTopic) => void; onCatalog: () => void; onOpen: (product: Product) => void; onQuickAdd: (product: Product) => void }) {
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
  const featured = products[1];
  const filtered = useMemo(() => {
    const result = products.filter((product) => (category === 'all' || product.category === category) && product.name.toLowerCase().includes(query.toLowerCase()) && product.range >= minRange);
    return sort === 'price' ? [...result].sort((a, b) => a.price - b.price) : result;
  }, [category, query, minRange, sort]);
  const chooseRoute = (next: Category) => { setCategory(next); onCloseInfo(); onCatalog(); };
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
      {screen === 'home' && <section className="hero home-hero">
        <div className="hero__intro">
          <p className="section-number">G-PARTNER · ЭЛЕКТРОТРАНСПОРТ В БОЛЬШОМ СОЧИ</p>
          <h1><span>ВАШ МАРШРУТ.</span><br /><em>ВАШ СКУТЕР.</em></h1>
          <p className="hero__lead">Город, работа или перевозка груза — сравните четыре модели и выберите подходящую без лишних параметров.</p>
          <div className="hero__actions">
            <button className="primary-button" onClick={() => chooseRoute('all')}><span className="button-label--full">ОТКРЫТЬ КАТАЛОГ</span><span className="button-label--compact">КАТАЛОГ</span><ChevronRight size={19} /></button>
            <button className="hero-secondary" onClick={() => onInfo('selection')}><span className="button-label--full">Подобрать модель</span><span className="button-label--compact">Подбор</span></button>
          </div>
          <ul className="home-trust" aria-label="Преимущества магазина">
            <li><Check size={16} /><span><strong>Подбор по маршруту</strong><small>учтём рельеф и нагрузку</small></span></li>
            <li><MapPin size={16} /><span><strong>Работаем в Сочи</strong><small>условия уточнит менеджер</small></span></li>
            <li><PackageCheck size={16} /><span><strong>Без онлайн-оплаты</strong><small>сначала подтверждение</small></span></li>
          </ul>
        </div>
        <button className="hero-product campaign-product" onClick={() => onOpen(featured)} aria-label="Открыть флагманскую модель Volt Cargo X">
          <div className="hero-product__head"><span>Хит · Cargo X</span><span>{formatPrice(featured.price)}* →</span></div>
          <img className="hero-cutout" src="/products/hero-campaign-v2.jpg" alt="Флагманский трёхколёсный электроскутер G-Partner в студийном освещении" width="1672" height="936" fetchPriority="high" />
          <div className="hero-product__facts">
            <div><strong>{featured.range}</strong><span>км<br />запас хода</span></div>
            <div><strong>{featured.payload}</strong><span>кг<br />нагрузка</span></div>
            <div><strong>{featured.speed}</strong><span>км/ч<br />скорость</span></div>
          </div>
        </button>
        <div className="quick-launcher" aria-label="Быстрые действия">
          <button onClick={() => onInfo('about')}><Handshake size={22} /><span><strong>О магазине</strong><small>Кто мы и как помогаем</small></span><ChevronRight size={18} /></button>
          <button onClick={() => onInfo('city')}><MapPin size={22} /><span><strong>Большой Сочи</strong><small>Где мы работаем</small></span><ChevronRight size={18} /></button>
          <button onClick={() => onInfo('delivery')}><Truck size={22} /><span><strong>Доставка и оплата</strong><small>Как получить технику</small></span><ChevronRight size={18} /></button>
          <button onClick={() => onInfo('contact')}><Wrench size={22} /><span><strong>Консультация</strong><small>Задать вопрос</small></span><ChevronRight size={18} /></button>
        </div>
      </section>}

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
        <div className="product-grid product-grid--market">{filtered.map((product) => <ProductCard key={product.id} product={product} index={products.indexOf(product)} favorite={favorites.has(product.id)} onFavorite={() => toggleFavorite(product.id)} onOpen={() => onOpen(product)} onAdd={() => onQuickAdd(product)} />)}</div>
        {!filtered.length && <div className="empty-state"><h3>Модель не найдена</h3><p>Измените запрос или выберите другую категорию.</p></div>}
      </section>

      {filtersOpen && createPortal(<div className="filter-backdrop" role="presentation" onClick={() => setFiltersOpen(false)}><section ref={filterSheetRef} id="catalog-filters" className="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title" onClick={(event) => event.stopPropagation()}><div className="filter-sheet__head"><div><small>Каталог</small><h3 id="filter-title">Фильтры</h3></div><button ref={filterCloseRef} onClick={() => setFiltersOpen(false)} aria-label="Закрыть фильтры"><X /></button></div><fieldset><legend>Минимальный запас хода</legend><div className="filter-options">{[0, 50, 70].map((value) => <button type="button" key={value} className={minRange === value ? 'is-active' : ''} aria-pressed={minRange === value} onClick={() => setMinRange(value)}>{value === 0 ? 'Любой' : `от ${value} км`}</button>)}</div></fieldset><fieldset><legend>Назначение</legend><div className="filter-options">{categories.map((item) => <button type="button" key={item.id} className={category === item.id ? 'is-active' : ''} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.label}</button>)}</div></fieldset><div className="filter-sheet__actions"><button className="secondary-button" onClick={() => { setMinRange(0); setCategory('all'); }}>Сбросить</button><button className="primary-button" onClick={() => setFiltersOpen(false)}>Показать: {filtered.length}</button></div></section></div>, document.body)}

      <footer className="site-footer catalog-footer"><div><strong><b>G-</b>PARTNER</strong><Handshake size={24} /></div><p>Магазин электротранспорта в Большом Сочи.</p><small>Цены и характеристики уточняются и не являются публичной офертой.</small></footer>
      </>}
      {infoTopic && <InfoSheet topic={infoTopic} onClose={onCloseInfo} onChoose={chooseRoute} />}
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
      <div className="sticky-action"><div><small>Комплект</small><strong>{formatPrice(total)}</strong></div><button className="primary-button" onClick={() => onAdd(selected)}>В корзину <ChevronRight size={20} /></button></div>
    </main>
  );
}

function CartPage({ lines, onBack, onChange, onCheckout }: { lines: CartLine[]; onBack: () => void; onChange: (lineKey: string, delta: number) => void; onCheckout: () => void }) {
  const total = cartTotal(lines);
  return (
    <main className="plain-page">
      <BackBar title="Ваш выбор" onBack={onBack} />
      <div className="page-body">
        <div className="section-title"><span>03</span><div><p>Заявка</p><h1>Выбранные модели</h1></div></div>
        {lines.length ? <div className="cart-list">{lines.map((line) => { const key = cartLineKey(line.product, line.addons); const configuration = line.addons.length ? line.addons.map((addon) => addon.name).join(', ') : 'базовая комплектация'; return <article className="cart-line" key={key}><ScooterVisual product={line.product} compact /><div className="cart-line__copy"><span>{line.product.kicker}</span><strong>{line.product.name}</strong>{line.addons.length ? <ul className="cart-options">{line.addons.map((addon) => <li key={addon.id}><span>{addon.name}</span><b>+ {formatPrice(addon.price)} / шт.</b></li>)}</ul> : <small>Базовая комплектация</small>}<b>{formatPrice((line.product.price + line.addons.reduce((sum, addon) => sum + addon.price, 0)) * line.quantity)}</b></div><div className="quantity"><button onClick={() => onChange(key, -1)} aria-label={`Уменьшить количество ${line.product.name}, ${configuration}`}><Minus size={16} /></button><span>{line.quantity}</span><button onClick={() => onChange(key, 1)} aria-label={`Увеличить количество ${line.product.name}, ${configuration}`}><Plus size={16} /></button></div></article>; })}</div> : <div className="empty-state"><ShoppingBag size={34} /><h3>Пока ничего не выбрано</h3><p>Вернитесь в каталог и откройте подходящую модель.</p><button className="secondary-button" onClick={onBack}>В каталог</button></div>}
        {lines.length > 0 && <div className="summary-card"><p><span>Модели и опции</span><b>{formatPrice(total)}</b></p><p><span>Доставка</span><b className="muted">уточнит менеджер</b></p><div><span>Предварительно</span><strong>{formatPrice(total)}</strong></div></div>}
      </div>
      {lines.length > 0 && <div className="sticky-action sticky-action--single"><button className="primary-button" onClick={onCheckout}>Получить предложение <ChevronRight size={20} /></button></div>}
    </main>
  );
}

function Checkout({ total, onBack }: { total: number; onBack: () => void }) {
  const [sent, setSent] = useState(false);
  const [delivery, setDelivery] = useState<'pickup' | 'delivery'>('pickup');
  const [payment, setPayment] = useState<'full' | 'finance'>('full');
  const submit = (event: FormEvent) => { event.preventDefault(); hapticTap(); setSent(true); };
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
          <fieldset><legend>Как хотите получить?</legend><div className="choice-row"><button type="button" aria-pressed={delivery === 'pickup'} className={delivery === 'pickup' ? 'is-active' : ''} onClick={() => setDelivery('pickup')}>Самовывоз</button><button type="button" aria-pressed={delivery === 'delivery'} className={delivery === 'delivery' ? 'is-active' : ''} onClick={() => setDelivery('delivery')}>Доставка</button></div></fieldset>
          {delivery === 'delivery' && <label htmlFor="lead-address"><span>Адрес</span><input id="lead-address" name="address" required autoComplete="street-address" placeholder="Район, улица, дом" /></label>}
          <fieldset><legend>Вариант оплаты</legend><div className="choice-row"><button type="button" aria-pressed={payment === 'full'} className={payment === 'full' ? 'is-active' : ''} onClick={() => setPayment('full')}>Полностью</button><button type="button" aria-pressed={payment === 'finance'} className={payment === 'finance' ? 'is-active' : ''} onClick={() => setPayment('finance')}>Рассрочка</button></div></fieldset>
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
  if (view === 'product' || view === 'cart' || view === 'checkout') return null;
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
  const [cart, setCart] = useState<CartLine[]>([]);
  const [infoTopic, setInfoTopic] = useState<InfoTopic | null>(null);
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
  useEffect(() => { document.documentElement.dataset.theme = 'dark'; document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#121214'); }, [theme]);
  const navigate = (next: View) => {
    if (view === 'home' || view === 'catalog') {
      storeScroll.current[view] = window.scrollY;
      lastStoreView.current = view;
    }
    hapticTap();
    setInfoTopic(null);
    setView(next);
    scrollImmediately();
  };
  const openProduct = (product: Product) => { setSelectedProduct(product); navigate('product'); };
  const returnToStore = () => {
    const target = lastStoreView.current;
    hapticTap();
    setView(target);
    window.setTimeout(() => scrollImmediately(storeScroll.current[target]), 0);
  };
  const addToCart = (product: Product, selectedAddons: Addon[] = [], openCart = true) => { hapticTap(); setCart((current) => addCartLine(current, product, selectedAddons)); if (openCart) navigate('cart'); };
  const changeQuantity = (lineKey: string, delta: number) => setCart((current) => changeCartLineQuantity(current, lineKey, delta));
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);
  const showHome = () => { hapticTap(); setInfoTopic(null); setView('home'); lastStoreView.current = 'home'; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const showCatalog = () => { hapticTap(); setInfoTopic(null); setView('catalog'); lastStoreView.current = 'catalog'; window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const storeVisible = view === 'home' || view === 'catalog';
  return <div className="app-shell">{storeVisible && <><Header count={count} active={view} onHome={showHome} onCatalog={showCatalog} onInfo={setInfoTopic} onCart={() => navigate('cart')} onProfile={() => navigate('profile')} /><Catalog screen={view} infoTopic={infoTopic} onCloseInfo={() => setInfoTopic(null)} onInfo={setInfoTopic} onCatalog={showCatalog} onOpen={openProduct} onQuickAdd={(product) => addToCart(product, [], false)} /></>}{view === 'product' && <ProductPage product={selectedProduct} onBack={returnToStore} onAdd={(selected) => addToCart(selectedProduct, selected)} />}{view === 'cart' && <CartPage lines={cart} onBack={returnToStore} onChange={changeQuantity} onCheckout={() => navigate('checkout')} />}{view === 'checkout' && <Checkout total={cartTotal(cart)} onBack={() => navigate('cart')} />}{view === 'orders' && <PlaceholderPage kind="orders" onBack={showCatalog} />}{view === 'profile' && <PlaceholderPage kind="profile" onBack={showHome} />}<BottomNav view={view} count={count} onHome={showHome} onCatalog={showCatalog} onCart={() => navigate('cart')} onOrders={() => navigate('orders')} onProfile={() => navigate('profile')} /></div>;
}
