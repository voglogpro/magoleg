import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowLeftRight, Check, ChevronRight, Grid2X2, Heart, Home, Image as ImageIcon, List, MapPin, Menu, Search, ShoppingBag, SlidersHorizontal, UserRound, X } from 'lucide-react';
import './mobile-storefront.css';

export type MobileInfoTopic = 'about' | 'city' | 'delivery' | 'selection' | 'contact';
type MobileView = 'home' | 'catalog' | 'favorites' | 'compare' | 'profile' | 'cart' | 'menu' | 'info';
type Props = { renderInfo?: (topic: MobileInfoTopic, onHome: () => void, onCatalog: () => void) => ReactNode };
type Vehicle = 'all' | 'kick-scooter' | 'scooter';
type License = 'all' | 'required' | 'not-required';
type CatalogSelection = { vehicle: Vehicle; license: License };
const vehicles: { id: Vehicle; label: string; title: string }[] = [
  { id: 'all', label: 'Все', title: 'Каталог транспорта' },
  { id: 'kick-scooter', label: 'Самокаты', title: 'Электросамокаты' },
  { id: 'scooter', label: 'Электроскутеры', title: 'Электроскутеры' },
];
const licenses: { id: License; label: string }[] = [
  { id: 'all', label: 'Все варианты' },
  { id: 'required', label: 'С правами' },
  { id: 'not-required', label: 'Без прав' },
];
const initialSelection: CatalogSelection = { vehicle: 'all', license: 'all' };
const infoLinks: { topic: MobileInfoTopic; title: string; detail: string }[] = [
  { topic: 'about', title: 'О магазине', detail: 'G-Partner · информация и документы' },
  { topic: 'city', title: 'Большой Сочи', detail: 'Где мы работаем' },
  { topic: 'delivery', title: 'Доставка и оплата', detail: 'Как получить свой транспорт' },
  { topic: 'selection', title: 'Помощь с выбором', detail: 'Подбор под ваш маршрут' },
  { topic: 'contact', title: 'Контакты', detail: 'Связаться с магазином' },
];

function PlaceholderCard({ index }: { index: number }) {
  return <article className="ms-product-placeholder" aria-label={`Место для товара ${index + 1}`}>
    <div className="ms-placeholder-photo"><ImageIcon aria-hidden="true" /><span>Фото товара</span></div>
    <div className="ms-placeholder-copy" aria-hidden="true"><i /><i /><div><i /><i /></div><i /></div>
  </article>;
}

