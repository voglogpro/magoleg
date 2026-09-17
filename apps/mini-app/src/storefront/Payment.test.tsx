import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Payment } from './Payment';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('раздел оплаты', () => {
  it('по умолчанию предлагает оплату Т-Банка: СБП, карту, рассрочку и кредит', () => {
    render(<Payment settings={withSettings()} />);
    for (const title of ['СБП', 'Банковская карта', 'Рассрочка', 'Кредит']) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getAllByText('Доступно')).toHaveLength(4);
    expect(screen.queryByText('Долями')).toBeNull();
    expect(screen.queryByText('Оплата при получении')).toBeNull();
    expect(screen.getByText(/способы оплаты, подтверждённые магазином/)).toBeInTheDocument();
  });

  it('объясняет порядок оплаты и отдельную оплату доставки', () => {
    render(<Payment settings={withSettings()} />);
    const accordion = screen.getByText('СБП').closest('details');
    expect(accordion).not.toHaveAttribute('open');
    fireEvent.click(screen.getByText('СБП'));
    expect(accordion).toHaveAttribute('open');
    expect(screen.getByText(/ссылку или QR-код на оплату/)).toBeInTheDocument();
    expect(screen.getByText(/Доставка оплачивается отдельно при получении/)).toBeInTheDocument();
  });

  it('не выдаёт неподключённый способ за рабочий', () => {
    render(<Payment settings={withSettings({ payment_sbp: 'off', payment_card: 'off', payment_credit: 'off', payment_installment: 'preparing' })} />);
    expect(screen.getByText('Готовим подключение')).toBeInTheDocument();
    expect(screen.queryByText('Доступно')).toBeNull();
    expect(screen.getByText(/Сейчас сайт принимает заявку без списания денег/)).toBeInTheDocument();
  });

  it('скрывает оплату картой, когда владелец её отключил', () => {
    render(<Payment settings={withSettings({ payment_card: 'off' })} />);
    expect(screen.queryByText('Банковская карта')).toBeNull();
  });

  it('временно скрывает Долями и не показывает устаревшие способы', () => {
    render(<Payment settings={withSettings({ payment_dolyame: 'preparing', payment_installment: 'preparing', payment_credit: 'preparing', payment_invoice: 'on', payment_on_delivery: 'on' })} />);
    expect(screen.getAllByRole('group')).toHaveLength(4);
    for (const title of ['СБП', 'Банковская карта', 'Рассрочка', 'Кредит']) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.queryByText('Долями')).toBeNull();
    expect(screen.queryByText('Счёт для организаций')).toBeNull();
    expect(screen.queryByText('Оплата при получении')).toBeNull();
  });

  it('показывает порядок заказа и предупреждение о безопасности расчётов', () => {
    render(<Payment settings={withSettings()} />);
    for (const step of ['Заявка', 'Подтверждение', 'Оплата', 'Чек и передача']) expect(screen.getByText(step)).toBeInTheDocument();
    expect(screen.getByText(/никогда не просит номер карты/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Публичная оферта' })).toHaveAttribute('href', '#offer');
  });

  it('публикует утверждённый владельцем порядок выдачи чека', () => {
    render(<Payment settings={withSettings({ payment_receipt: 'Чек приходит на email покупателя.' })} />);
    expect(screen.getByText('Чек приходит на email покупателя.')).toBeInTheDocument();
  });
});
