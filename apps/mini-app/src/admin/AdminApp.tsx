import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { adminRequest, AdminApiError, formatDate, formatPrice, mediaSource, type AdminSession, type Inquiry, type Product, type ShopSettings } from './api';
import { fitPhoto } from './fit-photo';
import { productDraft, uploadSizeError, validateProduct, validateUpload, type ProductDraft } from './product-form';
import { activePickLabels as tagLabels, badgeLabels, categoryLabels, defaultSettings, driveLabels, type PaymentStatus, type ProductTag } from '../storefront/types';
import { paymentStatusLabels } from '../storefront/Payment';
import './admin.css';
import { Customers, AnalyticsPanel } from './CustomerPanels';

const paymentFields = [
  ['payment_sbp', 'СБП (по QR или ссылке)'],
  ['payment_installment', 'Рассрочка'], ['payment_credit', 'Кредит'],
] as const;

/** Что владелец должен заполнить, прежде чем объявлять оплату рабочей. Совпадает с проверкой сервера. */
export function paymentChecklist(settings: ShopSettings) {
  const digits = settings.phone.replace(/\D/g, '');
  return [
    { label: 'Телефон или Telegram для обращений', done: Boolean((digits.length >= 7 && digits.length <= 15) || settings.telegram.trim()) },
    { label: 'Адрес для возврата товаров', done: Boolean(settings.return_address.trim()) },
    { label: 'Порядок обмена и возврата товара', done: Boolean(settings.returns_document.trim()) },
    { label: 'Порядок выдачи кассового чека', done: Boolean(settings.payment_receipt.trim()) },
  ];
}

