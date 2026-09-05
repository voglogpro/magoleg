import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MobileStorefront } from './MobileStorefront';
import { MobileStoreInfo } from './MobileStoreInfo';

beforeEach(() => {
  vi.stubGlobal('scrollTo', vi.fn());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const mount = () => render(<MobileStorefront renderInfo={(topic, _home, catalog) => <MobileStoreInfo topic={topic} onCatalog={catalog} />} />);

describe('shared storefront navigation', () => {
  it('uses plain transport buttons and no decorative category images', () => {
    const { container } = mount();
    expect(container.querySelectorAll('.ms-category-card')).toHaveLength(2);
    expect(container.querySelectorAll('.ms-category-card svg, .ms-license-grid svg')).toHaveLength(0);
    expect(screen.queryByText('Что важно для вас')).toBeNull();
  });
  it('passes home search into the catalog with an honest empty state', () => {
    const { container } = mount();
    fireEvent.change(screen.getByLabelText('Поиск по каталогу', { selector: 'input' }), { target: { value: 'City 42' } });
    fireEvent.submit(container.querySelector('.ms-home-search')!);
    expect(screen.getByLabelText('Поиск модели')).toHaveValue('City 42');
    expect(screen.getByRole('status')).toHaveTextContent('Товары ещё не опубликованы');
    expect(container.querySelectorAll('.ms-product-placeholder')).toHaveLength(4);
    expect(container.querySelectorAll('.ms-product-placeholder button')).toHaveLength(0);
  });
  it('combines transport and license filters and resets both', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Без прав' }));
    fireEvent.click(screen.getByRole('button', { name: 'Самокаты' }));
    expect(container.querySelector('.ms-active-filters')).toHaveTextContent('Электросамокаты · Без прав');
    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));
    expect(container.querySelector('.ms-active-filters')).toHaveTextContent('Все виды транспорта');
    expect(screen.getByRole('button', { name: 'Все' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('opens store information as a page, not a dialog', () => {
    const { container } = mount();
    fireEvent.click(within(container.querySelector('.ms-store-links') as HTMLElement).getByRole('button', { name: 'О магазине' }));
    expect(screen.getByText('Документы магазина')).toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(container.querySelector('.ms-hero')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(container.querySelector('.ms-hero')).not.toBeNull();
  });
  it('switches list/grid and restores catalog selection after another tab', () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Электроскутеры' }));
    fireEvent.click(screen.getByRole('button', { name: 'Плитка' }));
    expect(container.querySelector('.ms-placeholder-grid')).not.toBeNull();
    const nav = within(container.querySelector('.ms-bottom-nav') as HTMLElement);
    fireEvent.click(nav.getByRole('button', { name: 'Избранное' }));
    expect(screen.getByText('В избранном пока пусто')).toBeVisible();
    fireEvent.click(nav.getByRole('button', { name: 'Каталог' }));
    expect(container.querySelector('.ms-active-filters')).toHaveTextContent('Электроскутеры');
    expect(container.querySelector('.ms-placeholder-grid')).not.toBeNull();
  });
});
