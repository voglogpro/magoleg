import { useEffect, useRef, useState, type FormEvent } from 'react';
import { submitInquiry } from './api';
import { CityDatalist } from './CityPicker';
import { money } from './domain';
import { type AccountProfile, type CartItem, type Inquiry, type PaymentChoice, type ShopSettings } from './types';

const paymentChoiceLabels: Record<PaymentChoice, string> = {
  sbp: 'СБП', dolyame: 'Долями', installment: 'Рассрочка', credit: 'Кредит',
};

export function InquiryConfirmation({ inquiry }: { inquiry: Inquiry }) {
  return <div className="sf-confirmation" role="status">
    <h3>Заявка получена</h3>
    <p>Номер: <strong>{inquiry.id}</strong></p>
    <p>Магазин получил заказ и свяжется по указанному контакту. Деньги пока не списаны.</p>
    {inquiry.total !== null && <p>Сумма по каталогу: <strong>{money(inquiry.total)}</strong>. Доставка включена в стоимость товара.</p>}
    <p>После подтверждения наличия магазин пришлёт ссылку или QR-код для оплаты через СБП. Проверьте получателя и сумму до подтверждения перевода: реквизиты карты и коды подтверждения магазин никогда не запрашивает.</p>
    <a className="sf-button sf-button--secondary" href="#catalog">Продолжить выбор</a>
  </div>;
}

