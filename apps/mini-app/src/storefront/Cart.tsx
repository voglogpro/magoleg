import { useRef, type ReactNode } from 'react';
import { ArrowRight, ChevronRight, Clock3, CreditCard, MapPin, Package, ShieldCheck, X } from 'lucide-react';
import { cartTotal, catalogHref, money } from './domain';
import { cityKey, parseDeliverySchedule } from './delivery-estimates';
import { findDeliveryZone, zoneTerm } from './delivery-zones';
import { ProductPhoto } from './ProductCard';
import { categoryLabels, MAX_QUANTITY, stockLabels, type CartItem, type Product, type ShopSettings } from './types';

/** The approved cart reference supplies the layout; all commercial data comes from the store. */
export function Cart({ items, products, settings, city, onCity, onRetry, onQuantity, onRemove, children }: {
  items: CartItem[]; products: Product[]; settings: ShopSettings; city: string;
  onCity: () => void; onRetry: () => void; onQuantity: (id: string, quantity: number) => void;
  onRemove: (id: string) => void; children: ReactNode;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const summary = cartTotal(items, products);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const estimate = parseDeliverySchedule(settings.delivery_schedule).find(row => cityKey(row.city) === cityKey(city));
  const zone = findDeliveryZone(city);
  const term = estimate ? zoneTerm(estimate) : zone ? zoneTerm(zone) : null;
  const installment = settings.payment_installment === 'on';
  const startInquiry = () => {
    formRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    formRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus({ preventScroll: true });
  };

  return <div className="sf-cart-layout sf-cart-reference">
    <section className="sf-cart-items" aria-label="Выбранные товары">
      <div className="sf-collection-tools sf-cart-tools"><p>Товаров: <strong>{count}</strong></p><button className="sf-text-button" onClick={onRetry}>Обновить наличие</button></div>
      {items.map(item => {
        const product = products.find(value => value.id === item.product_id);
        if (!product) return <article className="sf-cart-item" key={item.product_id}><div className="sf-cart-unavailable"><h2>Модель больше не опубликована</h2><p>Удалите её, чтобы отправить заявку на оставшиеся товары.</p><button className="sf-text-button" onClick={() => onRemove(item.product_id)}>Удалить недоступный товар</button></div></article>;
        const specs = [product.power_w !== null ? `${product.power_w} Вт` : '', product.range_km !== null ? `до ${product.range_km} км` : ''].filter(Boolean).join(' · ');
        return <article className="sf-cart-item" key={product.id}>
          <a className="sf-cart-photo" href={`#product/${encodeURIComponent(product.id)}`}><ProductPhoto product={product} /></a>
          <div className="sf-cart-item__info"><h2><a href={`#product/${encodeURIComponent(product.id)}`}>{product.name}</a></h2><p className="sf-cart-category">{categoryLabels[product.category]}</p>{specs && <p className="sf-cart-specs">{specs}</p>}<p className={`sf-stock sf-stock--${product.stock_status}`}>{stockLabels[product.stock_status]}</p></div>
          <button className="sf-cart-remove" aria-label={`Удалить ${product.name}`} onClick={() => onRemove(product.id)}><X size={20} /></button>
          <div className="sf-quantity" role="group" aria-label={`Количество ${product.name}`}><button disabled={item.quantity <= 1} aria-label={`Уменьшить количество ${product.name}`} onClick={() => onQuantity(product.id, item.quantity - 1)}>−</button><output aria-live="polite">{item.quantity}</output><button disabled={item.quantity >= MAX_QUANTITY} aria-label={`Увеличить количество ${product.name}`} onClick={() => onQuantity(product.id, item.quantity + 1)}>+</button></div>
          <div className="sf-cart-item__total"><strong>{product.price === null ? 'По запросу' : money(Math.round(product.price * 100) * item.quantity / 100)}</strong>{item.quantity > 1 && <span>{money(product.price)} / шт.</span>}</div>
        </article>;
      })}
      <a className="sf-cart-extra sf-cart-panel" href={catalogHref({ category: 'accessories' })}><Package size={28} strokeWidth={1.5} /><span><strong>Дополнительные товары</strong><small>Шлем, замок, чехол и другие аксессуары</small></span><ChevronRight size={22} /></a>
      <a className="sf-text-button sf-continue-shopping" href="#catalog">Продолжить покупки <ArrowRight size={17} /></a>
    </section>
    <aside className="sf-cart-checkout" aria-label="Итог и оформление">
      <section className="sf-cart-summary sf-cart-panel" aria-label="Стоимость товаров">
        <dl><div><dt>Товары ({count})</dt><dd>{money(summary.knownTotal)}</dd></div><div><dt>Доставка</dt><dd>Включена в цену товара</dd></div><div><dt>Оплата</dt><dd>{settings.payment_sbp === 'on' ? 'СБП после подтверждения' : 'По согласованию с магазином'}</dd></div></dl>
        <p className="sf-cart-total"><span>{summary.unknownPrices ? 'Известная стоимость' : 'Итого за товары'}</span><strong>{money(summary.knownTotal)}</strong></p>
        {summary.unknownPrices > 0 && <p className="sf-muted">Для {summary.unknownPrices} шт. цена будет уточнена. Это не полная сумма заявки.</p>}
      </section>
      {installment ? <a className="sf-button sf-cart-primary" href="#payment"><CreditCard size={23} />Кредит и рассрочка</a> : !settings.inquiries_enabled ? <a className="sf-button sf-cart-primary" href="#contact"><CreditCard size={23} />Связаться с магазином</a> : <button className="sf-button sf-cart-primary" onClick={startInquiry} disabled={summary.unavailable > 0}><CreditCard size={23} />Перейти к оформлению</button>}
      <p className="sf-cart-reassurance"><ShieldCheck size={15} /><span>{installment ? 'Условия и решение — у банка-партнёра' : 'Без списания денег · Наличие подтвердит магазин'}</span></p>
      <section className="sf-cart-delivery sf-cart-panel" aria-label="Получение заказа">
        <div className="sf-cart-delivery-title"><MapPin size={28} /><div><h2>Доставка и получение</h2><p>Выберите удобный город получения</p></div></div>
        <button className="sf-cart-destination" onClick={onCity}><span className="sf-cart-destination-icon"><Package size={23} /></span><span><strong>{city || 'Выбрать город'}</strong><small>Адрес и пункт выдачи согласуем с вами</small></span><ChevronRight size={20} /></button>
        <p className="sf-cart-delivery-term"><Clock3 size={17} /><span>{term ? `Ориентировочно: ${term}` : 'Срок доставки уточним для вашего города'}</span></p>
        <p className="sf-cart-delivery-term"><Package size={17} /><span>Доставка СДЭК до пункта выдачи уже включена в стоимость товара</span></p>
        <a className="sf-cart-delivery-link" href="#delivery">Условия доставки <ChevronRight size={15} /></a>
      </section>
      <div className="sf-cart-form sf-cart-panel" ref={formRef}>{children}</div>
    </aside>
  </div>;
}
