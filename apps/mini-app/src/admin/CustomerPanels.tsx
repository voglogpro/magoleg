import { useEffect, useState } from 'react';
import type { adminRequest } from './api';
import { money } from '../storefront/domain';

type Request = <T>(path: string, options?: Parameters<typeof adminRequest>[1]) => Promise<T>;
type Customer = { id: string; name: string; contact: string; city: string; created_at: string; email: string; marketing: boolean; consent_at: string; cart_updated_at: string; inquiry_count: number; cart: { product_id: string; name: string; quantity: number; price: number | null; image_url: string; available: boolean }[] };
type CustomersResult = { customers: Customer[]; total: number; pages: number };
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Не удалось загрузить данные.';
const date = (value: string) => value ? new Date(value).toLocaleString('ru-RU') : 'Нет данных';

export function Customers({ request }: { request: Request }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [revision, refresh] = useState(0);
  const [data, setData] = useState<CustomersResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setData(null);
    request<CustomersResult>(`/customers?q=${encodeURIComponent(search)}&page=${page}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request, page, search, revision]);
  return <section><div className="crm-section-head"><div><h1>Покупатели</h1><p className="crm-muted">Зарегистрированные аккаунты, сохранённые корзины и разрешения на письма. Гости сюда не попадают.</p></div><button className="crm-button" disabled={loading} onClick={() => refresh(n => n+1)}>Обновить</button></div>
    <form className="crm-customer-search" onSubmit={e => { e.preventDefault(); setSearch(query.trim()); setPage(1); }}><label>Поиск покупателя<input value={query} maxLength={100} onChange={e => setQuery(e.target.value)} placeholder="Имя, контакт, почта или город" /></label><button className="crm-button">Найти</button></form>
    {error && <p className="crm-notice crm-notice--error" role="alert">{error}</p>}{loading && <p role="status">Загружаем покупателей…</p>}
    {data && <><p className="crm-muted">Всего: {data.total}. Корзины появляются после входа и синхронизации с обновлённым сайтом.</p>{!data.customers.length && <p className="crm-notice">Покупателей по этому запросу нет.</p>}
      <div className="crm-customer-list">{data.customers.map(customer => <CustomerCard key={customer.id} customer={customer} request={request} />)}</div>
      {data.pages > 1 && <nav className="crm-pagination" aria-label="Страницы покупателей"><button className="crm-button" disabled={page === 1} onClick={() => setPage(n => n-1)}>Назад</button><span>{page} / {data.pages}</span><button className="crm-button" disabled={page >= data.pages} onClick={() => setPage(n => n+1)}>Далее</button></nav>}
    </>}
  </section>;
}

function CustomerCard({ customer: c, request }: { customer: Customer; request: Request }) {
  const [compose, setCompose] = useState(false);
  const [subject, setSubject] = useState('Предложение G-Partner по выбранной технике');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const total = c.cart.reduce((sum, item) => sum + (item.price || 0)*item.quantity, 0);
  return <article className="crm-customer-card"><header><div><h2>{c.name}</h2><p>{c.city || 'Город не указан'} · Регистрация: {date(c.created_at)}</p></div><span>{c.inquiry_count} заявок</span></header>
    <dl className="crm-customer-facts"><div><dt>Контакт аккаунта</dt><dd>{c.contact}</dd></div><div><dt>Email</dt><dd>{c.email || 'Не указан'}</dd></div><div><dt>Рассылка</dt><dd>{c.marketing ? `Разрешена · ${date(c.consent_at)}` : 'Согласия нет — рекламные письма недоступны'}</dd></div></dl>
    <h3>Корзина · {c.cart.length} моделей</h3><p className="crm-help">Последняя синхронизация: {date(c.cart_updated_at)}</p>
    {c.cart.length ? <><ul className="crm-customer-cart">{c.cart.map(item => <li key={item.product_id}>{item.image_url && <img src={item.image_url} alt="" loading="lazy" />}<div><a href={`/#product/${encodeURIComponent(item.product_id)}`} target="_blank" rel="noopener noreferrer">{item.name}</a><p>{item.quantity} шт. · {item.price === null ? 'Цена уточняется' : money(item.price)}{!item.available && ' · Снято с публикации'}</p></div></li>)}</ul><p><strong>{c.cart.some(item => item.price === null) ? 'Известная часть суммы' : 'Сумма товаров'}: {money(total)}</strong></p></> : <p className="crm-muted">Сохранённых товаров нет.</p>}
    <button className="crm-button" disabled={!c.marketing || !c.email} onClick={() => setCompose(!compose)}>Подготовить письмо о скидке</button>
    {compose && <form className="crm-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError('');
      try {
        const latest = await request<CustomersResult>(`/customers?q=${encodeURIComponent(c.email)}&page=1`);
        const current = latest.customers.find(item => item.id === c.id);
        if (!current?.marketing || current.email !== c.email) throw new Error('Согласие изменилось или не подтверждено. Обновите список.');
        const body = `${message.trim()}\n\nВы получили предложение по подписке G-Partner. Отписаться: ${location.origin}/#profile (Почта и предложения магазина → снять отметку и сохранить).`;
        location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
    }}><label>Тема<input required maxLength={150} value={subject} onChange={e => setSubject(e.target.value)} /></label><label>Предложение<textarea required minLength={10} maxLength={1500} rows={4} value={message} onChange={e => setMessage(e.target.value)} placeholder="Укажите реальную скидку, модель и срок действия предложения" /></label><p className="crm-help">Откроется ваш почтовый клиент. Проверьте адрес отправителя и условия перед отправкой. Автоматической рассылки нет; владение email пока не подтверждается письмом.</p>{error && <p role="alert">{error}</p>}<button className="crm-button crm-button--primary" disabled={busy}>{busy ? 'Проверяем согласие…' : 'Открыть черновик в почте'}</button></form>}
  </article>;
}

