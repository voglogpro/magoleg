import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowLeftRight, Heart, Home as HomeIcon, Menu, MessageCircle, PackageOpen, Search, ShoppingBag, SlidersHorizontal, Trash2, UserRound, X, type LucideIcon } from 'lucide-react';
import { Account } from './Account';
import { Cart } from './Cart';
import { CityBar, CityPicker } from './CityPicker';
import { Home } from './Home';
import { PickCards } from './PickCards';
import { cargoLabel, cartTotal, catalogHref, effectiveLicense, filterProducts, money, parseFilters, plural, powerLabel, powerTotal, sanitizeCity, sanitizeIds, smartPicks, telegramLink } from './domain';
import { Analytics, trackCommerce, trackGoal } from './Analytics';
import { useCustomerCart } from './CustomerData';
import { seller } from './legal-texts';
import { useAccount, useHashRoute, useStoreData, useStored } from './hooks';
import { Information, infoTitles } from './Information';
import { InquiryConfirmation, InquiryForm, PaymentResult } from './InquiryForm';
import { FinancePreview, ProductCard, ProductGallery, ProductPhoto, ProductPrice } from './ProductCard';
import { ShopMenu } from './ShopMenu';
import { activePickLabels, categoryLabels, driveLabels, licenseLabels, MAX_CART_MODELS, MAX_QUANTITY, stockLabels, tagLabels, vehicleCategories, type AccountProfile, type Filters, type Inquiry, type Product } from './types';
import './storefront.css';
import './reference-theme.css';
import './cart.css';

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

function ProfileAccess({ account, restoring = false, active = false, mobile = false }: {
  account: AccountProfile | null; restoring?: boolean; active?: boolean; mobile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const route = () => setOpen(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('hashchange', route);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('hashchange', route); };
  }, [open]);
  const title = restoring ? 'Проверяем вход…' : account?.name || 'Личный кабинет';
  return <div ref={root} className={`sf-profile-access sf-profile-access--${mobile ? 'mobile' : 'header'}`}>
    <button type="button" className={mobile ? 'sf-profile-trigger sf-profile-trigger--mobile' : 'sf-icon-button'}
      aria-label="Меню личного кабинета" aria-expanded={open} aria-controls={mobile ? 'sf-profile-menu-mobile' : 'sf-profile-menu-header'}
      aria-current={active ? 'page' : undefined} onClick={() => setOpen(value => !value)}>
      <span className="sf-nav-icon"><UserRound size={mobile ? 23 : 22} aria-hidden="true" />{account && <i className="sf-profile-online" />}</span>
      {mobile && <span>Профиль</span>}
    </button>
    {open && <aside id={mobile ? 'sf-profile-menu-mobile' : 'sf-profile-menu-header'} className="sf-profile-popover" aria-label="Личный кабинет">
      <header><span className="sf-profile-popover__mark"><img src="/brand/gpartner-mark-v2-512.png" width="30" height="30" alt="" /></span><div><strong>{title}</strong><small>{account ? account.contact : 'Вход на этом устройстве'}</small></div></header>
      <p>{account ? 'Аккаунт уже сохранён — заявки и статусы доступны без повторной регистрации.' : 'Войдите один раз: магазин запомнит это устройство и больше не предложит регистрацию.'}</p>
      <a className="sf-button" href="#profile" onClick={() => setOpen(false)}>{account ? 'Открыть кабинет' : 'Войти в аккаунт'} <ArrowRight size={16} /></a>
    </aside>}
  </div>;
}

const catalogTypes = [['all', 'Все модели'], ...Object.entries(categoryLabels)] as [Filters['category'], string][];

