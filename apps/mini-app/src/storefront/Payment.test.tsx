import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Payment } from './Payment';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('раздел оплаты', () => {
  it('по умолчанию предлагает только СБП', () => {
    render(<Payment settings={withSettings()} />);
    expect(screen.getByText('Система быстрых платежей (СБП)')).toBeInTheDocument();
    expect(screen.getByText('Доступно')).toBeInTheDocument();
    expect(screen.queryByText('Банковской картой онлайн')).toBeNull();
    expect(screen.queryByText('Рассрочка и кредит')).toBeNull();
    expect(screen.queryByText('Оплата при получении')).toBeNull();
    expect(screen.getByText(/способы оплаты, подтверждённые магазином/)).toBeInTheDocument();
  });

  it('объясняет порядок оплаты по ссылке или QR-коду и включённую доставку', () => {
    render(<Payment settings={withSettings()} />);
    expect(screen.getByText(/ссылку или QR-код на оплату/)).toBeInTheDocument();
    expect(screen.getByText(/Стоимость доставки уже включена в цену товара/)).toBeInTheDocument();
  });

  it('не выдаёт неподключённый способ за рабочий', () => {
    render(<Payment settings={withSettings({ payment_sbp: 'off', payment_installment: 'preparing' })} />);
    expect(screen.getByText('Готовим подключение')).toBeInTheDocument();
    expect(screen.queryByText('Доступно')).toBeNull();
    expect(screen.getByText(/Сейчас сайт принимает заявку без списания денег/)).toBeInTheDocument();
  });

  it('не показывает оплату банковской картой даже для старой настройки', () => {
    render(<Payment settings={withSettings({ payment_card: 'on', payment_provider: 'Тестовый сервис' })} />);
    expect(screen.queryByText('Банковской картой онлайн')).toBeNull();
    expect(screen.queryByText(/Тестовый сервис/)).toBeNull();
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
