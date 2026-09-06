import { useState } from 'react';
import { Heart } from 'lucide-react';
import { effectiveLicense, money, productImage } from './domain';
import { categoryLabels, licenseLabels, stockLabels, vehicleCategories, type Product } from './types';

export function ProductPhoto({ product, large = false }: { product: Product; large?: boolean }) {
  const [broken, setBroken] = useState(false);
  const url = productImage(product.image_url);
  return <div className={`sf-product-photo${large ? ' sf-product-photo--large' : ''}`}>
    {url && !broken ? <img src={url} alt={product.name} loading={large ? 'eager' : 'lazy'} decoding="async" draggable={false} onError={() => setBroken(true)} /> : <span>Фото скоро появится</span>}
  </div>;
}

export function ProductCard({ product, favorite, compared, inCart, onFavorite, onCompare, onAdd }: {
  product: Product; favorite: boolean; compared: boolean; inCart: boolean;
  onFavorite: (id: string) => void; onCompare: (id: string) => void; onAdd: (id: string) => void;
}) {
  const href = `#product/${encodeURIComponent(product.id)}`;
  return <article className="sf-product-card">
    <div className="sf-product-card__visual">
      <a href={href} aria-label={`Подробнее: ${product.name}`}><ProductPhoto product={product} /></a>
      <button className="sf-icon-button sf-favorite" type="button" onClick={() => onFavorite(product.id)} aria-label={`${favorite ? 'Убрать' : 'Добавить'} «${product.name}» ${favorite ? 'из избранного' : 'в избранное'}`} aria-pressed={favorite}><Heart size={20} fill={favorite ? 'currentColor' : 'none'} /></button>
    </div>
    <div className="sf-product-card__body">
      <p className="sf-product-category">{categoryLabels[product.category]}</p>
      <h3><a href={href}>{product.name}</a></h3>
      <p className={`sf-stock sf-stock--${product.stock_status}`}>{stockLabels[product.stock_status]}</p>
      <dl className="sf-card-specs">
        {product.range_km !== null && <div><dt>Запас хода</dt><dd>до {product.range_km} км</dd></div>}
        {product.power_w !== null && <div><dt>Мощность</dt><dd>{product.power_w} Вт</dd></div>}
      </dl>
      {vehicleCategories.includes(product.category) && <p className="sf-license-caption">{licenseLabels[effectiveLicense(product)]}</p>}
      <strong className="sf-product-price">{money(product.price)}</strong>
      {inCart ? <a className="sf-button sf-button--secondary" href="#cart">В корзине</a> : <button className="sf-button" type="button" disabled={product.stock_status === 'out-of-stock'} onClick={() => onAdd(product.id)}>{product.stock_status === 'out-of-stock' ? 'Нет в наличии' : 'В корзину'}</button>}
      <button className="sf-compare-button" type="button" onClick={() => onCompare(product.id)} aria-pressed={compared}>{compared ? 'В сравнении' : 'Сравнить'}</button>
    </div>
  </article>;
}