export function InquiryForm({ settings, items, account = null, city = '', preferredPayment = 'sbp', onCity, blocked = false, onSuccess }: {
  settings: ShopSettings; items: CartItem[]; account?: AccountProfile | null; city?: string;
  preferredPayment?: PaymentChoice; onCity?: (city: string) => void; blocked?: boolean; onSuccess?: (inquiry: Inquiry) => void;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [destination, setDestination] = useState(city);
  const [cdekPvz, setCdekPvz] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>(preferredPayment);
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<Inquiry | null>(null);
  const submitting = useRef(false);
  const submission = useRef({ signature: '', key: '' });
  const errorRef = useRef<HTMLParagraphElement>(null);

  // The account and the chosen city may arrive after this form mounts; never overwrite typed text.
  useEffect(() => {
    if (!account) return;
    setName(current => current || account.name);
    setContact(current => current || account.contact);
  }, [account]);
  useEffect(() => { if (city) setDestination(current => current || city); }, [city]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !settings.inquiries_enabled || blocked || confirmation) return;
    setError('');
    const trimmedContact = contact.trim();
    const validContact = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact)
      || /^@[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(trimmedContact)
      || (/^[+0-9 ()-]{7,32}$/.test(trimmedContact) && trimmedContact.replace(/\D/g, '').length >= 7 && trimmedContact.replace(/\D/g, '').length <= 15);
    if (name.trim().length < 2 || !validContact || !consent || (!items.length && message.trim().length < 10)
        || (items.length > 0 && (destination.trim().length < 2 || cdekPvz.trim().length < 3))) {
      setError('Укажите имя, контакт, город доставки и адрес или код ПВЗ СДЭК. Для вопроса без товаров добавьте сообщение от 10 символов и подтвердите согласие.');
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    submitting.current = true; setPending(true);
    try {
      const payload = { name: name.trim(), contact: trimmedContact, city: destination.trim(), cdek_pvz: cdekPvz.trim(), payment_method: paymentMethod, message: message.trim(), items, consent: true as const };
      // Remember the destination so the next order does not ask again.
      if (payload.city && payload.city !== city) onCity?.(payload.city);
      const signature = JSON.stringify(payload);
      if (signature !== submission.current.signature) submission.current = { signature, key: crypto.randomUUID() };
      const inquiry = await submitInquiry(payload, submission.current.key);
      setConfirmation(inquiry); onSuccess?.(inquiry);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Не удалось отправить заявку. Проверьте соединение.');
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { submitting.current = false; setPending(false); }
  }

  if (confirmation) return <InquiryConfirmation inquiry={confirmation} />;

  if (!settings.inquiries_enabled) return <div className="sf-notice">
    <strong>Приём заявок пока закрыт</strong>
    <p>Выбранные товары сохранятся в этом браузере. Доступные способы связи указаны в разделе контактов.</p>
    <a href="#contact">Контакты магазина</a>
  </div>;

  return <form className="sf-inquiry ym-hide-content" onSubmit={handleSubmit} aria-label="Заявка в магазин">
    <h3>{items.length ? 'Оформление заказа' : 'Задать вопрос магазину'}</h3>
    <p className="sf-muted">{items.length
      ? 'Доставка по России включена в стоимость товара. После подтверждения наличия магазин пришлёт ссылку или QR-код для оплаты через СБП.'
      : 'Оставьте удобный контакт для ответа.'}</p>
    <fieldset disabled={pending || blocked}>
      <label>Ваше имя<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Телефон, email или @Telegram<input name="contact" autoComplete="email" required minLength={5} maxLength={150} value={contact} onChange={event => setContact(event.target.value)} placeholder="Как с вами связаться" /></label>
      {items.length > 0 && <label>Город доставки<input name="city" list="sf-cities" autoComplete="address-level2" required minLength={2} maxLength={80} value={destination} onChange={event => setDestination(event.target.value)} placeholder="Например, Краснодар" /><CityDatalist /></label>}
      {items.length > 0 && <label>Пункт выдачи СДЭК<input name="cdek_pvz" required minLength={3} maxLength={300} value={cdekPvz} onChange={event => setCdekPvz(event.target.value)} placeholder="Код или полный адрес ПВЗ" /><span className="sf-field-help">Выберите удобный пункт на <a href="https://www.cdek.ru/ru/offices" target="_blank" rel="noopener noreferrer">карте СДЭК</a> и вставьте сюда его код или адрес.</span></label>}
      {items.length > 0 && <fieldset className="sf-payment-choice">
        <legend>Желаемый способ оплаты</legend>
        <div>{([
          ['sbp', settings.payment_sbp], ['dolyame', settings.payment_dolyame], ['installment', settings.payment_installment], ['credit', settings.payment_credit],
        ] as [PaymentChoice, ShopSettings['payment_sbp']][]).filter(([, status]) => status !== 'off').map(([value, status]) => <label key={value}>
          <input type="radio" name="payment_method" value={value} checked={paymentMethod === value} onChange={() => setPaymentMethod(value)} />
          <span>{paymentChoiceLabels[value]}<small>{status === 'on' ? 'доступно' : 'подключаем'}</small></span>
        </label>)}</div>
        <p className="sf-field-help">Для «Долями», рассрочки и кредита условия и решение предоставляет Т‑Банк. До подключения сервисов заявка ничего не списывает.</p>
      </fieldset>}
      <label>{items.length ? 'Комментарий — необязательно' : 'Ваш вопрос'}<textarea name="message" rows={3} required={!items.length} minLength={items.length ? undefined : 10} maxLength={3000} value={message} onChange={event => setMessage(event.target.value)} placeholder={items.length ? 'Район доставки, вопросы о модели' : 'Какой транспорт ищете, куда и как далеко планируете ездить'} /></label>
      <label className="sf-consent"><input name="consent" type="checkbox" checked={consent} required onChange={event => setConsent(event.target.checked)} /><span>{items.length
        ? <>Я согласен с условиями <a href="#offer" target="_blank" rel="noopener noreferrer">«Публичной оферты»</a>, <a href="#privacy" target="_blank" rel="noopener noreferrer">«Политики конфиденциальности»</a> и даю <a href="#consent" target="_blank" rel="noopener noreferrer">«Согласие на обработку персональных данных»</a></>
        : <>Даю <a href="#consent" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a> для ответа на обращение. <a href="#privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a></>}</span></label>
      {error && <p className="sf-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
      {blocked && <p className="sf-error">Удалите недоступные товары из корзины перед отправкой заявки.</p>}
      {/* Кнопка расчёта включается только принятой галочкой: акцепт оферты фиксируется до оплаты. */}
      <button className="sf-button" type="submit" disabled={pending || blocked || (items.length > 0 && !consent)}>{pending ? 'Отправляем…' : items.length ? 'Перейти к оплате' : 'Отправить вопрос'}</button>
      {items.length > 0 && !consent && <p className="sf-muted" aria-live="polite">Отметьте согласие с документами — кнопка оплаты станет активной.</p>}
    </fieldset>
  </form>;
}
