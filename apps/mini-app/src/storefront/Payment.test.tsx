import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Payment } from './Payment';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });

describe('раздел оплаты', () => {
  it('не выдаёт неподключённый способ за рабочий', () => {
    render(<Payment settings={withSettings()} />);
    expect(screen.getByText('Банковской картой онлайн')).toBeInTheDocument();
    expect(screen.getAllByText('Готовим подключение').length).toBeGreaterThan(0);
    expect(screen.queryByText('Доступно')).toBeNull();
    expect(screen.getByText(/Сейчас сайт принимает заявку без списания денег/)).toBeInTheDocument();
  });

  it('скрывает способы, отключённые владельцем', () => {
    render(<Payment settings={withSettings({ payment_installment: 'off', payment_invoice: 'off', payment_on_delivery: 'off' })} />);
    expect(screen.queryByText('Рассрочка и кредит')).toBeNull();
    expect(screen.queryByText('Оплата при получении')).toBeNull();
    expect(screen.getByText('Банковской картой онлайн')).toBeInTheDocument();
  });

  it('называет подтверждённый платёжный сервис и помечает способ доступным', () => {
    render(<Payment settings={withSettings({ payment_card: 'on', payment_provider: 'Тестовый сервис' })} />);
    expect(screen.getByText('Доступно')).toBeInTheDocument();
    expect(screen.getByText(/Оплата через платёжный сервис Тестовый сервис/)).toBeInTheDocument();
    expect(screen.getByText(/способы оплаты, подтверждённые магазином/)).toBeInTheDocument();
  });

  it('показывает порядок заказа и предупреждение о безопасности расчётов', () => {
    render(<Payment settings={withSettings()} />);
    for (const step of['Заявка', 'Подтверждение', 'Оплата', 'Чек и передача']) expect(screen.getByText(step)).toBeInTheDocument();
    expect(screen.getByText(/никогда не просит номер карты/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Публичная оферта' })).toHaveAttribute('href', '#offer');
  });

  it('публикует утверждённый владельцем порядок выдачи чека', () => {
    render(<Payment settings={withSettings({ payment_receipt: 'Чек приходит на email покупателя.' })} />);
    expect(screen.getByText('Чек приходит на email покупателя.')).toBeInTheDocument();
  });
});
