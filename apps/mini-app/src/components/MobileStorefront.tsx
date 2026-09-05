import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowLeftRight, Bike, BriefcaseBusiness, Check, ChevronRight, Grid2X2, Heart, Home, Image as ImageIcon, List, MapPin, Menu, Mountain, Package, Search, ShoppingBag, SlidersHorizontal, UserRound, Weight, X, Zap } from 'lucide-react';
import './mobile-storefront.css';

export type MobileInfoTopic = 'about' | 'city' | 'delivery' | 'selection' | 'contact';
type MobileView = 'home' | 'catalog' | 'favorites' | 'compare' | 'profile' | 'cart' | 'menu' | 'info';
type Props = { renderInfo?: (topic: MobileInfoTopic, onHome: () => void, onCatalog: () => void) => ReactNode };
const categories = ['Все', 'Городские', 'Универсальные', 'Для работы'];
const vehicles = ['Электроскутеры', 'Электросамокаты', 'Электровелосипеды'];
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

function VehicleIcon({ kind }: { kind: number }) {
  if (kind === 2) return <Bike aria-hidden="true" />;
  return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="7" cy="24" r="4" /><circle cx="25" cy="24" r="4" />
    {kind === 1 ? <path d="M7 20l3 5h13L20 7h-5M20 10h4" /> : <><path d="M7 20h10l-2 5H9m7-1h7L20 9h-4m4 3h4M7 19v-5h7l3 6" /><path d="M5 14h10" /></>}
  </svg>;
}

