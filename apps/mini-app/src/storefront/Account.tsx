import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { getAccountInquiries, registerAccount, signIn, signOut } from './api';
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
  if (!inquiries.length) return <p className="sf-muted">Здесь появятся заявки, отправленные из этого аккаунта. Заявки, отправленные до входа, магазин видит, но в историю они не попадают.</p>;
  return <ul className="sf-history">
    {inquiries.map(inquiry => <li key={inquiry.id}>
      <div className="sf-history__head"><strong>Заявка {inquiry.id.slice(0, 8)}</strong><span>{formatDate(inquiry.created_at)}</span></div>
      <p className="sf-history__status">{statusLabels[inquiry.status]}</p>
      <ul className="sf-history__items">{inquiry.items.map(item => <li key={item.product_id}>{item.name} — {item.quantity} шт.</li>)}</ul>
      {inquiry.total !== null && <p className="sf-history__total">Сумма по каталогу: <strong>{money(inquiry.total)}</strong></p>}
    </li>)}
  </ul>;
}

export function Account({ account, csrfToken, onChange }: {
  account: AccountProfile | null; csrfToken: string; onChange: () => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [owner, setOwner] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerAccount(name.trim(), contact.trim(), password)
        : await signIn(contact.trim(), password);
      setPassword('');
      if (result.role === 'owner') {
        setOwner(true);
        // A blocked pop-up leaves the panel link below as the way in.
        window.open('/admin', '_blank', 'noopener');
        return;
      }
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
    try { await signOut(csrfToken); onChange(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }

  if (owner) return <section className="sf-account-login" aria-labelledby="sf-account-title">
    <h2 id="sf-account-title">Вход выполнен</h2>
    <p>Панель управления открывается в отдельной вкладке. Если она не открылась, перейдите по ссылке ниже.</p>
    <a className="sf-button" href="/admin" target="_blank" rel="noopener noreferrer">Панель управления <ArrowRight size={17} /></a>
  </section>;

  if (account) return <section className="sf-account-login" aria-labelledby="sf-account-title">
    <h2 id="sf-account-title">Аккаунт</h2>
    <p>{account.name} · {account.contact}</p>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <h3 className="sf-history-title">Мои заявки</h3>
    <History />
    <button className="sf-button sf-button--secondary" onClick={leave} disabled={busy}>{busy ? 'Выходим…' : 'Выйти'}</button>
  </section>;

  const registering = mode === 'register';
  return <section className="sf-account-login" aria-labelledby="sf-account-title">
    <h2 id="sf-account-title">{registering ? 'Регистрация' : 'Вход в аккаунт'}</h2>
    <p>{registering
      ? 'Аккаунт хранит историю ваших заявок и подставляет контакт при обращении в магазин. Избранное и корзина работают и без него.'
      : 'Войдите, чтобы видеть свои заявки. Сотрудники магазина после входа попадают в панель управления товарами.'}</p>
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
      <label>Пароль
        <input name="password" type="password" autoComplete={registering ? 'new-password' : 'current-password'} required minLength={registering ? 12 : 1} maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
        {registering && <small>От 12 символов — так аккаунт не подберут перебором.</small>}
      </label>
      {registering && <p className="sf-muted">Регистрируясь, вы соглашаетесь на обработку имени и контакта для ответа на обращения. <a href="#privacy">Как мы обрабатываем данные</a></p>}
      <button className="sf-button" type="submit" disabled={busy}>{busy ? 'Отправляем…' : registering ? 'Создать аккаунт' : 'Войти'}</button>
    </form>
  </section>;
}
