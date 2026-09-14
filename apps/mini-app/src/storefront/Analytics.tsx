import { useEffect, useState } from 'react';
import type { Product } from './types';

export const COUNTER = 112522333;
const KEY = 'gpartner.analytics-consent.v1';
type Ym = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number };
declare global { interface Window { ym?: Ym; dataLayer?: unknown[] } }
let running = false;
let recording = false;
export const analyticsAllowed = () => { try { return localStorage.getItem(KEY) === 'yes'; } catch { return false; } };
export function trackGoal(name: string) { if (running && analyticsAllowed()) window.ym?.(COUNTER, 'reachGoal', name); }
export function trackCommerce(action: 'detail' | 'add' | 'remove', product: Product | undefined, quantity = 1) {
  if (!product || !running || !analyticsAllowed()) return;
  window.dataLayer?.push({ ecommerce: { currencyCode: 'RUB', [action]: { products: [{ id: product.id, name: product.name, category: product.category, ...(product.price === null ? {} : { price: product.price }), quantity }] } } });
  trackGoal(action === 'detail' ? 'product_view' : action === 'add' ? 'add_to_cart' : 'remove_from_cart');
}

export function Analytics({ path, product, covered = false, showSettings = false }: { path: string; product?: Product; covered?: boolean; showSettings?: boolean }) {
  const [allowed, setAllowed] = useState(analyticsAllowed);
  const [open, setOpen] = useState(() => { try { return !localStorage.getItem(KEY); } catch { return true; } });
  const privatePage = ['profile', 'cart', 'payment', 'contact', 'guide'].includes(path);
  useEffect(() => {
    if (!allowed) {
      if (running) { window.ym?.(COUNTER, 'destruct'); running = false; window.dataLayer = []; }
      return;
    }
    if (path.startsWith('product/') && !product) return;
    // No search terms, contact values or form contents are used as analytics parameters.
    if (!window.ym) {
      const ym: Ym = (...args) => { (ym.a ||= []).push(args); };
      ym.l = Date.now(); window.ym = ym;
    }
    const protect = () => { document.querySelectorAll('input,textarea').forEach(node => node.classList.add('ym-disable-keys')); document.querySelectorAll('form,.sf-city-bar,.sf-city-dialog').forEach(node => node.classList.add('ym-hide-content')); };
    protect();
    const observer = new MutationObserver(protect); observer.observe(document.body, { childList: true, subtree: true });
    const url = `${location.origin}/#${path.startsWith('product/') ? `product/${encodeURIComponent(product?.id || 'unknown')}` : path.replace(/[^a-z-]/g, '')}`;
    if (running && recording === privatePage) { window.ym(COUNTER, 'destruct'); running = false; }
    if (!running) {
      window.dataLayer ||= [];
      window.ym(COUNTER, 'init', { defer: true, ssr: true, webvisor: !privatePage, clickmap: !privatePage, ecommerce: 'dataLayer', accurateTrackBounce: true, trackLinks: !privatePage, url, referrer: document.referrer ? new URL(document.referrer).origin : '' });
      running = true;
      recording = !privatePage;
      if (!document.querySelector('script[data-gpartner-metrika]')) {
        const script = document.createElement('script'); script.async = true; script.src = `https://mc.yandex.ru/metrika/tag.js?id=${COUNTER}`; script.dataset.gpartnerMetrika = 'true'; document.head.appendChild(script);
      }
    }
    window.ym(COUNTER, 'hit', url, { title: product?.name || path });
    if (product) trackCommerce('detail', product);
    return () => observer.disconnect();
  }, [allowed, privatePage, path, product?.id]);
  useEffect(() => { const sync = () => setAllowed(analyticsAllowed()); window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync); }, []);
  function choose(value: boolean) {
    try { localStorage.setItem(KEY, value ? 'yes' : 'no'); } catch { /* Do not start without saved consent. */ }
    setAllowed(value && analyticsAllowed()); setOpen(false);
  }
  return <div className={`sf-analytics-settings${showSettings ? '' : ' sf-analytics-settings--hidden'}`}>{showSettings && <button className="sf-text-button" onClick={() => setOpen(true)}>Настройки аналитики</button>}{open && !covered && <aside className="sf-analytics-banner ym-hide-content" aria-label="Настройки аналитики"><strong>Помогите сделать магазин удобнее</strong><p>С вашего разрешения Яндекс Метрика собирает статистику просмотров и действий, включая запись взаимодействий Вебвизором. Поля форм и личный кабинет исключены. Можно отказаться — магазин продолжит работать.</p><a href="#analytics-policy" onClick={() => setOpen(false)}>Подробнее об аналитике</a><div><button className="sf-button sf-button--secondary" onClick={() => choose(false)}>Без аналитики</button><button className="sf-button" onClick={() => choose(true)}>Разрешить</button></div></aside>}</div>;
}
