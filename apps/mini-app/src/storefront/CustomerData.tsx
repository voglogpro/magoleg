import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { customerRequest } from './api';
import { sanitizeCart } from './domain';
import { MAX_CART_MODELS, type AccountProfile, type CartItem } from './types';

type Preferences = { email: string; marketing: boolean; consent_at: string };
export function CustomerPreferences({ csrfToken }: { csrfToken: string }) {
  const [value, setValue] = useState<Preferences | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    customerRequest<Preferences>('preferences', undefined, '', controller.signal).then(setValue).catch(() => { if (!controller.signal.aborted) setMessage('Не удалось загрузить настройки почты.'); });
    return () => controller.abort();
  }, [revision]);
  return <section className="sf-customer-preferences ym-hide-content"><h3>Почта и предложения магазина</h3>
    {!value ? <><p>{message || 'Загружаем настройки…'}</p>{message && <button className="sf-text-button" onClick={() => { setMessage(''); setRevision(x => x+1); }}>Повторить</button>}</> : <form className="sf-login-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setMessage('');
      try { setValue(await customerRequest<Preferences>('preferences', { email: value.email, marketing: value.marketing }, csrfToken)); setMessage('Настройки сохранены.'); }
      catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось сохранить настройки.'); }
      finally { setBusy(false); }
    }}><label>Email для связи<input className="ym-disable-keys" type="email" autoComplete="email" maxLength={254} value={value.email} disabled={busy} onChange={e => setValue({ ...value, email: e.target.value, marketing: false })} /></label>
      <label className="sf-consent"><input type="checkbox" checked={value.marketing} disabled={busy} onChange={e => setValue({ ...value, marketing: e.target.checked })} /><span>Хочу получать письма G-Partner со скидками, в том числе на товары в моей корзине. Даю <a href="#marketing" target="_blank" rel="noopener noreferrer">отдельное согласие на рассылку</a>. Это необязательно; отписаться можно здесь в любой момент.</span></label>
      <button className="sf-button sf-button--secondary" disabled={busy}>Сохранить настройки</button><p role="status">{message}</p>
    </form>}
  </section>;
}

/** Guest cart remains local. Signed-in carts restore once and sync serially, never across accounts. */
export function useCustomerCart(account: AccountProfile | null, csrf: string, accountReady: boolean) {
  const identity = account?.id || (account ? account.contact : 'guest');
  const [state, setState] = useState<{ owner: string; items: CartItem[] }>({ owner: '', items: [] });
  const [error, setError] = useState('');
  const [revision, retry] = useState(0);
  const chain = useRef(Promise.resolve());
  const saved = useRef('');
  const previousOwner = useRef('guest');
  const ready = accountReady && state.owner === identity;
  useEffect(() => {
    if (!accountReady) return;
    let active = true;
    const controller = new AbortController();
    setError('');
    let guest: CartItem[] = [];
    try { guest = sanitizeCart(JSON.parse(localStorage.getItem('gpartner.cart.v1') || '[]')); } catch { /* Private mode. */ }
    if (identity === 'guest') {
      if (previousOwner.current !== 'guest') guest = [];
      setState({ owner: identity, items: guest }); previousOwner.current = identity;
      return;
    }
    previousOwner.current = identity;
    void customerRequest<{ items: CartItem[]; saved: boolean }>('cart', undefined, '', controller.signal).then(result => {
      if (!active) return;
      const restored = result.saved ? sanitizeCart(result.items) : [];
      const merged = new Map(restored.map(item => [item.product_id, item]));
      for (const item of guest) merged.set(item.product_id, { ...item, quantity: Math.max(item.quantity, merged.get(item.product_id)?.quantity || 0) });
      const items = [...merged.values()].slice(0, MAX_CART_MODELS);
      saved.current = result.saved ? JSON.stringify(restored) : '';
      setState({ owner: identity, items });
      try { localStorage.removeItem('gpartner.cart.v1'); } catch { /* No cross-account cache. */ }
    }).catch(() => { if (active) setError('Не удалось восстановить корзину аккаунта. Повторите загрузку.'); });
    return () => { active = false; controller.abort(); };
  }, [identity, accountReady, revision]);
  useEffect(() => {
    if (!ready) return;
    const body = JSON.stringify(state.items);
    if (identity === 'guest') { try { localStorage.setItem('gpartner.cart.v1', body); } catch { /* Local state works. */ } return; }
    if (!csrf || body === saved.current) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      chain.current = chain.current.catch(() => {}).then(async () => {
        if (!active) return;
        try { await customerRequest('cart', { items: state.items }, csrf); if (active) { saved.current = body; setError(''); } }
        catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Корзина не сохранена.'); }
      });
    }, 250);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [ready, state, identity, csrf]);
  const setCart = (next: SetStateAction<CartItem[]>) => {
    if (!ready) { setError('Дождитесь восстановления корзины или повторите загрузку.'); return; }
    setState(previous => ({ owner: identity, items: typeof next === 'function' ? next(previous.items) : next }));
  };
  return { cart: ready ? state.items : [], setCart, ready, error, retry: () => { if (ready) setState(previous => ({ ...previous })); else retry(x => x+1); } };
}
