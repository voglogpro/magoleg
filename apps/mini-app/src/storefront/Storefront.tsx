import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowLeftRight, CloudRain, Dumbbell, Feather, Heart, Home, Menu, Package, PackageOpen, Search, ShoppingBag, SlidersHorizontal, Sparkles, Sprout, Trash2, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { Account } from './Account';
import { CityBar, CityPicker } from './CityPicker';
import { StoreHero } from '../components/StoreHero';
import { ShopBenefits } from '../components/ShopBenefits';
import { cartTotal, catalogHref, effectiveLicense, filterProducts, money, parseFilters, plural, sanitizeCart, sanitizeCity, sanitizeIds, smartPicks } from './domain';
import { findDeliveryZone, zoneTerm } from './delivery-zones';
import { useAccount, useHashRoute, useStoreData, useStored } from './hooks';
import { Information, infoTitles } from './Information';
import { InquiryConfirmation, InquiryForm } from './InquiryForm';
import { ProductCard, ProductGallery, ProductPhoto } from './ProductCard';
import { activePickLabels, categoryLabels, licenseLabels, MAX_CART_MODELS, MAX_QUANTITY, stockLabels, tagLabels, vehicleCategories, type Filters, type Inquiry, type Product, type SmartPick } from './types';
import './storefront.css';

function Empty({ title, children, icon: Icon = PackageOpen, action = true }: {
  title: string; children: ReactNode; icon?: LucideIcon; action?: boolean;
}) {
  return <div className="sf-empty">
    <span className="sf-empty__icon" aria-hidden="true"><Icon size={26} /></span>
    <h2>{title}</h2><p>{children}</p>
    {action && <a className="sf-button" href="#catalog">Открыть каталог</a>}
  </div>;
}

/** Transport type stays visible; price, licence and availability live behind the filter icon. */
function TypeChips({ current, onPick, options }: {
  current: Filters['category']; onPick: (category: Filters['category']) => void;
  options: [Filters['category'], string][];
}) {
  return <div className="sf-category-tabs" role="group" aria-label="Тип транспорта">
    {options.map(([category, label]) =>
      <button key={category} aria-pressed={current === category} onClick={() => onPick(category)}>{label}</button>)}
  </div>;
}

/** Each pick gets a drawn icon of its own: a tile names an audience, not one model in stock. */
const pickIcons: Record<string, LucideIcon> = {
  'tag-waterproof': CloudRain, 'tag-heavy-rider': Dumbbell, 'tag-two-up': Users,
  'tag-courier': Package, 'tag-women': Feather, 'tag-beginner': Sprout, 'tag-teen': Sprout,
};

/** A pick is a plain catalogue link, so the shopper can narrow it further with the usual filters. */
function PickCards({ picks, layout }: { picks: SmartPick[]; layout: 'row' | 'grid' }) {
  return <div className={`sf-pick-rail sf-pick-rail--${layout}`}>
    <div className="sf-pick-track">{picks.map(pick => {
      const Icon = pickIcons[pick.id] ?? Sparkles;
      return <a className="sf-pick-card" href={catalogHref(pick.filters)} key={pick.id}>
        <span className="sf-pick-art" aria-hidden="true"><span><Icon size={26} strokeWidth={1.7} /></span></span>
        <strong>{pick.label}</strong><span>{pick.hint}</span><em>{pick.count ? `${pick.count} ${plural(pick.count, ['модель', 'модели', 'моделей'])}` : 'Скоро в каталоге'}</em>
      </a>;
    })}</div>
  </div>;
}

const catalogTypes = [['all', 'Все модели'], ...Object.entries(categoryLabels)] as [Filters['category'], string][];

