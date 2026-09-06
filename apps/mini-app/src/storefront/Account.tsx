import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, ClipboardList, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { getAccountInquiries, getOwnerSession, registerAccount, signIn, signOut, signOutOwner, type OwnerSession } from './api';
import { CityDatalist } from './CityPicker';
import { money } from './domain';
import type { AccountInquiry, AccountProfile } from './types';

const statusLabels: Record<AccountInquiry['status'], string> = {
  new: 'Магазин получил заявку', contacted: 'Магазин связался с вами', closed: 'Заявка закрыта',
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
  return <section className="sf-account-card" aria-labelledby="sf-account-title">
    <header className="sf-account-card__head">
      <span className="sf-account-card__icon" aria-hidden="true"><Icon size={22} /></span>
      <div><p className="sf-account-card__eyebrow">{eyebrow}</p><h2 id="sf-account-title">{title}</h2></div>
    </header>
    {children}
  </section>;
}

export function Account({ account, csrfToken, city = '', onChange, onCity }: {
  account: AccountProfile | null; csrfToken: string; city?: string; onChange: () => void; onCity?: (city: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [town, setTown] = useState(city);
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState<OwnerSession | null>(null);
  const ownerCheck = useRef<AbortController | null>(null);
  useEffect(() => {
    if (account) { setOwner(null); return; }
    const controller = new AbortController();
    ownerCheck.current = controller;
    void getOwnerSession(controller.signal).then(session => {
      if (!controller.signal.aborted) setOwner(session);
    }).catch(() => { /* A failed restore must not prevent a fresh sign-in. */ });
    return () => controller.abort();
  }, [account]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    ownerCheck.current?.abort();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerAccount(name.trim(), contact.trim(), town.trim(), password, remember)
        : await signIn(contact.trim(), password, remember);
      setPassword('');
      if (result.role === 'owner') {
        setOwner({ username: result.username || contact.trim(), csrfToken: result.csrfToken });
        // A blocked pop-up leaves the panel link below as the way in.
        window.open('/admin', '_blank', 'noopener');
        return;
      }
      if (result.account?.city) onCity?.(result.account.city);
      setName(''); setContact('');
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

  if (owner) return <Card icon={ShieldCheck} eyebrow="Управление магазином" title="Вход выполнен">
    <p className="sf-account-card__lead">Вы вошли как {owner.username}. Откройте управление товарами — повторный ввод пароля не нужен.</p>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <a className="sf-button" href="/admin" target="_blank" rel="noopener noreferrer">Панель управления <ArrowRight size={17} /></a>
    <button className="sf-text-button sf-account-leave" onClick={leave} disabled={busy}><LogOut size={16} />{busy ? 'Выходим…' : 'Выйти из аккаунта'}</button>
  </Card>;

  if (account) return <Card icon={UserRound} eyebrow="Аккаунт покупателя" title={account.name}>
    <p className="sf-account-contact">{account.contact}{account.city ? ` · ${account.city}` : ''}</p>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <h3 className="sf-history-title">Мои заявки</h3>
    <History />
    <button className="sf-text-button sf-account-leave" onClick={leave} disabled={busy}><LogOut size={16} />{busy ? 'Выходим…' : 'Выйти из аккаунта'}</button>
  </Card>;

  const registering = mode === 'register';
  return <Card icon={UserRound} eyebrow="Личный кабинет" title={registering ? 'Создать аккаунт' : 'Вход в аккаунт'}>
    <p className="sf-account-card__lead">{registering
      ? 'Аккаунт хранит историю заявок и подставляет контакт при обращении в магазин.'
      : 'Войдите, чтобы видеть свои заявки. Сотрудники магазина попадают в панель управления.'}</p>
    <div className="sf-account-tabs" role="group" aria-label="Вход или регистрация">
      <button aria-pressed={!registering} onClick={() => { setMode('login'); setError(''); }}>Вход</button>
      <button aria-pressed={registering} onClick={() => { setMode('register'); setError(''); }}>Регистрация</button>
    </div>
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
        <input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
        {registering && <small>От 12 символов — так аккаунт не подберут перебором.</small>}
      </label>
      <label className="sf-remember"><input name="remember" type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={busy}/><span>Оставаться в системе на этом устройстве</span></label>
      <p className="sf-account-consent">На чужом устройстве снимите отметку. Пароль на сайте не сохраняется.</p>
      <button className="sf-button" type="submit" disabled={busy}>{busy ? 'Отправляем…' : registering ? 'Создать аккаунт' : 'Войти'}</button>
      {registering && <p className="sf-account-consent">Создавая аккаунт, вы соглашаетесь на обработку имени и контакта для ответа на обращения. <a href="#privacy">Как мы обрабатываем данные</a></p>}
    </form>
  </Card>;
}