export function Storefront() {
  const { products, settings, loading, error, settingsError, retry } = useStoreData();
  const { path, search, navigate } = useHashRoute();
  const { account, csrfToken, ready: accountReady, restoring: restoringAccount, refresh: refreshAccount } = useAccount();
  const { cart, setCart, ready: cartReady, error: cartError, retry: retryCart } = useCustomerCart(account, csrfToken, accountReady);
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
  const activeFilterCount = [filters.category !== 'all', filters.tag !== 'all', filters.license !== 'all', filters.stock !== 'all', filters.sale, Boolean(filters.min || filters.max)].filter(Boolean).length;
  const supportChat = telegramLink(settings.telegram) || 'https://t.me/GpartnerStore';
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
    if (!cartReady) { setNotice('Дождитесь загрузки корзины аккаунта.'); return; }
    const product = products.find(item => item.id === id);
    if (!product || product.stock_status === 'out-of-stock') { setNotice('Сейчас эту модель нельзя добавить в заявку.'); return; }
    if (cart.some(item => item.product_id === id)) { navigate('#cart'); return; }
    if (cart.length >= MAX_CART_MODELS) { setNotice(`В корзине уже ${MAX_CART_MODELS} моделей. Удалите лишние или отправьте текущий выбор.`); return; }
    setCart(previous => [...previous, { product_id: id, quantity: 1 }]);
    trackCommerce('add', product);
    setNotice('Товар добавлен в корзину. Там можно уточнить наличие и получение.');
  };
  const removeCart = (id: string) => { trackCommerce('remove', products.find(p => p.id === id), cart.find(p => p.product_id === id)?.quantity || 1); setCart(previous => previous.filter(item => item.product_id !== id)); setNotice('Товар удалён из корзины.'); };
  const changeQuantity = (id: string, quantity: number) => {
    const next = Math.max(1, Math.min(MAX_QUANTITY, quantity));
    const delta = next - (cart.find(item => item.product_id === id)?.quantity || next);
    if (delta) trackCommerce(delta > 0 ? 'add' : 'remove', products.find(item => item.id === id), Math.abs(delta));
    setCart(previous => previous.map(item => item.product_id === id ? { ...item, quantity: next } : item));
  };
  const cards = (items: Product[]) => <div className={`sf-product-grid${path === 'catalog' && layout === 'list' ? ' sf-product-grid--list' : ''}`}>
    {items.map(product => <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} compared={compare.includes(product.id)} inCart={cart.some(item => item.product_id === product.id)} financeAvailable={[settings.payment_installment, settings.payment_credit].some(status => status === 'on')} onFavorite={toggleFavorite} onCompare={toggleCompare} onAdd={addToCart} />)}
  </div>;
  const catalogState = loading ? <p className="sf-loading" role="status">Загружаем каталог…</p> : error ? <div className="sf-empty" role="alert"><h2>Каталог временно недоступен</h2><p>{error}</p><button className="sf-button" onClick={retry}>Повторить загрузку</button></div> : null;
  const featured = [...products.filter(product => product.featured), ...products.filter(product => !product.featured)].slice(0, 4);
  const picks = smartPicks(products);

  return <div className={`sf-store${path === 'cart' ? ' sf-store--cart' : ''}`}>
    <a className="sf-skip" href="#sf-content" onClick={event => { event.preventDefault(); contentRef.current?.focus(); }}>Перейти к содержимому</a>
    <header className="sf-header">
      <div className="sf-header__inner">
        <a className="sf-icon-button sf-mobile-only" href="#menu" aria-label="Открыть меню"><Menu size={23} /></a>
        <a className="sf-brand" href="#home" aria-label={`${settings.shop_name} — главная`}><img src="/brand/gpartner-mark-v2-512.png" width="40" height="40" alt="" draggable={false} /><span>{settings.shop_name}</span></a>
        <nav className="sf-desktop-nav" aria-label="Разделы магазина"><a href="#catalog" aria-current={path === 'catalog' ? 'page' : undefined}>Каталог</a><a href="#delivery" aria-current={path === 'delivery' ? 'page' : undefined}>Доставка</a><a href="#payment" aria-current={path === 'payment' ? 'page' : undefined}>Оплата</a><a href="#about" aria-current={path === 'about' ? 'page' : undefined}>О магазине</a><a href="#contact" aria-current={path === 'contact' ? 'page' : undefined}>Контакты</a></nav>
        <div className="sf-header-actions">
          <a className="sf-icon-button" href="#favorites" aria-label={`Избранное: ${favorites.length}`} aria-current={path === 'favorites' ? 'page' : undefined}><Heart size={22} />{favorites.length > 0 && <span className="sf-count">{favorites.length}</span>}</a>
          <a className="sf-icon-button sf-desktop-only" href="#compare" aria-label={`Сравнение: ${compare.length}`}><ArrowLeftRight size={22} /></a>
          <ProfileAccess account={account} restoring={restoringAccount} active={path === 'profile'} />
          <a className="sf-icon-button" href="#cart" aria-label={`Корзина: ${cartCount}`}><ShoppingBag size={22} />{cartCount > 0 && <span className="sf-count">{cartCount}</span>}</a>
        </div>
      </div>
    </header>

    <CityBar city={city} onOpen={() => setCityOpen(true)} />
    {path === 'home' && <nav className="sf-mobile-shortcuts" aria-label="Быстрый переход"><a href="#catalog">Каталог</a><a href="#delivery">Доставка</a><a href="#payment">Оплата</a><a href="#about">О магазине</a></nav>}
    <main id="sf-content" className={`sf-main sf-page-${isProduct ? 'product' : path}${['profile', 'cart', 'payment', 'contact', 'guide', 'order-success'].includes(path) ? ' ym-hide-content' : ''}`} tabIndex={-1} ref={contentRef}>
      {cartError && <div className="sf-settings-error" role="alert"><span>{cartError}</span><button onClick={retryCart}>Повторить</button></div>}
      {path !== 'home' && <div className="sf-page-heading"><a href={isProduct ? '#catalog' : '#home'} className="sf-back" aria-label={isProduct ? 'Вернуться в каталог' : 'На главную'}><ArrowLeft size={20} /><span>{isProduct ? 'Каталог' : 'Главная'}</span></a><h1>{title}</h1>{path === 'cart' && cart.length > 0 && <button className="sf-icon-button sf-cart-clear" aria-label="Очистить корзину" onClick={() => { setCart([]); setNotice('Корзина очищена.'); }}><Trash2 size={22} /></button>}</div>}
      {settingsError && <div className="sf-settings-error" role="status"><span>{settingsError}</span><button onClick={retry} disabled={loading}>Обновить</button></div>}
      {path === 'home' && <Home products={products} settings={settings} picks={picks} featured={featured}
        chosen={{ favorites: favorites.length, compare: compare.length, cart: cartCount }}
        catalogState={catalogState} cards={cards} onCatalog={() => navigate('#catalog')} />}

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
        <div className="sf-results-heading">
          <p aria-live="polite">{loading ? 'Загрузка…' : `Найдено моделей: ${filtered.length}`}</p>
          <div className="sf-quick-availability" role="group" aria-label="Фильтр по наличию">
            <label className="sf-quick-stock"><input type="checkbox" checked={filters.sale} onChange={event => updateFilters({ sale: event.target.checked })} />Скидки</label>
            <label className="sf-quick-stock"><input type="checkbox" checked={filters.stock === 'in-stock'} onChange={event => updateFilters({ stock: event.target.checked ? 'in-stock' : 'all' })} />В наличии</label>
            <label className="sf-quick-stock"><input type="checkbox" checked={filters.stock === 'preorder'} onChange={event => updateFilters({ stock: event.target.checked ? 'preorder' : 'all' })} />Под заказ</label>
          </div>
          {activeFilterCount > 0 && <button className="sf-text-button" onClick={() => navigate('#catalog', true)}>Сбросить всё</button>}
        </div>
        {activeFilterCount > 0 && <div className="sf-active-filters" aria-label="Выбранные фильтры">
          {filters.category !== 'all' && <button onClick={() => updateFilters({ category: 'all' })}>{categoryLabels[filters.category]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {filters.tag !== 'all' && <button onClick={() => updateFilters({ tag: 'all' })}>{tagLabels[filters.tag]}<X size={14} aria-label="Убрать подборку" /></button>}
          {filters.license !== 'all' && <button onClick={() => updateFilters({ license: 'all' })}>{licenseLabels[filters.license]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {filters.stock !== 'all' && <button onClick={() => updateFilters({ stock: 'all' })}>{stockLabels[filters.stock]}<X size={14} aria-label="Убрать фильтр" /></button>}
          {filters.sale && <button onClick={() => updateFilters({ sale: false })}>Скидки<X size={14} aria-label="Убрать фильтр" /></button>}
          {(filters.min || filters.max) && <button onClick={() => updateFilters({ min: '', max: '' })}>{filters.min ? `От ${filters.min} ₽` : ''} {filters.max ? `До ${filters.max} ₽` : ''}<X size={14} aria-label="Убрать цену" /></button>}
        </div>}
        {catalogState || (filtered.length ? cards(filtered) : products.length ? <div className="sf-empty"><h2>По этим условиям моделей нет</h2><p>Попробуйте изменить бюджет, категорию или поисковый запрос.</p><button className="sf-button" onClick={() => navigate('#catalog', true)}>Показать все модели</button></div> : <Empty title="Каталог готовится к открытию" action={false}>Магазин ещё не опубликовал товары. Фотографии, описания и цены появятся здесь после загрузки ассортимента.</Empty>)}
        <div className="sf-catalog-assistance"><p>Нужна помощь с выбором?</p><a href="#guide">Расскажите о своём маршруте <ArrowRight size={16} /></a></div>
      </div>}

      {isProduct && (catalogState || (currentProduct ? <div className="sf-product-detail">
        <ProductGallery key={currentProduct.id} product={currentProduct} />
        <div className="sf-product-detail__summary"><p className="sf-product-category">{categoryLabels[currentProduct.category]}</p><p className={`sf-stock sf-stock--${currentProduct.stock_status}`}>{stockLabels[currentProduct.stock_status]}</p><ProductPrice product={currentProduct} detail />{[settings.payment_dolyame, settings.payment_installment, settings.payment_credit].some(status => status !== 'off') && currentProduct.stock_status !== 'out-of-stock' && <FinancePreview price={currentProduct.price} />}<p className="sf-muted">Наличие, комплектацию и условия получения подтвердит магазин.</p><div className="sf-detail-actions">{cart.some(item => item.product_id === currentProduct.id) ? <a className="sf-button" href="#cart">Перейти в корзину</a> : <button className="sf-button" disabled={currentProduct.stock_status === 'out-of-stock'} onClick={() => addToCart(currentProduct.id)}>{currentProduct.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'Добавить в корзину'}</button>}<button className="sf-button sf-button--secondary" aria-pressed={favorites.includes(currentProduct.id)} onClick={() => toggleFavorite(currentProduct.id)}>{favorites.includes(currentProduct.id) ? 'В избранном' : 'В избранное'}</button><button className="sf-text-button" aria-pressed={compare.includes(currentProduct.id)} onClick={() => toggleCompare(currentProduct.id)}>{compare.includes(currentProduct.id) ? 'Убрать из сравнения' : 'Добавить в сравнение'}</button></div><dl className="sf-detail-specs">{([['Запас хода', currentProduct.range_km, 'км'], ['Максимальная скорость', currentProduct.speed_kmh, 'км/ч'], ['Вес устройства', currentProduct.weight_kg, 'кг'], ['Грузоподъёмность', currentProduct.payload_kg, 'кг']] as const).map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value === null ? 'Уточняется' : `${value} ${unit}`}</dd></div>)}
          {currentProduct.drive !== 'unknown' && <div><dt>Привод</dt><dd>{driveLabels[currentProduct.drive]}</dd></div>}
          <div><dt>Мощность{currentProduct.drive === 'dual' ? ' (на мотор)' : ''}</dt><dd>{currentProduct.power_w === null ? 'Уточняется' : powerLabel(currentProduct)}</dd></div>
          {currentProduct.drive === 'dual' && powerTotal(currentProduct) !== null && <div><dt>Суммарная мощность</dt><dd>{`${powerTotal(currentProduct)} Вт`}</dd></div>}
          <div><dt>Багажник</dt><dd>{cargoLabel(currentProduct.cargo_l)}</dd></div>
          {vehicleCategories.includes(currentProduct.category) && <div><dt>Водительские права</dt><dd>{licenseLabels[effectiveLicense(currentProduct)]}</dd></div>}</dl><p className="sf-muted">Требования к управлению проверяйте по документам конкретной модели. Запас хода зависит от нагрузки и условий поездки.</p></div>
        {currentProduct.tags.length > 0 && <ul className="sf-product-tags" aria-label="Подборки магазина">{currentProduct.tags.map(tag => <li key={tag}><a href={catalogHref({ tag })}>{tagLabels[tag]}</a></li>)}</ul>}
        <section className="sf-product-description"><h2>О модели</h2><p className="sf-preserve-lines">{currentProduct.description || 'Описание этой модели готовится. Подробности можно уточнить у магазина.'}</p></section>
        <nav className="sf-product-info-links" aria-label="Условия покупки"><a href="#delivery">Сроки доставки</a><a href="#payment">Оплата и документы</a><a href="#contact">Связаться с магазином</a></nav>
      </div> : <Empty title="Товар не найден">Возможно, магазин снял модель с публикации. Посмотрите другие варианты в каталоге.</Empty>))}

      {path === 'favorites' && <div className="sf-collection-page">{favorites.length > 0 && <div className="sf-collection-tools"><p>Сохранено моделей: <strong>{favorites.length}</strong></p><button className="sf-text-button" onClick={() => { setFavorites([]); setNotice('Избранное очищено.'); }}><Trash2 size={16} />Очистить</button></div>}{catalogState || (selectedFavorites.length ? <>{selectedFavorites.length < favorites.length && <p className="sf-notice">Часть сохранённых моделей больше не опубликована.</p>}{cards(selectedFavorites)}</> : <Empty title="В избранном пока пусто" icon={Heart}>Нажмите на сердечко в карточке товара — модель сохранится здесь и в этом браузере.</Empty>)}</div>}

      {path === 'compare' && <div className="sf-collection-page">{compare.length > 0 && <div className="sf-collection-tools"><p>Выбрано: <strong>{compare.length}</strong> из 3</p><button className="sf-text-button" onClick={() => { setCompare([]); setNotice('Сравнение очищено.'); }}><Trash2 size={16} />Очистить</button></div>}{catalogState || (selectedCompare.length ? <><div className="sf-compare-scroll" tabIndex={0} aria-label="Таблица сравнения: прокрутите по горизонтали"><table className="sf-compare-table"><caption className="sf-sr-only">Сравнение характеристик выбранных моделей</caption><thead><tr><th scope="col">Модель</th>{selectedCompare.map(product => <th scope="col" key={product.id}><button className="sf-compare-remove" aria-label={`Убрать ${product.name} из сравнения`} onClick={() => toggleCompare(product.id)}><X size={16} /></button><a href={`#product/${encodeURIComponent(product.id)}`}><ProductPhoto product={product} /><span>{product.name}</span></a></th>)}</tr></thead><tbody>{([
          ['Цена', (product: Product) => money(product.price)], ['Наличие', (product: Product) => stockLabels[product.stock_status]], ['Тип', (product: Product) => categoryLabels[product.category]], ['Права', (product: Product) => vehicleCategories.includes(product.category) ? licenseLabels[effectiveLicense(product)] : 'Не требуются'], ['Запас хода', (product: Product) => product.range_km === null ? 'Уточняется' : `до ${product.range_km} км`], ['Скорость', (product: Product) => product.speed_kmh === null ? 'Уточняется' : `${product.speed_kmh} км/ч`], ['Мощность', (product: Product) => product.power_w === null ? 'Уточняется' : powerLabel(product)], ['Привод', (product: Product) => driveLabels[product.drive]], ['Вес устройства', (product: Product) => product.weight_kg === null ? 'Уточняется' : `${product.weight_kg} кг`], ['Грузоподъёмность', (product: Product) => product.payload_kg === null ? 'Уточняется' : `${product.payload_kg} кг`], ['Багажник', (product: Product) => cargoLabel(product.cargo_l)],
        ] as [string, (product: Product) => string][]).map(([label, getValue]) => <tr key={label}><th scope="row">{label}</th>{selectedCompare.map(product => <td key={product.id}>{getValue(product)}</td>)}</tr>)}<tr><th scope="row">Выбрать</th>{selectedCompare.map(product => <td key={product.id}>{cart.some(item => item.product_id === product.id) ? <a href="#cart" className="sf-button sf-button--secondary">В корзине</a> : <button className="sf-button" disabled={product.stock_status === 'out-of-stock'} onClick={() => addToCart(product.id)}>{product.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'В корзину'}</button>}</td>)}</tr></tbody></table></div>{selectedCompare.length < compare.length && <p className="sf-notice">Некоторые выбранные модели больше не опубликованы. Очистите сравнение, чтобы выбрать другие.</p>}<a className="sf-button sf-button--secondary" href="#catalog">Добавить модель из каталога</a></> : <Empty title="Сравнивать пока нечего" icon={ArrowLeftRight}>Нажмите «Сравнить» в карточке товара — до трёх моделей встанут рядом по цене и характеристикам.</Empty>)}</div>}

      {path === 'order-success' && <div className="sf-cart-page"><PaymentResult orderId={new URLSearchParams(search).get('order') || ''} /></div>}
      {path === 'cart' && <div className="sf-cart-page">{receipt ? <InquiryConfirmation inquiry={receipt} /> : catalogState || (cart.length ? <Cart items={cart} products={products} settings={settings} city={city.name} onCity={() => setCityOpen(true)} onRetry={retry} onQuantity={changeQuantity} onRemove={removeCart}>
        <InquiryForm settings={settings} total={cartTotal(cart, products).knownTotal} account={account} city={city.name} preferredPayment={new URLSearchParams(search).get('finance') === '1' ? 'installment' : 'sbp'} onCity={chooseCity} items={cart} blocked={!cartReady || cart.some(item => !products.some(product => product.id === item.product_id && product.stock_status !== 'out-of-stock'))} onSuccess={inquiry => { trackGoal('inquiry_submitted'); setReceipt(inquiry); setCart([]); window.scrollTo({ top: 0, behavior: 'instant' }); }} />
      </Cart> : <Empty title="В корзине пока пусто" icon={ShoppingBag}>Добавьте понравившуюся модель — в корзине можно уточнить наличие, доставку и итоговую цену у магазина.</Empty>)}</div>}

      {Object.hasOwn(infoTitles, path) && <Information key={path} topic={path} settings={settings} city={city.name} onCity={chooseCity} />}
      {path === 'profile' && <div className="sf-profile"><Account account={account} csrfToken={csrfToken} city={city.name} restoring={restoringAccount} onChange={refreshAccount} onCity={chooseCity} saved={{ favorites: favorites.length, compare: compare.length, cart: cartCount }} /></div>}
      {path === 'menu' && <ShopMenu settings={settings} />}
      {!Object.hasOwn(titles, path) && !isProduct && <Empty title="Такой страницы нет">Вернитесь в каталог или выберите раздел в меню магазина.</Empty>}
    </main>
    <footer className="sf-footer">
      <div className="sf-footer__inner">
        <a className="sf-footer__brand" href="#home" aria-label={`${settings.shop_name} — главная`}>
          <img src="/brand/gpartner-mark-v2-512.png" width="36" height="36" alt="" draggable={false} />
          <span>{settings.shop_name}</span>
        </a>
        <nav className="sf-footer__documents" aria-label="Документы магазина">
          <a href="#privacy">Политика конфиденциальности</a>
          <a href="#offer">Публичная оферта</a>
          <a href="#returns">Обмен и возврат</a>
        </nav>
        <nav className="sf-footer__guides" aria-label="Гайды по выбору электротранспорта">
          <a href="/guides/elektrovelosipedy-dlya-skautov">Электровелосипеды для скаутов</a>
          <a href="/guides/elektrotransport-dlya-kurerov">Электротранспорт для курьеров</a>
          <a href="/guides/elektrovelosipedy-s-bolshim-zapasom-hoda">Модели с большим запасом хода</a>
        </nav>
        <section className="sf-footer__requisites" aria-label="Реквизиты продавца">
          <strong>{seller.short}</strong>
          <span>ИНН {seller.inn}</span>
          <span>ОГРНИП {seller.ogrnip}</span>
          <span>Р/с {seller.account}</span>
          <span>{seller.bank}</span>
          <a href={`mailto:${seller.email}`}>{seller.email}</a>
        </section>
        <p className="sf-footer__copyright">© {new Date().getFullYear()} {seller.brand}</p>
      </div>
    </footer>
    <a className="sf-support-chat" href={supportChat} target="_blank" rel="noopener noreferrer" aria-label="Открыть чат с поддержкой в Telegram"><MessageCircle size={22} aria-hidden="true" /><span>Поддержка</span></a>
    <Analytics path={path} product={currentProduct} covered={cityOpen || filtersOpen} showSettings={path === 'profile'} />
    <nav className="sf-bottom-nav" aria-label="Основная навигация">{[
      { path: 'home', label: 'Главная', icon: HomeIcon }, { path: 'catalog', label: 'Каталог', icon: Search }, { path: 'cart', label: 'Корзина', icon: ShoppingBag }, { path: 'compare', label: 'Сравнить', icon: ArrowLeftRight },
    ].map(item => <a key={item.path} href={`#${item.path}`} aria-current={path === item.path || (item.path === 'catalog' && isProduct) ? 'page' : undefined}><span className="sf-nav-icon"><item.icon size={23} aria-hidden="true" />{item.path === 'cart' && cartCount > 0 && <span className="sf-count">{cartCount}</span>}</span><span>{item.label}</span></a>)}<ProfileAccess account={account} restoring={restoringAccount} active={path === 'profile'} mobile /></nav>
    {(cityOpen || (!city.asked && !loading)) && <CityPicker city={city} onChoose={chooseCity} onClose={() => { setCity({ ...city, asked: true }); setCityOpen(false); }} />}
    {notice && <div className="sf-toast" role="status"><span>{notice}</span><button aria-label="Закрыть уведомление" onClick={() => setNotice('')}><X size={18} /></button></div>}
  </div>;
}

export default Storefront;
