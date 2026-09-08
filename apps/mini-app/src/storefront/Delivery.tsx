import { useEffect, useState, type FormEvent } from 'react';
import { CityDatalist } from './CityPicker';
import { cityKey, parseDeliverySchedule } from './delivery-estimates';
import type { ShopSettings } from './types';

export function Delivery({ settings, city = '', onCity }: { settings: ShopSettings; city?: string; onCity?: (name: string) => void }) {
  const [destination, setDestination] = useState(city);
  const [selected, setSelected] = useState(city);
  useEffect(() => { setDestination(city); setSelected(city); }, [city]);
  const estimates = parseDeliverySchedule(settings.delivery_schedule);
  const estimate = settings.delivery_origin ? estimates.find(row => cityKey(row.city) === cityKey(selected)) : undefined;
  const submit = (event: FormEvent) => { event.preventDefault(); setSelected(destination.trim()); onCity?.(destination.trim()); };
  return <>
    <p className="sf-lead">Получите технику удобным способом — в вашем городе.</p>
    <section className="sf-delivery-calculator" aria-labelledby="delivery-city-title">
      <div><p className="sf-eyebrow">Доставка по России</p><h2 id="delivery-city-title">Сроки до вашего города</h2><p className="sf-muted">{settings.delivery_origin ? `Отправление: ${settings.delivery_origin}` : 'Город отправления подтвердит магазин.'}</p></div>
      <form onSubmit={submit}><label>Город получения<input name="delivery-city" list="sf-delivery-cities" autoComplete="address-level2" value={destination} onChange={event => setDestination(event.target.value)} minLength={2} maxLength={80} required placeholder="Введите ваш город" /></label><button className="sf-button" type="submit">Показать сроки</button></form>
      <CityDatalist id="sf-delivery-cities" />
      <div className="sf-delivery-result" role="status">
        {selected ? estimate ? <><h3>{selected}: {estimate.min === estimate.max ? estimate.min : `${estimate.min}–${estimate.max}`} дн.</h3><p>Ориентировочно после передачи перевозчику. Стоимость: {estimate.cost}.</p><p className="sf-muted">Оценка магазина, не онлайн-расчёт СДЭК. Срок подготовки, тариф, доступность перевозки и итоговую стоимость подтвердим до оплаты.</p></> : <><h3>Доставка в город {selected}</h3><p>Для этого направления срок и стоимость уточняются. Они зависят от склада, размера упаковки, веса техники и выбранного способа получения.</p><a className="sf-text-button" href="#contact">Уточнить у магазина →</a></> : <p>Выберите город, чтобы увидеть опубликованные магазином сроки.</p>}
      </div>
      <a className="sf-text-button" href="https://www.cdek.ru/ru/calculate/" target="_blank" rel="noopener noreferrer">Открыть калькулятор СДЭК ↗</a><p className="sf-muted">Калькулятор откроется на сайте перевозчика. Для расчёта понадобятся город отправления, вес и размеры упакованного товара. Данные из этой формы автоматически в СДЭК не передаются.</p>
    </section>
    <section className="sf-info-section"><h2>Способы получения</h2><div className="sf-delivery-methods">
      <div><h3>Курьером</h3><p>До согласованного адреса. Возможность подъёма и доставки крупной техники уточняется при оформлении.</p></div>
      <div><h3>Транспортной компанией</h3><p>Планируем сотрудничество со СДЭК. СДЭК, Деловые Линии или другой перевозчик согласуются для конкретного заказа с учётом груза и аккумулятора.</p></div>
      <div><h3>Самовывоз</h3><p>{settings.address ? `По предварительному согласованию: ${settings.address}` : 'Адрес и доступное время подтвердит магазин. Не выезжайте за заказом без подтверждения.'}</p></div>
    </div></section>
    <section className="sf-info-section"><h2>География, сроки и стоимость</h2><p>Отправляем по России в населённые пункты, обслуживаемые согласованным перевозчиком. «От 3-х дней» — минимальный ориентир, а не единый срок для всех городов. Подготовка заказа и перевозка согласуются отдельно.</p><p>Доставка — по тарифам транспортной компании, если магазин письменно не подтвердил бесплатную доставку. Страхование, упаковка и дополнительные услуги включаются в согласованный расчёт. До оплаты вы узнаете стоимость товаров и доставки отдельно.</p>{settings.delivery && <p className="sf-preserve-lines">{settings.delivery}</p>}</section>
    <section className="sf-info-section"><h2>Оплата</h2><p className="sf-preserve-lines">{settings.payment || 'Пока на сайте доступна заявка без списания денег. Онлайн-оплата картами, кредит и рассрочка готовятся к подключению; действующий способ оплаты подтвердит магазин.'}</p><p className="sf-muted">После подключения эквайринга и банков-партнёров здесь появится подтверждённая возможность покупки в кредит и рассрочку. Сейчас сайт не оформляет кредит и не передаёт данные в банк. Не вводите номер карты или паспортные данные в сообщениях.</p></section>
  </>;
}
