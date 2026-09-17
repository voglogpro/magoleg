import type { CSSProperties } from 'react';
import { CalendarClock, ChevronDown, CreditCard, FileCheck2, QrCode, ShieldCheck, type LucideIcon } from 'lucide-react';
import type { PaymentStatus, ShopSettings } from './types';

export const paymentStatusLabels: Record<PaymentStatus, string> = {
  on: 'Доступно', preparing: 'Готовим подключение', off: 'Не подключено',
};

type Method = { id: string; title: string; icon: LucideIcon; status: PaymentStatus; text: string; ready: string };

export const DOLYAME_LIMIT = 30_000;
/** Временно выключено. При будущем включении способ появится только при сумме строго ниже лимита. */
const DOLYAME_ENABLED = false;

/** Способ оплаты объявляется доступным только когда владелец подтвердил это в CRM. */
export function paymentMethods(settings: ShopSettings, orderTotal: number | null = null): Method[] {
  const partner = settings.payment_installment_partner.trim();
  const methods = [
    {
      id: 'sbp', title: 'СБП', icon: QrCode, status: settings.payment_sbp,
      text: 'Перевод по QR-коду или ссылке в приложении вашего банка. Комиссия с покупателя не взимается, деньги поступают на расчётный счёт продавца.',
      ready: 'После подтверждения заказа магазин присылает ссылку или QR-код на оплату. Проверьте получателя и сумму до подтверждения перевода.',
    },
    {
      id: 'card', title: 'Банковская карта', icon: CreditCard, status: settings.payment_card,
      text: 'Оплата картой на защищённой странице Т‑Банка. Реквизиты карты вводятся только на странице банка и магазину не передаются.',
      ready: 'После нажатия «Оплатить картой» открывается платёжная страница банка; статус заказа обновляется автоматически.',
    },
    {
      id: 'dolyame', title: 'Долями', icon: CalendarClock, status: settings.payment_dolyame,
      text: 'Оплата покупки частями через сервис Т‑Банка. Точный график и доступность будут показаны до подтверждения.',
      ready: 'Переход к оформлению откроется на защищённой странице сервиса.',
    },
    {
      id: 'installment', title: 'Рассрочка', icon: CalendarClock, status: settings.payment_installment,
      text: partner ? `Оформление у партнёра: ${partner}. Решение принимает банк, магазин на него не влияет.`
        : 'Оформление через банк-партнёр. Решение принимает банк, магазин на него не влияет.',
      ready: 'Срок, ставку и итоговую стоимость банк раскрывает до подписания договора.',
    },
    {
      id: 'credit', title: 'Кредит', icon: CreditCard, status: settings.payment_credit,
      text: partner ? `Заявка на покупку в кредит оформляется у партнёра: ${partner}.`
        : 'Заявка на покупку в кредит оформляется у банка-партнёра.',
      ready: 'Решение, ставку, полную стоимость кредита и график платежей сообщает банк.',
    },
  ];
  return methods.filter(method => method.id !== 'dolyame'
    || (DOLYAME_ENABLED && orderTotal !== null && orderTotal < DOLYAME_LIMIT));
}

const steps = [
  { title: 'Заявка', text: 'Вы собираете корзину и отправляете заявку. Деньги на этом шаге не списываются.' },
  { title: 'Подтверждение', text: 'Магазин проверяет наличие и комплектацию. Стоимость онлайн-платежа равна стоимости товаров.' },
  { title: 'Оплата', text: 'Оплата через СБП или картой проходит на защищённой странице банка. Доставка оплачивается отдельно при получении.' },
  { title: 'Чек и передача', text: 'Вы получаете кассовый чек и документы на товар, заказ уходит перевозчику.' },
];

