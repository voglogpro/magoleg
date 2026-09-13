import { phoneLink, telegramLink } from './domain';
import { InquiryForm } from './InquiryForm';
import { type ShopSettings } from './types';
import { Delivery } from './Delivery';
import { Payment } from './Payment';
import { LegalDocument, legalTopics } from './LegalDocuments';
import { seller } from './legal-texts';

export const infoTitles: Record<string, string> = {
  marketing: 'Согласие на рекламную рассылку', 'analytics-policy': 'Аналитика и сохранение корзины',
  about: 'О магазине', delivery: 'Доставка по России', payment: 'Оплата и документы', contact: 'Контакты', guide: 'Помощь с выбором',
  privacy: 'Политика конфиденциальности', consent: 'Согласие на обработку персональных данных', offer: 'Публичная оферта', returns: 'Обмен и возврат товара', warranty: 'Гарантия',
};

export function ContactLinks({ settings }: { settings: ShopSettings }) {
  const phone = phoneLink(settings.phone);
  const telegram = telegramLink(settings.telegram);
  return <div className="sf-contact-links">
    {phone && <a className="sf-button sf-button--secondary" href={phone}>{settings.phone}</a>}
    {telegram && <a className="sf-button sf-button--secondary" href={telegram} target="_blank" rel="noopener noreferrer">Написать в Telegram</a>}
    <a className="sf-button sf-button--secondary" href={`mailto:${seller.email}`}>Почта поддержки</a>
  </div>;
}

/** Реквизиты продавца: опубликованная в CRM редакция либо зафиксированные данные ИП. */
export function SellerDetails({ settings }: { settings: ShopSettings }) {
  const custom = [settings.legal_name, settings.legal_details].filter(Boolean).join('\n');
  if (custom) return <section className="sf-info-section"><h2>Информация о продавце</h2><p className="sf-preserve-lines">{custom}</p></section>;
  return <section className="sf-info-section"><h2>Информация о продавце</h2><ul className="sf-doc-facts">
    <li><span>Продавец</span><b>{seller.name}</b></li>
    <li><span>ИНН</span><b>{seller.inn}</b></li>
    <li><span>ОГРНИП</span><b>{seller.ogrnip}</b></li>
    <li><span>Расчётный счёт</span><b>{`${seller.account} в ${seller.bank}`}</b></li>
    <li><span>Юридический адрес</span><b>{seller.address}</b></li>
    <li><span>Почта для обращений</span><b><a href={`mailto:${seller.email}`}>{seller.email}</a></b></li>
  </ul></section>;
}

function Paragraph({ title, text, fallback }: { title: string; text: string; fallback: string }) {
  return <section className="sf-info-section"><h2>{title}</h2><p className="sf-preserve-lines">{text || fallback}</p></section>;
}

