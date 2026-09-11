import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeftRight, ArrowRight, Bike, Bell, Cog, Gauge, Heart, Puzzle, ShoppingBag, Truck, Zap, type LucideIcon } from 'lucide-react';
import { StoreHero } from '../components/StoreHero';
import { ShopBenefits } from '../components/ShopBenefits';
import { PickCards } from './PickCards';
import { catalogHref, categorySummary, money, plural, telegramLink } from './domain';
import { categoryLabels, type Category, type Product, type ShopSettings, type SmartPick } from './types';

/** Счётчики выбора покупателя: они и есть его место в воронке. */
export type Chosen = { favorites: number; compare: number; cart: number };

const categoryIcons: Record<Category, LucideIcon> = {
  'kick-scooter': Zap, scooter: Gauge, 'e-bike': Bike, atv: Truck, parts: Cog, accessories: Puzzle,
};

/**
 * Шаг 1 воронки: тип транспорта. Плитка ведёт в каталог с уже выставленным фильтром,
 * поэтому покупателю не нужно разбираться с панелью фильтров, чтобы увидеть свои модели.
 */
export function CategoryTiles({ products }: { products: Product[] }) {
  const rows = categorySummary(products);
  if (!rows.length) return null;
  return <section className="sf-home-block sf-home-categories" aria-labelledby="sf-categories-title">
    <div className="sf-section-heading"><h2 id="sf-categories-title">Ваш формат движения</h2><a href="#catalog">Весь каталог <ArrowRight size={16} /></a></div>
    <ul className="sf-cat-grid">
      {rows.map((row, index) => {
        const Icon = categoryIcons[row.category];
        return <li key={row.category} style={{ '--sf-step': index } as CSSProperties}>
          <a className="sf-cat-tile" href={catalogHref({ category: row.category })}>
            <Icon className="sf-cat-tile__symbol" size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="sf-cat-tile__text"><strong>{categoryLabels[row.category]}</strong><span className="sf-cat-tile__meta"><span>{row.count} {plural(row.count, ['модель', 'модели', 'моделей'])}</span>{row.from !== null && <span>от {money(row.from)}</span>}</span></span>
            <ArrowRight className="sf-cat-tile__arrow" size={16} aria-hidden="true" />
          </a>
        </li>;
      })}
    </ul>
  </section>;
}

/** Возврат в воронку: покупатель уже что-то отложил, и главная напоминает, где он остановился. */
export function ContinueChoice({ chosen }: { chosen: Chosen }) {
  const items = [
    { href: '#favorites', icon: Heart, label: 'В избранном', count: chosen.favorites },
    { href: '#compare', icon: ArrowLeftRight, label: 'В сравнении', count: chosen.compare },
    { href: '#cart', icon: ShoppingBag, label: 'В корзине', count: chosen.cart },
  ].filter(item => item.count > 0);
  if (!items.length) return null;
  const next = chosen.cart > 0 ? { href: '#cart', label: 'Оформить заявку' }
    : chosen.compare > 1 ? { href: '#compare', label: 'Сравнить модели' }
    : { href: '#favorites', label: 'Вернуться к выбору' };
  return <section className="sf-continue" aria-labelledby="sf-continue-title">
    <div>
      <p className="sf-eyebrow">Вы уже выбирали</p>
      <h2 id="sf-continue-title">Продолжить с того же места</h2>
      <ul className="sf-continue__stats">
        {items.map(item => <li key={item.href}><a href={item.href}><item.icon size={16} aria-hidden="true" /><span>{item.label}</span><b>{item.count}</b></a></li>)}
      </ul>
    </div>
    <a className="sf-button" href={next.href}>{next.label} <ArrowRight size={17} /></a>
  </section>;
}

export function TelegramPromo({ settings }: { settings: ShopSettings }) {
  const channel = telegramLink(settings.telegram_channel);
  if (!channel) return null;
  const handle = settings.telegram_channel.trim().replace(/^https:\/\/t\.me\//i, '').replace(/^@/, '');
  return <section className="sf-promo" aria-labelledby="sf-promo-title">
    <span className="sf-promo__icon" aria-hidden="true"><Bell size={22} /></span>
    <div>
      <h2 id="sf-promo-title">Скидки и новинки — в Telegram</h2>
      <p>Магазин объявляет акции, снижение цен и поступления в своём канале. Подпишитесь, чтобы не пропустить предложение по нужной модели.</p>
      <p className="sf-muted">Канал магазина: @{handle}. Подписка бесплатная, отписаться можно в любой момент.</p>
    </div>
    <a className="sf-button" href={channel} target="_blank" rel="noopener noreferrer">Подписаться на канал</a>
  </section>;
}

export function Home({ products, settings, picks, chosen, featured, catalogState, cards, onCatalog }: {
  products: Product[]; settings: ShopSettings; picks: SmartPick[]; chosen: Chosen;
  featured: Product[]; catalogState: ReactNode; cards: (items: Product[]) => ReactNode; onCatalog: () => void;
}) {
  return <>
    <StoreHero onCatalog={onCatalog} />
    <div className="sf-home-content">
      <ShopBenefits />
      <ContinueChoice chosen={chosen} />
      <CategoryTiles products={products} />
      <section className="sf-home-block sf-home-products" aria-labelledby="sf-products-title">
        <div className="sf-section-heading"><h2 id="sf-products-title">{products.some(product => product.featured) ? 'Выбор магазина' : 'Присмотритесь ближе'}</h2>{products.length > 0 && <a href="#catalog">Все модели <ArrowRight size={16} /></a>}</div>
        {catalogState || (featured.length ? cards(featured) : <div className="sf-catalog-preparing"><h3>Готовим ассортимент</h3><p>Здесь появятся фотографии, характеристики и цены после публикации товаров магазином.</p><a href="#contact">Контакты и информация о магазине</a></div>)}
      </section>
      {picks.length > 0 && <section className="sf-home-block sf-home-picks" aria-labelledby="sf-picks-title">
        <div className="sf-section-heading"><h2 id="sf-picks-title">Умные подборки</h2><a href="#picks">Все подборки <ArrowRight size={16} /></a></div>
        <PickCards picks={picks.slice(0, 4)} layout="grid" />
      </section>}
      {products.length > 0 && <div className="sf-home-catalog-cta"><div><h2>Найдите свой электротранспорт</h2><p>Сравните модели по запасу хода, мощности и цене.</p></div><a className="sf-button" href="#catalog">Перейти в каталог <ArrowRight size={16} /></a></div>}
      <TelegramPromo settings={settings} />
      <nav className="sf-store-links" aria-label="Информация для покупателя"><a href="#delivery"><strong>Доставка по России</strong><span>Сроки по округам, от 3 дней</span></a><a href="#payment"><strong>Оплата и документы</strong><span>Способы расчёта и порядок заказа</span></a><a href="#about"><strong>О магазине</strong><span>Информация и реквизиты</span></a><a href="#guide"><strong>Помощь с выбором</strong><span>Подберём под ваши задачи</span></a></nav>
    </div>
  </>;
}
