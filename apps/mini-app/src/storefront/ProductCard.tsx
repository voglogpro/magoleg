import { useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { ArrowLeft, ArrowRight, ArrowLeftRight, Heart, ShoppingCart } from 'lucide-react';
import { effectiveLicense, money, powerLabel, productImage } from './domain';
import { badgeLabels, categoryLabels, licenseShort, stockLabels, vehicleCategories, type Product } from './types';

export function ProductPhoto({ product, large = false }: { product: Product; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const url = productImage(product.image_url);
  return <div className={`sf-product-photo${large ? ' sf-product-photo--large' : ''}`}>
    {url && !broken ? <img src={url} alt={product.name} loading={large ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setBroken(true)} /> : <span>Фото скоро появится</span>}
  </div>;
}

/**
 * The photos live in a scroll-snap track, so a phone swipes through them the way it swipes
 * anything else, and the thumbnails stay ordinary buttons a keyboard can reach. The scroll
 * position — not a click — decides which photo is current, so both ways of moving agree.
 */
export function ProductGallery({ product }: { product: Product }) {
  const photos = product.images.map(productImage).filter(Boolean);
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const show = (index: number) => {
    const slide = track.current?.children[index] as HTMLElement | undefined;
    if (slide) track.current?.scrollTo({ left: slide.offsetLeft - (track.current.firstElementChild as HTMLElement).offsetLeft, behavior: 'smooth' });
  };
  if (photos.length < 2) return <ProductPhoto product={product} large />;
  return <div className="sf-gallery">
    <div className="sf-gallery__track" ref={track} tabIndex={0} aria-label={`Фотографии: ${product.name}`}
      onScroll={event => setActive(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}>
      {photos.map((url, index) => <div className="sf-product-photo sf-product-photo--large" key={url}>
        <img src={url} alt={`${product.name}: фото ${index + 1}`} loading={index ? 'lazy' : 'eager'} decoding="async" draggable={false} />
      </div>)}
    </div>
    <p className="sf-gallery__counter" aria-live="polite">{active + 1} / {photos.length}</p>
    <div className="sf-gallery__arrows sf-desktop-only">
      <button type="button" aria-label="Предыдущее фото" disabled={active === 0} onClick={() => show(active - 1)}><ArrowLeft size={18} /></button>
      <button type="button" aria-label="Следующее фото" disabled={active >= photos.length - 1} onClick={() => show(active + 1)}><ArrowRight size={18} /></button>
    </div>
    <div className="sf-gallery__thumbs" role="group" aria-label="Выбор фотографии">
      {photos.map((url, index) => <button type="button" key={url} aria-pressed={index === active} aria-label={`Фото ${index + 1}`} onClick={() => show(index)}>
        <img src={url} alt="" loading="lazy" draggable={false} />
      </button>)}
    </div>
  </div>;
}

/** A compact, touch-first gallery for catalogue tiles. Swiping must not open the product. */
function ProductCardGallery({ product, href }: { product: Product; href: string }) {
  const photos = product.images.map(productImage).filter(Boolean);
  const [active, setActive] = useState(0);
  const pointer = useRef({ x: 0, moved: false });
  const beginSwipe = (event: PointerEvent<HTMLDivElement>) => { pointer.current = { x: event.clientX, moved: false }; };
  const watchSwipe = (event: PointerEvent<HTMLDivElement>) => {
    if (Math.abs(event.clientX - pointer.current.x) > 8) pointer.current.moved = true;
  };
  const guardLink = (event: MouseEvent<HTMLDivElement>) => {
    if (!pointer.current.moved) return;
    event.preventDefault();
    event.stopPropagation();
    pointer.current.moved = false;
  };
  if (photos.length < 2) return <a href={href} aria-label={`Подробнее: ${product.name}`}><ProductPhoto product={product} /></a>;
  return <div className="sf-card-gallery">
    <div className="sf-card-gallery__track" tabIndex={0} aria-label={`Фотографии: ${product.name}`}
      onPointerDown={beginSwipe} onPointerMove={watchSwipe} onClickCapture={guardLink}
      onScroll={event => setActive(Math.round(event.currentTarget.scrollLeft / Math.max(1, event.currentTarget.clientWidth)))}>
      {photos.map((url, index) => <a href={href} aria-label={`Подробнее: ${product.name}, фото ${index + 1}`} key={url}>
        <span className="sf-product-photo"><img src={url} alt={`${product.name}: фото ${index + 1}`} loading="lazy" decoding="async" draggable={false} /></span>
      </a>)}
    </div>
    <div className="sf-card-gallery__dots" aria-hidden="true">
      {photos.map((url, index) => <span key={url} className={index === active ? 'is-active' : ''} />)}
    </div>
  </div>;
}

export function ProductCard({ product, favorite, compared, inCart, onFavorite, onCompare, onAdd }: {
  product: Product; favorite: boolean; compared: boolean; inCart: boolean;
  onFavorite: (id: string) => void; onCompare: (id: string) => void; onAdd: (id: string) => void;
}) {
  const href = `#product/${encodeURIComponent(product.id)}`;
  // The category is already printed above the title; keep the full model name in details and accessibility text.
  const title = product.name.replace(/^(Электросамокат|Электроскутер|Электровелосипед|Электропитбайк|Квадроцикл)\s+/i, '');
  const license = effectiveLicense(product);
  return <article className="sf-product-card">
    <div className="sf-product-card__visual">
      <ProductCardGallery product={product} href={href} />
      {product.badge && <span className={`sf-badge sf-badge--${product.badge}`}>{badgeLabels[product.badge]}</span>}
      <button className="sf-icon-button sf-favorite" type="button" onClick={() => onFavorite(product.id)} aria-label={`${favorite ? 'Убрать' : 'Добавить'} «${product.name}» ${favorite ? 'из избранного' : 'в избранное'}`} aria-pressed={favorite}><Heart size={20} fill={favorite ? 'currentColor' : 'none'} /></button>
      <button className="sf-compare-button" type="button" onClick={() => onCompare(product.id)} aria-pressed={compared} aria-label={`${compared ? 'Убрать из сравнения' : 'Сравнить'}: ${product.name}`} title={compared ? 'Убрать из сравнения' : 'Сравнить'}><ArrowLeftRight size={19} aria-hidden="true" /></button>
    </div>
    <div className="sf-product-card__body">
      <p className="sf-product-category">{categoryLabels[product.category]}</p>
      <div className="sf-product-title-row"><h3><a href={href} title={product.name} aria-label={product.name}>{title}</a></h3><span className={`sf-stock-light sf-stock-light--${product.stock_status}`} title={stockLabels[product.stock_status]}><span className="sf-sr-only">{stockLabels[product.stock_status]}</span></span></div>
      <dl className="sf-card-specs">
        {product.range_km !== null && <div><dt>Пробег</dt><dd>до {product.range_km} км</dd></div>}
        {product.power_w !== null && <div><dt>Мощность</dt><dd>{powerLabel(product)}</dd></div>}
      </dl>
      {vehicleCategories.includes(product.category) && license !== 'unknown' && <p className="sf-license-caption">{licenseShort[license]}</p>}
      <strong className="sf-product-price">{money(product.price)}</strong>
      <div className="sf-card-actions">
      {inCart ? <a className="sf-button sf-button--secondary" href="#cart">В корзине</a> : <button className="sf-button" type="button" disabled={product.stock_status === 'out-of-stock'} onClick={() => onAdd(product.id)}><ShoppingCart size={17} aria-hidden="true" />{product.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'В корзину'}</button>}
      </div>
    </div>
  </article>;
}
