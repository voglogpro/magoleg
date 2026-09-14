import { ArrowRight, MapPin } from 'lucide-react';
import { Sections } from './LegalDocuments';
import { deliveryTerms } from './legal-texts';
import type { ShopSettings } from './types';

export function Delivery({ settings }: { settings: ShopSettings; city?: string; onCity?: (name: string) => void }) {
  return <>
    <p className="sf-lead">Доставляем электротранспорт по России до выбранного пункта выдачи СДЭК.</p>
    <aside className="sf-cdek-notice">
      <MapPin size={22} aria-hidden="true" />
      <div><strong>Укажите ПВЗ СДЭК при оформлении</strong><p>В корзине введите код или полный адрес удобного пункта. Выбрать его можно на <a href="https://www.cdek.ru/ru/offices" target="_blank" rel="noopener noreferrer">официальной карте СДЭК</a>.</p></div>
    </aside>
    <section className="sf-info-section" aria-labelledby="delivery-terms-title">
      <h2 id="delivery-terms-title">Условия доставки</h2>
      <p>Стоимость доставки не входит в сумму онлайн-оплаты и оплачивается транспортной службе при получении.</p>
    </section>
    <Sections sections={deliveryTerms} />
    {settings.delivery && <section className="sf-info-section"><h2>Дополнительно от магазина</h2><p className="sf-preserve-lines">{settings.delivery}</p></section>}
    <nav className="sf-info-cta" aria-label="Оплата заказа">
      <span className="sf-info-cta__icon" aria-hidden="true"><MapPin size={20} /></span>
      <div><strong>Как оплатить заказ</strong><p className="sf-muted">Способы оплаты, порядок подтверждения, чек и документы — в отдельном разделе.</p></div>
      <a className="sf-text-button" href="#payment">Оплата и документы <ArrowRight size={16} /></a>
    </nav>
  </>;
}