export function Storefront() {
  const { products, settings, loading, error, settingsError, retry } = useStoreData();
  const { path, search, navigate } = useHashRoute();
  const { account, csrfToken, refresh: refreshAccount } = useAccount();
  const [cart, setCart] = useStored('gpartner.cart.v1', sanitizeCart);
  const [favorites, setFavorites] = useStored('gpartner.favorites.v1', sanitizeIds);
  const [compare, setCompare] = useStored('gpartner.compare.v1', value => sanitizeIds(value, 3));
  const [city, setCity] = useStored('gpartner.city.v1', sanitizeCity);
  const [cityOpen, setCityOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [receipt, setReceipt] = useState<Inquiry | null>(null);
  const contentRef = useRef<HTMLElement>(null);
  const filters = parseFilters(search);
  const filtered = filterProducts(products, filters);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const selectedFavorites = products.filter(product => favorites.includes(product.id));
  const selectedCompare = compare.map(id => products.find(product => product.id === id)).filter((product): product is Product => Boolean(product));
  const cartSummary = cartTotal(cart, products);
  const cartZone = city.name ? findDeliveryZone(city.name) : null;
  const activeFilterCount = [filters.category !== 'all', filters.tag !== 'all', filters.license !== 'all', filters.stock !== 'all', Boolean(filters.min || filters.max)].filter(Boolean).length;
  const isProduct = path.startsWith('product/');
  let productId = '';
  if (isProduct) { try { productId = decodeURIComponent(path.slice(8)); } catch { /* Invalid deep link is rendered as not found. */ } }
  const currentProduct = products.find(product => product.id === productId);
  const titles: Record<string, string> = { home: 'Главная', catalog: 'Каталог транспорта', picks: 'Умные подборки', favorites: 'Избранное', compare: 'Сравнение моделей', profile: 'Личный кабинет', cart: 'Корзина', menu: 'Меню', ...infoTitles };
  const title = isProduct ? currentProduct?.name || 'Карточка товара' : titles[path] || 'Страница не найдена';

  useEffect(() => {
    document.title = path === 'home' ? `${settings.shop_name} — магазин электротранспорта` : `${title} — ${settings.shop_name}`;
  }, [path, title, settings.shop_name]);
  useEffect(() => { setFiltersOpen(false); }, [path]);
  useEffect(() => {
    if (path === 'catalog' && new URLSearchParams(search).get('filters') === 'open') setFiltersOpen(true);
  }, [path, search]);
  useEffect(() => { if (path !== 'cart') setReceipt(null); }, [path]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 6500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    if (account?.city && !city.name) setCity({ name: account.city, asked: true });
  }, [account, city.name, setCity]);
  const chooseCity = (name: string) => { setCity({ name, asked: true }); setCityOpen(false); };
  const updateFilters = (patch: Partial<Filters>) => navigate(catalogHref({ ...filters, ...patch }), true);
  const toggleFavorite = (id: string) => {
    const exists = favorites.includes(id);
    setFavorites(previous => exists ? previous.filter(value => value !== id) : [...previous, id]);
    setNotice(exists ? 'Модель убрана из избранного.' : 'Модель добавлена в избранное.');
  };
  const toggleCompare = (id: string) => {
    if (compare.includes(id)) { setCompare(previous => previous.filter(value => value !== id)); setNotice('Модель убрана из сравнения.'); }
    else if (compare.length >= 3) setNotice('В сравнении уже три модели. Уберите одну на странице «Сравнение», чтобы добавить другую.');
    else { setCompare(previous => [...previous, id]); setNotice('Модель добавлена в сравнение.'); }
  };
  const addToCart = (id: string) => {
    const product = products.find(item => item.id === id);
    if (!product || product.stock_status === 'out-of-stock') { setNotice('Сейчас эту модель нельзя добавить в заявку.'); return; }
    if (cart.some(item => item.product_id === id)) { navigate('#cart'); return; }
    if (cart.length >= MAX_CART_MODELS) { setNotice(`В корзине уже ${MAX_CART_MODELS} моделей. Удалите лишние или отправьте текущий выбор.`); return; }
    setCart(previous => [...previous, { product_id: id, quantity: 1 }]);
    setNotice('Товар добавлен в корзину. Там можно уточнить наличие и получение.');
  };
  const removeCart = (id: string) => { setCart(previous => previous.filter(item => item.product_id !== id)); setNotice('Товар удалён из корзины.'); };
  const changeQuantity = (id: string, quantity: number) => setCart(previous => previous.map(item => item.product_id === id ? { ...item, quantity: Math.max(1, Math.min(MAX_QUANTITY, quantity)) } : item));
  const cards = (items: Product[]) => <div className={`sf-product-grid${path === 'catalog' && layout === 'list' ? ' sf-product-grid--list' : ''}`}>
    {items.map(product => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} compared={compare.includes(product.id)} inCart={cart.some(item => item.product_id === product.id)} onFavorite={toggleFavorite} onCompare={toggleCompare} onAdd={addToCart} />)}
  </div>;
  const catalogState = loading ? <p className="sf-loading" role="status">Загружаем каталог…</p> : error ? <div className="sf-empty" role="alert"><h2>Каталог временно недоступен</h2><p>{error}</p><button className="sf-button" onClick={retry}>Повторить загрузку</button></div> : null;
  const featured = [...products.filter(product => product.featured), ...products.filter(product => !product.featured)].slice(0, 4);
  const picks = smartPicks(products);
  const sections = ['delivery', 'payment', 'about', 'contact', 'guide'];

  return <div className="sf-store">
    <a className="sf-skip" href="#sf-content" onClick={event => { event.preventDefault(); contentRef.current?.focus(); }}>Перейти к содержимому</a>
    <header className="sf-header">
      <div className="sf-header__inner">
        <a className="sf-icon-button sf-mobile-only" href="#menu" aria-label="Открыть меню"><Menu size={23} /></a>
        <a className="sf-brand" href="#home" aria-label={`${settings.shop_name} — главная`}><img src="/brand/gpartner-mark-v2-512.png" width="40" height="40" alt="" draggable={false} /><span>{settings.shop_name}</span></a>
        <nav className="sf-desktop-nav" aria-label="Разделы магазина"><a href="#catalog" aria-current={path === 'catalog' ? 'page' : undefined}>Каталог</a><a href="#picks" aria-current={path === 'picks' ? 'page' : undefined}>Подборки</a><a href="#delivery" aria-current={path === 'delivery' ? 'page' : undefined}>Доставка</a><a href="#payment" aria-current={path === 'payment' ? 'page' : undefined}>Оплата</a><a href="#about" aria-current={path === 'about' ? 'page' : undefined}>О магазине</a><a href="#contact" aria-current={path === 'contact' ? 'page' : undefined}>Контакты</a></nav>
        <div className="sf-header-actions">
          <a className="sf-icon-button" href="#favorites" aria-label={`Избранное: ${favorites.length}`} aria-current={path === 'favorites' ? 'page' : undefined}><Heart size={22} />{favorites.length > 0 && <span className="sf-count">{favorites.length}</span>}</a>
          <a className="sf-icon-button sf-desktop-only" href="#compare" aria-label={`Сравнение: ${compare.length}`}><ArrowLeftRight size={22} /></a>
          <a className="sf-icon-button sf-desktop-only" href="#profile" aria-label="Личный кабинет"><UserRound size={22} /></a>
          <a className="sf-icon-button" href="#cart" aria-label={`Корзина: ${cartCount}`}><ShoppingBag size={22} />{cartCount > 0 && <span className="sf-count">{cartCount}</span>}</a>
        </div>
      </div>
    </header>

    <CityBar city={city} onOpen={() => setCityOpen(true)} />
    <main id="sf-content" className={`sf-main sf-page-${isProduct ? 'product' : path}`} tabIndex={-1} ref={contentRef}>
      {path !== 'home' && <div className="sf-page-heading"><a href={isProduct ? '#catalog' : '#home'} className="sf-back" aria-label={isProduct ? 'Вернуться в каталог' : 'На главную'}><ArrowLeft size={20} /><span>{isProduct ? 'Каталог' : 'Главная'}</span></a><h1>{title}</h1></div>}
      {settingsError && <div className="sf-settings-error" role="status"><span>{settingsError}</span><button onClick={retry} disabled={loading}>Обновить</button></div>}
      {path === 'home' && <>
        <StoreHero onCatalog={() => navigate('#catalog')} />
        <div className="sf-home-content">
          <ShopBenefits />
          {picks.length > 0 && <section className="sf-home-picks" aria-labelledby="sf-picks-title">
            <div className="sf-section-heading"><h2 id="sf-picks-title">Умные подборки</h2><a href="#picks">Все подборки <ArrowRight size={16} /></a></div>
            <PickCards picks={picks.slice(0, 4)} layout="grid" />
          </section>}
          <section className="sf-home-products" aria-labelledby="sf-products-title"><div className="sf-section-heading"><h2 id="sf-products-title">{products.some(product => product.featured) ? 'Выбор магазина' : 'Модели в каталоге'}</h2>{products.length > 0 && <a href="#catalog">Все модели <ArrowRight size={16} /></a>}</div>
            {catalogState || (featured.length ? cards(featured) : <div className="sf-catalog-preparing"><h3>Готовим ассортимент</h3><p>Здесь появятся фотографии, характеристики и цены после публикации товаров магазином.</p><a href="#contact">Контакты и информация о магазине</a></div>)}
          </section>
          <nav className="sf-store-links" aria-label="Информация для покупателя"><a href="#delivery"><strong>Доставка по России</strong><span>Сроки по округам, от 3 дней</span></a><a href="#payment"><strong>Оплата и документы</strong><span>Способы расчёта и порядок заказа</span></a><a href="#about"><strong>О магазине</strong><span>Информация и реквизиты</span></a><a href="#guide"><strong>Помощь с выбором</strong><span>Подберём под ваши задачи</span></a></nav>
        </div>
      </>}

      {path === 'picks' && <div className="sf-picks-page">
        {catalogState || (picks.length ? <>
          <p className="sf-lead">Готовые наборы фильтров: нажмите подборку — каталог сразу покажет подходящие модели, выгодные первыми. Дальше их можно сузить обычными фильтрами.</p>
          <PickCards picks={picks} layout="grid" />
          <div className="sf-catalog-assistance"><p>Не нашли подходящую подборку?</p><a href="#catalog?filters=open">Собрать фильтр самому <ArrowRight size={16} /></a></div>
        </> : <Empty title="Подборки готовятся">Когда магазин опубликует товары, здесь появятся готовые наборы: без прав, для курьеров, для большого веса и другие.</Empty>)}
      </div>}

      {path === 'catalog' && <div className="sf-catalog">
        <div className="sf-type-row">
          <TypeChips current={filters.category} options={catalogTypes} onPick={category => updateFilters({ category })} />
          <button className="sf-filter-toggle sf-filter-icon" aria-expanded={filtersOpen} aria-controls="sf-filter-panel" aria-label={`Фильтры: цена, права, наличие${activeFilterCount > 0 ? `. Выбрано: ${activeFilterCount}` : ''}`} onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={20} />{activeFilterCount > 0 && <span className="sf-count">{activeFilterCount}</span>}</button>
        </div>
        <div className="sf-catalog-toolbar"><label className="sf-sort"><span className="sf-sr-only">Порядок товаров</span><select value={filters.sort} onChange={event => updateFilters({ sort: event.target.value as Filters['sort'] })}><option value="featured">Выбор магазина</option><option value="value">Сначала выгодные</option><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="name">По названию</option></select></label><div className="sf-view-toggle" aria-label="Вид каталога"><button aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}>Плитка</button><button aria-pressed={layout === 'list'} onClick={() => setLayout('list')}>Список</button></div></div>
        <section className="sf-filter-panel" id="sf-filter-panel" hidden={!filtersOpen} aria-label="Фильтры каталога">
          <div><h2>Умные подборки</h2><div className="sf-filter-options">{([['all', 'Любая'], ...Object.entries(activePickLabels)] as [Filters['tag'], string][]).map(([tag, label]) => <button key={tag} aria-pressed={filters.tag === tag} onClick={() => updateFilters({ tag })}>{label}</button>)}</div><p>Подборки отмечает магазин в карточке товара. Подростковые модели подбираются с учётом возраста и документов производителя.</p></div>
          <div><h2>Водительские права</h2><div className="sf-filter-options">{([['all', 'Все варианты'], ...Object.entries(licenseLabels)] as string[][]).map(([license, label]) => <button key={license} aria-pressed={filters.license === license} onClick={() => updateFilters({ license: license as Filters['license'] })}>{label}</button>)}</div><p>Категория «Без прав» отображается только для моделей с проверенными магазином документами. Уточняйте требования перед покупкой.</p></div>
          <div><h2>Цена, ₽</h2><div className="sf-price-fields"><label><span>От</span><input type="number" inputMode="decimal" min={0} max={999999999} step="0.01" value={filters.min} onChange={event => updateFilters({ min: event.target.value })} /></label><label><span>До</span><input type="number" inputMode="decimal" min={0} max={999999999} step="0.01" value={filters.max} onChange={event => updateFilters({ max: event.target.value })} /></label></div>{filters.min && filters.max && Number(filters.min) > Number(filters.max) && <p className="sf-error">Цена «От» должна быть не больше цены «До».</p>}<label className="sf-stock-filter">Наличие<select value={filters.stock} onChange={event => updateFilters({ stock: event.target.value as Filters['stock'] })}><option value="all">Любое</option>{Object.entries(stockLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
          <div className="sf-filter-panel__actions"><button className="sf-button" onClick={() => setFiltersOpen(false)}>Показать товары</button><button className="sf-text-button" onClick={() => navigate('#catalog', true)}>Сбросить фильтры</button></div>
        </section>
        <div className="sf-results-heading"><p aria-live="polite">{loading ? 'Загрузка…' : `Найдено моделей: ${filtered.length}`}</p><label className="sf-quick-stock"><input type="checkbox" checked={filters.stock === 'in-stock'} onChange={event => updateFilters({ stock: event.target.checked ? 'in-stock' : 'all' })} />В наличии</label>{activeFilterCount > 0 && <button className="sf-text-button" onClick={() => navigate('#catalog', true)}>Сбросить всё</button>}</div>
        {activeFilterCount > 0 && <div className="sf-active-filters" aria-label="Выбранные фильтры">
          {filters.category !== 'all' && <button onClick={() => updateFilters({ category: 'all' })}>{categoryLabels[filters.category]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {filters.tag !== 'all' && <button onClick={() => updateFilters({ tag: 'all' })}>{tagLabels[filters.tag]}<X size={14} aria-label="Убрать подборку" /></button>}
          {filters.license !== 'all' && <button onClick={() => updateFilters({ license: 'all' })}>{licenseLabels[filters.license]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {filters.stock !== 'all' && <button onClick={() => updateFilters({ stock: 'all' })}>{stockLabels[filters.stock]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {(filters.min || filters.max) && <button onClick={() => updateFilters({ min: '', max: '' })}>{filters.min ? `От ${filters.min} ₽` : ''} {filters.max ? `До ${filters.max} ₽` : ''}<X size={14} aria-label="Убрать цену" /></button>}
        </div>}
        {catalogState || (filtered.length ? cards(filtered) : products.length ? <div className="sf-empty"><h2>По этим условиям моделей нет</h2><p>Попробуйте изменить бюджет, категорию или поисковый запрос.</p><button className="sf-button" onClick={() => navigate('#catalog', true)}>Показать все модели</button></div> : <Empty title="Каталог готовится к открытию" action={false}>Магазин ещё не опубликовал товары. Фотографии, описания и цены появятся здесь после загрузки ассортимента.</Empty>)}
        <div className="sf-catalog-assistance"><p>Нужна помощь с выбором?</p><a href="#guide">Расскажите о своём маршруте <ArrowRight size={16} /></a></div>
      </div>}

      {isProduct && (catalogState || (currentProduct ? <div className="sf-product-detail">
        <ProductGallery key={currentProduct.id} product={currentProduct} />
        <div className="sf-product-detail__summary"><p className="sf-product-category">{categoryLabels[currentProduct.category]}</p><p className={`sf-stock sf-stock--${currentProduct.stock_status}`}>{stockLabels[currentProduct.stock_status]}</p><strong className="sf-detail-price">{money(currentProduct.price)}</strong><p className="sf-muted">Наличие, комплектацию и условия получения подтвердит магазин.</p><div className="sf-detail-actions">{cart.some(item => item.product_id === currentProduct.id) ? <a className="sf-button" href="#cart">Перейти в корзину</a> : <button className="sf-button" disabled={currentProduct.stock_status === 'out-of-stock'} onClick={() => addToCart(currentProduct.id)}>{currentProduct.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'Добавить в корзину'}</button>}<button className="sf-button sf-button--secondary" aria-pressed={favorites.includes(currentProduct.id)} onClick={() => toggleFavorite(currentProduct.id)}>{favorites.includes(currentProduct.id) ? 'В избранном' : 'В избранное'}</button><button className="sf-text-button" aria-pressed={compare.includes(currentProduct.id)} onClick={() => toggleCompare(currentProduct.id)}>{compare.includes(currentProduct.id) ? 'Убрать из сравнения' : 'Добавить в сравнение'}</button></div><dl className="sf-detail-specs">{([['Запас хода', currentProduct.range_km, 'км'], ['Максимальная скорость', currentProduct.speed_kmh, 'км/ч'], ['Мощность', currentProduct.power_w, 'Вт'], ['Вес', currentProduct.weight_kg, 'кг'], ['Багажник', currentProduct.cargo_l, 'л']] as const).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value === null ? 'Уточняется' : `${value} ${unit}`}</dd></div>)}{vehicleCategories.includes(currentProduct.category) && <div><dt>Водительские права</dt><dd>{licenseLabels[effectiveLicense(currentProduct)]}</dd></div>}</dl><p className="sf-muted">Требования к управлению проверяйте по документам конкретной модели. Запас хода зависит от нагрузки и условий поездки.</p></div>
        {currentProduct.tags.length > 0 && <ul className="sf-product-tags" aria-label="Подборки магазина">{currentProduct.tags.map(tag => <li key={tag}><a href={catalogHref({ tag })}>{tagLabels[tag]}</a></li>)}</ul>}
        <section className="sf-product-description"><h2>О модели</h2><p className="sf-preserve-lines">{currentProduct.description || 'Описание этой модели готовится. Подробности можно уточнить у магазина.'}</p></section>
        <nav className="sf-product-info-links" aria-label="Условия покупки"><a href="#delivery">Сроки доставки</a><a href="#payment">Оплата и документы</a><a href="#contact">Связаться с магазином</a></nav>
      </div> : <Empty title="Товар не найден">Возможно, магазин снял модель с публикации. Посмотрите другие варианты в каталоге.</Empty>))}

      {path === 'favorites' && <div className="sf-collection-page">{favorites.length > 0 && <div className="sf-collection-tools"><p>Сохранено моделей: <strong>{favorites.length}</strong></p><button className="sf-text-button" onClick={() => { setFavorites([]); setNotice('Избранное очищено.'); }}><Trash2 size={16} />Очистить</button></div>}{catalogState || (selectedFavorites.length ? <>{selectedFavorites.length < favorites.length && <p className="sf-notice">Часть сохранённых моделей больше не опубликована.</p>}{cards(selectedFavorites)}</> : <Empty title="В избранном пока пусто" icon={Heart}>Нажмите на сердечко в карточке товара — модель сохранится здесь и в этом браузере.</Empty>)}</div>}

      {path === 'compare' && <div className="sf-collection-page">{compare.length > 0 && <div className="sf-collection-tools"><p>Выбрано: <strong>{compare.length}</strong> из 3</p><button className="sf-text-button" onClick={() => { setCompare([]); setNotice('Сравнение очищено.'); }}><Trash2 size={16} />Очистить</button></div>}{catalogState || (selectedCompare.length ? <><div className="sf-compare-scroll" tabIndex={0} aria-label="Таблица сравнения: прокрутите по горизонтали"><table className="sf-compare-table"><caption className="sf-sr-only">Сравнение характеристик выбранных моделей</caption><thead><tr><th scope="col">Модель</th>{selectedCompare.map(product => <th scope="col" key={product.id}><button className="sf-compare-remove" aria-label={`Убрать ${product.name} из сравнения`} onClick={() => toggleCompare(product.id)}><X size={16} /></button><a href={`#product/${encodeURIComponent(product.id)}`}><ProductPhoto product={product} /><span>{product.name}</span></a></th>)}</tr></thead><tbody>{([
          ['Цена', (product: Product) => money(product.price)], ['Наличие', (product: Product) => stockLabels[product.stock_status]], ['Тип', (product: Product) => categoryLabels[product.category]], ['Права', (product: Product) => vehicleCategories.includes(product.category) ? licenseLabels[effectiveLicense(product)] : 'Не требуются'], ['Запас хода', (product: Product) => product.range_km === null ? 'Уточняется' : `до ${product.range_km} км`], ['Скорость', (product: Product) => product.speed_kmh === null ? 'Уточняется' : `${product.speed_kmh} км/ч`], ['Мощность', (product: Product) => product.power_w === null ? 'Уточняется' : `${product.power_w} Вт`], ['Вес', (product: Product) => product.weight_kg === null ? 'Уточняется' : `${product.weight_kg} кг`], ['Багажник', (product: Product) => product.cargo_l === null ? 'Уточняется' : `${product.cargo_l} л`],
        ] as [string, (product: Product) => string][]).map(([label, getValue]) => <tr key={label}><th scope="row">{label}</th>{selectedCompare.map(product => <td key={product.id}>{getValue(product)}</td>)}</tr>)}<tr><th scope="row">Выбрать</th>{selectedCompare.map(product => <td key={product.id}>{cart.some(item => item.product_id === product.id) ? <a href="#cart" className="sf-button sf-button--secondary">В корзине</a> : <button className="sf-button" disabled={product.stock_status === 'out-of-stock'} onClick={() => addToCart(product.id)}>{product.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'В корзину'}</button>}</td>)}</tr></tbody></table></div>{selectedCompare.length < compare.length && <p className="sf-notice">Некоторые выбранные модели больше не опубликованы. Очистите сравнение, чтобы выбрать другие.</p>}<a className="sf-button sf-button--secondary" href="#catalog">Добавить модель из каталога</a></> : <Empty title="Сравнивать пока нечего" icon={ArrowLeftRight}>Нажмите «Сравнить» в карточке товара — до трёх моделей встанут рядом по цене и характеристикам.</Empty>)}</div>}

      {path === 'cart' && <div className="sf-cart-page">{receipt ? <InquiryConfirmation inquiry={receipt} /> : catalogState || (cart.length ? <div className="sf-cart-layout"><section className="sf-cart-items" aria-label="Выбранные товары"><div className="sf-collection-tools sf-cart-tools"><p>Товаров: <strong>{cartCount}</strong></p><button className="sf-text-button" onClick={retry}>Обновить наличие</button><button className="sf-text-button" onClick={() => { setCart([]); setNotice('Корзина очищена.'); }}><Trash2 size={16} />Очистить</button></div>{cart.map(item => {
          const product = products.find(value => value.id === item.product_id);
          return <article className="sf-cart-item" key={item.product_id}>{product ? <><a className="sf-cart-photo" href={`#product/${encodeURIComponent(product.id)}`}><ProductPhoto product={product} /></a><div className="sf-cart-item__info"><h2><a href={`#product/${encodeURIComponent(product.id)}`}>{product.name}</a></h2><p className={`sf-stock sf-stock--${product.stock_status}`}>{stockLabels[product.stock_status]}</p><p className="sf-cart-unit-price">{money(product.price)} / шт.</p><div className="sf-quantity" role="group" aria-label={`Количество ${product.name}`}><button disabled={item.quantity <= 1} aria-label={`Уменьшить количество ${product.name}`} onClick={() => changeQuantity(product.id, item.quantity - 1)}>−</button><output aria-live="polite">{item.quantity}</output><button disabled={item.quantity >= MAX_QUANTITY} aria-label={`Увеличить количество ${product.name}`} onClick={() => changeQuantity(product.id, item.quantity + 1)}>+</button></div></div><div className="sf-cart-item__total"><strong>{product.price === null ? 'По запросу' : money(Math.round(product.price * 100) * item.quantity / 100)}</strong><button className="sf-text-button" onClick={() => removeCart(product.id)}><Trash2 size={16} />Удалить</button></div></> : <div className="sf-cart-unavailable"><h2>Модель больше не опубликована</h2><p>Удалите её, чтобы отправить заявку на оставшиеся товары.</p><button className="sf-text-button" onClick={() => removeCart(item.product_id)}>Удалить недоступный товар</button></div>}</article>;
        })}<a className="sf-text-button sf-continue-shopping" href="#catalog">Продолжить покупки <ArrowRight size={17} /></a></section><aside className="sf-cart-summary"><h2>Ваш выбор</h2><dl><div><dt>Товаров</dt><dd>{cartCount}</dd></div><div><dt>{city.name ? `Доставка в ${city.name}` : 'Доставка по России'}</dt><dd>{cartZone ? zoneTerm(cartZone) : 'от 3 дней'}</dd></div><div><dt>Оплата</dt><dd>{settings.payment_card === 'on' ? 'Картой после подтверждения' : 'По согласованию с магазином'}</dd></div></dl><p className="sf-cart-total"><span>{cartSummary.unknownPrices ? 'Известная стоимость' : 'Стоимость товаров'}</span><strong>{money(cartSummary.knownTotal)}</strong></p>{cartSummary.unknownPrices > 0 && <p className="sf-muted">Для {cartSummary.unknownPrices} шт. цена будет уточнена. Это не полная сумма заявки.</p>}<p className="sf-muted">Сейчас деньги не списываются: сначала магазин подтверждает наличие и итоговую стоимость. <a href="#payment">Как проходит оплата</a></p><InquiryForm settings={settings} account={account} city={city.name} onCity={chooseCity} items={cart} blocked={cartSummary.unavailable > 0} onSuccess={inquiry => { setReceipt(inquiry); setCart([]); window.scrollTo({ top: 0, behavior: 'instant' }); }} /></aside></div> : <Empty title="В корзине пока пусто" icon={ShoppingBag}>Добавьте понравившуюся модель — в корзине можно уточнить наличие, доставку и итоговую цену у магазина.</Empty>)}</div>}

      {Object.hasOwn(infoTitles, path) && <Information key={path} topic={path} settings={settings} city={city.name} onCity={chooseCity} />}
      {path === 'profile' && <div className="sf-profile"><p className="sf-lead">Ваш выбор и обращения</p><p>Избранное и корзина сохраняются в этом браузере и работают без аккаунта. Аккаунт нужен, чтобы видеть историю своих заявок.</p><nav className="sf-account-links"><a href="#favorites">Избранное <span>{favorites.length}</span></a><a href="#compare">Сравнение <span>{compare.length}</span></a><a href="#cart">Корзина <span>{cartCount}</span></a><a href="#contact">Связаться с магазином <ArrowRight size={17} /></a></nav><Account account={account} csrfToken={csrfToken} city={city.name} onChange={refreshAccount} onCity={chooseCity} /></div>}
      {path === 'menu' && <nav className="sf-menu" aria-label="Все разделы"><a href="#catalog">Каталог транспорта <ArrowRight size={17} /></a><a href="#picks">Умные подборки <ArrowRight size={17} /></a>{sections.map(section => <a href={`#${section}`} key={section}>{infoTitles[section]}<ArrowRight size={17} /></a>)}<a href="#compare">Сравнение моделей <ArrowRight size={17} /></a><a href="#privacy">Обработка данных <ArrowRight size={17} /></a></nav>}
      {!Object.hasOwn(titles, path) && !isProduct && <Empty title="Такой страницы нет">Вернитесь в каталог или выберите раздел в меню магазина.</Empty>}
    </main>
    <footer className="sf-footer"><div><span>{settings.shop_name} · доставка по России</span><nav aria-label="Дополнительная информация"><a href="#about">О магазине</a><a href="#delivery">Доставка</a><a href="#payment">Оплата</a><a href="#warranty">Гарантия</a><a href="#privacy">Политика конфиденциальности</a><a href="#consent">Согласие на обработку данных</a><a href="#offer">Публичная оферта</a><a href="#returns">Возврат товаров и денег</a><a href="#contact">Контакты</a></nav></div></footer>
    <nav className="sf-bottom-nav" aria-label="Основная навигация">{[
      { path: 'home', label: 'Главная', icon: Home }, { path: 'catalog', label: 'Каталог', icon: Search }, { path: 'cart', label: 'Корзина', icon: ShoppingBag }, { path: 'compare', label: 'Сравнить', icon: ArrowLeftRight }, { path: 'profile', label: 'Профиль', icon: UserRound },
    ].map(item => <a key={item.path} href={`#${item.path}`} aria-current={path === item.path || (item.path === 'catalog' && isProduct) ? 'page' : undefined}><item.icon size={21} aria-hidden="true" /><span>{item.label}</span></a>)}</nav>
    {(cityOpen || (!city.asked && !loading)) && <CityPicker city={city} onChoose={chooseCity} onClose={() => { setCity({ ...city, asked: true }); setCityOpen(false); }} />}
    {notice && <div className="sf-toast" role="status"><span>{notice}</span><button aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={18} /></button></div>}
  </div>;
}

export default Storefront;