export function Payment({ settings }: { settings: ShopSettings }) {
  const methods = paymentMethods(settings).filter(method => method.status !== 'off');
  const live = methods.filter(method => method.status === 'on');
  return <>
    <p className="sf-lead">Прозрачный расчёт: сначала подтверждаем сумму, потом принимаем оплату.</p>
    <p>{live.length
      ? 'Ниже — способы оплаты, подтверждённые магазином, и порядок оформления заказа.'
      : 'Сейчас сайт принимает заявку без списания денег. Ниже — способы оплаты, которые магазин готовит к подключению, и порядок, по которому будет проходить заказ.'}</p>

    <section className="sf-info-section" aria-labelledby="payment-methods-title">
      <h2 id="payment-methods-title">Способы оплаты</h2>
      <div className="sf-pay-grid">
        {methods.map((method, index) => <details className={`sf-pay-card sf-pay-card--${method.status}`} key={method.id} style={{ '--sf-step': index } as CSSProperties}>
          <summary>
            <span className="sf-pay-card__icon" aria-hidden="true"><method.icon size={20} /></span>
            <span className="sf-pay-card__heading"><strong>{method.title}</strong><span className={`sf-status sf-status--${method.status}`}>{paymentStatusLabels[method.status]}</span></span>
            <ChevronDown className="sf-pay-card__chevron" size={20} aria-hidden="true" />
          </summary>
          <div className="sf-pay-card__body"><p>{method.text}</p><p className="sf-muted">{method.status === 'on' ? method.ready : 'Пока способ не подключён: магазин не принимает по нему деньги и не передаёт данные банку.'}</p></div>
        </details>)}
        {methods.length === 0 && <div className="sf-pay-card sf-pay-card--preparing"><h3>Способы оплаты уточняются</h3><p>Магазин подтвердит доступные варианты расчёта до оформления заказа.</p></div>}
      </div>
      {settings.payment && <p className="sf-preserve-lines">{settings.payment}</p>}
    </section>

    <section className="sf-info-section" aria-labelledby="payment-steps-title">
      <h2 id="payment-steps-title">Как проходит заказ</h2>
      <ol className="sf-steps">
        {steps.map((step, index) => <li key={step.title} style={{ '--sf-step': index } as CSSProperties}>
          <span className="sf-steps__number" aria-hidden="true">{index + 1}</span>
          <strong>{step.title}</strong><span>{step.text}</span>
        </li>)}
      </ol>
    </section>

    <section className="sf-info-section" aria-labelledby="payment-receipt-title">
      <h2 id="payment-receipt-title">Чек и документы</h2>
      <p>{settings.payment_receipt || 'При оплате покупатель получает кассовый чек в порядке, предусмотренном законом о применении контрольно-кассовой техники. Вместе с товаром передаются документы на модель и гарантийные условия.'}</p>
      <ul className="sf-doc-links">
        <li><a href="#offer"><FileCheck2 size={16} aria-hidden="true" />Публичная оферта</a></li>
        <li><a href="#returns"><FileCheck2 size={16} aria-hidden="true" />Возврат товаров и денег</a></li>
        <li><a href="#warranty"><FileCheck2 size={16} aria-hidden="true" />Гарантия</a></li>
        <li><a href="#privacy"><FileCheck2 size={16} aria-hidden="true" />Политика конфиденциальности</a></li>
        <li><a href="#consent"><FileCheck2 size={16} aria-hidden="true" />Согласие на обработку данных</a></li>
      </ul>
    </section>

    <section className="sf-info-section sf-pay-safety" aria-labelledby="payment-safety-title">
      <span className="sf-pay-safety__icon" aria-hidden="true"><ShieldCheck size={22} /></span>
      <div>
        <h2 id="payment-safety-title">Безопасность расчётов</h2>
        <p>Магазин никогда не просит номер карты, CVC-код, СМС-код или пароль в переписке и по телефону. Оплата проходит только на странице платёжного сервиса или по официально выставленному счёту.</p>
        <p>Проверяйте наименование продавца и сумму до подтверждения платежа. Если сообщение о «доплате» или «возврате» пришло из другого канала — свяжитесь с магазином по контактам с сайта.</p>
      </div>
    </section>
  </>;
}
