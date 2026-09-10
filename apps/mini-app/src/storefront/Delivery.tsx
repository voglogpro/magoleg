import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowRight, MapPin, Truck } from 'lucide-react';
import { cityKey, parseDeliverySchedule } from './delivery-estimates';
import { deliveryZones, findDeliveryZone, zoneById, zoneTerm, type DeliveryZone } from './delivery-zones';
import { CityDatalist } from './CityPicker';
import { Sections } from './LegalDocuments';
import { deliveryTerms } from './legal-texts';
import type { ShopSettings } from './types';

function ZoneCards({ activeId, onPick }: { activeId?: string; onPick?: (zone: DeliveryZone) => void }) {
  return <ul className="sf-zone-grid">
    {deliveryZones.map((zone, index) => {
      const inner = <>
        <span className="sf-zone-card__district">{zone.districts}</span>
        <strong>{zone.title}</strong>
        <span className="sf-zone-card__days">{zoneTerm(zone)}</span>
        <span className="sf-zone-card__hint">{zone.hint}</span>
      </>;
      return <li className="sf-zone-item" key={zone.id} style={{ '--sf-step': index } as CSSProperties}>
        {onPick
          ? <button type="button" className="sf-zone-card" aria-pressed={activeId === zone.id} onClick={() => onPick(zone)}>{inner}</button>
          : <div className={`sf-zone-card${activeId === zone.id ? ' sf-zone-card--active' : ''}`}>{inner}</div>}
      </li>;
    })}
  </ul>;
}

export function Delivery({ settings, city = '', onCity }: { settings: ShopSettings; city?: string; onCity?: (name: string) => void }) {
  const [destination, setDestination] = useState(city);
  const [selected, setSelected] = useState(city);
  const [zoneChoice, setZoneChoice] = useState<DeliveryZone | null>(null);
  useEffect(() => { setDestination(city); setSelected(city); setZoneChoice(null); }, [city]);
  const estimates = parseDeliverySchedule(settings.delivery_schedule);
  // Опубликованная владельцем строка точнее общей оценки округа и всегда идёт первой.
  const published = settings.delivery_origin ? estimates.find(row => cityKey(row.city) === cityKey(selected)) : undefined;
  const zone = selected ? findDeliveryZone(selected) : null;
  const shown = zone ?? zoneChoice;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const name = destination.trim();
    setSelected(name); setZoneChoice(null);
    if (name) onCity?.(name);
  };
  return <>
    <p className="sf-lead">Отправляем технику по всей России: посчитайте срок до своего города за один шаг.</p>
    <section className="sf-delivery-calculator" aria-labelledby="delivery-city-title">
      <div className="sf-delivery-calculator__head">
        <span className="sf-delivery-calculator__icon" aria-hidden="true"><Truck size={22} /></span>
        <div>
          <p className="sf-eyebrow">Доставка по России</p>
          <h2 id="delivery-city-title">Сроки до вашего города</h2>
          <p className="sf-muted">{settings.delivery_origin ? `Отправление: ${settings.delivery_origin}` : 'Город отправления подтвердит магазин.'}</p>
        </div>
      </div>
      <form onSubmit={submit}>
        <label>Город получения<input name="delivery-city" list="sf-delivery-cities" autoComplete="address-level2" value={destination} onChange={event => setDestination(event.target.value)} minLength={2} maxLength={80} required placeholder="Например, Краснодар" /></label>
        <button className="sf-button" type="submit">Показать сроки</button>
      </form>
      <CityDatalist id="sf-delivery-cities" />
      <div className="sf-delivery-result" role="status">
        {!selected && !zoneChoice && <p>Введите город — покажем ориентировочный срок доставки по базе магазина.</p>}
        {!selected && zoneChoice && <>
          <h3>{zoneChoice.title}: {zoneTerm(zoneChoice)}</h3>
          <p>{zoneChoice.districts}. {zoneChoice.hint} Срок считается после передачи заказа перевозчику.</p>
          <p className="sf-muted">Укажите город, чтобы уточнить оценку и подставить его в заявку.</p>
        </>}
        {selected && published && <>
          <h3>{selected}: {published.min === published.max ? published.min : `${published.min}–${published.max}`} дн.</h3>
          <p>Ориентировочно после передачи перевозчику. Стоимость: {published.cost}.</p>
          <p className="sf-muted">Точная оценка магазина для этого направления. Срок подготовки, тариф и итоговую стоимость подтвердим до оплаты.</p>
        </>}
        {selected && !published && zone && <>
          <h3>{selected}: {zoneTerm(zone)}</h3>
          <p>{zone.title} ({zone.districts}). Срок считается после передачи заказа перевозчику, стоимость — по тарифу транспортной компании.</p>
          <p className="sf-muted">Ориентир магазина по округу, не онлайн-расчёт СДЭК. Габаритная техника, отдалённые адреса и правила перевозки аккумулятора могут изменить срок — подтвердим до оплаты.</p>
        </>}
        {selected && !published && !zone && <>
          <h3>Доставка в город {selected}</h3>
          <p>Этого направления пока нет в базе: срок и стоимость уточняются. Они зависят от склада, размера упаковки, веса техники и способа получения.</p>
          <p className="sf-muted">Выберите свой федеральный округ — покажем ориентир по нему, либо напишите нам.</p>
          {zoneChoice && <p className="sf-zone-answer"><strong>{zoneChoice.title}</strong> ({zoneChoice.districts}): ориентировочно {zoneTerm(zoneChoice)} после передачи перевозчику.</p>}
          <label className="sf-zone-select">Федеральный округ
            <select value={zoneChoice?.id ?? ''} onChange={event => setZoneChoice(zoneById(event.target.value) ?? null)}>
              <option value="">Не выбран</option>
              {deliveryZones.map(item => <option value={item.id} key={item.id}>{item.title} ({item.districts})</option>)}
            </select>
          </label>
          <a className="sf-text-button" href="#contact">Уточнить у магазина →</a>
        </>}
      </div>
    </section>

    <section className="sf-info-section" aria-labelledby="delivery-zones-title">
      <h2 id="delivery-zones-title">Сроки по федеральным округам</h2>
      <p>Ориентиры магазина в календарных днях с момента передачи заказа перевозчику. Для городов, у которых опубликована отдельная оценка, показывается именно она.</p>
      <ZoneCards activeId={shown?.id} onPick={picked => { setSelected(''); setDestination(''); setZoneChoice(picked); }} />
      <p className="sf-muted">Нажмите округ, чтобы отметить своё направление. Крайние сроки относятся к отдалённым населённым пунктам и периодам загрузки перевозчиков.</p>
    </section>

    <section className="sf-info-section" aria-labelledby="delivery-terms-title">
      <h2 id="delivery-terms-title">Условия доставки</h2>
      <p className="sf-muted">Опубликованная редакция условий, на которых магазин передаёт заказ покупателю.</p>
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
