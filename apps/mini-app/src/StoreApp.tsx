import { Component, lazy, Suspense, useEffect, type ReactNode } from 'react';
import { prepareTelegram } from './lib/telegram';
import './store-base.css';

const Admin = lazy(() => import('./admin/AdminApp'));
const Storefront = lazy(() => import('./storefront/Storefront').then(module => ({ default: module.Storefront })));
class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <main className="app-fallback" role="alert"><h1>Не удалось открыть страницу</h1><p>Обновите страницу. Если ошибка повторится, попробуйте позже.</p><button onClick={() => window.location.reload()}>Обновить</button></main>;
    return this.props.children;
  }
}
export function App() {
  useEffect(() => { prepareTelegram(); document.documentElement.dataset.theme = 'dark'; }, []);
  const admin = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
  return <AppBoundary><Suspense fallback={<main className="app-fallback" role="status">Открываем {admin ? 'кабинет' : 'магазин'}…</main>}>{admin ? <Admin /> : <Storefront />}</Suspense></AppBoundary>;
}
