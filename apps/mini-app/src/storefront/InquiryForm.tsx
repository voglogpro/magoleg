import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getOrderStatus, submitInquiry } from './api';
import { CdekPvzPicker } from './CdekPvzPicker';
import { CityDatalist } from './CityPicker';
import { money } from './domain';
import { type AccountProfile, type CartItem, type Inquiry, type PaymentChoice, type ShopSettings } from './types';

const paymentChoiceLabels: Record<PaymentChoice, string> = {
  sbp: 'СБП', card: 'Банковская карта', dolyame: 'Долями', installment: 'Рассрочка', credit: 'Кредит',
};
/** Порог программы банка: ниже этой суммы рассрочка и кредит не оформляются. */
export const CREDIT_MIN_TOTAL = 3000;

export const ORDER_ACCEPTED_TEXT = 'Ваш заказ принят! Сборка и отправка товара со склада производителя занимает до 3 рабочих дней. Как только посылка будет передана в транспортную службу, в этом заказе появится трек-номер для отслеживания.';

export function InquiryConfirmation({ inquiry }: { inquiry: Inquiry }) {
  const paid = ['paid', 'processing', 'shipped', 'completed'].includes(inquiry.status);
  return <div className={`sf-confirmation${paid ? ' sf-confirmation--paid' : ''}`} role="status">
    <h3>{paid ? 'Заказ успешно оформлен' : 'Заявка получена'}</h3>
    <p>Номер: <strong>{inquiry.id}</strong></p>
    {paid
      ? <p className="sf-confirmation__instruction">{ORDER_ACCEPTED_TEXT}</p>
      : <p>Магазин получил заявку и свяжется по указанному контакту. Если выбран онлайн-платёж, деньги ещё не списаны.</p>}
    {inquiry.total !== null && <p>Стоимость товаров: <strong>{money(inquiry.total)}</strong>. Оплата доставки осуществляется при получении и не входит в сумму онлайн-платежа.</p>}
    {inquiry.tracking_number && <p className="sf-confirmation__track">Трек-номер: <strong>{inquiry.tracking_number}</strong></p>}
    {!paid && <p>После подтверждения наличия магазин сообщит дальнейшие шаги. Реквизиты карты и коды подтверждения сотрудники магазина никогда не запрашивают.</p>}
    <a className="sf-button sf-button--secondary" href={paid ? '#profile' : '#catalog'}>{paid ? 'Открыть мои заказы' : 'Продолжить выбор'}</a>
  </div>;
}

export function PaymentResult({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Inquiry | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!orderId) { setError('Номер заказа не найден в ссылке оплаты.'); return; }
    let cancelled = false;
    let timer = 0;
    let attempt = 0;
    const load = async () => {
      try {
        const current = await getOrderStatus(orderId);
        if (cancelled) return;
        setOrder(current);
        if (!['paid', 'processing', 'shipped', 'completed', 'cancelled'].includes(current.status) && ++attempt < 6) {
          timer = window.setTimeout(load, 1500);
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Не удалось проверить оплату.');
      }
    };
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [orderId]);

  if (error) return <div className="sf-confirmation" role="alert"><h3>Не удалось проверить заказ</h3><p>{error}</p><a className="sf-button sf-button--secondary" href="#profile">Открыть мои заказы</a></div>;
  if (!order) return <p className="sf-loading" role="status">Проверяем оплату…</p>;
  if (!['paid', 'processing', 'shipped', 'completed'].includes(order.status)) return <div className="sf-confirmation" role="status"><h3>Платёж подтверждается</h3><p>Банк ещё передаёт результат оплаты. Статус заказа обновится автоматически; его также можно проверить в личном кабинете.</p><a className="sf-button sf-button--secondary" href="#profile">Открыть мои заказы</a></div>;
  return <InquiryConfirmation inquiry={order} />;
}

