import { phoneLink, telegramLink } from './domain';
import { InquiryForm } from './InquiryForm';
import { type ShopSettings } from './types';

export const infoTitles: Record<string, string> = {
  about: 'О магазине', city: 'Где мы работаем', delivery: 'Доставка и оплата', contact: 'Контакты', guide: 'Помощь с выбором', privacy: 'Обработка данных',
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

export function Information({ topic, settings }: { topic: string; settings: ShopSettings }) {
  return <article className="sf-information">
    {topic === 'about' && <>
      <p className="sf-lead">{settings.shop_name} — магазин электротранспорта{settings.city ? ` в регионе ${settings.city}` : ''}.</p>
      <p>Здесь можно выбрать электросамокат или электроскутер, сравнить характеристики и передать свой выбор магазину. Фотографии, цены и наличие публикует магазин.</p>
      <section className="sf-info-section"><h2>Как подобрать модель</h2><ol><li>Выберите тип транспорта и задайте бюджет в каталоге.</li><li>Добавьте до трёх моделей в сравнение — основные характеристики будут рядом.</li><li>Соберите корзину и оставьте заявку, чтобы уточнить комплектацию, наличие и получение.</li></ol></section>
      <Paragraph title="Информация о продавце" text={[settings.legal_name, settings.legal_details].filter(Boolean).join('\n')} fallback="Реквизиты продавца ещё не опубликованы. До покупки уточните их у магазина." />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'city' && <>
      <p className="sf-lead">Регион работы: {settings.city || 'уточняется'}</p>
      <Paragraph title="Адрес" text={settings.address} fallback="Адрес для посещения пока не опубликован. Не планируйте поездку без подтверждения магазина." />
      <Paragraph title="Время работы" text={settings.hours} fallback="График работы уточняется." />
      <Paragraph title="Получение транспорта" text={settings.delivery} fallback="Возможность и условия доставки в ваш район необходимо уточнить перед покупкой." />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'delivery' && <>
      <Paragraph title="Доставка и самовывоз" text={settings.delivery} fallback="Способы получения, сроки и стоимость доставки пока не опубликованы. Магазин должен подтвердить их до покупки." />
      <Paragraph title="Оплата" text={settings.payment} fallback="Онлайн-оплата на сайте не подключена. Заявка не списывает деньги; способ оплаты согласуется с магазином." />
      <Paragraph title="Гарантия и обслуживание" text={settings.warranty} fallback="Условия гарантии и обслуживания уточняются по документам конкретной модели до покупки." />
      <ContactLinks settings={settings} />
    </>}
    {topic === 'guide' && <>
      <p className="sf-lead">Расскажите, где и как вы будете ездить.</p>
      <p>Для первого сравнения достаточно маршрута, расстояния за день, бюджета и места хранения. Если на маршруте есть подъёмы или нужно перевозить груз, укажите это в обращении.</p>
      <section className="sf-info-section"><h2>Что проверить в карточке</h2><ul><li>Тип транспорта и требования к водительским правам.</li><li>Запас хода, мощность и вес модели.</li><li>Цену, наличие и условия получения.</li></ul><p className="sf-muted">Паспортный запас хода зависит от условий испытаний. Фактический результат меняется с нагрузкой, рельефом и условиями поездки.</p></section>
      <InquiryForm settings={settings} items={[]} />
    </>}
    {topic === 'contact' && <>
      <p className="sf-lead">{settings.shop_name}{settings.city ? ` · ${settings.city}` : ''}</p>
      <ContactLinks settings={settings} />
      {settings.address && <Paragraph title="Адрес" text={settings.address} fallback="" />}
      {settings.hours && <Paragraph title="Время работы" text={settings.hours} fallback="" />}
      <InquiryForm settings={settings} items={[]} />
    </>}
    {topic === 'privacy' && <>
      <p className="sf-lead">Какие данные используются на сайте</p>
      <Paragraph title="Информация о продавце" text={[settings.legal_name, settings.legal_details].filter(Boolean).join('\n')} fallback="Реквизиты продавца ещё не опубликованы. Не отправляйте персональные данные до уточнения информации о продавце." />
      <section className="sf-info-section"><h2>Обращение в магазин</h2><p>При отправке заявки сайт передаёт магазину указанное вами имя, контакт, сообщение и выбранные товары. Они используются для обработки обращения и ответа. Не указывайте паспортные, банковские или другие лишние данные.</p></section>
      <section className="sf-info-section"><h2>Корзина и избранное</h2><p>Выбранные товары, количество, избранное и сравнение сохраняются локально в вашем браузере. Эти данные можно удалить через кнопки на соответствующих страницах или настройки браузера. До отправки заявки корзина не передаётся как обращение магазину.</p></section>
      <section className="sf-info-section"><h2>Вопросы об обработке данных</h2><p>Для уточнения обработки, исправления или удаления данных обращения используйте опубликованные контакты продавца и укажите номер заявки, если он есть.</p><ContactLinks settings={settings} /></section>
    </>}
    <div className="sf-info-bottom"><a className="sf-button" href="#catalog">Перейти в каталог</a></div>
  </article>;
}