export function Information({ topic, settings, city = '', onCity }: { topic: string; settings: ShopSettings; city?: string; onCity?: (city: string) => void }) {
  if (Object.hasOwn(legalTopics, topic)) return <article className="sf-information">{['privacy', 'consent'].includes(topic) && <section className="sf-info-section"><h2>Корзина, аналитика и подписка</h2><p>После входа корзина сохраняется за аккаунтом на сервере и доступна магазину. Подписка на рекламные письма и разрешение аналитики выбираются отдельно и не обязательны для покупки.</p><a href="#analytics-policy">Условия аналитики и хранения корзины</a><p><a href="#marketing">Отдельное согласие на рассылку</a></p></section>}<LegalDocument topic={topic as keyof typeof legalTopics} settings={settings} /><ContactLinks settings={settings} /><div className="sf-info-bottom"><a className="sf-button" href="#catalog">Перейти в каталог</a></div></article>;
  return <article className="sf-information">
    {topic === 'marketing' && <><p className="sf-lead">Рассылка G-Partner — только по вашему выбору.</p><p>Отмечая подписку в личном кабинете, вы разрешаете продавцу G-Partner отправлять на указанный email рекламные предложения, скидки и информацию о товарах, в том числе выбранных в корзине. Подписка не является условием покупки или регистрации.</p><p>Для этого магазин хранит email, состояние подписки, дату и редакцию согласия. Согласие действует до отзыва. Отозвать его можно в личном кабинете: снимите отметку рассылки и сохраните настройки; также можно обратиться к продавцу. Редакция: email-offers-2026-09-12.</p><SellerDetails settings={settings}/><ContactLinks settings={settings}/><a className="sf-button" href="#profile">Управлять подпиской</a></>}
    {topic === 'analytics-policy' && <><p className="sf-lead">Вы решаете, разрешать ли аналитику.</p><p>С вашего разрешения используется Яндекс Метрика, счётчик 112522333: просмотры страниц и товаров, действия с корзиной, технические сведения о браузере и устройстве, источники переходов и запись взаимодействий Вебвизором. Сервис предоставляется ООО «ЯНДЕКС». Пароли, контакты, содержимое форм и личного кабинета исключаются из передаваемых нами параметров.</p><p>Разрешение хранится в браузере. Изменить выбор можно кнопкой «Настройки аналитики» внизу сайта. Без разрешения счётчик не загружается; покупка и аккаунт продолжают работать.</p><p>Корзина гостя сохраняется на его устройстве. После входа корзина сохраняется за аккаунтом на сервере для продолжения выбора и доступна владельцу магазина. Товары можно удалить, очистив корзину. Почта и согласие на предложения настраиваются отдельно в личном кабинете. Данные аккаунта и корзины хранятся до удаления или обращения владельцу; отозвать согласие и запросить удаление можно через контакты магазина.</p><a href="https://yandex.ru/legal/confidential/" target="_blank" rel="noopener noreferrer">Политика конфиденциальности Яндекса</a><SellerDetails settings={settings}/><ContactLinks settings={settings}/></>}
    {topic === 'about' && <>
      <p className="sf-lead">{settings.shop_name} — магазин электротранспорта с доставкой по всей России.</p>
      <p>Здесь можно выбрать электросамокат, электроскутер или электровелосипед, подобрать запчасти и аксессуары, сравнить характеристики и передать свой выбор магазину. Фотографии, цены и наличие публикует магазин.</p>
      <section className="sf-info-section"><h2>Как подобрать модель</h2><ol><li>Выберите тип транспорта и задайте бюджет в каталоге.</li><li>Добавьте до трёх моделей в сравнение — основные характеристики будут рядом.</li><li>Соберите корзину и оставьте заявку, чтобы уточнить комплектацию, наличие и получение.</li></ol></section>
      <SellerDetails settings={settings} />
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
    {topic === 'guide' && <>
      <p className="sf-lead">Расскажите, где и как вы будете ездить.</p>
      <p>Для первого сравнения достаточно маршрута, расстояния за день, бюджета и места хранения. Если на маршруте есть подъёмы или нужно перевозить груз, укажите это в обращении.</p>
      <section className="sf-info-section"><h2>Что проверить в карточке</h2><ul><li>Тип транспорта и требования к водительским правам.</li><li>Запас хода, мощность и вес модели.</li><li>Цену, наличие и условия получения.</li></ul><p className="sf-muted">Паспортный запас хода зависит от условий испытаний. Фактический результат меняется с нагрузкой, рельефом и условиями поездки.</p></section>
      <InquiryForm settings={settings} items={[]} />
    </>}
    {topic === 'contact' && <>
      <p className="sf-lead">{settings.shop_name}</p>
      {settings.contacts_document
        ? <div className="sf-document-body sf-preserve-lines">{settings.contacts_document}</div>
        : <section className="sf-info-section"><h2>Как с нами связаться</h2><p>Поддержка покупателей: <a href={`mailto:${seller.email}`}>{seller.email}</a>, телефон {settings.phone || '+7 (988) 414-87-54'}, Telegram <a href="https://t.me/GpartnerStore" target="_blank" rel="noopener noreferrer">@GpartnerStore</a>.</p><p>Ответ приходит на тот же контакт. Не отправляйте реквизиты карты и коды подтверждения в письме.</p></section>}
      <ContactLinks settings={settings} />
      {settings.address && <Paragraph title="Адрес" text={settings.address} fallback="" />}
      {settings.hours && <Paragraph title="Время работы" text={settings.hours} fallback="" />}
      <SellerDetails settings={settings} />
      <InquiryForm settings={settings} items={[]} />
    </>}
    <div className="sf-info-bottom"><a className="sf-button" href="#catalog">Перейти в каталог</a></div>
  </article>;
}
