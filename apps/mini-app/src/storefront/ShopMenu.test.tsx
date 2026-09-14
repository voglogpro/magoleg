import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ShopMenu } from './ShopMenu';
import { seller } from './legal-texts';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });
const block = (index: number) => screen.getByRole('navigation').querySelectorAll('.sf-menu__list')[index] as HTMLElement;
const labels = (node: HTMLElement) => within(node).getAllByRole('link').map(link => link.textContent?.trim());

describe('меню магазина', () => {
  it('делит разделы и документы на два блока без заголовков', () => {
    render(<ShopMenu settings={withSettings()} />);
    expect(labels(block(0))).toEqual(['Главная', 'О магазине', 'Контакты', 'Гарантия', 'Доставка', 'Оплата']);
    expect(labels(block(1))).toEqual(['Публичная оферта', 'Политика конфиденциальности', 'Согласие на обработку данных', 'Обмен и возврат']);
    expect(screen.getByRole('link', { name: seller.email })).toHaveAttribute('href', `mailto:${seller.email}`);
  });

  it('не обещает прямых поставок: магазин работает посредником', () => {
    render(<ShopMenu settings={withSettings()} />);
    expect(screen.queryByText('Прямые поставки')).toBeNull();
    expect(screen.queryByText(/Помощь с выбором/)).toBeNull();
  });

  it('не дублирует способы оплаты в меню и подвале', () => {
    render(<ShopMenu settings={withSettings()} />);
    expect(screen.queryByLabelText('Способы оплаты')).toBeNull();
    expect(screen.queryByText('СБП')).toBeNull();
  });

  it('не выводит канал связи, которого у магазина нет', () => {
    render(<ShopMenu settings={withSettings()} />);
    expect(screen.queryByLabelText('Написать в Telegram')).toBeNull();
    cleanup();
    render(<ShopMenu settings={withSettings({ telegram: '@gpartner', phone: '+7 999 111 22 33' })} />);
    expect(screen.getByLabelText('Написать в Telegram')).toHaveAttribute('href', 'https://t.me/gpartner');
    expect(screen.getByLabelText(/Позвонить/)).toHaveAttribute('href', 'tel:+79991112233');
  });
});
