import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ClipboardList, Headphones, Heart, LogOut, MapPin, PackageCheck, Scale, ShieldCheck, ShoppingBag, Truck, UserRound } from 'lucide-react';
import { getAccountInquiries, getOwnerSession, registerAccount, signIn, signOut, signOutOwner, type OwnerSession } from './api';
import { CityDatalist } from './CityPicker';
import { money } from './domain';
import type { AccountInquiry, AccountProfile } from './types';
import { CustomerPreferences } from './CustomerData';
import { trackGoal } from './Analytics';

const statusLabels: Record<AccountInquiry['status'], string> = {
  new: 'Заказ принят', awaiting_payment: 'Ожидается оплата', paid: 'Оплачено',
  processing: 'Сборка на складе', shipped: 'Передано в доставку', completed: 'Получено',
  cancelled: 'Отменено', contacted: 'Магазин связался с вами', closed: 'Заявка закрыта',
};
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : 'Не удалось выполнить действие. Повторите попытку.';
const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(date);
};

function History() {
  const [inquiries, setInquiries] = useState<AccountInquiry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    void getAccountInquiries(controller.signal)
      .then(setInquiries)
      .catch(reason => { if (!controller.signal.aborted) setError(errorText(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  if (loading) return <p className="sf-muted" role="status">Загружаем заявки…</p>;
  if (error) return <p className="sf-error" role="alert">{error}</p>;
  if (!inquiries.length) return <div className="sf-history-empty">
    <ClipboardList size={22} aria-hidden="true" />
    <p>Здесь появятся заявки, отправленные из этого аккаунта. Обращения без входа магазин видит, но в историю они не попадают.</p>
  </div>;
  return <ul className="sf-history">
    {inquiries.map(inquiry => <li key={inquiry.id}>
      <div className="sf-history__head">
        <span className={`sf-history__status sf-history__status--${inquiry.status}`}>{statusLabels[inquiry.status]}</span>
        <span className="sf-history__date">{formatDate(inquiry.created_at)}</span>
      </div>
      {inquiry.city && <p className="sf-history__city">Доставка в город {inquiry.city}</p>}
      {['paid', 'processing', 'shipped', 'completed'].includes(inquiry.status) && <div className="sf-order-progress" aria-label="Этапы выполнения заказа">
        <span className="is-active"><PackageCheck size={18} aria-hidden="true" /><small>Оплачено</small></span>
        <i aria-hidden="true" />
        <span className={['processing', 'shipped', 'completed'].includes(inquiry.status) ? 'is-active' : ''}><PackageCheck size={18} aria-hidden="true" /><small>Сборка</small></span>
        <i aria-hidden="true" />
        <span className={['shipped', 'completed'].includes(inquiry.status) ? 'is-active' : ''}><Truck size={18} aria-hidden="true" /><small>Доставка</small></span>
      </div>}
      {['paid', 'processing'].includes(inquiry.status) && <p className="sf-order-instruction">Ваш заказ принят! Сборка и отправка товара со склада производителя занимает до 3 рабочих дней. Как только посылка будет передана в транспортную службу, в этом заказе появится трек-номер для отслеживания.</p>}
      {inquiry.tracking_number && <p className="sf-order-track"><Truck size={17} aria-hidden="true" /><span>Трек-номер посылки</span><strong>{inquiry.tracking_number}</strong></p>}
      <ul className="sf-history__items">{inquiry.items.map(item => <li key={item.product_id}><span>{item.name}</span><b>{item.quantity} шт.</b></li>)}</ul>
      <div className="sf-history__foot">
        <span>Заявка №{inquiry.id.slice(0, 8)}</span>
        {inquiry.total !== null && <strong>{money(inquiry.total)}</strong>}
      </div>
    </li>)}
  </ul>;
}

function Card({ icon: Icon, eyebrow, title, children }: {
  icon: typeof UserRound; eyebrow: string; title: string; children: React.ReactNode;
}) {
  return <section className="sf-account-card ym-hide-content" aria-labelledby="sf-account-title">
    <header className="sf-account-card__head">
      <span className="sf-account-card__icon" aria-hidden="true"><Icon size={22} /></span>
      <div><p className="sf-account-card__eyebrow">{eyebrow}</p><h2 id="sf-account-title">{title}</h2></div>
    </header>
    {children}
  </section>;
}

export function Account({ account, csrfToken, city = '', restoring = false, onChange, onCity, saved = { favorites: 0, compare: 0, cart: 0 } }: {
  account: AccountProfile | null; csrfToken: string; city?: string; restoring?: boolean;
  onChange: () => void; onCity?: (city: string) => void;
  saved?: { favorites: number; compare: number; cart: number };
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [town, setTown] = useState(city);
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState<OwnerSession | null>(null);
  const ownerCheck = useRef<AbortController | null>(null);
  useEffect(() => {
    if (account) { setOwner(null); return; }
    if (restoring) return;
    const controller = new AbortController();
    ownerCheck.current = controller;
    void getOwnerSession(controller.signal).then(session => {
      if (!controller.signal.aborted) setOwner(session);
    }).catch(() => { /* A failed restore must not prevent a fresh sign-in. */ });
    return () => controller.abort();
  }, [account, restoring]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === 'register' && !consent) { setError('Подтвердите отдельное согласие на обработку данных.'); return; }
    ownerCheck.current?.abort();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerAccount(name.trim(), contact.trim(), town.trim(), password, true, consent)
        : await signIn(contact.trim(), password, true);
      setPassword('');
      if (result.role === 'owner') {
        setOwner({ username: result.username || contact.trim(), csrfToken: result.csrfToken });
        return;
      }
      if (result.account?.city) onCity?.(result.account.city);
      setName(''); setContact('');
      trackGoal(mode === 'register' ? 'registration' : 'customer_login');
      onChange();
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    setBusy(true);
    setError('');
    try {
      if (owner) { await signOutOwner(owner.csrfToken); setOwner(null); }
      else await signOut(csrfToken);
      onChange();
    }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  if (restoring && !account && !owner) return <Card icon={UserRound} eyebrow="Личный кабинет" title="Возвращаем вас в аккаунт">
    <p className="sf-account-card__lead" role="status">Вход сохранён на этом устройстве — восстанавливаем сессию…</p>
  </Card>;

  if (owner) return <Card icon={ShieldCheck} eyebrow="Управление магазином" title="Вход выполнен">
    <p className="sf-account-card__lead">Вы вошли как {owner.username}. Откройте управление товарами — повторный ввод пароля не нужен.</p>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <a className="sf-button" href="/admin">Панель управления <ArrowRight size={17} /></a>
    <button className="sf-text-button sf-account-leave" onClick={leave} disabled={busy}><LogOut size={16} />{busy ? 'Выходим…' : 'Выйти из аккаунта'}</button>
  </Card>;

  if (account) return <section className="sf-account-dashboard ym-hide-content" aria-labelledby="sf-account-dashboard-title">
    <header className="sf-account-hero">
      <span className="sf-account-avatar" aria-hidden="true">{account.name.trim().charAt(0).toUpperCase() || <UserRound size={30} />}</span>
      <div className="sf-account-identity"><p>Личный кабинет</p><h2 id="sf-account-dashboard-title">{account.name}</h2><span>{account.contact}{account.city ? ` · ${account.city}` : ''}</span></div>
      <span className="sf-account-device"><ShieldCheck size={16} aria-hidden="true" />Устройство запомнено</span>
    </header>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <nav className="sf-account-dashboard__menu" aria-label="Разделы личного кабинета">
      <a href="#favorites"><Heart size={21} aria-hidden="true" /><span><strong>Избранное</strong><small>Сохранённые модели</small></span><b>{saved.favorites}</b><ArrowRight size={18} /></a>
      <a href="#cart"><ShoppingBag size={21} aria-hidden="true" /><span><strong>Корзина</strong><small>Товары к оформлению</small></span><b>{saved.cart}</b><ArrowRight size={18} /></a>
      <a href="#compare"><Scale size={21} aria-hidden="true" /><span><strong>Сравнение</strong><small>Характеристики рядом</small></span><b>{saved.compare}</b><ArrowRight size={18} /></a>
      <a href="#delivery"><MapPin size={21} aria-hidden="true" /><span><strong>Доставка</strong><small>Условия получения в СДЭК</small></span><ArrowRight size={18} /></a>
      <a href="#contact"><Headphones size={21} aria-hidden="true" /><span><strong>Поддержка</strong><small>Помощь и обратная связь</small></span><ArrowRight size={18} /></a>
    </nav>
    <section className="sf-account-orders" aria-labelledby="sf-account-orders-title">
      <div className="sf-account-section-title"><span><PackageCheck size={21} aria-hidden="true" /></span><div><p>Покупки и статусы</p><h3 id="sf-account-orders-title">Мои заказы</h3></div></div>
      <History />
    </section>
    <details className="sf-account-settings"><summary>Настройки уведомлений и аналитики</summary><CustomerPreferences csrfToken={csrfToken} /></details>
    <button className="sf-text-button sf-account-leave" onClick={leave} disabled={busy}><LogOut size={16} />{busy ? 'Выходим…' : 'Выйти из аккаунта'}</button>
  </section>;

  const registering = mode === 'register';
  return <Card icon={UserRound} eyebrow="Личный кабинет" title={registering ? 'Создать аккаунт' : 'Вход в аккаунт'}>
    <p className="sf-account-card__lead">{registering
      ? 'Создайте аккаунт один раз — заказы и контакт будут доступны на этом устройстве.'
      : 'Войдите один раз. Защищённая сессия запомнит это устройство и вернёт ваши заказы без повторной регистрации.'}</p>
    <div className="sf-account-device-note"><ShieldCheck size={18} aria-hidden="true" /><span>Автоматический вход включён. Пароль в браузере не сохраняется.</span></div>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <form className="sf-login-form" onSubmit={submit}>
      {registering && <label>Ваше имя
        <input name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} disabled={busy} onChange={event => setName(event.target.value)} />
      </label>}
      <label>{registering ? 'Телефон, email или @Telegram' : 'Логин, телефон или email'}
        <input name="contact" autoComplete="username" required minLength={registering ? 5 : 1} maxLength={150} value={contact} disabled={busy} onChange={event => setContact(event.target.value)} />
      </label>
      {registering && <label>Ваш город
        <input name="city" list="sf-cities" autoComplete="address-level2" required minLength={2} maxLength={80} value={town} disabled={busy} onChange={event => setTown(event.target.value)} placeholder="Например, Краснодар" />
        <CityDatalist />
      </label>}
      <label>Пароль
        <input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 8 : 1} maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
        {registering && <small>От 8 символов — так аккаунт не подберут перебором.</small>}
      </label>

      {registering && <label className="sf-consent"><input name="consent" type="checkbox" checked={consent} required disabled={busy} onChange={event => setConsent(event.target.checked)} /><span>Даю <a href="#consent" target="_blank" rel="noopener noreferrer">согласие на обработку данных</a> для создания аккаунта и работы с заявками. <a href="#privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a></span></label>}
      <button className="sf-button" type="submit" disabled={busy}>{busy ? 'Отправляем…' : registering ? 'Создать аккаунт' : 'Войти'}</button>
    </form>
    <p className="sf-account-switch">{registering ? 'Уже есть аккаунт?' : 'Первый раз в G-Partner?'} <button type="button" onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); }}>{registering ? 'Вернуться ко входу' : 'Создать аккаунт'}</button></p>
  </Card>;
}