export function MobileStorefront({ renderInfo }: Props) {
  const [view, setView] = useState<MobileView>('home');
  const [topic, setTopic] = useState<MobileInfoTopic>('about');
  const [category, setCategory] = useState('Все');
  const [vehicle, setVehicle] = useState(vehicles[0]);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState<'list' | 'grid'>('list');
  const [sort, setSort] = useState('popular');
  const searchRef = useRef<HTMLInputElement>(null);
  const navigate = (next: MobileView) => { setView(next); setFiltersOpen(false); window.scrollTo({ top: 0, behavior: 'instant' }); };
  const openCatalog = (selected = 'Все', selectedVehicle = vehicle) => { setCategory(selected); setVehicle(selectedVehicle); setQuery(''); setSearchOpen(false); navigate('catalog'); };
  const openInfo = (next: MobileInfoTopic) => { setTopic(next); navigate('info'); };
  useEffect(() => { if (view === 'catalog' && searchOpen) searchRef.current?.focus(); }, [view, searchOpen]);
  const title = view === 'catalog' ? vehicle : view === 'info' ? infoLinks.find(item => item.topic === topic)?.title : ({ favorites: 'Избранное', compare: 'Сравнение', profile: 'Профиль', cart: 'Корзина', menu: 'Меню' } as Partial<Record<MobileView, string>>)[view];
  const search = () => { navigate('catalog'); setSearchOpen(true); };
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
        <button className="ms-icon-button" onClick={() => navigate('home')} aria-label="На главную"><ArrowLeft /></button>
        <h1 className="ms-page-title">{title}</h1>
        {view === 'catalog' ? <button className={`ms-icon-button ${filtersOpen ? 'is-active' : ''}`} aria-label="Фильтры каталога" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal /></button> : <button className="ms-icon-button" onClick={() => navigate('cart')} aria-label="Корзина"><ShoppingBag /></button>}
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
          <nav className="ms-vehicle-nav" aria-label="Виды транспорта">{vehicles.map((item, index) => <button key={item} aria-label={item} onClick={() => openCatalog('Все', item)}><VehicleIcon kind={index} /><span>{item === 'Электросамокаты' ? <>Электро-<br />самокаты</> : item === 'Электровелосипеды' ? <>Электро-<br />велосипеды</> : <>Электро-<br />скутеры</>}</span></button>)}</nav>
          <div className="ms-trust"><button onClick={() => openInfo('selection')}><Check /><span><strong>Поможем выбрать</strong><small>Под ваш маршрут</small></span></button><button onClick={() => openInfo('city')}><MapPin /><span><strong>Большой Сочи</strong><small>Наш регион работы</small></span></button></div>

          <section className="ms-section"><div className="ms-section-heading"><h2>Выберите свой маршрут</h2><button onClick={() => openCatalog()} aria-label="Смотреть все категории">Все<ChevronRight size={14} /></button></div><div className="ms-category-grid">{[
            { title: 'Для города', category: 'Городские', caption: 'На каждый день', icon: MapPin },
            { title: 'Для прогулок', category: 'Универсальные', caption: 'Разные маршруты', icon: Mountain },
            { title: 'Для работы', category: 'Для работы', caption: 'Дела и доставка', icon: BriefcaseBusiness },
          ].map(item => <button className="ms-category-card" key={item.title} onClick={() => openCatalog(item.category)}><strong>{item.title}</strong><span className="ms-category-art"><item.icon strokeWidth={1} /></span><span className="ms-category-caption">{item.caption}<ArrowRight size={13} /></span></button>)}</div></section>

          <section className="ms-section ms-collections"><div className="ms-section-heading"><h2>Что важно для вас?</h2></div><div className="ms-collection-grid">{[
            { label: 'Городские поездки', icon: MapPin, filter: 'Городские' },
            { label: 'Лёгкий транспорт', icon: Zap, filter: 'Универсальные' },
            { label: 'Больше нагрузки', icon: Weight, filter: 'Для работы' },
            { label: 'Работа и доставка', icon: Package, filter: 'Для работы' },
          ].map(item => <button key={item.label} onClick={() => openCatalog(item.filter)}><item.icon /><span>{item.label}</span><ChevronRight size={13} /></button>)}</div></section>

        </div>
      </>}

      {view === 'catalog' && <div className="ms-catalog">
        <div className="ms-filter-chips" role="group" aria-label="Категории">{categories.map(item => <button key={item} className={category === item ? 'is-active' : ''} onClick={() => setCategory(item)} aria-pressed={category === item}>{item}</button>)}</div>
        {filtersOpen && <section className="ms-filter-panel" aria-label="Выбор транспорта"><h2>Вид транспорта</h2>{vehicles.map(item => <button className={vehicle === item ? 'is-active' : ''} key={item} onClick={() => setVehicle(item)}>{item}{vehicle === item && <Check size={17} />}</button>)}<button className="ms-filter-done" onClick={() => setFiltersOpen(false)}>Готово<Check size={17} /></button></section>}
        <div className="ms-search-field"><Search size={18} /><input ref={searchRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Найти модель" aria-label="Поиск модели" />{query && <button aria-label="Очистить поиск" onClick={() => setQuery('')}><X size={16} /></button>}</div>
        <div className="ms-catalog-toolbar"><label><span className="ms-visually-hidden">Сортировка</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="popular">Популярные</option><option value="price-up">Сначала дешевле</option><option value="price-down">Сначала дороже</option></select></label><div role="group" aria-label="Вид каталога"><button className={layout === 'grid' ? 'is-active' : ''} aria-label="Плитка" aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><Grid2X2 size={19} /></button><button className={layout === 'list' ? 'is-active' : ''} aria-label="Список" aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={21} /></button></div></div>
        <div className="ms-catalog-notice" role="status"><span className="ms-status-dot" /><div><strong>{query ? 'Поиск станет доступен с появлением товаров' : 'Каталог скоро пополнится'}</strong><p>{query ? 'Пока готовим фотографии и описания моделей.' : 'Готовим фотографии и описания моделей.'}</p></div></div>
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
    ].map(item => <button key={item.view} className={view === item.view ? 'is-active' : ''} aria-current={view === item.view ? 'page' : undefined} onClick={() => item.view === 'catalog' ? openCatalog() : navigate(item.view)}><item.icon size={22} strokeWidth={1.6} /><span>{item.label}</span></button>)}</nav>
  </div>;
}
