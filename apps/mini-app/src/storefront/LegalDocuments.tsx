import { consentText, offerText, privacyText, seller, type LegalSection, type LegalText } from './legal-texts';
import type { ShopSettings } from './types';

export const legalTopics = {
  privacy: { title: 'Политика конфиденциальности', field: 'privacy_document', approved: privacyText },
  consent: { title: 'Согласие на обработку персональных данных', field: 'consent_document', approved: consentText },
  offer: { title: 'Публичная оферта', field: 'offer_document', approved: offerText },
  returns: { title: 'Обмен и возврат товара', field: 'returns_document', approved: null },
} as const;

export function Sections({ sections }: { sections: readonly LegalSection[] }) {
  return <>{sections.map(section => <section className="sf-info-section" key={section.title}>
    <h2>{section.title}</h2>
    {section.blocks.map((block, index) => typeof block === 'string'
      ? <p key={index}>{block}</p>
      : <ul key={index}>{block.list.map(item => <li key={item}>{item}</li>)}</ul>)}
  </section>)}</>;
}

/** Утверждённая владельцем редакция: название, дата публикации и разделы документа. */
function ApprovedText({ text }: { text: LegalText }) {
  return <>
    <p className="sf-lead">{text.title}</p>
    <p className="sf-muted">{text.published}</p>
    {text.intro?.map(paragraph => <p className="sf-document-intro" key={paragraph}>{paragraph}</p>)}
    <Sections sections={text.sections} />
  </>;
}

export function LegalDocument({ topic, settings }: { topic: keyof typeof legalTopics; settings: ShopSettings }) {
  const custom = settings[legalTopics[topic].field];
  const approved = legalTopics[topic].approved;
  // Текст, опубликованный через CRM, перекрывает встроенную редакцию целиком.
  if (custom) return <div className="sf-document-body sf-preserve-lines">{custom}</div>;
  if (approved) return <ApprovedText text={approved} />;
  return <>
    <aside className="sf-document-draft" role="note"><strong>Базовый проект документа</strong><p>Продавец готовит окончательную редакцию. Опубликовать её можно в кабинете магазина; до этого действуют нормы закона и условия публичной оферты.</p></aside>
    <section className="sf-info-section"><h2>Продавец</h2><p>{settings.legal_name || seller.name}</p><p>{`ИНН ${seller.inn}, ОГРНИП ${seller.ogrnip}`}</p><p>{`Обращения: ${seller.email}`}</p></section>
    <section className="sf-info-section"><h2>1. Качественный товар при дистанционной покупке</h2><p>До передачи товара от покупки можно отказаться в любое время, после передачи — в течение 7 дней. Если письменная информация о порядке и сроках возврата не была предоставлена при доставке, срок отказа составляет 3 месяца.</p><p>Необходимо сохранить товарный вид и потребительские свойства. Покупку можно подтвердить чеком или другими доказательствами. Для товара с индивидуально-определёнными свойствами, который может использоваться исключительно покупателем, действует предусмотренное законом исключение. Само отнесение товара к технически сложным не означает полного запрета возврата при дистанционной покупке.</p><p>Деньги возвращаются не позднее 10 дней со дня требования; при отказе от качественного товара могут быть удержаны предусмотренные законом расходы продавца на доставку возвращаемого товара от покупателя.</p><a href="https://zpp.rospotrebnadzor.ru/news/regional/463650" target="_blank" rel="noopener noreferrer">Разъяснение Роспотребнадзора о дистанционном возврате ↗</a></section>
    <section className="sf-info-section"><h2>2. Недостатки и технически сложные товары</h2><p>Сообщите продавцу о недостатке и своём требовании. Продавец принимает товар и при необходимости проводит проверку качества; при споре о причинах недостатка — экспертизу в предусмотренном законом порядке.</p><p>Если модель относится к технически сложным товарам, требование возврата денег или замены при недостатке можно предъявить в течение 15 дней после передачи. После этого применяются специальные основания: существенный недостаток, нарушение срока ремонта либо невозможность использования более 30 дней в каждом году гарантии вследствие неоднократного устранения разных недостатков. Для других товаров действуют общие правила. Условия зависят от документов и классификации конкретной модели.</p><a href="https://zpp.rospotrebnadzor.ru/news/federal/528410" target="_blank" rel="noopener noreferrer">Разъяснение Роспотребнадзора о технически сложных товарах ↗</a></section>
    <section className="sf-info-section"><h2>3. Если товар куплен в кредит</h2><p>Возврат товара не прекращает кредитный договор автоматически. Сообщите банку о возврате, согласуйте перечисление денег и досрочное погашение, получите подтверждение исполнения обязательств. До подтверждения банка соблюдайте действующий порядок платежей.</p><p>При возврате некачественного товара, приобретённого за счёт потребительского кредита, продавец возвращает уплаченную сумму и возмещает предусмотренные законом уплаченные проценты и иные платежи по кредиту. Правила возврата качественного товара и банковских услуг рассматриваются отдельно; автоматическую компенсацию всех процентов обещать нельзя.</p><a href="https://zpp.rospotrebnadzor.ru/news/regional/325797" target="_blank" rel="noopener noreferrer">Роспотребнадзор: возврат кредитного товара ↗</a></section>
    <section className="sf-info-section"><h2>4. Как обратиться</h2><p>Направьте номер заказа, название модели, описание причины и своё требование на {seller.email}. Согласуйте способ перевозки и адрес; для техники с аккумулятором особенно важны упаковка и правила перевозчика.</p><p>{settings.return_address ? `Адрес для возврата: ${settings.return_address}` : `Адрес для возврата согласуется с магазином до отправки: напишите на ${seller.email}.`}</p><p>Возврат денежных средств согласуется с учётом исходного способа оплаты. Не отправляйте реквизиты карты, коды подтверждения или паспорт в открытые сообщения.</p></section>
  </>;
}
