import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ShopMenu } from './ShopMenu';
import { seller } from './legal-texts';
import { defaultSettings, type ShopSettings } from './types';

afterEach(cleanup);
const withSettings = (patch: Partial<ShopSettings> = {}) => ({ ...defaultSettings, ...patch });
const group = (title: string) => screen.getByText(title).closest('details') as HTMLDetailsElement;

describe('меню магазина', () => {
  it('держит короткий список разделов, а документы прячет под одну кнопку', () => {
    render(<ShopMenu settings={withSettings()} />);
    const sections = screen.getByRole('navigation').querySelector('.sf-menu__list') as HTMLElement;
    expect(within(sections).getAllByRole('link').map(link => link.textContent?.trim())).toEqual([
      'Главная', 'Каталог транспорта', 'Умные подборки', 'Доставка по России', 'Оплата и документы', 'О магазине', 'Контакты',
    ]);
    // Свёрнутая группа остаётся в разметке: ссылку видно поиском и после раскрытия.
    const legal = group('Юридический отдел');
    expect(legal.open).toBe(false);
    expect(within(legal).getByText('Публичная оферта')).toBeInTheDocument();
    expect(within(legal).getByText('Обмен и возврат товара')).toBeInTheDocument();
    expect(within(legal).getByText('Гарантия')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: seller.email })).toHaveAttribute('href', `mailto:${seller.email}`);
  });

  it('показывает только те способы оплаты, которые магазин подтвердил', () => {
    render(<ShopMenu settings={withSettings()} />);
    expect(screen.getByLabelText('Способы оплаты').textContent).toBe('СБП');
    cleanup();
    // Выключенный способ не должен превращаться в обещание на видном месте.
    render(<ShopMenu settings={withSettings({ payment_sbp: 'off' })} />);
    expect(screen.queryByLabelText('Способы оплаты')).toBeNull();
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
