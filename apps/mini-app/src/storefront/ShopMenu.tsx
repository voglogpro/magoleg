import { ChevronDown, ChevronRight, Headset, Megaphone, Phone, Send } from 'lucide-react';
import { phoneLink, telegramLink } from './domain';
import { infoTitles } from './Information';
import { seller } from './legal-texts';
import { paymentMethods } from './Payment';
import type { ShopSettings } from './types';

/** Разделы, которые покупатель ищет чаще всего: они остаются на виду без раскрытия. */
const mainSections = ['home', 'catalog', 'picks', 'delivery', 'payment', 'about', 'contact'] as const;
const mainTitles: Record<string, string> = { home: 'Главная', catalog: 'Каталог транспорта', picks: 'Умные подборки', ...infoTitles };

/**
 * Свёрнутые группы. Документы магазина покупатель открывает раз в жизни — в общем
 * списке они только удлиняли меню, поэтому уходят под одну кнопку.
 */
const groups = [
  { id: 'legal', title: 'Юридический отдел', note: 'Оферта, гарантия, возврат и обработка данных',
    items: ['offer', 'privacy', 'consent', 'returns', 'warranty'] },
  { id: 'buyer', title: 'Покупателю', note: 'Как мы возим и как помогаем выбрать',
    items: ['guide', 'supply'] },
];

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

    <ul className="sf-menu__list">
      {mainSections.map(target => <li key={target}>
        <a href={`#${target}`}>{mainTitles[target]} <ChevronRight size={18} aria-hidden="true" /></a>
      </li>)}
    </ul>

    {groups.map(group => <details className="sf-menu__group" key={group.id}>
      <summary>
        <span><strong>{group.title}</strong><small>{group.note}</small></span>
        <ChevronDown size={18} aria-hidden="true" />
      </summary>
      <ul className="sf-menu__list sf-menu__list--nested">
        {group.items.map(target => <li key={target}>
          <a href={`#${target}`}>{infoTitles[target]} <ChevronRight size={18} aria-hidden="true" /></a>
        </li>)}
      </ul>
    </details>)}

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