export function InquiryForm({ settings, items, total = 0, account = null, city = '', preferredPayment = 'sbp', onCity, blocked = false, onSuccess }: {
  settings: ShopSettings; items: CartItem[]; total?: number; account?: AccountProfile | null; city?: string;
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
  const availablePayments = ([
    ['sbp', settings.payment_sbp], ['card', settings.payment_card],
    ['installment', settings.payment_installment], ['credit', settings.payment_credit],
  ] as [PaymentChoice, ShopSettings['payment_sbp']][])
    // Рассрочку и кредит банк не оформляет на маленькие суммы — не предлагаем их там, где они не сработают.
    .filter(([value, status]) => status === 'on'
      && (!['installment', 'credit'].includes(value) || total === 0 || total >= CREDIT_MIN_TOTAL));
  const effectivePayment = availablePayments.some(([value]) => value === paymentMethod)
    ? paymentMethod : availablePayments[0]?.[0] || 'sbp';

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
      const payload = { name: name.trim(), contact: trimmedContact, city: destination.trim(), cdek_pvz: cdekPvz.trim(), payment_method: effectivePayment, message: message.trim(), items, consent: true as const };
      // Remember the destination so the next order does not ask again.
      if (payload.city && payload.city !== city) onCity?.(payload.city);
      const signature = JSON.stringify(payload);
      if (signature !== submission.current.signature) submission.current = { signature, key: crypto.randomUUID() };
      const inquiry = await submitInquiry(payload, submission.current.key);
      if (inquiry.payment_url) {
        onSuccess?.(inquiry);
        window.location.assign(inquiry.payment_url);
        return;
      }
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
      ? 'Стоимость онлайн-платежа равна стоимости товаров. Оплата доставки осуществляется при получении.'
      : 'Оставьте удобный контакт для ответа.'}</p>
    <fieldset disabled={pending || blocked}>
      <label>Ваше имя<input name="name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label>
      <label>Телефон, email или @Telegram<input name="contact" autoComplete="email" required minLength={5} maxLength={150} value={contact} onChange={event => setContact(event.target.value)} placeholder="Как с вами связаться" /></label>
      {items.length > 0 && <label>Город доставки<input name="city" list="sf-cities" autoComplete="address-level2" required minLength={2} maxLength={80} value={destination} onChange={event => setDestination(event.target.value)} placeholder="Например, Краснодар" /><CityDatalist /></label>}
      {items.length > 0 && <label>Пункт выдачи СДЭК<input name="cdek_pvz" required minLength={3} maxLength={300} value={cdekPvz} onChange={event => setCdekPvz(event.target.value)} placeholder="Код или полный адрес ПВЗ" /><span className="sf-field-help">Выберите пункт ниже — код и адрес подставятся сюда сами. Можно вписать их вручную: пункты есть на <a href="https://www.cdek.ru/ru/offices" target="_blank" rel="noopener noreferrer">карте СДЭК</a>.</span></label>}
      {items.length > 0 && <CdekPvzPicker apiKey={settings.cdek_widget_key} city={destination} onChoose={choice => {
        setCdekPvz(choice.address.slice(0, 300));
        if (choice.city) setDestination(current => current.trim() ? current : choice.city);
      }} />}
      {items.length > 0 && <fieldset className="sf-payment-choice">
        <legend>Желаемый способ оплаты</legend>
        <div>{availablePayments.map(([value]) => <label key={value}>
          <input type="radio" name="payment_method" value={value} checked={effectivePayment === value} onChange={() => setPaymentMethod(value)} />
          <span>{paymentChoiceLabels[value]}<small>доступно</small></span>
        </label>)}</div>
        <p className="sf-field-help">СБП и карта открываются на защищённой странице Т‑Банка: реквизиты карты вводятся только там. Условия рассрочки и кредита банк показывает до подписания договора{total > 0 && total < CREDIT_MIN_TOTAL ? `; они доступны для заказов от ${CREDIT_MIN_TOTAL} ₽` : ''}.</p>
      </fieldset>}
      <label>{items.length ? 'Комментарий — необязательно' : 'Ваш вопрос'}<textarea name="message" rows={3} required={!items.length} minLength={items.length ? undefined : 10} maxLength={3000} value={message} onChange={event => setMessage(event.target.value)} placeholder={items.length ? 'Район доставки, вопросы о модели' : 'Какой транспорт ищете, куда и как далеко планируете ездить'} /></label>
      <label className="sf-consent"><input name="consent" type="checkbox" checked={consent} required onChange={event => setConsent(event.target.checked)} /><span>{items.length
        ? <>Я согласен с условиями <a href="#offer" target="_blank" rel="noopener noreferrer">«Публичной оферты»</a>, <a href="#privacy" target="_blank" rel="noopener noreferrer">«Политики конфиденциальности»</a> и даю <a href="#consent" target="_blank" rel="noopener noreferrer">«Согласие на обработку персональных данных»</a></>
        : <>Даю <a href="#consent" target="_blank" rel="noopener noreferrer">согласие на обработку персональных данных</a> для ответа на обращение. <a href="#privacy" target="_blank" rel="noopener noreferrer">Политика конфиденциальности</a></>}</span></label>
      {error && <p className="sf-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</p>}
      {blocked && <p className="sf-error">Удалите недоступные товары из корзины перед отправкой заявки.</p>}
      {/* Кнопка расчёта включается только принятой галочкой: акцепт оферты фиксируется до оплаты. */}
      <button className="sf-button" type="submit" disabled={pending || blocked || (items.length > 0 && !consent)}>{pending ? 'Готовим оплату…' : !items.length ? 'Отправить вопрос' : effectivePayment === 'installment' ? 'Купить в рассрочку' : effectivePayment === 'credit' ? 'Оформить кредит' : effectivePayment === 'card' ? 'Оплатить картой' : 'Оплатить заказ'}</button>
      {items.length > 0 && !consent && <p className="sf-muted" aria-live="polite">Отметьте согласие с документами — кнопка оплаты станет активной.</p>}
    </fieldset>
  </form>;
}
