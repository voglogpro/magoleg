import { useState, type FormEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { signIn } from './api';

export function AccountLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signIn(username.trim(), password);
      setPassword('');
      setSignedIn(true);
      // A blocked pop-up leaves the panel link below as the way in.
      window.open('/admin', '_blank', 'noopener');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось войти. Повторите попытку.');
    } finally {
      setBusy(false);
    }
  }

  if (signedIn) {
    return <section className="sf-account-login" aria-labelledby="sf-login-title">
      <h2 id="sf-login-title">Вход выполнен</h2>
      <p>Панель управления открывается в отдельной вкладке. Если она не открылась, перейдите по ссылке ниже.</p>
      <a className="sf-button" href="/admin" target="_blank" rel="noopener noreferrer">Панель управления <ArrowRight size={17} /></a>
    </section>;
  }

  return <section className="sf-account-login" aria-labelledby="sf-login-title">
    <h2 id="sf-login-title">Вход в аккаунт</h2>
    <p>Покупателям аккаунт не нужен: избранное, сравнение и корзина сохраняются в этом браузере. Сотрудники магазина после входа попадают в панель управления товарами и заявками.</p>
    {error && <p className="sf-error" role="alert">{error}</p>}
    <form className="sf-login-form" onSubmit={submit}>
      <label>Логин
        <input name="username" autoComplete="username" required maxLength={100} value={username} disabled={busy} onChange={event => setUsername(event.target.value)} />
      </label>
      <label>Пароль
        <input name="password" type="password" autoComplete="current-password" required maxLength={256} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} />
      </label>
      <button className="sf-button" type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти'}</button>
    </form>
  </section>;
}