export function MobileStorefront({ renderInfo }: Props) {
  const [view, setView] = useState<MobileView>('home');
  const [topic, setTopic] = useState<MobileInfoTopic>('about');
  const [selection, setSelection] = useState<CatalogSelection>(initialSelection);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const searchRef = useRef<HTMLInputElement>(null);
  const history = useRef<{ view: MobileView; topic: MobileInfoTopic; scroll: number }[]>([]);
  const navigate = (next: MobileView, remember = true) => {
    if (remember && next !== view) history.current.push({ view, topic, scroll: window.scrollY });
    setView(next); setFiltersOpen(false); window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const switchTab = (next: MobileView) => { history.current = []; navigate(next, false); };
  const goBack = () => {
    const previous = history.current.pop();
    setView(previous?.view ?? 'home'); setTopic(previous?.topic ?? 'about'); setFiltersOpen(false);
    requestAnimationFrame(() => window.scrollTo({ top: previous?.scroll ?? 0, behavior: 'instant' }));
  };
  const resetFilters = () => { setSelection(initialSelection); setQuery(''); };
  const openCatalog = (selected: Partial<CatalogSelection> = {}) => {
    setSelection({ ...initialSelection, ...selected }); setQuery(''); setSearchOpen(false); navigate('catalog');
  };
  const openInfo = (next: MobileInfoTopic) => { setTopic(next); navigate('info'); };
  useEffect(() => {
    if (view === 'catalog' && searchOpen) { searchRef.current?.focus(); setSearchOpen(false); }
  }, [view, searchOpen]);
  const selectedVehicle = vehicles.find(item => item.id === selection.vehicle)!;
  const selectedLicense = licenses.find(item => item.id === selection.license)!;
  const hasFilters = selection.vehicle !== 'all' || selection.license !== 'all' || query.length > 0;
  const selectionLabel = [selection.vehicle === 'all' ? 'Все виды транспорта' : selectedVehicle.title, selection.license !== 'all' ? selectedLicense.label : ''].filter(Boolean).join(' · ');
  const title = view === 'catalog' ? selectedVehicle.title : view === 'info' ? infoLinks.find(item => item.topic === topic)?.title : ({ favorites: 'Избранное', compare: 'Сравнение', profile: 'Профиль', cart: 'Корзина', menu: 'Меню' } as Partial<Record<MobileView, string>>)[view];
  const search = () => { openCatalog(); setSearchOpen(true); };
  const emptyContent = {
    favorites: { icon: Heart, title: 'Здесь будет ваш выбор', text: 'Понравившиеся модели будут собраны здесь, когда товары появятся в каталоге.' },
    compare: { icon: ArrowLeftRight, title: 'Всё для сравнения', text: 'Здесь вы сможете сравнить характеристики моделей и выбрать подходящую.' },
    cart: { icon: ShoppingBag, title: 'В корзине пока пусто', text: 'Мы готовим каталог. Скоро здесь можно будет собрать выбранные товары.' },
    profile: { icon: UserRound, title: 'Рады видеть вас в G-Partner', text: 'Каталог и информация о магазине доступны без регистрации. Личный кабинет появится позже.' },
  };
  const empty = view === 'favorites' || view === 'compare' || view === 'cart' || view === 'profile' ? emptyContent[view] : null;

  return <div className="mobile-storefront">
    <header className="ms-header">
      {view === 'home' ? <>
        <button className="ms-icon-button ms-menu-button" onClick={() => navigate('menu')} aria-label="Открыть меню"><Menu /></button>
        <button className="ms-wordmark" onClick={() => navigate('home')} aria-label="G-Partner — главная"><img src="/brand/gpartner-mark-v2-512.png" alt="" /><span><b>G</b>-PARTNER</span></button>
        <button className="ms-icon-button" onClick={search} aria-label="Поиск по каталогу"><Search /></button>
        <button className="ms-icon-button" onClick={() => navigate('cart')} aria-label="Корзина"><ShoppingBag /></button>
      </> : <>
        <button className="ms-icon-button" onClick={goBack} aria-label="Назад"><ArrowLeft /></button>
        <h1 className="ms-page-title">{title}</h1>
        {view === 'catalog' ? <button className={`ms-icon-button ${filtersOpen ? 'is-active' : ''}`} aria-label="Фильтры каталога" aria-expanded={filtersOpen} aria-controls="ms-license-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal /></button> : view === 'cart' ? <button className="ms-icon-button" onClick={search} aria-label="Поиск по каталогу"><Search /></button> : <button className="ms-icon-button" onClick={() => navigate('cart')} aria-label="Корзина"><ShoppingBag /></button>}
      </>}
    </header>

    <main className={`ms-main ms-view-${view}`}>
      {view === 'home' && <>
        <section className="ms-hero" aria-labelledby="ms-hero-title">
          <img className="ms-hero-image" src="/products/mobile-hero-v1.jpg" alt="Электросамокат с оранжевой подсветкой на фоне ночного города" width="1448" height="1086" fetchPriority="high" draggable={false} />
          <div className="ms-hero-shade" />
          <div className="ms-hero-content"><h1 id="ms-hero-title">Магазин<br /><span>электротранспорта</span></h1><p className="ms-hero-description">Для города, работы<br />и поездок по Сочи.</p><button className="ms-primary" onClick={() => openCatalog()}>Смотреть каталог<ArrowRight size={17} /></button></div>
        </section>

        <div className="ms-home-content">
          <div className="ms-trust"><button onClick={() => openInfo('selection')}><Check /><span><strong>Поможем выбрать</strong><small>Под ваш маршрут</small></span></button><button onClick={() => openInfo('city')}><MapPin /><span><strong>Большой Сочи</strong><small>Наш регион работы</small></span></button></div>

          <section className="ms-section"><div className="ms-section-heading"><h2>Категории транспорта</h2><button onClick={() => openCatalog()} aria-label="Смотреть все категории">Все<ChevronRight size={14} /></button></div><div className="ms-category-grid">{vehicles.filter(item => item.id !== 'all').map(item => <button className="ms-category-card" key={item.id} onClick={() => openCatalog({ vehicle: item.id })}>{item.title}</button>)}</div></section>

          <section className="ms-section ms-collections"><div className="ms-section-heading"><h2>По водительским правам</h2></div><div className="ms-license-grid">{licenses.filter(item => item.id !== 'all').map(item => <button key={item.id} onClick={() => openCatalog({ license: item.id })}>{item.label}</button>)}</div><p className="ms-license-note">Требования укажем для каждой модели после проверки её документов.</p></section>

        </div>
      </>}

      {view === 'catalog' && <div className="ms-catalog">
        <div className="ms-filter-chips" role="group" aria-label="Категории транспорта">{vehicles.map(item => <button key={item.id} className={selection.vehicle === item.id ? 'is-active' : ''} onClick={() => setSelection(current => ({ ...current, vehicle: item.id }))} aria-pressed={selection.vehicle === item.id}>{item.label}</button>)}</div>
        <section id="ms-license-filters" className="ms-filter-panel" hidden={!filtersOpen} aria-label="Водительские права"><h2>Водительские права</h2>{licenses.map(item => <button className={selection.license === item.id ? 'is-active' : ''} key={item.id} aria-pressed={selection.license === item.id} onClick={() => setSelection(current => ({ ...current, license: item.id }))}>{item.label}{selection.license === item.id && <Check size={17} />}</button>)}<p className="ms-license-note">Требования к водителю будут проверены по документам каждой модели.</p><button className="ms-filter-done" onClick={() => setFiltersOpen(false)}>Готово<Check size={17} /></button></section>
        <div className="ms-search-field"><Search size={18} /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} maxLength={120} placeholder="Найти модель" aria-label="Поиск модели" />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={16} /></button>}</div>
        <div className="ms-catalog-toolbar"><span className="ms-catalog-count">Товары готовятся</span><div role="group" aria-label="Вид каталога"><button className={layout === 'grid' ? 'is-active' : ''} aria-label="Плитка" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={19} /></button><button className={layout === 'list' ? 'is-active' : ''} aria-label="Список" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={21} /></button></div></div>
        <div className="ms-active-filters"><span>{selectionLabel}</span>{hasFilters && <button onClick={resetFilters}>Сбросить фильтры<X size={14} /></button>}</div>
        <div className="ms-catalog-notice" role="status"><span className="ms-status-dot" /><div><strong>{query.trim() ? `Поиск: «${query.trim()}»` : 'Каталог скоро пополнится'}</strong><p>{query.trim() ? 'Товары ещё не опубликованы. Поиск станет доступен после наполнения каталога.' : `Готовим фотографии и описания: ${selectionLabel.toLocaleLowerCase('ru-RU')}.`}</p></div></div>
        <div className={layout === 'grid' ? 'ms-placeholder-grid' : 'ms-placeholder-list'}>{[0, 1, 2, 3].map(index => <PlaceholderCard key={index} index={index} />)}</div>
        <button className="ms-catalog-help" onClick={() => openInfo('selection')}><span>Нужна помощь с выбором?</span><ArrowRight size={18} /></button>
      </div>}

      {view === 'menu' && <nav className="ms-menu-page" aria-label="Разделы магазина"><button className="ms-menu-catalog" onClick={() => openCatalog()}><Grid2X2 /><span>Каталог транспорта</span><ChevronRight /></button>{infoLinks.map(item => <button key={item.topic} onClick={() => openInfo(item.topic)}><span><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight size={19} /></button>)}</nav>}
      {view === 'info' && <div className="ms-info-page">{renderInfo ? renderInfo(topic, () => navigate('home'), () => openCatalog()) : <section><h2>{title}</h2><p>G-Partner — магазин электротранспорта в Большом Сочи. Помогаем подобрать технику для города, работы и перевозки грузов.</p><button className="ms-primary" onClick={() => openCatalog()}>Открыть каталог<ArrowRight size={17} /></button></section>}</div>}
      {empty && <section className="ms-empty-state"><div className="ms-empty-icon"><empty.icon size={38} strokeWidth={1.3} /></div><h2>{empty.title}</h2><p>{empty.text}</p><button className="ms-primary" onClick={() => openCatalog()}>В каталог<ArrowRight size={17} /></button><button className="ms-text-button" onClick={() => openInfo(view === 'profile' ? 'about' : 'selection')}>{view === 'profile' ? 'О магазине' : 'Помочь с выбором'}</button></section>}
    </main>

    <nav className="ms-bottom-nav" aria-label="Основная навигация">{[
      { view: 'home' as const, label: 'Главная', icon: Home },
      { view: 'catalog' as const, label: 'Каталог', icon: Grid2X2 },
      { view: 'favorites' as const, label: 'Избранное', icon: Heart },
      { view: 'compare' as const, label: 'Сравнить', icon: ArrowLeftRight },
      { view: 'profile' as const, label: 'Профиль', icon: UserRound },
    ].map(item => <button key={item.view} className={view === item.view ? 'is-active' : ''} aria-current={view === item.view ? 'page' : undefined} onClick={() => switchTab(item.view)}><item.icon size={22} strokeWidth={1.6} /><span>{item.label}</span></button>)}</nav>
  </div>;
}
