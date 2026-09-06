import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccount, getProducts, getSettings } from './api';
import { defaultSettings, type AccountProfile, type ShopSettings, type Product } from './types';

export function useAccount() {
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [csrfToken, setCsrfToken] = useState('');
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void getAccount(controller.signal)
      // A signed-out visitor and an unreachable server look the same here: the
      // shop stays usable without an account either way.
      .then(state => { setAccount(state.account); setCsrfToken(state.csrfToken ?? ''); })
      .catch(() => { if (!controller.signal.aborted) { setAccount(null); setCsrfToken(''); } })
      .finally(() => { if (!controller.signal.aborted) setReady(true); });
    return () => controller.abort();
  }, [revision]);
  return { account, csrfToken, ready, refresh };
}

export function useStoreData() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<ShopSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsError, setSettingsError] = useState('');
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSettingsError('');
    void Promise.allSettled([getProducts(controller.signal), getSettings(controller.signal)]).then(([catalog, shop]) => {
      if (controller.signal.aborted) return;
      if (catalog.status === 'fulfilled') setProducts(catalog.value);
      else setError('Не удалось загрузить каталог. Проверьте соединение и повторите попытку.');
      if (shop.status === 'fulfilled') setSettings(shop.value);
      else { setSettings(previous => ({ ...previous, inquiries_enabled: false })); setSettingsError('Не удалось обновить информацию о магазине. Отправка заявок временно недоступна.'); }
      setLoading(false);
    });
    return () => controller.abort();
  }, [revision]);
  return { products, settings, loading, error, settingsError, retry };
}

export function useStored<T>(key: string, sanitize: (value: unknown) => T) {
  const sanitizer = useRef(sanitize);
  const [value, setValue] = useState<T>(() => {
    try { return sanitize(JSON.parse(localStorage.getItem(key) ?? 'null')); } catch { return sanitize(null); }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* A private WebView may deny storage; current-session state still works. */ } }, [key, value]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key) return;
      try { setValue(sanitizer.current(JSON.parse(event.newValue ?? 'null'))); } catch { setValue(sanitizer.current(null)); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [key]);
  return [value, setValue] as const;
}

export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#home');
  useEffect(() => {
    const sync = () => setHash(window.location.hash || '#home');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const [path, search = ''] = hash.slice(1).split('?', 2);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [path]);
  const navigate = useCallback((next: string, replace = false) => {
    if (replace) { window.history.replaceState(null, '', next); setHash(next); }
    else if (window.location.hash === next) setHash(next);
    else window.location.hash = next;
  }, []);
  return { path: path || 'home', search, navigate };
}
