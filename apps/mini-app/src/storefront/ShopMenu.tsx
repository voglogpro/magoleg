import { ChevronRight, Headset, Megaphone, Phone, Send } from 'lucide-react';
import { phoneLink, telegramLink } from './domain';
import { infoTitles } from './Information';
import { seller } from './legal-texts';
import { paymentMethods } from './Payment';
import type { ShopSettings } from './types';

/**
 * Меню идёт двумя блоками через черту, без заголовков и раскрывающихся групп:
 * сначала разделы магазина, следом документы. Каталог и подборки сюда не входят —
 * они и так лежат в шапке и в нижней панели, и в меню только дублировались.
 */
const blocks = [
  ['home', 'about', 'contact', 'warranty', 'delivery', 'payment'],
  ['offer', 'privacy', 'consent', 'returns'],
];

/** В меню названия короче, чем заголовки самих страниц: длинная строка ломает ровный столбец. */
const menuTitles: Record<string, string> = {
  ...infoTitles, home: 'Главная', delivery: 'Доставка', payment: 'Оплата', returns: 'Обмен и возврат',
  consent: 'Согласие на обработку данных',
};

/** Короткая подпись для значка оплаты: полное название способа в плашку не помещается. */
const payBadges: Record<string, string> = {
  sbp: 'СБП', card: 'Картой', installment: 'Рассрочка', invoice: 'Счёт', 'on-delivery': 'При получении',
};

export function ShopMenu({ settings }: { settings: ShopSettings }) {
  const telegram = telegramLink(settings.telegram);
  const channel = telegramLink(settings.telegram_channel);
  const phone = phoneLink(settings.phone);
  const accepted = paymentMethods(settings).filter(method => method.status === 'on');
  return <nav className="sf-menu" aria-label="Все разделы">
    <div className="sf-menu__brand">
      <img src="/brand/gpartner-mark-v2-512.png" width="52" height="52" alt="" draggable={false} />
      <strong>{settings.shop_name}</strong>
      <span>Вместе к большему</span>
    </div>

    {blocks.map((block, index) => <ul className="sf-menu__list" key={index}>
      {block.map(target => <li key={target}>
        <a href={`#${target}`}>{menuTitles[target]} <ChevronRight size={18} aria-hidden="true" /></a>
      </li>)}
    </ul>)}

    <div className="sf-menu__support">
      <Headset size={24} aria-hidden="true" />
      <p>Служба поддержки</p>
      <a href={`mailto:${seller.email}`}>{seller.email}</a>
    </div>

    {(telegram || channel || phone) && <div className="sf-menu__socials">
      {telegram && <a href={telegram} target="_blank" rel="noopener noreferrer" aria-label="Написать в Telegram"><Send size={20} aria-hidden="true" /></a>}
      {channel && <a href={channel} target="_blank" rel="noopener noreferrer" aria-label="Telegram-канал магазина"><Megaphone size={20} aria-hidden="true" /></a>}
      {phone && <a href={phone} aria-label={`Позвонить: ${settings.phone}`}><Phone size={20} aria-hidden="true" /></a>}
    </div>}

    {/* Реквизиты продавца печатает подвал магазина — он идёт сразу под меню,
        и повторять ту же строку здесь значило бы показать её дважды на одном экране. */}
    {accepted.length > 0 && <ul className="sf-menu__pay" aria-label="Способы оплаты">
      {accepted.map(method => <li key={method.id}>{payBadges[method.id] || method.title}</li>)}
    </ul>}
  </nav>;
}
