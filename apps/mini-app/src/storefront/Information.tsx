import { phoneLink, telegramLink } from './domain';
import { InquiryForm } from './InquiryForm';
import { type ShopSettings } from './types';
import { Delivery } from './Delivery';
import { Payment } from './Payment';
import { LegalDocument, legalTopics } from './LegalDocuments';

export const infoTitles: Record<string, string> = {
  about: 'О магазине', delivery: 'Доставка по России', payment: 'Оплата и документы', contact: 'Контакты', guide: 'Помощь с выбором',
  privacy: 'Политика конфиденциальности', consent: 'Согласие на обработку персональных данных', offer: 'Публичная оферта', returns: 'Возврат товаров и денег', warranty: 'Гарантия', supply: 'Прямые поставки',
};

export function ContactLinks({ settings }: { settings: ShopSettings }) {
  const phone = phoneLink(settings.phone);
  const telegram = telegramLink(settings.telegram);
  return <div className="sf-contact-links">
    {phone && <a className="sf-button sf-button--secondary" href={phone}>{settings.phone}</a>}
    {telegram && <a className="sf-button sf-button--secondary" href={telegram} target="_blank" rel="noopener noreferrer">Написать в Telegram</a>}
    {!phone && !telegram && <p className="sf-muted">Контакты магазина готовятся к публикации.</p>}
  </div>;
}

function Paragraph({ title, text, fallback }: { title: string; text: string; fallback: string }) {
  return <section className="sf-info-section"><h2>{title}</h2><p className="sf-preserve-lines">{text || fallback}</p></section>;
}

export function Information({ topic, settings, city = '', onCity }: { topic: string; settings: ShopSettings; city?: string; onCity?: (city: string) => void }) {
  if (Object.hasOwn(legalTopics, topic)) return <article className="sf-information"><LegalDocument topic={topic as keyof typeof legalTopics} settings={settings} /><ContactLinks settings={settings} /><div className="sf-info-bottom"><a className="sf-button" href="#catalog">Перейти в каталог</a></div></article>;
  return <article className="sf-information">
    {topic === 'about' && <>
      <p className="sf-lead">{settings.shop_name} — магазин электротранспорта с доставкой по всей России.</p>
      <p>Здесь можно выбрать электросамокат, электроскутер или электровелосипед, подобрать запчасти и аксессуары, сравнить характеристики и передать свой выбор магазину. Фотографии, цены и наличие публикует магазин.</p>
      <section className="sf-info-section"><h2>Как подобрать модель</h2><ol><li>Выберите тип транспорта и задайте бюджет в каталоге.</li><li>Добавьте до трёх моделей в сравнение — основные характеристики будут рядом.</li><li>Соберите корзину и оставьте заявку, чтобы уточнить комплектацию, наличие и получение.</li></ol></section>
      <Paragraph title="Информация о продавце" text={[settings.legal_name, settings.legal_details].filter(Boolean).join('\n')} fallback="Реквизиты продавца ещё не опубликованы. До покупки уточните их у магазина." />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'delivery' && <>
      <Delivery settings={settings} city={city} onCity={onCity} />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'payment' && <>
      <Payment settings={settings} />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'warranty' && <><p className="sf-lead">Гарантия 12 месяцев на все товары магазина.</p><Paragraph title="Как получить обслуживание" text={settings.warranty} fallback="Сохраните документы о покупке и обратитесь в магазин с названием модели и описанием неисправности. Порядок проверки, передачи техники и обслуживания согласуется с продавцом. Подробные условия отражаются в гарантийных документах и не ограничивают права, предоставленные законом." /><a className="sf-text-button" href="#returns">Возврат товара и денег →</a><ContactLinks settings={settings} /></>}
    {topic === 'supply' && <><p className="sf-lead">Прямые поставки — без посредников и переплат.</p><p>Магазин самостоятельно организует закупку и публикует актуальные модели в каталоге. Перед покупкой уточните комплектацию, документы и наличие конкретного товара. Стоимость техники и доставки сообщается отдельно до оплаты.</p><p>Фотографии блока поставок — фирменные иллюстрации, не фотографии собственного автопарка или склада.</p><ContactLinks settings={settings} /></>}
    {topic === 'guide' && <>
      <p className="sf-lead">Расскажите, где и как вы будете ездить.</p>
      <p>Для первого сравнения достаточно маршрута, расстояния за день, бюджета и места хранения. Если на маршруте есть подъёмы или нужно перевозить груз, укажите это в обращении.</p>
      <section className="sf-info-section"><h2>Что проверить в карточке</h2><ul><li>Тип транспорта и требования к водительским правам.</li><li>Запас хода, мощность и вес модели.</li><li>Цену, наличие и условия получения.</li></ul><p className="sf-muted">Паспортный запас хода зависит от условий испытаний. Фактический результат меняется с нагрузкой, рельефом и условиями поездки.</p></section>
      <InquiryForm settings={settings} items={[]} />
    </>}
    {topic === 'contact' && <>
      <p className="sf-lead">{settings.shop_name}</p>
      <ContactLinks settings={settings} />
      {settings.address && <Paragraph title="Адрес" text={settings.address} fallback="" />}
      {settings.hours && <Paragraph title="Время работы" text={settings.hours} fallback="" />}
      <InquiryForm settings={settings} items={[]} />
    </>}
    <div className="sf-info-bottom"><a className="sf-button" href="#catalog">Перейти в каталог</a></div>
  </article>;
}