type Report = { totals: number[]; data: { dimensions: { name: string }[]; metrics: number[] }[]; sampled: boolean };
type AnalyticsResult = { counter: number; connected: boolean; message?: string; updated_at?: string; local: { customers: number; carts: number; subscribers: number }; totals?: Report; sources?: Report; pages?: Report };
export function AnalyticsPanel({ request }: { request: Request }) {
  const [days, setDays] = useState('7'); const [revision, refresh] = useState(0);
  const [data, setData] = useState<AnalyticsResult | null>(null); const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); setData(null); setError(''); request<AnalyticsResult>(`/analytics?days=${days}`, { signal: controller.signal }).then(setData).catch(e => { if (!controller.signal.aborted) setError(errorText(e)); }); return () => controller.abort(); }, [request, days, revision]);
  return <section><div className="crm-section-head"><div><h1>Статистика</h1><p className="crm-muted">Яндекс Метрика · счётчик 112522333. В статистике только посетители, разрешившие аналитику; блокировщики могут уменьшать показатели.</p></div><button className="crm-button" onClick={() => refresh(n => n+1)}>Обновить</button></div><label>Период<select value={days} onChange={e => setDays(e.target.value)}><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option></select></label>
    {error && <p role="alert" className="crm-notice crm-notice--error">{error}</p>}{!data && !error && <p role="status">Загружаем статистику…</p>}
    {data && <><h2>Данные магазина за всё время</h2><div className="crm-stat-grid">{[['Аккаунтов', data.local.customers], ['Непустых корзин', data.local.carts], ['Подписчиков', data.local.subscribers]].map(([name, value]) => <div key={name}><span>{name}</span><strong>{value}</strong></div>)}</div>
      {!data.connected ? <p className="crm-notice">{data.message}</p> : <><h2>Посещения за {days} дней</h2><div className="crm-stat-grid">{['Визиты', 'Посетители', 'Просмотры', 'Отказы, %'].map((label, index) => <div key={label}><span>{label}</span><strong>{(data.totals?.totals[index] ?? 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</strong></div>)}</div><p className="crm-help">Обновлено: {date(data.updated_at || '')}. Кэш — до 5 минут. {data.totals?.sampled && 'Данные рассчитаны по выборке.'}</p>
        {([['Источники переходов', data.sources], ['Популярные адреса страниц', data.pages]] as const).map(([title, report]) => <section className="crm-customer-card" key={title}><h2>{title}</h2>{report?.data.length ? <ul className="crm-report-list">{report.data.map((row, index) => <li key={index}><span>{row.dimensions.map(d => d.name).join(' / ') || 'Не определено'}</span><strong>{row.metrics[0]}</strong></li>)}</ul> : <p>За выбранный период данных нет.</p>}</section>)}</>}
      <a className="crm-button" href="https://metrika.yandex.ru/dashboard?id=112522333" target="_blank" rel="noopener noreferrer">Открыть Метрику: цели, Вебвизор и карты кликов</a><p className="crm-help">Для просмотра в Яндексе нужен аккаунт с доступом к счётчику. Личные контакты покупателей в Метрику не передаются.</p></>}
  </section>;
}