type Request = <T>(path: string, options?: Parameters<typeof adminRequest>[1]) => Promise<T>;
type PanelProps = { request: Request; onDirty: (value: boolean) => void; onBusy: (value: boolean) => void };
type Tab = 'products' | 'inquiries' | 'customers' | 'analytics' | 'settings';
const tabLabels: Record<Tab, string> = { products: 'Товары', inquiries: 'Заявки', customers: 'Покупатели', analytics: 'Статистика', settings: 'Магазин и документы' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Не удалось выполнить действие.';
const discardMessage = 'Есть несохранённые изменения. Покинуть страницу без сохранения?';
/** Mirrors MAX_PHOTOS in store_api.py, so the form stops before the server refuses the card. */
const MAX_PHOTOS = 8;

function Notice({ error = false, focus = false, children }: { error?: boolean; focus?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  return <div ref={ref} tabIndex={focus ? -1 : undefined} className={`crm-notice ${error ? 'crm-notice--error' : ''}`} role={error ? 'alert' : 'status'}>{children}</div>;
}

function Login({ onLogin, initialError }: { onLogin: (session: AdminSession) => void; initialError: string }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const session = await adminRequest<AdminSession>('/login', { method: 'POST', body: { username: username.trim(), password, remember } });
      setPassword(''); onLogin(session);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <main className="crm-login">
    <a className="crm-brand" href="/">G-PARTNER</a>
    <div className="crm-login-card">
      <p className="crm-eyebrow">Управление магазином</p>
      <h1>Вход для владельца</h1>
      <p className="crm-muted">Товары, заявки покупателей и информация на сайте.</p>
      {error && <Notice error>{error}</Notice>}
      <form onSubmit={submit} className="crm-form">
        <label>Логин<input name="username" autoComplete="username" placeholder="Ваш логин" required maxLength={100} value={username} onChange={event => setUsername(event.target.value)} disabled={busy}/></label>
        <label>Пароль<input name="password" type="password" autoComplete="current-password" placeholder="Ваш пароль" required maxLength={256} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/></label>
        <label className="crm-checkbox"><input type="checkbox" name="remember" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy}/><span>Оставаться в системе на этом устройстве</span></label>
        <p className="crm-help">До 14 дней, если перерыв в работе не превышает 7 дней. На чужом устройстве снимите отметку.</p>
        <button className="crm-button crm-button--primary" disabled={busy} type="submit">{busy ? 'Входим…' : 'Войти'}</button>
      </form>
      <p className="crm-login-note">Доступ только для сотрудников магазина. Пароль не сохраняется в приложении.</p>
    </div>
    <a className="crm-link" href="/">Вернуться в магазин</a>
  </main>;
}

function useUnsaved(dirty: boolean, onDirty: PanelProps['onDirty']) {
  useEffect(() => {
    onDirty(dirty);
    const preventUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (dirty) window.addEventListener('beforeunload', preventUnload);
    return () => { onDirty(false); window.removeEventListener('beforeunload', preventUnload); };
  }, [dirty, onDirty]);
}

function Products({ request, onDirty, onBusy }: PanelProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(productDraft());
  const [original, setOriginal] = useState(JSON.stringify(productDraft()));
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = editing !== null && JSON.stringify(draft) !== original;
  useUnsaved(dirty, onDirty);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  useEffect(() => { if (formErrors.length) document.querySelector<HTMLElement>('.crm-form-errors')?.focus(); }, [formErrors]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try { const result = await request<{ products: Product[] }>('/products', { signal }); setProducts(result.products); }
    catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(errorText(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);

  function edit(product: Product | 'new' | null) {
    if (dirty && !window.confirm(discardMessage)) return;
    const value = productDraft(product && product !== 'new' ? product : undefined);
    setEditing(product); setDraft(value); setOriginal(JSON.stringify(value)); setFormErrors([]); setError(''); setMessage('');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('#crm-product-name')?.focus());
  }
  function update<K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) { setDraft(current => ({ ...current, [key]: value })); }
  /** Photos are uploaded one by one so a failure keeps the ones that already went through. */
  async function upload(files?: FileList | null) {
    const chosen = [...files ?? []];
    if (!chosen.length) return;
    setBusy(true); setFormErrors([]); setMessage('');
    const uploaded: string[] = [];
    const problems: string[] = [];
    try {
      for (const file of chosen) {
        if (draft.images.length + uploaded.length >= MAX_PHOTOS) { problems.push(`В карточке может быть не больше ${MAX_PHOTOS} фотографий.`); break; }
        const failure = validateUpload(file);
        if (failure) { problems.push(`${file.name}: ${failure}`); continue; }
        const fitted = await fitPhoto(file);
        const tooLarge = uploadSizeError(fitted);
        if (tooLarge) { problems.push(`${file.name}: ${tooLarge}`); continue; }
        const body = new FormData(); body.append('file', fitted);
        uploaded.push((await request<{ image_url: string }>('/upload', { method: 'POST', body })).image_url);
      }
    } catch (cause) { problems.push(errorText(cause)); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
    if (uploaded.length) {
      setDraft(current => ({ ...current, images: [...current.images, ...uploaded].slice(0, MAX_PHOTOS) }));
      setMessage(`Загружено фотографий: ${uploaded.length}. Сохраните товар, чтобы применить изменение.`);
    }
    setFormErrors([...new Set(problems)]);
  }
  function movePhoto(from: number, to: number) {
    setDraft(current => {
      const images = [...current.images];
      const [moved] = images.splice(from, 1);
      images.splice(to, 0, moved);
      return { ...current, images };
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const button = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const publish = button?.value === 'publish';
    const result = validateProduct(draft, publish);
    setFormErrors(result.errors); setMessage('');
    if (result.errors.length) { document.querySelector<HTMLElement>('.crm-form-errors')?.focus(); return; }
    if (editing !== 'new' && editing?.published && !publish && !window.confirm('Снять товар с публикации и сохранить как черновик? Он исчезнет из каталога.')) return;
    setBusy(true);
    try {
      const isNew = editing === 'new';
      const response = await request<{ product: Product }>(isNew ? '/products' : `/products/${encodeURIComponent(editing!.id)}`, { method: isNew ? 'POST' : 'PUT', body: result.payload });
      setProducts(current => isNew ? [response.product, ...current] : current.map(item => item.id === response.product.id ? response.product : item));
      const nextDraft = productDraft(response.product);
      setEditing(response.product); setDraft(nextDraft); setOriginal(JSON.stringify(nextDraft));
      setMessage(publish ? 'Товар опубликован. Изменения доступны в каталоге магазина.' : 'Черновик сохранён. Покупатели его не видят.');
    } catch (cause) { setFormErrors([errorText(cause)]); }
    finally { setBusy(false); }
  }
  async function remove(product: Product) {
    if (busy || !window.confirm(`Удалить товар «${product.name}»? Он исчезнет из каталога и CRM. Восстановление через панель недоступно.${editing !== 'new' && editing?.id === product.id && dirty ? ' Несохранённые изменения этой карточки будут потеряны.' : ''}`)) return;
    setBusy(true); setFormErrors([]); setMessage(''); setError('');
    try {
      await request(`/products/${encodeURIComponent(product.id)}`, { method: 'DELETE' });
      setProducts(current => current.filter(item => item.id !== product.id));
      if (editing !== 'new' && editing?.id === product.id) setEditing(null);
      setMessage(`Товар «${product.name}» удалён из каталога и CRM.`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  const visible = products.filter(product => (!search.trim() || `${product.name} ${product.id}`.toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'))) && (status === 'all' || (status === 'published' ? product.published : !product.published)));

  return <section aria-label="Управление товарами">
    <div className="crm-section-head"><div><h1>Товары</h1><p className="crm-muted">{products.length ? `${products.length} в базе · ${products.filter(product => product.published).length} опубликовано` : error ? 'Не удалось получить список товаров. Повторите загрузку.' : 'Добавьте первый товар и подготовьте его к публикации.'}</p></div><button className="crm-button crm-button--primary" type="button" disabled={busy || loading} onClick={() => edit('new')}>Добавить товар</button></div>
    {error && <Notice error focus>{error}<button className="crm-link" type="button" onClick={() => void load()}>Повторить загрузку</button></Notice>}
    {message && !editing && <Notice focus>{message}</Notice>}
    <div className={`crm-products-layout ${editing ? 'crm-products-layout--editing' : ''}`}>
      <div className="crm-products-list">
        <div className="crm-product-tools"><label className="crm-search">Найти товар<input type="search" placeholder="Название или артикул" value={search} onChange={event => setSearch(event.target.value)} maxLength={120}/></label><label>Публикация<select value={status} onChange={event => setStatus(event.target.value)}><option value="all">Все товары</option><option value="published">На сайте</option><option value="draft">Черновики</option></select></label></div>
        {loading ? <p className="crm-muted" role="status">Загружаем товары…</p> : error && !products.length ? null : visible.length ? <ul className="crm-product-rows">{visible.map(product => <li key={product.id}><button type="button" disabled={busy} className={`crm-product-row ${editing !== 'new' && editing?.id === product.id ? 'is-selected' : ''}`} onClick={() => edit(product)}>
          <span className="crm-product-thumb">{mediaSource(product.image_url) ? <img src={mediaSource(product.image_url)} alt="" loading="lazy"/> : <span>Без фото</span>}</span>
          <span className="crm-product-row-copy"><strong>{product.name || 'Без названия'}</strong><span>{formatPrice(product.price)}</span><small>{categoryLabels[product.category] ?? 'Товар'}</small></span>
          <span className={`crm-badge ${product.published ? 'crm-badge--published' : ''}`}>{product.published ? 'На сайте' : 'Черновик'}</span>
        </button><div className="crm-row-actions"><button className="crm-button crm-button--danger" type="button" disabled={busy} aria-label={`Удалить товар «${product.name}»`} onClick={() => void remove(product)}>Удалить товар</button></div></li>)}</ul> : <div className="crm-empty"><h2>{products.length ? 'Товары не найдены' : 'Каталог пока пуст'}</h2><p>{products.length ? 'Измените название в поиске или выберите все товары.' : 'Загрузите фото, укажите название и цену. До публикации товар виден только здесь.'}</p>{products.length > 0 && <button className="crm-button" onClick={() => { setSearch(''); setStatus('all'); }}>Сбросить поиск</button>}</div>}
      </div>
      {editing && <form className="crm-product-editor crm-form" onSubmit={save}>
        <div className="crm-editor-head"><div><p className="crm-eyebrow">{editing === 'new' ? 'Новый товар' : editing.published ? 'Опубликован' : 'Черновик'}</p><h2>{editing === 'new' ? 'Карточка товара' : editing.name}</h2></div><div className="crm-editor-head-actions"><button className="crm-button" type="button" disabled={busy} onClick={() => edit(null)}>Закрыть</button>{editing !== 'new' && <button className="crm-button crm-button--danger" type="button" disabled={busy} onClick={() => void remove(editing)}>Удалить товар</button>}</div></div>
        {formErrors.length > 0 && <div className="crm-notice crm-notice--error crm-form-errors" role="alert" tabIndex={-1}><strong>Проверьте карточку</strong><ul>{formErrors.map(item => <li key={item}>{item}</li>)}</ul></div>}
        {message && <Notice focus>{message}</Notice>}
        <div className="crm-editor-actions" aria-label="Сохранение товара"><button className="crm-button crm-button--primary" type="submit" name="intent" value="publish" disabled={busy}>{busy ? 'Подождите…' : editing !== 'new' && editing.published ? 'Сохранить публикацию' : 'Опубликовать'}</button><button className="crm-button" type="submit" name="intent" value="draft" disabled={busy}>{editing !== 'new' && editing.published ? 'Снять с сайта' : 'Сохранить черновик'}</button><span className="crm-save-state" role="status">{busy ? 'Обрабатываем…' : dirty ? 'Есть несохранённые изменения' : 'Изменений нет'}</span></div>
        <fieldset disabled={busy}><legend>Основная информация</legend>
          <label>Название товара<input id="crm-product-name" value={draft.name} onChange={event => update('name', event.target.value)} maxLength={160} required minLength={2} placeholder="Бренд и модель"/></label>
          <div className="crm-fields-two"><label>Категория<select value={draft.category} onChange={event => update('category', event.target.value as Product['category'])}>{Object.entries(categoryLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Наличие<select value={draft.stock_status} onChange={event => update('stock_status', event.target.value as Product['stock_status'])}><option value="preorder">Под заказ</option><option value="in-stock">В наличии</option><option value="out-of-stock">Нет в наличии</option></select></label></div>
          <label>Описание<textarea rows={5} value={draft.description} onChange={event => update('description', event.target.value)} maxLength={12000} placeholder="Особенности модели, комплектация и кому она подходит"/></label>
          <div className="crm-fields-two">
            <label>Текущая цена, ₽<input inputMode="decimal" type="number" min="0.01" max="100000000" step="0.01" value={draft.price} onChange={event => update('price', event.target.value)} placeholder="Цена продажи"/></label>
            <label>Цена до скидки, ₽<input inputMode="decimal" type="number" min="0.01" max="100000000" step="0.01" value={draft.old_price} onChange={event => update('old_price', event.target.value)} placeholder="Оставьте пустой без скидки"/><small className="crm-help">Будет аккуратно зачёркнута на витрине. Должна быть выше текущей цены.</small></label>
          </div>
        </fieldset>
        <fieldset disabled={busy}><legend>Фотография товара</legend>
          <div className="crm-photo-editor">
            <ol className="crm-photo-list">{draft.images.map((photo, index) => <li key={photo}>
              <img src={mediaSource(photo)} alt=""/>
              <span>{index === 0 ? 'Главное фото' : `Фото ${index + 1}`}</span>
              <div className="crm-photo-actions">
                {index > 0 && <button className="crm-button" type="button" onClick={() => movePhoto(index, 0)}>Сделать главным</button>}
                <button className="crm-button" type="button" onClick={() => update('images', draft.images.filter(value => value !== photo))}>Удалить</button>
              </div>
            </li>)}</ol>
            {!draft.images.length && <p className="crm-photo-empty">Фотографии ещё не загружены</p>}
            <div><label htmlFor="crm-photo-file">{draft.images.length ? 'Добавить ещё фотографии' : 'Загрузить фотографии'}</label><input ref={fileRef} id="crm-photo-file" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event => void upload(event.target.files)}/><p className="crm-help">JPG, PNG или WebP — фотографии с телефона подойдут, размер подгоняется автоматически. До {MAX_PHOTOS} штук: снимите модель с разных сторон. Первая фотография показывается в каталоге.</p></div>
          </div>
        </fieldset>
        <fieldset disabled={busy}><legend>Характеристики</legend><p className="crm-help">Заполняйте только подтверждённые данные. Пустые значения не будут показаны как нулевые.</p><div className="crm-fields-two">
          <label>Запас хода, км<input inputMode="decimal" type="number" min="0" max="3000" step="0.1" value={draft.range_km} onChange={event => update('range_km', event.target.value)}/></label>
          <label>Макс. скорость, км/ч<input inputMode="decimal" type="number" min="0" max="500" step="0.1" value={draft.speed_kmh} onChange={event => update('speed_kmh', event.target.value)}/></label>
          <label>Привод<select value={draft.drive} onChange={event => update('drive', event.target.value as Product['drive'])}>{(Object.keys(driveLabels) as Product['drive'][]).map(value => <option value={value} key={value}>{driveLabels[value]}</option>)}</select></label>
          <label>Мощность на один мотор, Вт<input inputMode="numeric" type="number" min="0" max="500000" step="1" value={draft.power_w} onChange={event => update('power_w', event.target.value)}/></label>
          <label>Вес устройства, кг<input inputMode="decimal" type="number" min="0" max="10000" step="0.1" value={draft.weight_kg} onChange={event => update('weight_kg', event.target.value)}/></label>
          <label>Грузоподъёмность, кг<input inputMode="decimal" type="number" min="0" max="2000" step="1" value={draft.payload_kg} onChange={event => update('payload_kg', event.target.value)}/></label>
          <label>Багажник<select value={draft.cargo_l === '' ? '' : draft.cargo_l === '0' ? 'none' : 'volume'} onChange={event => update('cargo_l', event.target.value === '' ? '' : event.target.value === 'none' ? '0' : '1')}>
            <option value="">Уточняется</option><option value="none">Нет</option><option value="volume">Есть, указать объём</option>
          </select></label>
          {draft.cargo_l !== '' && draft.cargo_l !== '0' && <label>Объём багажника, л<input inputMode="decimal" type="number" min="1" max="1000" step="1" value={draft.cargo_l} onChange={event => update('cargo_l', event.target.value)}/></label>}
        </div><p className="crm-help">Мощность указывается на одно колесо. При полном приводе сайт покажет её как «2 × 1100 Вт» и посчитает суммарную. Грузоподъёмность — предельный вес райдера с грузом, отдельно от веса самого устройства.</p></fieldset>
        <fieldset disabled={busy}><legend>Умные подборки и отметки</legend>
          <p className="crm-help">Подборки собирают товары на главной: покупатель нажимает и видит только подходящие модели.</p>
          <div className="crm-tag-grid">{(Object.keys(tagLabels) as ProductTag[]).map(tag => <label className="crm-checkbox" key={tag}>
            <input type="checkbox" checked={draft.tags.includes(tag)} onChange={event => update('tags', event.target.checked ? [...draft.tags, tag] : draft.tags.filter(value => value !== tag))} />
            <span>{tagLabels[tag]}</span>
          </label>)}</div>
          <label>Отметка на карточке<select value={draft.badge} onChange={event => update('badge', event.target.value as Product['badge'])}><option value="">Без отметки</option>{Object.entries(badgeLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </fieldset>
        <fieldset disabled={busy}><legend>Документы и показ на сайте</legend>
          <label>Водительские права<select value={draft.license} onChange={event => update('license', event.target.value as Product['license'])}>
            <option value="unknown">Не проверено</option>
            <option value="not-required">Без прав</option>
            <option value="m">Категория M</option>
            <option value="a">Категория A</option>
            <option value="required">Нужны права, категория уточняется</option>
          </select></label>
          <label className="crm-checkbox"><input type="checkbox" checked={draft.license_verified} onChange={event => update('license_verified', event.target.checked)}/><span>Я проверил документы модели и требования к водительским правам</span></label>
          <label className="crm-checkbox"><input type="checkbox" checked={draft.featured} onChange={event => update('featured', event.target.checked)}/><span>Показывать в подборке на главной</span></label>
          <p className="crm-help">Для публикации обязательны название, описание, фотография и цена. Категории по правам доступны только после проверки документов.</p>
        </fieldset>
        {editing !== 'new' && <p className="crm-help">Обновлено: {formatDate(editing.updated_at)} · ID: {editing.id}</p>}
      </form>}
    </div>
  </section>;
}

function Settings({ request, onDirty, onBusy }: PanelProps) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useUnsaved(settings !== null && JSON.stringify(settings) !== original, onDirty);
  useEffect(() => { onBusy(busy); return () => onBusy(false); }, [busy, onBusy]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try { const result = await request<{ settings: ShopSettings }>('/settings', { signal }); const merged = { ...defaultSettings, ...result.settings }; setSettings(merged); setOriginal(JSON.stringify(merged)); }
    catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(errorText(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  function update<K extends keyof ShopSettings>(key: K, value: ShopSettings[K]) { setSettings(current => current && { ...current, [key]: value }); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setError(''); setMessage('');
    if (settings.inquiries_enabled && (!settings.legal_name.trim() || !settings.legal_details.trim() || (!settings.phone.trim() && !settings.telegram.trim()))) {
      setError('Чтобы принимать заявки, укажите продавца, реквизиты и хотя бы один способ связи: телефон или Telegram.'); return;
    }
    setBusy(true);
    try { const result = await request<{ settings: ShopSettings }>('/settings', { method: 'PUT', body: settings }); setSettings(result.settings); setOriginal(JSON.stringify(result.settings)); setMessage('Информация магазина сохранена и доступна на сайте.'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <section><div className="crm-section-head"><div><h1>Магазин и документы</h1><p className="crm-muted">Только достоверная информация, которую увидят покупатели.</p></div></div>
    {error && <Notice error focus>{error}{!settings && <button className="crm-link" type="button" onClick={() => void load()}>Повторить загрузку</button>}</Notice>}{message && <Notice focus>{message}</Notice>}
    {loading ? <p role="status">Загружаем настройки…</p> : settings && <form className="crm-form crm-settings-form" onSubmit={save}>
      <fieldset disabled={busy}><legend>Магазин и связь</legend><div className="crm-fields-two">
        <label>Название магазина<input required maxLength={100} value={settings.shop_name} onChange={event => update('shop_name', event.target.value)}/></label>
        <label>Телефон<input type="tel" autoComplete="tel" maxLength={32} placeholder="Номер для покупателей" value={settings.phone} onChange={event => update('phone', event.target.value)}/></label>
        <label>Telegram для связи<input maxLength={100} placeholder="@username" value={settings.telegram} onChange={event => update('telegram', event.target.value)}/></label>
        <label>Telegram-канал со скидками<input maxLength={100} placeholder="@channel" value={settings.telegram_channel} onChange={event => update('telegram_channel', event.target.value)}/></label>
      </div><p className="crm-help">Канал публикуется на главной как приглашение подписаться на акции. Пока поле пустое, блок скидок на сайте не показывается.</p><label>Адрес магазина<input maxLength={500} autoComplete="street-address" placeholder="Адрес офиса или склада для документов" value={settings.address} onChange={event => update('address', event.target.value)}/></label><label>Часы работы<input maxLength={200} placeholder="Укажите дни и время" value={settings.hours} onChange={event => update('hours', event.target.value)}/></label></fieldset>
      <fieldset disabled={busy}><legend>Условия покупки</legend>
        <label>Город и адрес отправления<input maxLength={500} value={settings.delivery_origin} onChange={event => update('delivery_origin', event.target.value)} placeholder="Фактический склад отправления" /></label>
        <label>Оценки доставки по городам<textarea rows={5} maxLength={8000} value={settings.delivery_schedule} onChange={event => update('delivery_schedule', event.target.value)} placeholder="Город; дней от; дней до; стоимость" /></label>
        <p className="crm-help">Одна строка на город. Четыре поля через точку с запятой: город; минимальный срок; максимальный срок; стоимость или «По тарифу ТК». Срок — целое число от 1 до 90 календарных дней после передачи перевозчику. Публикуйте только проверенные оценки. Это не подключение API СДЭК.</p>
        <label>Ключ виджета СДЭК<input maxLength={200} value={settings.cdek_widget_key} onChange={event => update('cdek_widget_key', event.target.value)} placeholder="API-ключ виджета из личного кабинета СДЭК" /></label>
        <p className="crm-help">С ключом покупатель выбирает пункт выдачи на карте прямо в корзине и остаётся на сайте: код и адрес подставляются в заявку. Без ключа поле ПВЗ заполняется вручную — заказ оформляется как прежде.</p>
        <label>Доставка и получение<textarea rows={4} maxLength={6000} placeholder="Территория, способы, стоимость и сроки доставки" value={settings.delivery} onChange={event => update('delivery', event.target.value)}/></label>
        <label>Гарантия и возврат<textarea rows={4} maxLength={6000} placeholder="Подтверждённые условия обслуживания, гарантии и возврата" value={settings.warranty} onChange={event => update('warranty', event.target.value)}/></label>
      </fieldset>
      <fieldset disabled={busy}><legend>Продавец и приём заявок</legend><p className="crm-help">Эти сведения публикуются в информации о магазине. Не добавляйте персональные данные, которые не предназначены для общего доступа.</p>
        <label>Адрес для возврата товаров<input maxLength={500} value={settings.return_address} onChange={event => update('return_address', event.target.value)} /></label>
        <label>Юридическое наименование продавца<input maxLength={500} placeholder="ИП или организация" value={settings.legal_name} onChange={event => update('legal_name', event.target.value)}/></label>
        <label>Реквизиты и информация для покупателя<textarea rows={5} maxLength={8000} placeholder="Реквизиты продавца, регистрационные данные и условия обработки обращений" value={settings.legal_details} onChange={event => update('legal_details', event.target.value)}/></label>
        <label className="crm-checkbox"><input type="checkbox" checked={settings.inquiries_enabled} onChange={event => update('inquiries_enabled', event.target.checked)}/><span>Принимать заявки с сайта</span></label>
        <p className="crm-help">Включайте после заполнения документов, контактов и условий. Заявка не списывает деньги и не является онлайн-оплатой.</p>
      </fieldset>
      <fieldset disabled={busy}><legend>Оплата</legend>
        <p className="crm-help">Раздел «Оплата и документы» на сайте показывает только то, что отмечено здесь. «Доступно» означает, что магазин действительно принимает деньги этим способом: включайте после договора с платёжным сервисом или банком.</p>
        <div className="crm-fields-two">
          {paymentFields.map(([key, label]) => <label key={key}>{label}
            <select value={settings[key]} onChange={event => update(key, event.target.value as PaymentStatus)}>
              {(['off', 'preparing', 'on'] as const).map(status => <option value={status} key={status}>{paymentStatusLabels[status]}</option>)}
            </select>
          </label>)}
          <label>Платёжный сервис<input maxLength={200} placeholder="Например, ЮKassa или Т-Бизнес" value={settings.payment_provider} onChange={event => update('payment_provider', event.target.value)} /></label>
          <label>Банк-партнёр рассрочки<input maxLength={200} placeholder="Кто оформляет рассрочку и кредит" value={settings.payment_installment_partner} onChange={event => update('payment_installment_partner', event.target.value)} /></label>
        </div>
        <label>Чек и документы покупателю<textarea rows={3} maxLength={8000} placeholder="Как выдаётся кассовый чек и какие документы получает покупатель" value={settings.payment_receipt} onChange={event => update('payment_receipt', event.target.value)} /></label>
        <label>Порядок оплаты — свободный текст<textarea rows={3} maxLength={6000} placeholder="Дополнительные условия расчёта, которые увидит покупатель" value={settings.payment} onChange={event => update('payment', event.target.value)}/></label>
        <div className="crm-checklist">
          <h3>Готовность к приёму денег</h3>
          <ul>{paymentChecklist(settings).map(item => <li key={item.label} className={item.done ? 'crm-checklist__done' : ''}>
            <span aria-hidden="true">{item.done ? '✓' : '•'}</span><span>{item.label}</span><b>{item.done ? 'заполнено' : 'нужно заполнить'}</b>
          </li>)}</ul>
          <p className="crm-help">Оферта, политика и согласие уже опубликованы в утверждённой редакции; реквизиты ИП зашиты в сайт. Договор с банком, онлайн-касса по 54-ФЗ и приём платежей выполняются вне сайта. Сервер не разрешит отметить «Доступно» способ, для которого не указан сервис или банк-партнёр.</p>
        </div>
      </fieldset>
      <fieldset disabled={busy}><legend>Документы сайта</legend><p className="crm-help">На сайте есть отдельные страницы. Ниже можно опубликовать утверждённые юристом редакции обычным текстом. Пока поле пустое, показывается базовый проект с предупреждением. Заполните реальные реквизиты и условия перед запуском оплаты и кредита.</p>
        {([['privacy_document', 'Политика конфиденциальности'], ['consent_document', 'Согласие на обработку данных'], ['offer_document', 'Публичная оферта'], ['returns_document', 'Обмен и возврат товара'], ['contacts_document', 'Контакты']] as const).map(([key, label]) => <label key={key}>{label}<textarea rows={7} maxLength={12000} value={settings[key]} onChange={event => update(key, event.target.value)} /></label>)}
      </fieldset>
      <button className="crm-button crm-button--primary" disabled={busy} type="submit">{busy ? 'Сохраняем…' : 'Сохранить информацию'}</button>
    </form>}
  </section>;
}

function Inquiries({ request, onBusy }: PanelProps) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  useEffect(() => { onBusy(Boolean(busyId)); return () => onBusy(false); }, [busyId, onBusy]);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try {
      const result = await request<{ inquiries: Inquiry[]; total: number; total_pages: number }>(`/inquiries?page=${page}&page_size=50&status=${filter}`, { signal });
      if (signal?.aborted) return;
      setInquiries(result.inquiries); setTotal(result.total); setTotalPages(result.total_pages);
      if (page > Math.max(1, result.total_pages)) setPage(Math.max(1, result.total_pages));
    }
    catch (cause) { if (!(cause instanceof Error && cause.name === 'AbortError')) setError(errorText(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [request, page, filter]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  async function changeStatus(id: string, status: Inquiry['status']) {
    setBusyId(id); setError(''); setMessage('');
    try { await request(`/inquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }); setMessage('Статус заявки обновлён.'); await load(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusyId(''); }
  }
  async function saveTracking(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const trackingNumber = String(new FormData(event.currentTarget).get('tracking_number') || '').trim();
    setBusyId(id); setError(''); setMessage('');
    try {
      await request(`/inquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: { tracking_number: trackingNumber } });
      setMessage(trackingNumber ? 'Трек-номер сохранён, клиенту отправлено уведомление.' : 'Трек-номер удалён.');
      await load();
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusyId(''); }
  }
  return <section><div className="crm-section-head"><div><h1>Заявки покупателей</h1><p className="crm-muted">Обращения с сайта. Цена в заявке зафиксирована на момент отправки.</p></div><button className="crm-button" disabled={loading || Boolean(busyId)} onClick={() => void load()}>Обновить</button></div>
    {error && <Notice error>{error}</Notice>}{message && <Notice>{message}</Notice>}
    <label className="crm-inquiry-filter">Статус заявки<select value={filter} disabled={loading || Boolean(busyId)} onChange={event => { setFilter(event.target.value); setPage(1); setMessage(''); }}><option value="all">Все заказы</option><option value="new">Новые</option><option value="awaiting_payment">Ожидают оплаты</option><option value="paid">Оплачены</option><option value="processing">На сборке</option><option value="shipped">В доставке</option><option value="completed">Завершены</option><option value="cancelled">Отменены</option><option value="contacted">Связались</option><option value="closed">Архив</option></select></label>
    {loading ? <p role="status">Загружаем заявки…</p> : error ? null : !inquiries.length ? <div className="crm-empty"><h2>{filter !== 'all' ? 'В этом статусе заявок нет' : 'Заявок пока нет'}</h2><p>{filter !== 'all' ? 'Выберите другой статус, чтобы увидеть обращения.' : 'Здесь появятся обращения после публикации товаров и включения приёма заявок в настройках магазина.'}</p></div> : <div className="crm-inquiry-list">{inquiries.map(inquiry => <article className="crm-inquiry" key={inquiry.id}>
      <div className="crm-inquiry-head"><div><h2>{inquiry.name}</h2><p className="crm-help">{formatDate(inquiry.created_at)} · № {inquiry.id}</p></div><label>Статус<select aria-label={`Статус заявки ${inquiry.id}`} value={inquiry.status} disabled={Boolean(busyId)} onChange={event => void changeStatus(inquiry.id, event.target.value as Inquiry['status'])}><option value="new">Новый</option><option value="awaiting_payment">Ожидается оплата</option><option value="paid">Оплачено</option><option value="processing">Сборка</option><option value="shipped">В доставке</option><option value="completed">Завершён</option><option value="cancelled">Отменён</option><option value="contacted">Связались</option><option value="closed">Архив</option></select></label></div>
      <dl className="crm-contact-data"><dt>Связаться с покупателем</dt><dd>{inquiry.contact}</dd><dt>Город доставки</dt><dd>{inquiry.city || 'не указан'}</dd><dt>ПВЗ СДЭК</dt><dd>{inquiry.cdek_pvz || 'не указан'}</dd><dt>Оплата</dt><dd>{{ sbp: 'СБП', dolyame: 'Долями', installment: 'Рассрочка', credit: 'Кредит' }[inquiry.payment_method || 'sbp']}</dd>{inquiry.payment_status && <><dt>Статус банка</dt><dd>{inquiry.payment_status}</dd></>}{inquiry.message && <><dt>Комментарий</dt><dd>{inquiry.message}</dd></>}</dl>
      <form className="crm-tracking-form" onSubmit={event => void saveTracking(event, inquiry.id)}>
        <label>Трек-номер посылки<input name="tracking_number" maxLength={100} defaultValue={inquiry.tracking_number || ''} placeholder="Например, CDEK 1234567890" disabled={Boolean(busyId)} /></label>
        <button className="crm-button" type="submit" disabled={Boolean(busyId)}>{busyId === inquiry.id ? 'Сохраняем…' : 'Сохранить трек-номер'}</button>
      </form>
      <div className="crm-inquiry-items">{inquiry.items.map((item, index) => <div key={`${item.product_id}-${index}`}><span>{item.name}<small>{item.quantity} шт. × {formatPrice(item.price)}</small></span><strong>{formatPrice(item.price * item.quantity)}</strong></div>)}</div><p className="crm-inquiry-total">Сумма товаров <strong>{formatPrice(inquiry.total)}</strong></p>
    </article>)}</div>}
    {!loading && !error && total > 0 && <nav className="crm-pagination" aria-label="Страницы заявок">
      <button className="crm-button" disabled={page <= 1 || Boolean(busyId)} onClick={() => setPage(current => current - 1)}>Назад</button>
      <p>Страница {page} из {totalPages}<span className="crm-help">Всего заявок: {total}</span></p>
      <button className="crm-button" disabled={page >= totalPages || Boolean(busyId)} onClick={() => setPage(current => current + 1)}>Далее</button>
    </nav>}
  </section>;
}

export function AdminApp() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('products');
  const [busy, setBusy] = useState(false);
  const dirtyRef = useRef(false);
  const onDirty = useCallback((value: boolean) => { dirtyRef.current = value; }, []);
  const onBusy = useCallback((value: boolean) => setBusy(value), []);
  useEffect(() => {
    document.documentElement.dataset.theme = 'dark';
    const priorTitle = document.title; document.title = 'Управление магазином — G-Partner';
    const controller = new AbortController();
    void adminRequest<AdminSession>('/session', { signal: controller.signal }).then(setSession).catch(cause => {
      if (cause instanceof Error && cause.name === 'AbortError') return;
      if (!(cause instanceof AdminApiError && cause.status === 401)) setError(errorText(cause));
    }).finally(() => { if (!controller.signal.aborted) setChecking(false); });
    return () => { controller.abort(); document.title = priorTitle; };
  }, []);
  const request: Request = useCallback(async (path, options = {}) => {
    try { return await adminRequest(path, { ...options, csrfToken: session?.csrfToken }); }
    catch (cause) {
      if (cause instanceof AdminApiError && cause.status === 401) { setError('Сеанс завершён. Войдите снова.'); setSession(null); }
      throw cause;
    }
  }, [session]);
  function switchTab(next: Tab) {
    if (next === tab || busy || (dirtyRef.current && !window.confirm(discardMessage))) return;
    setTab(next); setError(''); window.scrollTo({ top: 0, behavior: 'instant' });
  }
  async function logout() {
    if (dirtyRef.current && !window.confirm(discardMessage)) return;
    setBusy(true); setError('');
    try { await request('/logout', { method: 'POST' }); setSession(null); setTab('products'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  return <div className="crm-app">
    {checking ? <main className="crm-loading" role="status">Проверяем доступ…</main> : !session ? <Login key={error} initialError={error} onLogin={value => { setSession(value); setError(''); }}/>
      : <><header className="crm-header"><a className="crm-brand" href="/" onClick={event => { if (busy || (dirtyRef.current && !window.confirm(discardMessage))) event.preventDefault(); }}>G-PARTNER <span>Управление</span></a><div className="crm-header-actions"><span className="crm-username">{session.username}</span><a className="crm-button" href="/">Открыть сайт</a><button className="crm-button" disabled={busy} onClick={() => void logout()}>Выйти</button></div></header>
        <nav className="crm-tabs" aria-label="Разделы управления">{(Object.keys(tabLabels) as Tab[]).map(key => <button key={key} type="button" disabled={busy} aria-current={tab === key ? 'page' : undefined} onClick={() => switchTab(key)}>{tabLabels[key]}</button>)}</nav>
        <main className="crm-main">{error && <Notice error>{error}</Notice>}{tab === 'customers' ? <Customers request={request}/> : tab === 'analytics' ? <AnalyticsPanel request={request}/> : tab === 'products' ? <Products request={request} onDirty={onDirty} onBusy={onBusy}/> : tab === 'settings' ? <Settings request={request} onDirty={onDirty} onBusy={onBusy}/> : <Inquiries request={request} onDirty={onDirty} onBusy={onBusy}/>}</main>
      </>}
  </div>;
}

export default AdminApp;
